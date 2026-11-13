// MV3 service worker: talks to the backend, runs the order pipeline, relays progress.
//   side panel ──PREPARE (order opened) / ANALYZE (Run)──▶ worker ──BUILD_SNAPSHOT / FETCH_PHOTOS──▶ content script (EZ tab)
//                           worker ──PUT snapshot, POST photos, POST analyses──▶ backend
// The worker (not the EZ page) calls the backend, so Chrome's page→localhost block doesn't apply.

import { getConfig } from '../common/config.js';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const PHOTO_BATCH = 6;
const CONTENT_FILES = ['content/snapshot.js', 'content/writer.js', 'content/overlay.js', 'content/content.js'];
const broadcast = msg => chrome.runtime.sendMessage(msg).catch(() => {});   // no listener = panel closed

// ---------------------------------------------------------------- sign-in
// chrome.storage.local.auth = { accessToken, accessExp, refreshToken, user, org }. The access token lives 15 min and is
// renewed with the refresh token (which the server rotates on every use). Signed out → every call asks to sign in.
const getAuth = async () => (await chrome.storage.local.get('auth')).auth || null;
const setAuth = a => (a ? chrome.storage.local.set({ auth: a }) : chrome.storage.local.remove('auth'));
const keep = j => ({ accessToken: j.accessToken, accessExp: Date.now() + j.expiresIn * 1000, refreshToken: j.refreshToken, user: j.user, org: j.org });
const signInError = msg => Object.assign(new Error(msg || 'Please sign in.'), { signIn: true });
let refreshing = null;
function refreshNow() {
  return (refreshing ||= (async () => {
    const a = await getAuth(); if (!a?.refreshToken) throw signInError();
    const { apiBase } = await getConfig();
    const r = await fetch(apiBase + '/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: a.refreshToken }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        // a sign-in the server no longer accepts (or one from another server, e.g. after switching to a local test
        // server): forget it. With a developer token configured that becomes the sign-in; customers have none.
        await setAuth(null);
        const s = await authState(), { token } = await getConfig();
        broadcast({ type: 'AUTH_CHANGED', signedIn: s.signedIn, message: j.error?.message });
        if (token) return token;
        throw signInError(j.error?.message);
      }
      throw new Error(j.error?.message || `HTTP ${r.status}`);
    }
    await setAuth(keep(j)); return j.accessToken;
  })().finally(() => { refreshing = null; }));
}
/** The bearer for the next call: the signed-in user's access token (renewed when < 1 min is left), else the developer token. */
async function bearer() {
  const a = await getAuth();
  if (a?.accessToken) return a.accessExp - Date.now() > 60e3 ? a.accessToken : refreshNow();
  const { token } = await getConfig(); if (token) return token;
  throw signInError();
}
// chrome.storage.local.device = { id, name }: this computer, kept across sign-outs. Each computer signed in uses one seat;
// signing in again here replaces this computer's earlier sign-in. The name is shown on the dashboard next to Sign out.
async function getDevice() {
  let d = (await chrome.storage.local.get('device')).device;
  if (!d?.id) { d = { id: crypto.randomUUID(), name: '' }; await chrome.storage.local.set({ device: d }); }
  return d;
}
async function authState() {
  const a = await getAuth(), { token } = await getConfig(), computer = (await getDevice()).name || '';
  return a ? { signedIn: true, user: a.user, org: a.org, computer } : token ? { signedIn: true, dev: true, user: { name: 'Developer', role: 'admin' } } : { signedIn: false, computer };
}
async function login({ email, password, deviceName }) {
  const { apiBase } = await getConfig(), d = await getDevice();
  if (deviceName !== undefined) { d.name = String(deviceName).trim().slice(0, 40); await chrome.storage.local.set({ device: d }); }
  const r = await fetch(apiBase + '/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, client: 'extension', deviceId: d.id, deviceName: d.name }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  await setAuth(keep(j)); return authState();
}
async function logout() {
  const a = await getAuth(), { apiBase } = await getConfig();
  if (a?.refreshToken) await fetch(apiBase + '/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: a.refreshToken }) }).catch(() => {});
  await setAuth(null); return authState();
}

async function api(method, path, body, { raw = false } = {}, retried = false) {
  const { apiBase } = await getConfig();
  const headers = { Authorization: `Bearer ${await bearer()}` };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiBase + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried && (await getAuth())) { await refreshNow(); return api(method, path, body, { raw }, true); }   // expired between check and call
  if (res.status === 401) throw signInError(json.error?.message);
  if (!res.ok) throw Object.assign(new Error(json.error?.message || `HTTP ${res.status}`), { code: json.error?.code });   // e.g. IMAGE_LIMIT
  return raw ? { status: res.status, json } : json;
}

/** Send to the EZ tab's content script, injecting it first if the tab predates the install. */
async function toTab(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] }).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    return chrome.tabs.sendMessage(tabId, msg);
  }
}

function b64ToBlob(b64, type = 'image/jpeg') {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type });
}

// ---------------------------------------------------------------- order pipeline
// Preparing = everything before the AI: read the order from EZ, send the snapshot, upload the photos the backend
// doesn't have yet. The panel starts it as soon as an order is opened (PREPARE), so Run only waits for the AI.
// A preparation is reused for PREP_TTL when asked without `force`; Run AI review always sends force (a fresh read and
// a new review), an applied fix or an older preparation also reads the order again.
const PREP_TTL = 10 * 60 * 1000;
const PHOTO_LANES = 2;              // photo batches in flight at once (each fetches 3 photos from EZ in parallel)
const prepping = new Map();         // orderId → in-flight preparation (one per order)
const prepKey = id => 'prep_' + id;
const clearPreps = async () => { const all = await chrome.storage.session.get(null); await chrome.storage.session.remove(Object.keys(all).filter(k => k.startsWith('prep_'))); };

async function prepareOrder({ tabId, orderId, force }) {
  if (prepping.has(orderId)) return prepping.get(orderId);   // already running (opened a moment ago): wait for it
  if (!force) {
    const done = (await chrome.storage.session.get(prepKey(orderId)))[prepKey(orderId)];
    if (done && Date.now() - done.at < PREP_TTL) return { ...done, reused: true };
  }
  const p = doPrepare(tabId, orderId).finally(() => prepping.delete(orderId));
  prepping.set(orderId, p);
  return p;
}

// What the last read of an order found (its forms), kept for the browser session and NOT cleared with the
// preparations: the next read starts the forms at the same time as the order page, and skips the prior report
// (the server keeps the one it already has; an earlier survey doesn't change).
const seenKey = id => 'seen_' + id;
async function readOrder(tabId, orderId, { prior } = {}) {
  const seen = (await chrome.storage.session.get(seenKey(orderId)))[seenKey(orderId)];
  // first read this session: the order's forms from its last snapshot on the server, if it has one. The prior report
  // is read only when the server has none yet (or only a failed one): it is the slow part of a first read (the
  // earlier order's page, then its forms, one after the other; 35.7 s instead of 11.8 s on 1166305).
  const last = seen ? null : (await api('GET', `/v1/orders/${orderId}/snapshot`).catch(() => null))?.snapshot;
  const knownForms = seen?.forms || (last?.forms || []).map(f => ({ formId: f.formId, copy: f.copy || 0, name: f.name }));
  const havePrior = !!seen || (last?.priorReports || []).some(p => !p.error);
  const built = await toTab(tabId, { type: 'BUILD_SNAPSHOT', orderId, knownForms, prior: prior ?? !havePrior });
  if (!built?.ok) throw new Error(built?.error || 'Snapshot failed');
  await chrome.storage.session.set({ [seenKey(orderId)]: { forms: built.snapshot.forms.map(f => ({ formId: f.formId, copy: f.copy || 0, name: f.name })), at: Date.now() } });
  return built.snapshot;
}

async function doPrepare(tabId, orderId) {
  const step = (stage, message, extra = {}) => broadcast({ type: 'PROGRESS', orderId, stage, message, ...extra });
  const t0 = Date.now();
  step('scrape', 'Reading the order from EZ…');
  const snap = await readOrder(tabId, orderId);
  const fields = snap.forms.reduce((a, f) => a + f.sections.reduce((b, s) => b + s.fields.length, 0), 0);
  step('scrape', `Read ${snap.forms.length} forms, ${fields} fields, ${snap.photos.length} photos`, { done: true });

  step('upload', 'Preparing the review…');
  const put = await api('PUT', `/v1/orders/${orderId}/snapshot`, snap);
  step('upload', put.unchanged ? 'No changes since the last review' : 'Ready', { done: true });

  // photos: PHOTO_LANES batches at once, so one batch downloads from EZ while another uploads
  const need = put.photosNeeded || [];
  const batches = []; for (let i = 0; i < need.length; i += PHOTO_BATCH) batches.push(need.slice(i, i + PHOTO_BATCH));
  let sent = 0, failed = 0, next = 0;
  const lane = async () => {
    while (next < batches.length) {
      const ids = batches[next++];
      step('photos', `Gathering photos ${sent}/${need.length}…`, { progress: sent / need.length });
      const exts = Object.fromEntries(snap.photos.filter(p => ids.includes(p.imageId) && p.ext).map(p => [p.imageId, p.ext]));
      const got = await toTab(tabId, { type: 'FETCH_PHOTOS', orderId, imageIds: ids, size: 'l', exts });
      const ok = (got?.photos || []).filter(p => p.b64);
      failed += (got?.photos || []).length - ok.length;
      if (!ok.length) continue;
      const fd = new FormData();
      fd.append('meta', JSON.stringify(ok.map(p => {
        const ph = snap.photos.find(x => x.imageId === p.imageId) || {};
        return { imageId: p.imageId, caption: ph.caption, order: ph.order, markedHazard: !!ph.markedHazard };
      })));
      for (const p of ok) fd.append('files', b64ToBlob(p.b64), `${p.imageId}.jpg`);
      const r = await api('POST', `/v1/orders/${orderId}/photos`, fd); sent += r.stored.length; failed += r.rejected.length;
    }
  };
  await Promise.all(Array.from({ length: Math.min(PHOTO_LANES, batches.length) }, lane));
  step('photos', need.length ? `${sent} photos ready${failed ? `, ${failed} could not be read` : ''}` : 'Photos ready', { done: true, progress: 1 });

  const result = { orderId, snapshotId: put.snapshotId, unchanged: put.unchanged, forms: snap.forms.length, fields, photos: snap.photos.length, sent, failed, secs: Math.round((Date.now() - t0) / 1000), at: Date.now() };
  await chrome.storage.session.set({ [prepKey(orderId)]: result });
  return result;
}

async function analyzeOrder({ tabId, orderId, force }) {
  const step = (stage, message, extra = {}) => broadcast({ type: 'PROGRESS', orderId, stage, message, ...extra });
  const prep = await prepareOrder({ tabId, orderId, force });
  // the panel reset its steps when Run was pressed: mark the prepared ones done
  const ago = Math.max(0, Math.round((Date.now() - prep.at) / 60000));
  step('scrape', `Read ${prep.forms} forms, ${prep.fields} fields, ${prep.photos} photos${prep.reused ? ago ? ` (${ago} min ago)` : ' (just now)' : ''}`, { done: true });
  step('upload', prep.unchanged ? 'No changes since the last review' : 'Ready', { done: true });
  step('photos', prep.sent ? `${prep.sent} photos ready${prep.failed ? `, ${prep.failed} could not be read` : ''}` : 'Photos ready', { done: true, progress: 1 });

  step('analyze', 'Starting the review…');
  const { status, json } = await api('POST', `/v1/orders/${orderId}/analyses${force ? '?force=true' : ''}`, {}, { raw: true });
  const run = { orderId, analysisId: json.analysisId, cached: !!json.cached, httpStatus: status, startedAt: Date.now(), snapshotId: prep.snapshotId };
  step('analyze', json.cached ? 'Nothing changed since the last review' : 'Reviewing…', { analysisId: json.analysisId });
  return run;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // content-script broadcasts (PROGRESS, PAGE_DETECTED) are for the panel; the viewer window is our own page and is served
  if (sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  if (msg.type === 'VIEWER_SHOW') return false;   // panel → viewer window, not for the worker
  (async () => {
    switch (msg.type) {
      case 'GET_CONFIG': return { ...(await getConfig()), bearer: await bearer().catch(() => '') };   // bearer: for <img>/EventSource URLs (?token=)
      case 'AUTH_STATE': return authState();
      case 'LOGIN': return login(msg);
      case 'LOGOUT': { const s = await logout(); broadcast({ type: 'AUTH_CHANGED', signedIn: s.signedIn }); return s; }
      case 'HEALTH': { const { apiBase } = await getConfig(); const r = await fetch(apiBase + '/v1/health'); if (!r.ok) throw new Error('offline'); return { ok: true }; }
      case 'DETECT': return toTab(msg.tabId, { type: 'DETECT' });
      case 'ANALYZE': return analyzeOrder(msg);
      case 'PREPARE': return prepareOrder(msg);
      case 'LATEST': return api('GET', `/v1/orders/${msg.orderId}/analyses/latest`).catch(() => null);
      case 'API': return api(msg.method, msg.path, msg.body);
      case 'FEEDBACK': return api('POST', '/v1/feedback', msg.body);
      case 'FOCUS': return toTab(msg.tabId, { type: 'FOCUS_FIELD', key: msg.key });
      case 'FOCUS_PHOTO': return toTab(msg.tabId, { type: 'FOCUS_PHOTO', imageId: msg.imageId });
      case 'APPLY': await clearPreps(); return toTab(msg.tabId, { type: 'APPLY', writes: msg.writes });   // the form changed: read it again on Run
      case 'REVERT': await clearPreps(); return toTab(msg.tabId, { type: 'REVERT', keys: msg.keys });
      case 'PRESENT': return toTab(msg.tabId, { type: 'PRESENT', keys: msg.keys });
      case 'HIGHLIGHT': return toTab(msg.tabId, { type: 'HIGHLIGHT', items: msg.items });
      case 'CLEAR_HIGHLIGHT': return toTab(msg.tabId, { type: 'CLEAR_HIGHLIGHT' });
      case 'SHOW_PHOTOS': return toTab(msg.tabId, { type: 'SHOW_PHOTOS', orderId: msg.orderId, imageIds: msg.imageIds, exts: msg.exts, captions: msg.captions, index: msg.index });
      default: throw new Error('unknown message ' + msg.type);
    }
  })().then(r => reply({ ok: true, data: r }), e => reply({ ok: false, error: e.message, code: e.code, signIn: !!e.signIn }));
  return true;
});
