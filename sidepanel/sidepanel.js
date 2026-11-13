// SmartFill side panel.
import { renderBrand, platformProblem } from '../common/brand.js';
// Flow: detect EZ page → Run AI review → live progress →
// score + tabs (Overview · Checks · Photos · Recs · Questions · Narrative · Finish).
// Every finding can be Applied into the open EZ form (never saved), Undone, or Dismissed with a reason;
// each decision is sent to the backend as feedback.

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const send = msg => new Promise((ok, bad) => chrome.runtime.sendMessage(msg, r => {
  if (chrome.runtime.lastError) return bad(new Error(chrome.runtime.lastError.message));
  if (!r?.ok && r?.signIn) showSignIn(r.error);   // the session ended (or never started): ask to sign in
  r?.ok ? ok(r.data) : bad(Object.assign(new Error(r?.error || 'no response'), { signIn: !!r?.signIn, code: r?.code }));
}));

const TABS = [
  { id: 'overview', label: 'Overview', modules: ['orderBrief', 'uwConcerns', 'pricing', 'priorReport'] },
  { id: 'checks', label: 'Checks', modules: ['checks'] },
  { id: 'photos', label: 'Photos', modules: ['photoReview', 'captions'] },
  { id: 'recs', label: 'Recs', modules: ['recommendations', 'recPhotos'] },
  { id: 'questions', label: 'Answers', modules: ['questions'] },
  { id: 'narrative', label: 'Narrative', modules: ['narrative'] },
  { id: 'finish', label: 'Finish', modules: [] },
];
const MOD_LABEL = { orderBrief: 'Order brief', checks: 'Logic checks', photoReview: 'Photo review', uwConcerns: 'Underwriter concerns', recommendations: 'Recommendations',
  recPhotos: 'Rec photos', questions: 'Yes/No answers', captions: 'Photo names', narrative: 'Narrative', pricing: 'Pricing', priorReport: 'Prior report', qcChecklist: 'QC checklist' };
const MOD_ORDER = Object.keys(MOD_LABEL);
const STEPS = [['scrape', 'Read the order from EZ'], ['upload', 'Prepare the review'], ['photos', 'Gather the photos'], ['analyze', 'AI review']];
const REASONS = [['not_a_hazard', 'Not a hazard'], ['client_does_not_care', "Client doesn't need it"], ['wrong_suggestion', 'Wrong suggestion'], ['already_handled', 'Already handled'], ['other', 'Other']];

const S = { cfg: null, tab: null, det: { page: 'none' }, orderId: null, demo: false, analysis: null, current: 'overview', photoFilter: 'issues',
  itemState: {}, present: {}, index: null, steps: {}, mods: {}, es: null, hl: false, origin: null, snapshot: null, undoStack: [], pendingFocus: null, recToQ: {}, pageKey: null, prep: null, running: false };

// ---------------------------------------------------------------- theme (System / Light / Dark)
const darkMq = matchMedia('(prefers-color-scheme: dark)');
let themePref = 'system';
document.documentElement.dataset.theme = darkMq.matches ? 'dark' : 'light';   // before the saved choice loads, avoids a flash
function applyTheme() {
  document.documentElement.dataset.theme = themePref === 'system' ? (darkMq.matches ? 'dark' : 'light') : themePref;
  const b = $('btnTheme'), label = `Theme: ${themePref === 'system' ? 'match system' : themePref} (click to change)`;
  b.dataset.pref = themePref; b.title = label; b.setAttribute('aria-label', label);
  document.querySelectorAll('[data-theme-pick]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.themePick === themePref)));
}
async function setTheme(pref) { themePref = pref; applyTheme(); await chrome.storage.local.set({ theme: pref }).catch(() => {}); }
async function initTheme() {
  themePref = (await chrome.storage.local.get('theme').catch(() => ({}))).theme || 'system';
  applyTheme();
  darkMq.addEventListener('change', () => themePref === 'system' && applyTheme());
  const order = ['system', 'light', 'dark'];
  $('btnTheme').onclick = () => setTheme(order[(order.indexOf(themePref) + 1) % order.length]);
  document.querySelectorAll('[data-theme-pick]').forEach(x => (x.onclick = () => setTheme(x.dataset.themePick)));
}

// ---------------------------------------------------------------- footer status + toast (NSR style)
function setConn(state /* 'idle'|'online'|'busy'|'error' */, text) {
  $('conn-dot').className = 'conn-dot' + (state === 'online' ? ' is-online' : state === 'busy' ? ' is-busy' : state === 'error' ? ' is-error' : '');
  $('conn-text').textContent = text;
}
let toastTimer = null;
function toast(text, action) {
  const t = $('toast'), a = $('toastAction');
  $('toastText').textContent = text;
  a.hidden = !action; if (action) { a.textContent = action.label; a.onclick = () => { t.classList.remove('is-visible'); action.run(); }; }
  t.classList.add('is-visible'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-visible'), action ? 6000 : 2600);
}

/** Error text for the reviewer: no model, cost or server internals. */
function friendlyError(e) {
  const m = String(e?.message || e);
  if (/failed to fetch|networkerror|offline|ECONN/i.test(m)) return 'SmartFill is offline. Check your connection and try again.';
  if (/cost cap|budget|openai|gpt-|model|quota|rate limit|\b(429|5\d\d)\b/i.test(m)) return 'The review could not finish. Please try again in a minute.';
  return m;
}

// ---------------------------------------------------------------- sign-in
/** The customer's name for their own rule sets ("TIS question set", "TIS style"); neutral when not known. */
const client = () => S.org?.brand?.name || S.org?.name || '';
function setOrg(org) { if (org) S.org = org; renderBrand($('brand'), S.org); }
function showSignIn(message) {
  document.body.classList.add('signed-out'); $('signin').hidden = false;
  S.org = null; renderBrand($('brand'), null);   // nobody signed in: SmartFill's own mark, no customer logo
  $('siError').textContent = message && !/^please sign in/i.test(message) ? message : '';
  setConn('idle', 'Signed out'); renderAccount({ signedIn: false });
  send({ type: 'AUTH_STATE' }).then(st => { if (st?.computer && !$('siComputer').value) $('siComputer').value = st.computer; }).catch(() => {});
  setTimeout(() => $('siEmail').focus(), 50);
}
function renderAccount(st) {
  const L = st.org?.licence, date = d => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const name = st.user?.name || st.user?.email || '', initials = (name.match(/\b[A-Za-z]/g) || ['?']).slice(0, 2).join('').toUpperCase();
  const sub = [st.user?.email && st.user.email !== name ? st.user.email : '', st.org?.name].filter(Boolean).join(' · ');
  const computer = st.signedIn && !st.dev && st.computer ? `<span>This computer: ${esc(st.computer)}</span>` : '';
  const plan = L ? `${L.planName || L.plan || ''} plan${L.expiresAt ? ` · until ${date(L.expiresAt)}` : ''}` : '';
  $('account').innerHTML = !st.signedIn ? '<p class="small muted">Not signed in</p>'
    : `<span class="avatar" aria-hidden="true">${esc(initials)}</span>
      <div class="who"><b>${esc(name)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}${computer}
        ${st.dev ? '<span class="chip">Developer token</span>' : plan ? `<span class="chip">${esc(plan)}</span>` : ''}</div>`;
  $('btnSignOut').hidden = !st.signedIn || !!st.dev;
  $('btnSignOut').onclick = async () => { await send({ type: 'LOGOUT' }).catch(() => {}); location.reload(); };
}
// ---------------------------------------------------------------- photo allowance (the plan's photos per month)
/** Fresh from the server: how many of the plan's photos this month are used. A photo counts the first time it is
 *  reviewed; re-running an order does not count it again. */
async function refreshUsage() {
  const me = await send({ type: 'API', method: 'GET', path: '/v1/auth/me' }).catch(() => null);
  if (me?.org && !document.body.classList.contains('signed-out')) setOrg(me.org);   // picks up a logo changed on the dashboard
  const cap = Number(me?.org?.licence?.imagesPerMonth) || 0;
  S.usage = cap ? { cap, used: Number(me.org.usage?.imagesThisMonth) || 0 } : null;
  renderUsage();
}
function renderUsage() {
  const u = S.usage, chip = $('usage'), box = $('usageBox');
  if (!u) { chip.hidden = true; $('usageSec').hidden = true; return; }
  const n = x => x.toLocaleString('en-US'), left = Math.max(0, u.cap - u.used), pct = Math.min(100, Math.round(u.used / u.cap * 100));
  const now = new Date(), reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString([], { day: 'numeric', month: 'short' });
  const level = left === 0 ? 'out' : left < u.cap * 0.1 ? 'low' : '';
  chip.hidden = false; chip.className = `usage ${level}`;
  chip.textContent = left === 0 ? 'No photos left' : `${n(left)} photos left`;
  chip.title = `${n(u.used)} of ${n(u.cap)} photos used this month. Resets ${reset}.`;
  $('usageSec').hidden = false; box.className = `usage-box ${level}`;
  box.innerHTML = `<div class="ub-hd"><b>${n(u.used)}</b><span>of ${n(u.cap)} used</span><span class="ub-left">${left === 0 ? 'None left' : `${n(left)} left`}</span></div>
    <div class="ub-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${u.cap}" aria-valuenow="${u.used}" aria-label="Photos used this month"><i style="width:${pct}%"></i></div>
    <div class="small muted">Resets ${esc(reset)}. A photo counts once; re-running an order is free.</div>`;
}

function initSignIn() {
  $('signinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('siEmail').value.trim(), password = $('siPassword').value;
    if (!email || !password) { $('siError').textContent = 'Enter your email and password.'; return; }
    $('btnSignIn').disabled = true; $('btnSignIn').textContent = 'Signing in…'; $('siError').textContent = '';
    try { await send({ type: 'LOGIN', email, password, deviceName: $('siComputer').value.trim() }); location.reload(); }   // start clean, as the signed-in person
    catch (err) { $('siError').textContent = friendlyError(err); $('btnSignIn').disabled = false; $('btnSignIn').textContent = 'Sign in'; }
  });
}

// ---------------------------------------------------------------- boot
async function init() {
  initSignIn();
  S.cfg = await send({ type: 'GET_CONFIG' });
  // Settings opens as a panel under the gear (no scrolling up); a click outside it or Esc closes it
  const setSettings = open => { $('settings').hidden = !open; $('btnSettings').setAttribute('aria-expanded', String(open)); };
  $('btnSettings').onclick = e => { e.stopPropagation(); setSettings($('settings').hidden); };
  $('btnSetClose').onclick = () => setSettings(false);
  // the dashboard lives on the same server as the API: <apiBase>/dashboard (e.g. …/tis/dashboard)
  $('btnDashboard').onclick = async () => {
    const c = await send({ type: 'GET_CONFIG' }).catch(() => null);
    if (c?.apiBase) chrome.tabs.create({ url: c.apiBase.replace(/\/+$/, '') + '/dashboard' });
  };
  document.addEventListener('click', e => { if (!$('settings').hidden && !e.target.closest('#settings, #btnSettings')) setSettings(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('settings').hidden) setSettings(false); });
  $('btnRun').onclick = () => run();
  $('btnHighlight').onclick = highlight;
  $('btnClearHl').onclick = async () => { await send({ type: 'CLEAR_HIGHLIGHT', tabId: S.tab }).catch(() => {}); S.hl = false; $('btnClearHl').hidden = true; };
  initLightbox();
  $('quickLinks').addEventListener('click', onQuickLink);
  // the tab bar sticks right under the page bar + quick links, whatever their height
  new ResizeObserver(() => document.documentElement.style.setProperty('--head-h', $('stickyHead').offsetHeight + 'px')).observe($('stickyHead'));
  $('panel').addEventListener('click', onPanelClick);
  $('panel').addEventListener('input', e => {   // square-footage helper: the measured outline, compared live
    if (e.target.id !== 'sfMeasured') return;
    (S.sfMeasured ||= {})[S.orderId] = num(e.target.value);
    const s = sfFacts(), m = S.sfMeasured[S.orderId], v = $('sfVerdict');
    const d = m && s.footprint ? (m - s.footprint) / s.footprint : null;
    v.className = 'verdict-sf ' + (d == null ? '' : Math.abs(d) <= 0.15 ? 'ok' : 'no');
    v.textContent = d == null ? '' : Math.abs(d) <= 0.15 ? `Within ${Math.round(Math.abs(d) * 100)}%: checklist 1.4 is fine` : `${Math.round(Math.abs(d) * 100)}% ${d > 0 ? 'larger' : 'smaller'}: question the square footage`;
  });
  $('panel').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.item.locatable')) { e.preventDefault(); locate(findItem(e.target.dataset.item)); } });
  $('btnUndoLast').onclick = () => undoLast();
  $('btnUndoAll').onclick = () => undoAll();
  initTheme();
  try { const v = chrome.runtime.getManifest().version; $('version').textContent = 'v ' + v; $('setVersion').textContent = `SmartFill v${v}`; } catch {}
  chrome.tabs.onActivated.addListener(() => refreshTab());
  chrome.tabs.onUpdated.addListener((id, info) => { if (id === S.tab && info.status === 'complete') refreshTab(); });
  chrome.runtime.onMessage.addListener(onMessage);
  const st = await send({ type: 'AUTH_STATE' }).catch(() => ({ signedIn: false }));
  renderAccount(st);
  setInterval(health, 20000);   // recover by itself when the server comes back (and notice when it goes away)
  if (!st.signedIn) return showSignIn();
  setOrg(st.org);
  const problem = platformProblem(st.org);   // the organisation's web tool needs page code this version does not have
  if (problem) { document.body.classList.add('unsupported'); $('platformNote').hidden = false; $('platformText').textContent = problem; return; }
  health(); refreshTab(); refreshUsage();
  setInterval(refreshUsage, 5 * 60000);
}

let wasOffline = false;
async function health() {
  // the client never sees models, costs or engines: just whether SmartFill is reachable
  try {
    await send({ type: 'HEALTH' });
    if (document.body.classList.contains('signed-out')) return;
    S.cfg = await send({ type: 'GET_CONFIG' }).catch(() => S.cfg);   // keeps the photo/stream token fresh (15-min access tokens)
    const now = $('conn-text').textContent;
    if (now === 'Working…' || now === 'Review failed') return;   // don't overwrite a review's status
    setConn('online', 'Online');
    if (wasOffline) { toast('SmartFill is back online'); refreshTab(); }   // refreshTab puts the normal hint back
    wasOffline = false;
  } catch { setConn('error', 'Offline'); wasOffline = true; }
}

/** EZ's CGI script for this login (aa.cgi or ss.cgi): the other one answers "Access Denied". */
const ezScript = () => S.det?.script || S.ezScript || '/cgi-bin/current/aa.cgi';


async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  S.tab = tab?.id; S.origin = tab?.url && /ezsurveyform\.com/.test(tab.url) ? new URL(tab.url).origin : null;
  let det = { page: 'none' };
  if (S.origin) { try { det = await send({ type: 'DETECT', tabId: tab.id }); } catch { det = { page: 'other' }; } }
  S.det = det;
  if (det.script) S.ezScript = det.script;   // remembered for links opened while the tab shows another page
  const onOrder = !!det.orderId && ['order', 'form', 'images', 'report'].includes(det.page);
  $('btnRun').disabled = !onOrder;
  // guidance for other pages is in the page bar; this line only carries problems
  $('hint').className = 'hint small err';
  $('hint').textContent = onOrder ? orderHint() : '';
  const pageKey = [det.page, det.orderId, det.formId].join(':'), changed = S.pageKey !== null && S.pageKey !== pageKey;
  S.pageKey = pageKey;
  if (changed) S.present = {};   // field presence belongs to the page we just left
  if (onOrder && det.orderId !== S.orderId) { S.demo = false; await selectOrder(det.orderId); }
  else if (onOrder) { await checkPresence(); if (S.hl) highlight(); }
  if (onOrder) prepare(det.orderId);   // not awaited: reading the order runs in the background
  renderPageBar(changed && !S.pendingFocus);   // announced after presence is known, so the count is for this page
  if (onOrder && S.pendingFocus && det.orderId === S.orderId) {
    const key = S.pendingFocus; S.pendingFocus = null;
    const r = await send({ type: 'FOCUS', tabId: S.tab, key }).catch(() => null);
    toast(r?.ok ? 'Here is the question' : (r?.reason || 'Could not find the question on this page'));
  }
}

async function selectOrder(orderId) {
  S.orderId = orderId; S.undoStack = []; S.recToQ = {}; S.analysis = null; S.undone = {}; S.index = null; S.snapshot = null; S.itemState = {}; S.present = {};
  $('orderTitle').textContent = `Order ${orderId}`; $('orderMeta').textContent = '';
  $('scoreCard').hidden = true; $('tabbar').hidden = true; $('panel').innerHTML = ''; $('progress').hidden = true;
  const latest = await send({ type: 'LATEST', orderId }).catch(() => null);
  if (latest?.status === 'done') await showAnalysis(latest);
}

// ---------------------------------------------------------------- preparation (runs when an order is opened)
// Reading the order, sending it and uploading the photos start by themselves; Run AI review then only waits for the
// AI. Run AI review always reads the order again (photos already uploaded are not sent again), so the preparation
// mainly gets the photos to the server early.
// Preparation runs silently: the line under Run AI review only appears when something went wrong.
function orderHint() {
  const p = S.prep && S.prep.orderId === S.det?.orderId ? S.prep : null;
  return p?.state === 'error' ? `Couldn't get the order ready (${p.error}). It will be read when you press Run AI review.` : '';
}
/** Not enough of the month's photos left for this order (checked once the order is ready, and when Run is refused). */
const limitFor = orderId => (S.allow?.orderId === orderId && S.allow.limited && !S.allow.enough ? S.allow.message : '');
function showOrderHint() {
  if (S.running || !S.det?.orderId) return;
  const limit = limitFor(S.det.orderId);
  $('hint').className = limit ? 'hint small limit' : 'hint small err';
  $('hint').innerHTML = limit ? `<b>Not enough photos left this month</b><span>${esc(limit)}</span>` : esc(orderHint());
}
async function checkAllowance(orderId) {
  const al = await send({ type: 'API', method: 'GET', path: `/v1/orders/${orderId}/photo-allowance` }).catch(() => null);
  if (al) { S.allow = { orderId, ...al }; showOrderHint(); }
}
async function prepare(orderId) {
  if (S.demo || !S.tab || (S.prep?.orderId === orderId && S.prep.state !== 'error')) return;
  S.prep = { orderId, state: 'running' }; showOrderHint();
  try {
    const r = await send({ type: 'PREPARE', tabId: S.tab, orderId });
    if (S.prep?.orderId === orderId) { S.prep = { orderId, state: 'ready', ...r }; checkAllowance(orderId); }
    if (!S.snapshot && S.orderId === orderId) { await loadIndex(); renderQuickLinks(); }   // the order's forms, for the quick links
  }
  catch (e) { if (S.prep?.orderId === orderId) S.prep = { orderId, state: 'error', error: friendlyError(e).replace(/\.$/, '') }; }
  showOrderHint();
}

// ---------------------------------------------------------------- run + progress
function resetProgress() {
  S.steps = Object.fromEntries(STEPS.map(([k]) => [k, { state: 'todo', msg: '' }])); S.mods = {}; S.startedAt = Date.now();
  $('progress').hidden = false; $('barFill').style.width = '4%'; renderProgress();
}
function renderProgress() {
  $('stepper').innerHTML = STEPS.map(([k, label]) => { const s = S.steps[k] || {};
    return `<li class="${s.state === 'done' ? 'done' : s.state === 'active' ? 'active' : s.state === 'err' ? 'err' : ''}"><span class="ic">${s.state === 'err' ? '!' : ''}</span>
      <span>${esc(label)}<br><span class="t">${esc(s.msg || '')}</span></span><span class="t">${s.secs ? s.secs + 's' : ''}</span></li>`; }).join('');
  $('mods').innerHTML = MOD_ORDER.map(m => `<span class="${S.mods[m] || ''}">${esc(MOD_LABEL[m])}</span>`).join('');
}
function step(stage, msg, { done, err } = {}) {
  const order = STEPS.map(s => s[0]); const idx = order.indexOf(stage); if (idx < 0) return;
  order.slice(0, idx).forEach(k => { if (S.steps[k].state !== 'done') S.steps[k].state = 'done'; });
  const s = S.steps[stage];
  if (s.state !== 'active' && !done) s.t0 = Date.now();
  s.state = err ? 'err' : done ? 'done' : 'active'; s.msg = msg;
  if (done && s.t0) s.secs = Math.round((Date.now() - s.t0) / 1000);
  renderProgress();
}

async function run() {
  const orderId = S.det.orderId; if (!orderId) return;
  try { await send({ type: 'HEALTH' }); }
  catch { setConn('error', 'Offline'); wasOffline = true; $('hint').className = 'hint small err'; $('hint').textContent = 'SmartFill can\'t be reached, so the review didn\'t start. The panel checks again every 20 seconds and clears this message when it\'s back.'; return; }
  setConn('busy', 'Working…'); S.running = true;
  $('btnRun').disabled = true; resetProgress(); step('scrape', 'Starting…');
  try {
    // always a fresh review (TIS, 2026-11-09): read the order from EZ again, so edits typed in EZ count, and never
    // return a saved review. Photos already uploaded and already looked at by the AI are reused, not paid for again.
    const r = await send({ type: 'ANALYZE', tabId: S.tab, orderId, force: true });
    await stream(r.analysisId, r.cached);
    setConn('online', 'Online');
  } catch (e) {
    const active = Object.entries(S.steps).find(([, v]) => v.state === 'active')?.[0] || 'scrape';
    if (e.code === 'IMAGE_LIMIT') {   // the plan's photos for the month: say so plainly, next to Run
      S.allow = { orderId, limited: true, enough: false, message: e.message }; setConn('online', 'Online');
      step('analyze', 'Not started: not enough photos left this month', { err: true });
    } else { setConn('error', 'Review failed'); step(active, friendlyError(e), { err: true }); }
  }
  finally { S.running = false; $('btnRun').disabled = !(S.det.orderId); showOrderHint(); refreshUsage(); if (S.allow?.orderId === orderId && S.allow.enough !== false) checkAllowance(orderId); }
}

function onMessage(msg) {
  if (msg.type === 'AUTH_CHANGED') return msg.signedIn ? location.reload() : showSignIn(msg.message);
  if (document.body.classList.contains('signed-out')) return;
  if (msg.type === 'PAGE_DETECTED') return refreshTab();
  if (msg.type !== 'PROGRESS' || msg.orderId !== S.orderId) return;
  if (!S.running) { if (S.prep?.orderId === msg.orderId && S.prep.state === 'running') { S.prep.msg = msg.message; showOrderHint(); } return; }
  if (!S.steps.scrape) return;
  step(msg.stage || 'scrape', msg.message, { done: msg.done });
  const pct = { scrape: 18, upload: 30, photos: 30 + 25 * (msg.progress || 0), analyze: 58 }[msg.stage || 'scrape'];
  if (pct) $('barFill').style.width = pct + '%';
}

async function stream(analysisId, cached) {
  step('analyze', cached ? 'Loaded the last review (nothing changed)' : 'Running…');
  if (!cached) {
    S.es?.close();
    await new Promise(resolve => {
      const es = S.es = new EventSource(`${S.cfg.apiBase}/v1/analyses/${analysisId}/events?token=${encodeURIComponent(S.cfg.bearer || '')}`);
      let n = 0;
      es.addEventListener('module.started', e => { S.mods[JSON.parse(e.data).module] = 'run'; renderProgress(); });
      es.addEventListener('module.completed', e => {
        const d = JSON.parse(e.data); n++; S.mods[d.module] = 'done';
        step('analyze', `${MOD_LABEL[d.module] || d.module} done`);
        $('barFill').style.width = Math.min(98, 58 + n * 3.4) + '%';
      });
      es.addEventListener('analysis.completed', () => { es.close(); resolve(); });
      es.onerror = () => { es.close(); resolve(); };
    });
  }
  step('analyze', 'Done', { done: true }); $('barFill').style.width = '100%';
  const a = await send({ type: 'API', method: 'GET', path: `/v1/analyses/${analysisId}` });
  await showAnalysis(a);
  setTimeout(() => { $('progress').hidden = true; }, 1600);
}

// ---------------------------------------------------------------- analysis view
async function showAnalysis(a) {
  S.analysis = a; refreshUsage();   // a finished review may have used photos
  const stored = await chrome.storage.session.get(['items_' + a.analysisId, 'undone_' + a.analysisId]).catch(() => ({}));
  S.itemState = stored['items_' + a.analysisId] || {}; S.undone = stored['undone_' + a.analysisId] || {};
  if (!S.index) await loadIndex();
  renderHero(); renderScore(); renderAiNote(); render();
  await checkPresence();
}

/** When the AI part of a review didn't run, say so plainly: what happened, which steps, what to do.
 *  The server sends only a category to customers (aiStatus.kind); admins also get the technical detail. */
const AI_NOTE = {
  setup: "SmartFill couldn't use its AI service (a setup problem on the SmartFill side), so these results come from the basic checks only. Tell your SmartFill administrator, then press Run AI review again.",
  busy: 'The AI service was busy, so these results come from the basic checks only. Press Run AI review again in a few minutes.',
  unreachable: "The AI service didn't answer in time, so these results come from the basic checks only. Press Run AI review again in a few minutes.",
  limit: 'This order was too big for one review, so the last steps used the basic checks only. Tell your SmartFill administrator.',
  other: 'Something went wrong in the AI part, so these results come from the basic checks only. Press Run AI review again; if it keeps happening, tell your SmartFill administrator.',
};
const aiFailedFor = m => !!S.analysis?.aiStatus && S.analysis.aiStatus.ok === false && (S.analysis.aiStatus.modules || []).includes(m);
function renderAiNote() {
  const st = S.analysis?.aiStatus, el = $('aiNote');
  if (!st || st.ok !== false) { el.hidden = true; el.innerHTML = ''; return; }
  const hit = (st.modules || []).filter(m => MOD_LABEL[m]);
  const detail = st.detail || '';   // admins only, already cleaned by the server (no key fragments, no links)
  el.innerHTML = `<h4>${st.partial ? "Part of the AI review didn't run" : "The AI part of this review didn't run"}</h4>
    <p>${esc(AI_NOTE[st.kind] || AI_NOTE.other)}</p>
    ${hit.length ? `<p class="small">Affected: ${esc(hit.map(m => MOD_LABEL[m].toLowerCase()).join(', '))}</p>` : ''}
    ${detail ? `<p class="small muted">Details (admins only): ${esc(detail)}</p>` : ''}`;
  el.hidden = false;
}

async function loadIndex() {
  try {
    const s = (await send({ type: 'API', method: 'GET', path: `/v1/orders/${S.orderId}/snapshot` })).snapshot;
    S.snapshot = s; S.index = {};
    for (const f of s.forms) for (const sec of f.sections) for (const x of sec.fields) {
      const info = { formId: f.formId, form: f.name, section: sec.title };
      S.index[x.key] = info; if (x.comment) S.index[x.comment.key] = info; if (x.rec) S.index[x.rec.key] = S.index[x.rec.key] || info;
    }
    const recForm = s.forms.find(f => /recommendation/i.test(f.name));
    for (const r of s.recommendations || []) S.index[r.key] = { formId: recForm?.formId, form: recForm?.name || 'Recommendations', section: 'Recommendations' };
    S.recForm = recForm;
    for (const f of s.forms) for (const sec of f.sections) for (const x of sec.fields) if (x.rec?.key) S.recToQ[x.rec.key] = x.key;
  } catch { S.index = {}; }
}
const formFor = key => {
  if (/^caption\d+/.test(key)) return { images: true, form: 'Images page' };
  if (key === 'F14:new' || /^RECIMAGEID_/.test(key)) { const k = key.replace(/^RECIMAGEID_/, ''); return S.index?.[k] || { formId: S.recForm?.formId, form: S.recForm?.name || 'Recommendations' }; }
  return S.index?.[key] || null;
};

function renderHero() {
  const b = S.analysis?.modules?.orderBrief?.summary; if (!b) return;
  // forms are in the quick links, coverages + U/W on the Facts tab: the card only names the order
  $('orderTitle').textContent = `Order ${S.orderId}`;   // the order number first, bold; the address under it, smaller
  $('orderMeta').textContent = b.location || '';          // the client company is never shown
}

// ---------------------------------------------------------------- order facts (Facts tab)
const num = v => { const m = String(v ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const fmt = n => n == null ? '–' : Math.round(n).toLocaleString('en-US');
const KNOWN_FACTS = ['total_sqft', 'stories', 'units', 'year_built', 'iso_class', 'sprinklered'];
/** Everything SmartFill read about the order (part of Overview). The client company is never shown. */
function orderInfoBox() {
  const b = S.analysis.modules.orderBrief?.summary || {}, k = b.keyFacts || {}, o = S.snapshot?.order || {}, of = o.orderForm || {};
  const yn = v => v == null ? 'Not stated' : v ? 'Yes' : 'No';
  const table = (title, rows) => {
    const r = rows.filter(([, v]) => v != null && String(v).trim() !== '' && !/^\*+$/.test(String(v).trim()) && !(Array.isArray(v) && !v.length));   // EZ's "*****" = blank
    return r.length ? `<h3>${title}</h3><table class="facts">${r.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${esc(Array.isArray(v) ? v.join(', ') : v)}</td></tr>`).join('')}</table>` : '';
  };
  const sf = num(k.total_sqft), c = o.counts;
  const files = c ? [`${c.photos || 0} photo${c.photos === 1 ? '' : 's'}`, `${c.diagrams || 0} diagram${c.diagrams === 1 ? '' : 's'}`, `${c.attachments || 0} attachment${c.attachments === 1 ? '' : 's'}`].join(' · ') : '';
  const html = table('Order', [['Order number', S.orderId], ['Location', b.location || o.location], ['Additional addresses', of.additionalAddresses],
      ['Insured', o.insured], ['Nature of business', of.natureOfBusiness], ['Request', b.requestType]])
    + table('Coverage ordered', [['Coverage', b.coverages], ['Liability', b.liability], ['Climatic supplements', of.climaticSupplements]])
    + table('Required by the order', [['Photos required', yn(b.photosRequired)], ['Diagram required', yn(b.diagramRequired)], ['Files on the order', files]])
    + table('Building (from the forms)', [['Total area', sf ? `${fmt(sf)} sf` : k.total_sqft], ['Stories', k.stories], ['Units', k.units], ['Year built', k.year_built],
      ['Construction / ISO class', k.iso_class], ['Sprinklered', k.sprinklered],
      ...Object.entries(k).filter(([n]) => !KNOWN_FACTS.includes(n)).map(([n, v]) => [n.replace(/_/g, ' ').replace(/^./, x => x.toUpperCase()), v])]);
  return html;
}

// ---------------------------------------------------------------- square footage / Google Earth helper (QC checklist 1.4)
function narrativeSqft() {
  const f = (S.snapshot?.forms || []).flatMap(x => x.sections.flatMap(s => s.fields)).find(x => x.type === 'longtext' && /^narrative($| \()/i.test((x.label || '').trim()));
  const m = String(f?.value || '').match(/(\d{1,3}(?:,\d{3})+|\d{3,7})\s*[- ]?\s*(?:square[- ]?f(?:oo|ee)t|sq\.?\s*f(?:oo|ee)?t\.?|sf\b)/i);
  return m ? num(m[1]) : null;
}
function sfFacts() {
  const b = S.analysis?.modules?.orderBrief?.summary || {}, k = b.keyFacts || {};
  const total = num(k.total_sqft), stories = num(k.stories) || null;
  return { address: b.location || '', total, stories, units: num(k.units), narrative: narrativeSqft(),
    prior: (b.priorReports || []).map(p => num(p.sqft)).find(Boolean) || null, footprint: total && stories ? total / stories : null };
}
const earthUrl = a => 'https://earth.google.com/web/search/' + encodeURIComponent(a);
const mapsUrl = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
function sfHelper() {
  const s = sfFacts(); if (!s.total && !s.address) return '';
  const st = S.sfMeasured?.[S.orderId];
  const diff = st && s.footprint ? (st - s.footprint) / s.footprint : null;
  const box = (label, v, cls = '') => `<div class="num ${cls}"><span>${label}</span><b>${typeof v === 'number' ? fmt(v) : esc(v ?? '–')}</b></div>`;
  const off = v => v && s.total && Math.abs(v - s.total) / s.total > 0.05 ? 'bad' : '';
  return `<article class="item advisory sfh" aria-label="Square footage check">
    <div class="hd"><span class="sev">QC checklist 1.4</span><span>· Square footage on Google Earth</span></div>
    <h4>Measure the building outline and compare</h4>
    <div class="nums">${box('Form total', s.total)}${s.narrative ? box('Narrative', s.narrative, off(s.narrative)) : ''}${s.prior ? box('Prior report', s.prior, off(s.prior)) : ''}
      ${box('Stories', s.stories)}${box('Expected outline', s.footprint ? `≈ ${fmt(s.footprint)} sf` : '–', 'key')}</div>
    ${s.footprint ? `<p class="small muted">${fmt(s.total)} sf ÷ ${s.stories} ${s.stories === 1 ? 'story' : 'stories'}. Several buildings? Add up their outlines.</p>` : '<p class="small muted">Stories or total square footage missing on the form.</p>'}
    ${s.address ? `<div class="actions"><button class="primary sm" data-act="earth">Open in Google Earth ↗</button><button class="ghost sm" data-act="maps">Google Maps ↗</button></div>
      <ol><li>In Google Earth, click the ruler (Measure) and choose <b>Area</b>.</li><li>Click each corner of the roof, close the shape, read the square feet.</li><li>Type it below.</li></ol>` : ''}
    <div class="measure"><label class="small muted" for="sfMeasured">Measured outline</label><input id="sfMeasured" inputmode="numeric" placeholder="e.g. 4,800" value="${st ? fmt(st) : ''}">
      <span class="verdict-sf ${diff == null ? '' : Math.abs(diff) <= 0.15 ? 'ok' : 'no'}" id="sfVerdict">${diff == null ? '' : Math.abs(diff) <= 0.15 ? `Within ${Math.round(Math.abs(diff) * 100)}%: checklist 1.4 is fine` : `${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? 'larger' : 'smaller'}: question the square footage`}</span></div>
  </article>`;
}

/** Open findings by severity, over those the reviewer has not applied or dismissed yet (no score: TIS said it is not needed). */
function liveSummary() {
  const m = S.analysis.modules, open = i => i.status === 'fail' && !S.itemState[i.id];
  const items = Object.entries(m).filter(([k]) => !['qcChecklist', 'captions'].includes(k)).flatMap(([, x]) => x.items || []).filter(open);
  const n = sev => items.filter(i => i.severity === sev).length;
  const blockers = n('blocker'), warnings = n('warning'), advisories = n('advisory');
  return { blockers, warnings, advisories, hazardsMissed: (m.photoReview?.items || []).filter(i => i.hazardType && (open(i) || i.recDrafted)).length };
}

function renderScore() {
  const a = S.analysis; const s = liveSummary();
  $('scoreCard').hidden = false; $('tabbar').hidden = false;
  $('verdict').textContent = s.blockers ? `${s.blockers} must-fix item${s.blockers > 1 ? 's' : ''} before Reviewed` : s.warnings ? 'A few things to check' : s.advisories ? 'Only advisory items left' : 'Nothing left to fix';
  $('counts').innerHTML = [['blocker', s.blockers, 'must fix'], ['warning', s.warnings, 'to check'], ['', s.advisories, 'advisory'], ['hazard', s.hazardsMissed, 'missed hazards']]
    .map(([c, v, l]) => `<span class="count ${c}"><b>${v ?? 0}</b> ${l}</span>`).join('');
  const secs = a.finishedAt && a.createdAt ? Math.round((new Date(a.finishedAt) - new Date(a.createdAt)) / 1000) : null;
  $('runMeta').textContent = [a.finishedAt ? 'Reviewed ' + new Date(a.finishedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null,
    secs != null ? `took ${secs < 90 ? secs + 's' : Math.round(secs / 60) + ' min'}` : null].filter(Boolean).join(' · ');
  $('btnHighlight').disabled = S.demo || !S.det.orderId;
}

const itemsOf = mods => mods.flatMap(m => (S.analysis?.modules?.[m]?.items || []).map(i => ({ ...i, module: i.module || m })));
const isOpen = i => i.status === 'fail' && i.severity !== 'info';
const rank = i => (S.itemState[i.id]?.status ? 5 : 0) + ({ blocker: 0, warning: 1, advisory: 2, info: 3 }[i.severity] ?? 4);

function render() {
  renderUndoBar();
  if (S.analysis) { renderScore(); renderPageBar(false); }
  if (!S.analysis) return;
  $('tabs').innerHTML = TABS.map(t => {
    const open = t.id === 'finish' ? [] : itemsOf(t.modules).filter(i => isOpen(i) && !S.itemState[i.id]);
    const red = open.some(i => i.severity === 'blocker');
    return `<button class="tab" role="tab" aria-selected="${t.id === S.current}" data-tab="${t.id}">${t.label}${open.length ? `<span class="n ${red ? 'red' : ''}">${open.length}</span>` : ''}</button>`;
  }).join('');
  $('tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { S.current = b.dataset.tab; render(); });
  const view = { overview: viewOverview, checks: viewChecks, photos: viewPhotos, recs: viewRecs, questions: viewQuestions, narrative: viewNarrative, finish: viewFinish }[S.current];
  $('panel').innerHTML = view();
}

// ---------------------------------------------------------------- item card
function photoUrl(id) { return `${S.cfg.apiBase}/v1/orders/${S.orderId}/photos/${encodeURIComponent(id)}?token=${encodeURIComponent(S.cfg.bearer || '')}`; }
function thumbs(ids) {
  return ids?.length ? `<div class="thumbs">${ids.slice(0, 4).map(id => `<img class="thumb" src="${photoUrl(id)}" alt="Photo ${esc(id)}" data-act="photo" data-photo="${esc(id)}" onerror="this.outerHTML='<span class=&quot;thumb ph&quot;>${esc(id)}</span>'">`).join('')}</div>` : '';
}
/** Drop EZ field keys ([F4_112427_1_10704437]) and photo ids from text shown to people or written into EZ. */
const noCodes = t => String(t || '').replace(/\b(photos?|images?)\s+\d{6,}((\s*,\s*|\s+and\s+)\d{6,})*/gi, '$1')
  .replace(/\[?\bF\d+_\d+_\d+_\d+\b\]?/g, '')
  .replace(/,?\s*\(?(as )?(confirmed|shown|noted|documented|seen|stated|see) ((by|in) )?(the )?(narrative|form|photos?|report|answers?)(\s*(,|and)\s*(the )?(narrative|form|photos?|report|answers?))*\)?/gi, '')
  .replace(/\(\s*\)|\[\s*\]/g, '').replace(/\s+([.,;:])/g, '$1').replace(/:\s*=\s*/g, ': ').replace(/[ \t]{2,}/g, ' ').trim();
/** Status of one underwriter request as a quiet word pill (no emoji). */
const uwMark = i => i.addressed === 'yes' && i.status === 'pass' ? '<span class="st ok">Answered</span>'
  : i.addressed === 'yes' ? '<span class="st no">Contradicted</span>' : i.addressed === 'partial' ? '<span class="st part">Partly</span>' : '<span class="st no">Not answered</span>';
function card(i, { compact = false } = {}) {
  const st = S.itemState[i.id] || {};
  const sev = i.status === 'pass' ? 'pass' : i.severity;
  const writes = i.proposedWrites || [];
  const keys = writes.map(w => w.key);
  const canApply = !S.demo && writes.length && keys.some(k => S.present[k]);
  const where = !canApply && writes.length && !S.demo ? formFor(keys[0]) : null;
  const diff = i.before != null || i.after != null
    ? `<div class="diff">${i.before ? `<div class="b"><span class="lbl">Now</span>${esc(i.before)}</div>` : ''}${i.after ? `<div class="a"><span class="lbl">${i.before ? 'Suggested' : 'Add'}</span>${esc(i.after)}</div>` : ''}</div>`
    : i.suggested != null && i.current != null && i.module !== 'captions' ? `<div class="qa"><span class="from">${esc(i.current || 'blank')}</span>→<span class="to">${esc(i.suggested)}</span></div>`
    : i.module === 'captions' ? `<div class="qa"><span class="from">${esc(i.current)}</span>→<span class="to">${esc(i.suggested)}</span></div>`
    : i.suggestedRec ? `<div class="diff"><div class="a"><span class="lbl">Suggested recommendation</span>${esc(i.suggestedRec)}</div></div>` : '';
  const comment = writes.find(w => w.kind === 'text' && i.module === 'questions');
  const evForms = new Set((i.evidence?.fields || []).slice(0, 3).map(k => formFor(k)?.formId).filter(Boolean).map(String));
  const fields = (i.evidence?.fields || []).slice(0, 3).map(k => `<button data-act="focus" data-key="${esc(k)}" title="${esc(secFull(formFor(k)?.section))}">↗ ${esc(formFor(k)?.form ? secName(formFor(k).section).slice(0, 34) : 'Show')}</button>`).join('');
  let actions = '';
  if (st.status === 'applied') actions = `<span class="state">Applied in EZ</span><button class="link sm" data-act="undo" data-id="${esc(i.id)}">Undo</button><span class="why">Save in EZ to keep it</span>`;
  else if (st.status === 'dismissed') actions = `<span class="why">Dismissed: ${esc(REASONS.find(r => r[0] === st.reason)?.[1] || st.reason)}</span><button class="link sm" data-act="restore" data-id="${esc(i.id)}">Restore</button>`;
  else if (i.status === 'fail') actions = [
    writes.length ? (canApply ? `<button class="primary sm" data-act="apply" data-id="${esc(i.id)}">Apply</button>`
      : S.demo ? '<span class="why">Open the order in EZ to apply</span>'
      : where?.images ? '<button class="ghost sm" data-act="openimages">Open Images page ↗</button><span class="why">to apply</span>'
      : where?.formId && !evForms.has(String(where.formId)) ? `<button class="ghost sm" data-act="openform" data-form="${esc(where.formId)}">Open ${esc(where.form)}</button>` : '') : '',
    `<button class="ghost sm" data-act="dismiss" data-id="${esc(i.id)}">Dismiss</button>`,
  ].join('');
  const loc = locateLabel(i);
  return `<article class="item ${sev} ${st.status || ''} ${loc ? 'locatable' : ''}" data-item="${esc(i.id)}" ${loc ? `tabindex="0" title="Click to ${esc(loc.toLowerCase())}"` : ''}>
    <div class="hd"><span class="sev">${sev === 'pass' ? 'OK' : esc(sev)}</span><span>· ${esc(MOD_LABEL[i.module] || i.module)}</span>${i.confidence != null && i.status === 'fail' ? `<span class="conf">${Math.round(i.confidence * 100)}% sure</span>` : ''}${loc ? `<span class="goto${loc === 'Show photo' ? ' photo' : ''}">${esc(loc)} ›</span>` : ''}</div>
    <h4>${esc(i.title)}</h4>
    ${i.message && i.message !== i.title && !compact && !(i.module === 'captions' && i.suggested != null) ? `<p>${esc(i.message)}</p>` : ''}
    ${diff}${comment ? `<p class="small">Comment: “${esc(comment.value)}”</p>` : ''}
    ${thumbs(i.evidence?.photos || (i.photoId ? [i.photoId] : []))}
    ${fields ? `<div class="ev">${fields}</div>` : ''}
    <div class="actions">${actions}</div>
    <div class="reasons" data-reasons="${esc(i.id)}" hidden>${REASONS.map(([k, l]) => `<button data-act="reason" data-id="${esc(i.id)}" data-reason="${k}">${l}</button>`).join('')}</div>
  </article>`;
}
function list(items, emptyText) {
  const shown = items.filter(i => isOpen(i) || S.itemState[i.id]).sort((a, b) => rank(a) - rank(b));
  return shown.length ? shown.map(i => card(i)).join('') : `<div class="empty good">${esc(emptyText)}</div>`;
}

// ---------------------------------------------------------------- views
function viewOverview() {
  const b = S.analysis.modules.orderBrief?.summary || {};
  const all = Object.entries(S.analysis.modules).filter(([k]) => !['qcChecklist', 'orderBrief'].includes(k)).flatMap(([k, m]) => (m.items || []).map(i => ({ ...i, module: i.module || k })));
  const top = all.filter(i => isOpen(i) && i.severity === 'blocker' && !S.itemState[i.id]).slice(0, 5);
  const uw = S.analysis.modules.uwConcerns;
  const uwItems = uw?.items || [];
  const draft = uwItems.find(i => i.proposedWrites?.length);
  return `${top.length ? `<h3>Must fix first</h3>${top.map(i => card(i, { compact: true })).join('')}` : '<div class="empty good">No must-fix items</div>'}
    ${orderInfoBox()}
    ${b.underwriterInstructions ? `<h3>Underwriter instructions</h3><div class="quote">${esc(b.underwriterInstructions)}</div>
      ${uw?.summary?.notChecked && !uwItems.length ? '<p class="small muted">Not checked this time because the AI part of the review didn’t run. Check these by hand, or run the review again once it’s back.</p>' : ''}
      ${uwItems.map(i => `<div class="uw">${uwMark(i)}<div>${esc(i.title)}<small>${esc(noCodes(i.message))}${i.draftAnswer ? ` · Draft: ${esc(noCodes(i.draftAnswer))}` : ''}</small></div></div>`).join('')}
      ${draft && !S.itemState[draft.id] ? `<div class="row">${!S.demo && draft.proposedWrites.some(w => S.present[w.key]) ? `<button class="primary sm" data-act="apply" data-id="${esc(draft.id)}">Insert drafted answers</button>` : `<span class="small muted">Drafted answers are ready. Open the General Form to insert them.</span>`}</div>` : ''}` : ''}
    <h3>Pricing</h3>${pricingBox()}
    ${priorBox()}`;
}

/** This order vs its latest prior survey ("Matches:" on the order page): one row per fact, prior | now | Same / Differs. */
const PRIOR_LABEL = { sqft: 'Square footage', iso: 'ISO class', sprinkler: 'Sprinklers', buildings: 'Buildings' };
function priorBox() {
  const m = S.analysis.modules.priorReport, s = m?.summary || {};
  // the order has no earlier survey linked in EZ: say so, so an empty end of Overview doesn't look like a missing step
  if (m?.status === 'done' && s.priorReports === 0 && !(m.items || []).length) return '<h3>Prior report</h3><p class="small muted">No prior report for this order, so there is nothing to compare.</p>';
  if (!s.prior) return (m?.items || []).length ? `<h3>Prior report</h3>${list(m.items, '')}` : '';   // older reviews
  const p = s.prior, open = !S.demo && S.origin ? `<button class="link sm" data-act="openprior" data-order="${esc(p.orderId)}">Open ↗</button>` : '';
  const head = `<h3 class="prior-head">Prior report ${esc(p.orderId)}${p.date ? ` · ${esc(p.date)}` : ''} ${open}</h3>`;
  if (p.error) return `${head}<p class="small muted">Couldn't read it: ${esc(p.error)}.</p>`;
  const rows = s.rows || [], n = x => Number(String(x ?? '').replace(/,/g, ''));
  const val = x => x == null ? '<span class="none" title="Not on the form">–</span>' : esc(x);
  const mark = r => r.scope ? '<span class="cmp-s scope" title="The two surveys covered a different number of buildings">Other scope</span>'
    : r.info ? '' : r.same === true ? '<span class="cmp-s same">Same</span>' : r.same === false ? '<span class="cmp-s diff">Differs</span>'
    : '<span class="cmp-s na" title="One of the two reports has no value">Not compared</span>';
  const delta = r => {   // square footage: how big the change is
    if (r.key !== 'sqft' || r.same !== false && !r.scope) return '';
    const a = n(r.prior), b = n(r.current); if (!a || !b) return '';
    const d = b - a; return `<small>${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-US')} sf (${d > 0 ? '+' : '−'}${Math.abs(Math.round(d / a * 100))}%)</small>`;
  };
  const b = rows.find(r => r.key === 'buildings');
  const scope = rows.find(r => r.scope);
  return `${head}
    <table class="cmp"><thead><tr><th></th><th>Prior</th><th>Now</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.same === false && !r.info ? 'is-diff' : ''}"><td>${esc(PRIOR_LABEL[r.key] || r.label)}</td><td>${val(r.prior)}</td><td>${val(r.current)}${delta(r)}</td><td>${mark(r)}</td></tr>`).join('')}
    </tbody></table>
    ${scope && b ? `<p class="small muted">The prior report was for ${esc(b.prior)} building${b.prior === '1' ? '' : 's'} and this one for ${esc(b.current)}, so the totals can't be compared directly. Compare building by building, or check that it is the same property.</p>` : ''}`;
}

/** Expected inspector pay, client fee and fee type from TIS's pricing guide, next to what EZ has. Suggestions only. */
function pricingBox() {
  const m = S.analysis.modules.pricing, s = m?.summary || {}, items = m?.items || [];
  if (!s.inspector && !s.client) return items.map(i => card(i)).join('') || '<div class="empty">No pricing information on this order</div>';   // older reviews
  const $ = n => n == null ? '–' : '$' + (Number.isInteger(n) ? n : Number(n).toFixed(2));
  const cell = (exp, ent) => ent == null ? `<b>${$(exp)}</b> <span class="muted">· not entered</span>` : Math.abs(ent - (exp ?? ent)) < 0.01 ? `<b>${$(exp)}</b> <span class="ok">matches EZ</span>` : `<b>${$(exp)}</b> <span class="no">EZ has ${$(ent)}</span>`;
  const ft = s.feeType || {};
  const review = items.filter(i => i.kind === 'review' || i.kind === 'action');
  return `<table class="facts pricing">
      <tr><td>Inspector pay</td><td>${s.inspector.minimum && s.inspector.entered != null && s.inspector.entered >= s.inspector.expected - 0.01
        ? `<b>${$(s.inspector.entered)}</b> <span class="ok">at or above the ${$(s.inspector.expected)} minimum</span>`
        : s.inspector.minimum && s.inspector.entered == null ? `<b>at least ${$(s.inspector.expected)}</b> <span class="muted">· not entered</span>`
        : cell(s.inspector.expected, s.inspector.entered)}<small>${esc(s.inspector.lines.join(' · '))}</small></td></tr>
      <tr><td>Client fee</td><td>${s.client.expected == null ? '<b>Price by hand</b>' : cell(s.client.expected, s.client.entered)}<small>${esc(s.client.lines.filter(Boolean).join(' · '))}</small></td></tr>
      ${ft.expected ? `<tr><td>Order fee type</td><td>${esc(ft.expected)}${ft.selected ? ft.selected === ft.expected ? ' <span class="ok">· selected</span>' : ` <span class="no">selected: ${esc(ft.selected)}</span>` : ' <span class="muted">· not selected</span>'}</td></tr>` : ''}
    </table>
    ${review.map(i => `<p class="small ${i.kind === 'review' ? 'confirm-note' : 'muted'}">${esc(i.message)}</p>`).join('')}`;
}

function viewChecks() {
  const cl = S.analysis.modules.qcChecklist?.items || [];
  const sections = { 1: 'Square footage', 2: 'ISO class', 3: 'Access & systems', 4: 'Photos', 5: 'Recs & narrative' };
  const fp = sfFacts().footprint;   // 1.4 is measured by hand with the helper above (older reviews carry an outdated note)
  const msg = i => i.checklistItem === '1.4' ? `Measure on Google Earth (Square footage above)${fp ? `: about ${fmt(fp)} sf` : ''}` : i.message;
  const byS = Object.entries(sections).map(([n, t]) => { const rows = cl.filter(i => i.checklistItem?.startsWith(n + '.'));
    return rows.length ? `<div class="small muted" style="margin-top:6px">${n}. ${t}</div>` + rows.map(i => `<div class="cl"><span class="dot ${i.status === 'pass' ? 'ok' : i.status === 'fail' ? 'no' : 'na'}" title="${i.status === 'pass' ? 'OK' : i.status === 'fail' ? 'Needs attention' : 'Not checked'}"></span><span>${esc(i.title)}${i.status !== 'pass' ? ` <span class="muted">· ${esc(msg(i))}</span>` : ''}</span></div>`).join('') : ''; }).join('');
  return `<h3>Logic checks</h3>${list(itemsOf(['checks']), 'All logic checks passed')}
    <h3>Square footage</h3>${sfHelper() || '<div class="empty">No square footage on the form</div>'}
    <h3>QC checklist (proposed)</h3>${byS || '<div class="empty">–</div>'}`;
}

function viewPhotos() {
  const snapPhotos = S.snapshot?.photos || [];
  const pr = itemsOf(['photoReview']), caps = itemsOf(['captions']);
  const flags = id => {
    const all = pr.filter(i => i.evidence?.photos?.includes(id) && isOpen(i)), h = all.filter(i => i.kind !== 'photo_source');
    const drafted = pr.some(i => i.recDrafted && i.evidence?.photos?.includes(id));
    return `${all.some(i => i.kind === 'photo_source') ? '<span class="sv">Street View?</span>' : ''}${h.some(i => i.severity === 'blocker') ? '<span>Hazard</span>' : h.length || drafted ? '<span class="adv">Hazard</span>' : ''}${caps.some(i => i.evidence?.photos?.includes(id) && isOpen(i)) ? '<span class="ren">Rename</span>' : ''}${snapPhotos.find(p => p.imageId === id)?.usedAsRecImage ? '<span class="rec">Rec</span>' : ''}`;
  };
  const pfx = s => s ? s.replace(/\s+/g, ' ') : '';
  // `engine` is hidden from customers, so it can't decide this; `summary.vision` can (older reviews: `cached` exists only after a vision pass)
  const prs = S.analysis.modules.photoReview?.summary || {};
  const sawImages = prs.vision ?? (prs.cached != null || S.analysis.modules.photoReview?.engine === 'openai');
  const aiDown = aiFailedFor('photoReview');
  // photos the AI has no result for while the rest were looked at: file not uploaded, left out of the AI's answer, or
  // added in EZ after this review. Reviews made before `checked` existed can't tell, so they show nothing.
  const checked = sawImages && !aiDown && Array.isArray(prs.checked) ? new Set(prs.checked.map(String)) : null;
  const unchecked = new Set(checked ? snapPhotos.map(p => String(p.imageId)).filter(id => !checked.has(id)) : []);
  const f = S.photoFilter === 'unchecked' && !unchecked.size ? 'all' : S.photoFilter;
  const ids = snapPhotos.map(p => p.imageId).filter(id => f === 'all' || (f === 'unchecked' ? unchecked.has(String(id))
    : f === 'issues' ? pr.some(i => i.evidence?.photos?.includes(id) && (isOpen(i) || i.recDrafted)) : caps.some(i => i.evidence?.photos?.includes(id) && isOpen(i))));
  const n = unchecked.size;
  const insightsNote = aiDown ? "The AI couldn't look at the photos this time (see the note at the top), so they were checked by caption only."
    : !sawImages ? 'Photos were checked by caption only for this order. Open it in EZ and run the review to include the images.'
    : n ? `${snapPhotos.length - n} of ${snapPhotos.length} photos were checked by the AI. Press Run AI review to check the other ${n === 1 ? 'one' : n}; until then ${n === 1 ? 'it is' : 'they are'} checked by caption only.` : '';
  // same pattern as "Read the full narrative ↗" on the Narrative tab (also in the quick links as "Photo viewer")
  return `${snapPhotos.length ? `<div class="row open-viewer"><button class="primary sm" data-act="viewer" data-view="photos">View all ${snapPhotos.length} photos ↗</button><span class="small muted">Large window with every photo and its findings</span></div>` : ''}
    <div class="filters" role="group" aria-label="Photo filter">${[['issues', 'Hazards'], ['rename', 'Rename'], ['all', `All ${snapPhotos.length}`], ...(n ? [['unchecked', `Not checked ${n}`]] : [])].map(([k, l]) => `<button data-act="pfilter" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
    ${insightsNote ? `<p class="small muted">${esc(insightsNote)}</p>` : ''}
    ${!S.demo && S.origin && onImagesPage() ? '<p class="small muted">Click a photo to see it larger. Click a finding to find its photo on this page.</p>' : ''}
    ${ids.length ? `<div class="grid">${ids.map(id => { const p = snapPhotos.find(x => x.imageId === id);
      return `<button class="tile" data-act="photo" data-photo="${esc(id)}" title="${esc(p?.caption)}"><img src="${photoUrl(id)}" alt="${esc(p?.caption)}" loading="lazy" onerror="this.remove()"><span class="flags">${flags(id)}</span><span class="cap">${esc(pfx(p?.caption))}</span></button>`; }).join('')}</div>` : `<div class="empty good">${f === 'issues' ? 'No hazards found in photos' : f === 'rename' ? 'No photo names to fix' : f === 'unchecked' ? 'Every photo was checked by the AI' : 'No photos'}</div>`}
    ${pr.some(i => i.kind === 'photo_source' && (isOpen(i) || S.itemState[i.id])) ? `<h3>Where the photos came from</h3>${list(pr.filter(i => i.kind === 'photo_source'), '')}` : ''}
    ${draftedBox(pr)}
    <h3>Hazards without a recommendation</h3>${list(pr.filter(i => i.kind !== 'photo_source'), pr.some(i => i.recDrafted) ? 'Every other hazard seen is covered by a recommendation' : 'Every hazard seen is covered by a recommendation')}
    <h3>Photo names</h3>${list(caps, 'Photo names look fine')}`;
}

/** Photo hazards the review drafted a recommendation for: one short pointer each to the Recs card, which is the one
 *  place to act (not counted here, no Apply / Dismiss of their own). */
function draftedBox(pr) {
  const d = pr.filter(i => i.recDrafted); if (!d.length) return '';
  const st = { applied: 'Applied in EZ', dismissed: 'Dismissed' };
  return `<h3>Hazards with a drafted recommendation</h3>${d.map(i => { const id = i.evidence?.photos?.[0], s = st[S.itemState[i.recItemId]?.status];
    return `<div class="drafted">${id ? `<img class="thumb" src="${photoUrl(id)}" alt="Photo ${esc(id)}" data-act="photo" data-photo="${esc(id)}" onerror="this.outerHTML='<span class=&quot;thumb ph&quot;>${esc(id)}</span>'">` : ''}
      <div><b>${esc(i.title)}</b><small>${esc(i.message || '')}</small></div>
      ${s ? `<span class="state">${s}</span>` : `<button class="link sm" data-act="gotab" data-tab="recs" data-item="${esc(i.recItemId || '')}">See in Recs ›</button>`}</div>`; }).join('')}`;
}

/** Open rec-photo suggestions that only set a photo picker that is on the open page. */
const suggestedPhotos = () => itemsOf(['recPhotos']).filter(i => isOpen(i) && !S.itemState[i.id] && i.proposedWrites?.length
  && i.proposedWrites.every(w => w.kind === 'recImage' && S.present[w.key]));
function viewRecs() {
  const sp = S.demo ? [] : suggestedPhotos();
  const recOpen = itemsOf(['recPhotos']).some(i => isOpen(i) && !S.itemState[i.id]);
  return `<h3>Recommendations</h3>${list(itemsOf(['recommendations']), 'Recommendations look complete')}
    <h3>Recommendation photos</h3>
    ${sp.length > 1 ? `<div class="row open-viewer"><button class="primary sm" data-act="applyphotos">Use ${sp.length} suggested photos</button><span class="small muted">Sets each photo picker on this form; Undo is one click</span></div>`
      : recOpen && !S.demo && S.recForm && !sp.length ? `<div class="row open-viewer"><button class="ghost sm" data-act="openform" data-form="${esc(S.recForm.formId)}">Open ${esc(S.recForm.name)}</button><span class="small muted">Photo pickers there show thumbnails</span></div>` : ''}
    ${list(itemsOf(['recPhotos']), 'Every recommendation has a suitable photo')}`;
}

/** An EZ section title as a short name: "Property Hazards (applies to both Property & Liability Only coverageDUPLICATE
 *  Description:" → "Property Hazards". EZ's titles carry the help text in brackets (sometimes never closed), the word
 *  DUPLICATE and, for duplicated sections, the whole title twice. */
const secName = t => { const s = String(t || '').replace(/\s*DUPLICATE[\s\S]*$/, '').replace(/\s*\([\s\S]*$/, '').replace(/\s+/g, ' ').trim(); return s || String(t || '').trim(); };
/** The same title without the junk but with its help text, for a tooltip. */
const secFull = t => { let s = String(t || '').replace(/\s*DUPLICATE[\s\S]*$/, '').replace(/\s+/g, ' ').trim(); const h = s.length / 2;
  if (s.length % 2 === 1 && s.slice(0, h - .5) === s.slice(h + .5)) s = s.slice(0, h - .5);   // the title twice
  return (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length ? s + ')' : s; };

function viewQuestions() {
  const items = itemsOf(['questions']).filter(i => isOpen(i) || S.itemState[i.id]);
  if (!items.length) return `<h3>Yes/No answers</h3><div class="empty good">No answers to change</div>`;
  const groups = {}; for (const i of items) (groups[i.section || formFor(i.evidence?.fields?.[0] || '')?.section || 'Other'] ||= []).push(i);
  return `<h3>Yes/No answers</h3>` + Object.entries(groups).map(([sec, list]) => `<div class="small muted" style="margin:10px 2px 0" title="${esc(secFull(sec))}">${esc(secName(sec))}</div>${list.sort((a, b) => rank(a) - rank(b)).map(i => card(i)).join('')}`).join('');
}

function viewNarrative() {
  const all = itemsOf(['narrative']), draft = all.find(i => i.kind === 'draft');
  const issues = all.filter(i => i.kind !== 'rewrite' && i.kind !== 'draft');   // old reviews may still carry a rewrite
  const s = S.analysis.modules.narrative?.summary || {};
  return `<div class="row open-viewer"><button class="primary sm" data-act="viewer" data-view="narrative">Read the full narrative ↗</button><span class="small muted">Large window with the issues highlighted${draft ? ', and the draft' : ''}</span></div>
    ${draft ? draftBlock(draft) : ''}
    ${s.questions ? `<p class="small muted qset">${esc(client() ? client() + ' question set' : 'Question set')}: ${s.answered} of ${s.questions} answered in the report${s.gl ? ' · GL questions included' : ' · property only, no GL questions'}${s.hazardousTenants?.length ? ` · ${s.hazardousTenants.map(t => t.replace('_', ' ')).join(', ')} questions` : ''}</p>` : ''}
    <h3>Narrative issues</h3>${list(issues, 'No issues in the narrative')}`;
}

/** The drafted narrative: read it, copy it, or put it into the EZ narrative box (Undo restores the old text). */
function draftBlock(i) {
  const st = S.itemState[i.id] || {}, w = i.proposedWrites?.[0];
  const canApply = !S.demo && w && S.present[w.key], where = w && !canApply && !S.demo ? formFor(w.key) : null;
  const text = esc(i.after).replace(/\[\[confirm:([^\]]*)\]\]/gi, '<mark class="confirm">confirm:$1</mark>');
  const words = (i.after.match(/\S+/g) || []).length;
  const actions = st.status === 'applied' ? `<span class="state">In the EZ narrative box</span><button class="link sm" data-act="undo" data-id="${esc(i.id)}">Undo</button><span class="why">Save in EZ to keep it</span>`
    : st.status === 'dismissed' ? `<span class="why">Not used</span><button class="link sm" data-act="restore" data-id="${esc(i.id)}">Restore</button>`
    : [canApply ? `<button class="primary sm" data-act="apply" data-id="${esc(i.id)}">${i.before ? 'Replace narrative in EZ' : 'Put draft in EZ'}</button>`
        : S.demo ? '<span class="why">Open the order in EZ to use it</span>'
        : where?.formId ? `<button class="ghost sm" data-act="openform" data-form="${esc(where.formId)}">Open ${esc(where.form)}</button>` : '',
       `<button class="ghost sm" data-act="copy" data-text="${esc(i.after)}">Copy</button>`,
       `<button class="ghost sm" data-act="reason" data-id="${esc(i.id)}" data-reason="other">Don't use</button>`].join('');
  return `<section class="draft ${st.status || ''}" aria-label="Draft narrative">
    <div class="dhd"><h3>Draft narrative</h3><span class="small muted">${words} words${client() ? ` · ${esc(client())} style` : ''}</span></div>
    ${i.confirm ? `<p class="small confirm-note">${esc(i.message)}</p>` : ''}
    <div class="dtext${S.draftOpen ? ' open' : ''}">${text}</div>
    <button class="link sm" data-act="draftmore">${S.draftOpen ? 'Show less' : 'Show all'}</button>
    <div class="actions">${actions}</div></section>`;
}

function viewFinish() {
  const q = S.analysis.modules.qcChecklist?.summary || {};
  const o = outcomeItems(), c = d => o.filter(x => x.decision === d).length;
  const s6 = Object.entries(q.section6 || {}).map(([k, v]) => `<div class="cl"><span class="dot ${v ? 'no' : 'ok'}" title="${v ? 'Issues' : 'OK'}"></span><span>${esc(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))}${v ? ' issues' : ''}</span></div>`).join('');
  const rating = q.rating ?? null;
  return `<h3>Inspector feedback (QC checklist 6–8)</h3>
    ${s6 ? `<div class="small muted">6. Issues by area</div>${s6}` : ''}
    ${rating != null ? `<div style="margin-top:10px"><span class="small muted">7. Suggested rating of the report as received</span><div class="row" style="margin-top:2px"><b style="font-size:18px">${rating}/10</b><div class="rating">${Array.from({ length: 10 }, (_, k) => `<i class="${k < rating ? 'on' : ''}"></i>`).join('')}</div></div><span class="small muted">${esc(q.ratingReason || '')}</span></div>` : ''}
    ${q.section8Draft ? `<div class="small muted" style="margin-top:10px">8. Note to the inspector (draft)</div><div class="quote">${esc(q.section8Draft)}</div><div class="row"><button class="ghost sm" data-act="copy" data-text="${esc(q.section8Draft)}">Copy note</button></div>` : ''}
    <h3>This review</h3>
    <p class="small">${c('applied')} applied · ${c('dismissed')} dismissed · ${c('undone')} undone · ${c('not acted')} not acted on</p>
    <div class="row"><button class="ghost sm" data-act="outcome">Save QC outcome</button><span class="small muted" id="outcomeMsg"></span></div>
    <p class="small muted">Saves what you did with every finding of this review (applied, dismissed with the reason, undone or left as is), with the inspector feedback above.</p>`;
}

// ---------------------------------------------------------------- actions
const findItem = id => Object.values(S.analysis?.modules || {}).flatMap(m => m.items || []).find(i => i.id === id);
/** Every finding of this review you could act on, and what you did with it: applied, dismissed (+ reason), undone, or
 *  not acted on. Saved with the QC outcome. Info notes, passes and photo pointers to a rec are left out. */
function outcomeItems() {
  if (!S.analysis) return [];
  return Object.entries(S.analysis.modules).filter(([k]) => !['qcChecklist', 'orderBrief'].includes(k)).flatMap(([k, m]) => (m.items || []).map(i => ({ ...i, module: i.module || k })))
    .filter(i => !i.recDrafted && (isOpen(i) || S.itemState[i.id] || S.undone?.[i.id] || (i.proposedWrites?.length && i.status !== 'pass')))
    .map(i => { const st = S.itemState[i.id] || {};
      const decision = st.status === 'applied' ? 'applied' : st.status === 'dismissed' ? 'dismissed' : S.undone?.[i.id] ? 'undone' : 'not acted';
      return { itemId: i.id, module: i.module, kind: i.kind || null, title: String(i.title || '').slice(0, 200), severity: i.status === 'fail' ? i.severity : 'info', decision,
        reason: st.status === 'dismissed' ? st.reason || null : null, at: st.at || (S.undone?.[i.id] ?? null) }; });
}
async function saveState() { await chrome.storage.session.set({ ['items_' + S.analysis.analysisId]: S.itemState, ['undone_' + S.analysis.analysisId]: S.undone || {} }).catch(() => {}); }
function feedback(i, decision, extra = {}) {
  send({ type: 'FEEDBACK', body: { analysisId: S.analysis.analysisId, orderId: S.orderId, trigger: 'manual', items: [{ itemId: i.id, module: i.module, decision,
    proposedValue: i.proposedWrites?.map(w => w.value).join(' | ').slice(0, 2000) || null, severity: i.severity, title: i.title, ...extra }] } }).catch(() => {});
}

async function onPanelClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) {   // a click anywhere else on a finding jumps to its question in EZ ("Show photo ›" opens the large viewer)
    const card = e.target.closest('.item.locatable');
    if (card && !e.target.closest('.reasons, .diff, .quote, a, input, select, textarea')) locate(findItem(card.dataset.item), { view: !!e.target.closest('.goto') });
    return;
  }
  const act = b.dataset.act, i = b.dataset.id ? findItem(b.dataset.id) : null;
  if (['apply', 'applyphotos', 'undo'].includes(act) && S.prep?.orderId === S.orderId) S.prep = null;   // the form changed: Run reads it again
  if (act === 'apply' && i) {
    b.disabled = true; b.textContent = 'Applying…';
    try {
      // drafted U/W answers never carry EZ field keys / photo ids into EZ (reviews made before the server cleaned them)
      const writes = i.proposedWrites.map(w => w.kind === 'text' && i.module === 'uwConcerns' ? { ...w, value: String(w.value).split(/\r?\n/).map(noCodes).join('\n') } : w);
      const r = await send({ type: 'APPLY', tabId: S.tab, writes });
      const ok = r.results.filter(x => x.ok);
      if (!ok.length) { b.textContent = r.results[0]?.reason || 'Not on this page'; return; }
      S.itemState[i.id] = { status: 'applied', at: Date.now(), keys: ok.map(x => x.resolved), prev: ok.map(x => ({ key: x.resolved, prev: x.prev, kind: x.kind })) };
      S.undoStack = S.undoStack.filter(x => x !== i.id).concat(i.id);
      toast(`Applied in EZ: ${i.title.slice(0, 48)}`, { label: 'Undo', run: () => undoItem(i.id) });
      feedback(i, 'applied', { partial: ok.length < r.results.length });
      await saveState(); render();
    } catch (err) { b.textContent = err.message; }
  } else if (act === 'applyphotos') {   // every suggested rec photo whose picker is on the open page, one click
    b.disabled = true; b.textContent = 'Applying…';
    const done = [];
    for (const it of suggestedPhotos()) {
      const r = await send({ type: 'APPLY', tabId: S.tab, writes: it.proposedWrites }).catch(() => null);
      const ok = (r?.results || []).filter(x => x.ok); if (!ok.length) continue;
      S.itemState[it.id] = { status: 'applied', at: Date.now(), keys: ok.map(x => x.resolved), prev: ok.map(x => ({ key: x.resolved, prev: x.prev, kind: x.kind })) };
      feedback(it, 'applied', { bulk: true }); done.push(it.id);
    }
    await saveState(); render();
    toast(done.length ? `Applied ${done.length} rec photo${done.length > 1 ? 's' : ''} in EZ` : 'No rec photos could be set on this page',
      done.length ? { label: 'Undo', run: async () => { for (const id of done) await undoItem(id); } } : undefined);
  } else if (act === 'undo' && i) {
    await undoItem(i.id);
  } else if (act === 'dismiss' && i) {
    const r = $('panel').querySelector(`[data-reasons="${CSS.escape(i.id)}"]`); if (r) r.hidden = !r.hidden;
  } else if (act === 'reason' && i) {
    S.itemState[i.id] = { status: 'dismissed', reason: b.dataset.reason, at: Date.now() }; feedback(i, 'dismissed', { reason: b.dataset.reason }); await saveState(); render();
  } else if (act === 'restore' && i) {
    delete S.itemState[i.id]; await saveState(); render();
  } else if (act === 'focus') {
    await jumpTo(b.dataset.key);
  } else if (act === 'openform') {
    if (!S.origin) return;
    await chrome.tabs.update(S.tab, { url: `${S.origin}${ezScript()}?g=3&orderid=${S.orderId}&formid=${b.dataset.form}&copyformnum=0` });
  } else if (act === 'photo') {
    await photoClick(b.dataset.photo);
  } else if (act === 'openprior') {   // the prior survey's order page, in a new tab next to this one (read-only GET)
    if (!S.origin) return;
    const cur = await chrome.tabs.get(S.tab).catch(() => null);
    await chrome.tabs.create({ url: `${S.origin}${ezScript()}?g=3&orderid=${encodeURIComponent(b.dataset.order)}`, index: cur ? cur.index + 1 : undefined, active: true });
  } else if (act === 'openimages') {
    await openImages();
  } else if (act === 'viewer') {
    await openViewer(b.dataset.view);
  } else if (act === 'pfilter') { S.photoFilter = b.dataset.f; render(); }
  else if (act === 'copy') { await navigator.clipboard.writeText(b.dataset.text).catch(() => {}); b.textContent = 'Copied'; }
  else if (act === 'draftmore') { S.draftOpen = !S.draftOpen; render(); }
  else if (act === 'earth' || act === 'maps') {
    const a = sfFacts().address; if (!a) return;
    const cur = S.tab ? await chrome.tabs.get(S.tab).catch(() => null) : null;
    await chrome.tabs.create({ url: act === 'earth' ? earthUrl(a) : mapsUrl(a), index: cur ? cur.index + 1 : undefined });
  }
  else if (act === 'gotab') { S.current = b.dataset.tab; render(); const el = b.dataset.item && document.querySelector(`[data-item="${CSS.escape(b.dataset.item)}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); } }
  else if (act === 'outcome') {
    const q = S.analysis.modules.qcChecklist?.summary || {}, items = outcomeItems(), c = d => items.filter(x => x.decision === d).length;
    b.disabled = true;
    await send({ type: 'API', method: 'POST', path: `/v1/orders/${S.orderId}/qc-outcome`, body: { analysisId: S.analysis.analysisId, inspector: S.snapshot?.order?.inspector, section6: q.section6, rating: q.rating, note: q.section8Draft,
      applied: c('applied'), dismissed: c('dismissed'), undone: c('undone'), notActed: c('not acted'), items } })
      .then(() => { $('outcomeMsg').textContent = `Saved: ${items.length} findings`; }, err => { $('outcomeMsg').textContent = friendlyError(err); }).finally(() => { b.disabled = false; });
  }
}

// panel lightbox (demo mode / not on EZ): same zoom + pan controls as the on-page viewer and the NSR extension
const LB = { scale: 1, tx: 0, ty: 0, drag: null };
function lbApply() {
  const lb = $('lightbox');
  lb.querySelector('img').style.transform = `translate(${LB.tx}px, ${LB.ty}px) scale(${LB.scale})`;
  lb.querySelector('.lb-zoom').textContent = `${Math.round(LB.scale * 100)}%`;
  lb.querySelector('.lb-stage').classList.toggle('is-zoomed', LB.scale > 1);
}
function lbZoom(d) { LB.scale = Math.min(6, Math.max(1, LB.scale + d)); if (LB.scale === 1) LB.tx = LB.ty = 0; lbApply(); }
function lbFit() { LB.scale = 1; LB.tx = LB.ty = 0; lbApply(); }
function initLightbox() {
  const lb = $('lightbox'), stage = lb.querySelector('.lb-stage');
  lb.onclick = e => { if (e.target.closest('.lb-close') || e.target === lb) lb.hidden = true; const z = e.target.closest('[data-lbz]'); if (z) lbZoom(Number(z.dataset.lbz) * 0.25); };
  stage.addEventListener('wheel', e => { e.preventDefault(); lbZoom(-e.deltaY * 0.0015); }, { passive: false });
  stage.addEventListener('dblclick', () => (LB.scale > 1 ? lbFit() : lbZoom(1)));
  stage.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); LB.drag = { x: e.clientX - LB.tx, y: e.clientY - LB.ty }; stage.classList.add('is-dragging'); });
  addEventListener('pointermove', e => { if (!LB.drag) return; LB.tx = e.clientX - LB.drag.x; LB.ty = e.clientY - LB.drag.y; lbApply(); });
  addEventListener('pointerup', () => { LB.drag = null; stage.classList.remove('is-dragging'); });
  addEventListener('keydown', e => {
    if (lb.hidden) return;
    const k = { Escape: () => (lb.hidden = true), '+': () => lbZoom(0.25), '=': () => lbZoom(0.25), '-': () => lbZoom(-0.25), 0: lbFit }[e.key];
    if (k) { e.preventDefault(); k(); }
  });
}
function openLightbox(id) {
  const p = (S.snapshot?.photos || []).find(x => x.imageId === id);
  $('lightbox').querySelector('img').src = photoUrl(id); $('lightbox').querySelector('.lb-cap').textContent = `${id} · ${p?.caption || ''}`; $('lightbox').hidden = false;
  lbFit();
}

async function checkPresence() {
  if (!S.analysis || S.demo || !S.tab || S.det.orderId !== S.orderId) { S.present = {}; return; }
  const keys = [...new Set(Object.values(S.analysis.modules).flatMap(m => m.items || []).flatMap(i => (i.proposedWrites || []).map(w => w.key)))];
  if (!keys.length) return;
  S.present = await send({ type: 'PRESENT', tabId: S.tab, keys }).catch(() => ({})) || {};
  render();
}

async function highlight() {
  const items = Object.values(S.analysis?.modules || {}).flatMap(m => m.items || []).filter(i => isOpen(i) && !S.itemState[i.id])
    .flatMap(i => (i.evidence?.fields || []).map(key => ({ key, severity: i.severity, title: i.title })));
  const r = await send({ type: 'HIGHLIGHT', tabId: S.tab, items }).catch(() => null);
  S.hl = true; $('btnClearHl').hidden = false;
  $('btnHighlight').textContent = r?.onPage ? `${r.onPage} highlighted on this page` : 'Nothing to highlight on this page';
  setTimeout(() => { $('btnHighlight').textContent = 'Highlight on page'; }, 2500);
}

init();

// ---------------------------------------------------------------- jump to question
/** The EZ field a finding is about: first evidence field, else the field its fix writes to. */
function targetKey(i) {
  let k = i?.evidence?.fields?.[0] || i?.proposedWrites?.find(w => !/:new$/.test(w.key))?.key;
  if (!k) return null;
  k = k.replace(/^RECIMAGEID_/, '');
  return S.recToQ[k] || k;   // a rec box on the General Form → the question that triggers it
}
function locateLabel(i) {
  if (!i || i.status === 'pass') return null;
  const k = targetKey(i);
  if (k && /^caption\d+/.test(k)) return 'Show photo';
  if (k) return 'Go to question';
  return i.evidence?.photos?.length ? 'Show photo' : null;
}
/** view = the "Show photo ›" label was clicked: open the large viewer. A click on the rest of a photo finding, on
 *  the Images page, scrolls EZ to that photo and outlines it (rename findings: its caption box is ready to edit). */
async function locate(i, { view = false } = {}) {
  if (!i) return;
  const key = targetKey(i);
  const photo = i.evidence?.photos?.[0] || (key && /^caption\d+/.test(key) ? key.replace('caption', '') : null);
  if (!key || /^caption/.test(key)) {
    if (onImagesPage() && !view) {
      const r = await send(key ? { type: 'FOCUS', tabId: S.tab, key } : { type: 'FOCUS_PHOTO', tabId: S.tab, imageId: photo }).catch(() => null);
      if (r?.ok) return toast(key ? 'Here is the photo. Its caption box is ready to edit' : 'Here is the photo on the Images page');
    }
    if (photo) return showPhoto(photo);
    return;
  }
  await jumpTo(key);
}
/** Scroll EZ to a field; if it lives on another form, open that form and scroll once it has loaded. */
async function jumpTo(key) {
  if (S.demo || !S.origin || S.det?.orderId !== S.orderId) return toast('Open this order in EZ to jump to the question');
  const r = await send({ type: 'FOCUS', tabId: S.tab, key }).catch(() => null);
  if (r?.ok) return toast('Here is the question');
  const f = formFor(key);
  if (f?.formId && String(f.formId) !== String(S.det.formId)) {
    toast(S.undoStack.length ? `Opening ${f.form}… EZ will ask before leaving unsaved changes` : `Opening ${f.form}…`);
    S.pendingFocus = key;
    await chrome.tabs.update(S.tab, { url: `${S.origin}${ezScript()}?g=3&orderid=${S.orderId}&formid=${f.formId}&copyformnum=0` });
    return;
  }
  toast(r?.reason || 'That question is not on this page');
}
const onImagesPage = () => !S.demo && S.det?.page === 'images' && S.det.orderId === S.orderId;
/** A photo (tile or thumbnail) was clicked in the panel: open the large viewer, on every page. */
async function photoClick(id) { return showPhoto(id); }
/** Open this order's Images page in a new tab next to the current one (or switch to it if it's already open). */
async function openImages() {
  if (S.demo || !S.origin || !S.orderId) return toast('Open the order in EZ first');
  const url = `${S.origin}${ezScript()}?g=O&orderid=${S.orderId}&buttonact=Upload&butparam=`;
  const open = (await chrome.tabs.query({})).find(t => t.url === url);
  if (open) { await chrome.tabs.update(open.id, { active: true }); return; }
  const cur = await chrome.tabs.get(S.tab).catch(() => null);
  toast('Opening the Images page in a new tab…');
  await chrome.tabs.create({ url, index: cur ? cur.index + 1 : undefined, openerTabId: S.tab });
}

/** All photos / the full narrative in a large window of their own (reused if already open). */
async function openViewer(view, photo) {
  if (!S.orderId) return toast('Choose an order first');
  const base = chrome.runtime.getURL('viewer/viewer.html');
  const ez = { tab: S.demo ? '' : String(S.tab || ''), origin: S.demo ? '' : S.origin || '', script: ezScript() };
  const open = (await chrome.tabs.query({}).catch(() => [])).find(t => t.url?.startsWith(base));
  if (open) {
    await chrome.windows.update(open.windowId, { focused: true }).catch(() => {});
    await chrome.tabs.update(open.id, { active: true });
    chrome.runtime.sendMessage({ type: 'VIEWER_SHOW', orderId: S.orderId, view, photo, ...ez }).catch(() => {});
    return;
  }
  const p = new URLSearchParams({ order: S.orderId, view, ...ez }); if (photo) p.set('photo', photo);
  const width = Math.min(screen.availWidth - 40, 1440), height = Math.min(screen.availHeight - 40, 940);
  await chrome.windows.create({ url: `${base}?${p}`, type: 'popup', width, height, left: Math.max(0, Math.round((screen.availWidth - width) / 2)), top: Math.max(0, Math.round((screen.availHeight - height) / 2)) });
}

async function showPhoto(id) {
  const photos = S.snapshot?.photos || [];
  const ids = photos.map(p => p.imageId);
  if (!S.demo && S.origin && S.det?.orderId === S.orderId && ids.length) {
    const r = await send({ type: 'SHOW_PHOTOS', tabId: S.tab, orderId: S.orderId, imageIds: ids, exts: photos.map(p => p.ext), captions: photos.map(p => p.caption), index: Math.max(0, ids.indexOf(id)) }).catch(() => null);
    if (r?.ok) return;
  }
  openLightbox(id);
}

// ---------------------------------------------------------------- undo
function renderUndoBar() {
  // derived from the saved item state, so the bar survives closing and reopening the panel
  S.undoStack = Object.entries(S.itemState).filter(([, st]) => st.status === 'applied').sort((a, b) => a[1].at - b[1].at).map(([id]) => id);
  const n = S.undoStack.length;
  $('undoBar').hidden = n === 0;
  $('undoCount').textContent = n; $('undoLabel').textContent = n === 1 ? 'change' : 'changes';
}
async function revertItem(id) {
  const st = S.itemState[id]; if (!st || st.status !== 'applied') return null;
  const r = await send({ type: 'REVERT', tabId: S.tab, keys: st.prev || st.keys || [] }).catch(e => ({ ok: false, error: e.message }));
  const i = findItem(id); if (i) feedback(i, 'reverted');
  (S.undone ||= {})[id] = Date.now();   // remembered for the QC outcome
  delete S.itemState[id]; S.undoStack = S.undoStack.filter(x => x !== id);
  return r;
}
async function undoItem(id) {
  const r = await revertItem(id); if (!r) return;
  await saveState(); render();
  toast(r.ok ? 'Change undone' : 'Undone. Open the form again to see the original value');
}
async function undoLast() { const id = S.undoStack.at(-1); if (id) await undoItem(id); }
async function undoAll() {
  const ids = [...S.undoStack].reverse();
  for (const id of ids) await revertItem(id);
  await saveState(); render();
  toast(`${ids.length} change${ids.length === 1 ? '' : 's'} undone`);
}

// ---------------------------------------------------------------- page status strip
const PB_ICON = {
  form: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  images: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/>',
  order: '<path d="M3 7h6l2 2h10v10H3z"/>',
  report: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  orders_list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  logged_out: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
// ---------------------------------------------------------------- quick links to the order's EZ pages
/** Order page · each form · Images · Report, under the page bar. Shown while the EZ tab is on the reviewed order;
 *  the page the EZ tab shows is marked. Forms come from the order's snapshot (or the form open right now). */
function renderQuickLinks() {
  const d = S.det || {}, nav = $('quickLinks');
  const on = !S.demo && !!S.origin && !!S.orderId && d.orderId === S.orderId && ['order', 'form', 'images', 'report'].includes(d.page);
  nav.hidden = !on; if (!on) { nav.innerHTML = ''; return; }
  const forms = (S.snapshot?.forms || []).map(f => ({ id: String(f.formId), name: f.name }));
  if (d.page === 'form' && d.formId && !forms.some(f => f.id === String(d.formId))) forms.push({ id: String(d.formId), name: 'This form' });
  const link = (label, attrs, current, title) => `<button class="ql" ${attrs}${current ? ' aria-current="page"' : ''} title="${esc(title)}">${esc(label)}</button>`;
  nav.innerHTML = '<span class="ql-label">Go to</span>' + [
    link('Order', 'data-ql="order"', d.page === 'order', 'Order page: status, fees, forms list'),
    ...forms.map(f => link(f.name.replace(/^recommendations$/i, 'Recs'), `data-ql="form" data-form="${esc(f.id)}"`, d.page === 'form' && String(d.formId) === f.id, `Open ${f.name}`)),
    link('Images', 'data-ql="images"', d.page === 'images', 'Images page, in a tab next to this one (photo names are changed there)'),
    link('Report', 'data-ql="report"', d.page === 'report', 'Report view: the whole inspection, read only'),
  ].join('')
    // the photo viewer: ready once the order has been read (photos uploaded), no review needed
    + (S.snapshot?.photos?.length ? `<span class="ql-group"><span class="ql-sep" aria-hidden="true"></span>${link('Photo viewer', 'data-ql="photos"', false, `All ${S.snapshot.photos.length} photos in a large window`)}</span>` : '');
}
/** Open one of the order's pages in the EZ tab (Images: in a tab next to it, as before). */
async function onQuickLink(e) {
  const b = e.target.closest('[data-ql]'); if (!b || b.getAttribute('aria-current') === 'page' || !S.origin || !S.orderId) return;
  const which = b.dataset.ql;
  if (which === 'images') return openImages();
  if (which === 'photos') return openViewer('photos');
  const base = `${S.origin}${ezScript()}?`;
  const url = which === 'order' ? `${base}g=3&orderid=${S.orderId}`
    : which === 'report' ? `${base}g=F&A=0&orderid=${S.orderId}`
    : `${base}g=3&orderid=${S.orderId}&formid=${encodeURIComponent(b.dataset.form)}&copyformnum=0`;
  const name = which === 'order' ? 'the order page' : which === 'report' ? 'the report' : b.textContent;
  toast(S.undoStack.length ? `Opening ${name}… EZ will ask before leaving unsaved changes` : `Opening ${name}…`);
  await chrome.tabs.update(S.tab, { url });
}

/** Tell the operator where they are in EZ and what the panel can do on this page. `changed` = the EZ tab just moved to another page. */
function renderPageBar(changed) {
  // the page type is shown only here (the order number is on the order card); no sub-line on EZ order pages
  const d = S.det || { page: 'none' };
  const formName = S.snapshot?.forms?.find(f => String(f.formId) === String(d.formId))?.name || d.formName || 'Form';
  let [title, sub, kind] = {
    form: [formName, '', 'form'],
    images: ['Images page', '', 'images'],
    order: ['Order page', '', 'order'],
    report: ['Report view', 'Read only', 'report'],
    orders_list: ['Orders list', 'Open an order (click its OID) to review it.', 'orders_list'],
    logged_out: ['EZ session expired', 'Log in to EZ again, then reopen the order.', 'logged_out'],
    other: ['EZSurveyForm', 'Open an order to review it.', 'info'],
  }[d.page] || ['Not on EZ', 'Open an EZ order in this tab to review it.', 'info'];
  // how many open findings can be applied right here
  let here = 0;
  if (S.analysis && !S.demo && d.orderId === S.orderId) here = Object.values(S.analysis.modules).flatMap(m => m.items || [])
    .filter(i => isOpen(i) && !S.itemState[i.id] && (i.proposedWrites || []).some(w => S.present[w.key])).length;
  if (S.analysis && d.orderId && d.orderId !== S.orderId && !S.demo) sub = `The review shown is for order ${S.orderId}.`;
  const bar = $('pageBar');
  bar.className = 'pagebar ' + (d.page === 'logged_out' ? 'is-error' : ['form', 'images', 'order', 'report'].includes(d.page) ? 'is-ez' : '');
  $('pbIcon').innerHTML = `<svg viewBox="0 0 24 24">${PB_ICON[kind] || PB_ICON.info}</svg>`;
  $('pbTitle').textContent = title;
  $('pbSub').textContent = sub;
  $('pbCount').hidden = !here; $('pbCount').textContent = `${here} to apply here`;
  renderQuickLinks();
  if (changed) {
    bar.classList.remove('is-changed'); void bar.offsetWidth; bar.classList.add('is-changed');
    toast(`Now on: ${title}${here ? ` · ${here} fix${here > 1 ? 'es' : ''} can be applied here` : ''}`);
  }
}
