// SmartFill full-size viewer, opened from the side panel in its own window:
//   viewer.html?order=<id>&tab=<EZ tab id>&origin=<EZ origin>&view=photos|narrative
// Photos: every photo of the order in one grid (filters, search, size), click → zoom/pan viewer with the AI's notes.
// Narrative: the whole text with the issue sentences highlighted (no rewrite: the reviewer edits the text in EZ).
// Read-only: nothing here writes into EZ or moves the EZ tab.
import { renderBrand } from '../common/brand.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const send = msg => new Promise((ok, bad) => chrome.runtime.sendMessage(msg, r => {
  if (chrome.runtime.lastError) return bad(new Error(chrome.runtime.lastError.message));
  r?.ok ? ok(r.data) : bad(new Error(r?.error || 'no response'));
}));

const q = new URLSearchParams(location.search);
const V = { orderId: Number(q.get('order')), tab: Number(q.get('tab')) || null, origin: q.get('origin') || null, script: q.get('script') || '/cgi-bin/current/aa.cgi', view: q.get('view') === 'narrative' ? 'narrative' : 'photos',
  cfg: null, analysis: null, snapshot: null, itemState: {}, filter: 'all', search: '', size: 'm', list: [], idx: -1, insights: {}, nActive: null };

const itemsOf = mods => mods.flatMap(m => (V.analysis?.modules?.[m]?.items || []).map(i => ({ ...i, module: i.module || m })));
const isOpen = i => i.status === 'fail' && i.severity !== 'info' && !['applied', 'dismissed'].includes(V.itemState[i.id]?.status);
const photos = () => V.snapshot?.photos || [];
const photoUrl = id => `${V.cfg.apiBase}/v1/orders/${V.orderId}/photos/${encodeURIComponent(id)}?token=${encodeURIComponent(V.cfg.bearer || '')}`;
// fallback when the photo was never uploaded to SmartFill: EZ's own file (case-sensitive extension)
const ezUrl = p => V.origin ? `${V.origin}/orders/${String(V.orderId).padStart(7, '0').split('').join('/')}/${p.imageId}l${p.ext || '.jpg'}` : '';
const imgTag = (p, cls = '') => `<img class="${cls}" src="${photoUrl(p.imageId)}" alt="${esc(p.caption)}" loading="lazy" data-ez="${esc(ezUrl(p))}">`;
document.addEventListener('error', e => {   // one retry from EZ, then a placeholder
  const img = e.target; if (img.tagName !== 'IMG' || !('ez' in img.dataset)) return;
  if (img.dataset.ez && !img.dataset.tried) { img.dataset.tried = '1'; img.src = img.dataset.ez; return; }
  if (img.closest('.im')) { img.closest('.im').insertAdjacentHTML('beforeend', '<span class="ph">Photo not available</span>'); img.remove(); }
}, true);

// ---------------------------------------------------------------- theme (same setting as the panel)
const darkMq = matchMedia('(prefers-color-scheme: dark)');
let themePref = 'system';
function applyTheme() {
  document.documentElement.dataset.theme = themePref === 'system' ? (darkMq.matches ? 'dark' : 'light') : themePref;
  $('btnTheme').dataset.pref = themePref; $('btnTheme').title = `Theme: ${themePref === 'system' ? 'match system' : themePref} (click to change)`;
}
document.documentElement.dataset.theme = darkMq.matches ? 'dark' : 'light';

// ---------------------------------------------------------------- toast
let toastTimer = null;
function toast(text, action) {
  $('toastText').textContent = text;
  const b = $('toastAction'); b.hidden = !action; if (action) { b.textContent = action.label; b.onclick = () => { $('toast').classList.remove('is-visible'); action.run(); }; }
  $('toast').classList.add('is-visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('is-visible'), action ? 6000 : 3200);
}

// ---------------------------------------------------------------- data
async function load() {
  V.cfg = await send({ type: 'GET_CONFIG' });   // fresh photo token each load (access tokens last 15 min)
  const [analysis, snap] = await Promise.all([
    send({ type: 'LATEST', orderId: V.orderId }).catch(() => null),
    send({ type: 'API', method: 'GET', path: `/v1/orders/${V.orderId}/snapshot` }).catch(() => null)]);
  V.analysis = analysis; V.snapshot = snap?.snapshot || null; V.insights = {}; V.checked = checkedSet();
  V.itemState = analysis ? ((await chrome.storage.session.get('items_' + analysis.analysisId).catch(() => ({})))['items_' + analysis.analysisId] || {}) : {};
  const o = V.snapshot?.order || {};
  $('vOrder').textContent = `Order ${V.orderId}`;
  $('vAddr').textContent = [o.insured, o.location].filter(Boolean).join(' · ');
  document.title = `SmartFill · Order ${V.orderId}`;
  render();
}

function render() {
  for (const b of document.querySelectorAll('.vtabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.view === V.view));
  $('viewPhotos').hidden = V.view !== 'photos'; $('viewNarrative').hidden = V.view !== 'narrative';
  $('nPhotos').textContent = photos().length;
  const nIssues = narrativeIssues().filter(isOpen);
  $('nNarr').textContent = nIssues.length; $('nNarr').classList.toggle('red', nIssues.some(i => i.severity === 'blocker'));
  if (!V.snapshot) {
    const msg = '<div class="empty">No review for this order yet. Run the review from the SmartFill panel first.</div>';
    $('pGrid').innerHTML = msg; $('nText').innerHTML = msg; $('nIssues').innerHTML = ''; $('pFilters').innerHTML = ''; return;
  }
  V.view === 'photos' ? renderPhotos() : renderNarrative();
}

// ---------------------------------------------------------------- photos
// `engine` is hidden from customers; `summary.vision` says whether the images were looked at (older reviews: `cached`)
const sawImages = () => { const pr = V.analysis?.modules?.photoReview; return pr?.summary?.vision ?? (pr?.summary?.cached != null || pr?.engine === 'openai'); };
const photoAiDown = () => V.analysis?.aiStatus?.ok === false && (V.analysis.aiStatus.modules || []).includes('photoReview');
/** The photos the AI has a result for in this review, or null when that isn't known (no vision pass, AI down, or a
 *  review made before `checked` existed). The order's other photos are "not checked by the AI". */
function checkedSet() {
  const c = V.analysis?.modules?.photoReview?.summary?.checked;
  return sawImages() && !photoAiDown() && Array.isArray(c) ? new Set(c.map(String)) : null;
}
function photoFacts(id) {
  const hz = itemsOf(['photoReview']).filter(i => i.evidence?.photos?.includes(id) && (isOpen(i) || i.recDrafted));   // recDrafted: the rec on the Recs tab is the action
  const ren = itemsOf(['captions']).find(i => i.evidence?.photos?.includes(id) && isOpen(i));
  const p = photos().find(x => x.imageId === id) || {};
  const recs = (V.snapshot?.recommendations || []).filter(r => String(r.imageOptionValue || '').startsWith(id + 't') || String(r.imageOptionValue || '').startsWith(id + '.'));
  return { p, hz, ren, recs, hazard: hz.some(i => i.severity === 'blocker'), check: hz.length > 0, rec: !!p.usedAsRecImage || recs.length > 0, marked: !!p.markedHazard,
    unchecked: !!V.checked && !V.checked.has(String(id)) };
}
const tags = f => `${f.hazard ? '<span>Hazard</span>' : f.check ? '<span class="adv">Check</span>' : ''}${f.ren ? '<span class="ren">Rename</span>' : ''}${f.rec ? '<span class="rec">Rec</span>' : ''}${f.marked ? '<span class="mk">Marked</span>' : ''}`;
const FILTERS = [['all', 'All'], ['hazards', 'Hazards', f => f.check], ['rename', 'Rename', f => !!f.ren], ['rec', 'Rec photos', f => f.rec], ['marked', 'Marked by inspector', f => f.marked], ['unchecked', 'Not checked by AI', f => f.unchecked]];

function filtered() {
  const s = V.search.trim().toLowerCase(), test = FILTERS.find(x => x[0] === V.filter)?.[2];
  return photos().filter(p => (!test || test(photoFacts(p.imageId))) && (!s || `${p.caption} ${p.imageId}`.toLowerCase().includes(s)));
}
function renderPhotos() {
  const all = photos().map(p => photoFacts(p.imageId));
  $('pFilters').innerHTML = FILTERS.map(([k, l, t]) => { const n = t ? all.filter(t).length : all.length;
    return (n || k === 'all' || k === V.filter) ? `<button data-f="${k}" aria-pressed="${V.filter === k}">${l} ${n}</button>` : ''; }).join('');
  const nUn = all.filter(f => f.unchecked).length;
  const note = !V.analysis ? 'Not reviewed yet. Press Run AI review in the panel to mark hazards and photo names to fix.'
    : photoAiDown() ? "The AI couldn't look at these photos this time, so they were checked by caption only. Run the review again from the panel."
    : !sawImages() ? 'These photos were checked by caption only. Run the review from an open EZ order to include the images.'
    : nUn ? `${all.length - nUn} of ${all.length} photos were checked by the AI. Run the review again from the panel to check the other ${nUn === 1 ? 'one' : nUn} (filter: Not checked by AI).` : '';
  $('pNote').hidden = !note; $('pNote').textContent = note;
  V.list = filtered();
  $('pGrid').innerHTML = V.list.length ? V.list.map(p => { const f = photoFacts(p.imageId);
    return `<button class="vtile" data-photo="${esc(p.imageId)}" title="${esc(p.caption)}"><span class="im">${imgTag(p)}<span class="flags">${tags(f)}</span><span class="num">${p.order ?? ''}</span></span>
      <span class="meta"><span class="cap">${esc(p.caption || 'No caption')}</span><span class="sub">ID ${esc(p.imageId)}${f.ren ? ` · rename to “${esc(f.ren.suggested)}”` : ''}</span></span></button>`; }).join('')
    : `<div class="empty vempty">${V.search ? 'No photo matches the search' : 'No photos in this group'}</div>`;
}

// photo viewer
const PV = { scale: 1, tx: 0, ty: 0, drag: null, moved: false };
const pvApply = () => { $('pvImg').style.transform = `translate(${PV.tx}px, ${PV.ty}px) scale(${PV.scale})`; $('pvZoom').textContent = `${Math.round(PV.scale * 100)}%`; $('pvStage').classList.toggle('is-zoomed', PV.scale > 1); };
const pvFit = () => { PV.scale = 1; PV.tx = PV.ty = 0; pvApply(); };
function pvZoom(d, cx, cy) {
  const s = Math.min(6, Math.max(1, PV.scale + d)); if (s === PV.scale) return;
  if (cx != null) { const r = $('pvStage').getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2; PV.tx = ox - (ox - PV.tx) * s / PV.scale; PV.ty = oy - (oy - PV.ty) * s / PV.scale; }
  PV.scale = s; if (s === 1) PV.tx = PV.ty = 0; pvApply();
}
function openPhoto(id) {
  V.list = filtered(); if (!V.list.some(p => p.imageId === id)) V.list = photos();
  V.idx = V.list.findIndex(p => p.imageId === id);
  $('pvStrip').innerHTML = V.list.map((p, i) => `<img src="${photoUrl(p.imageId)}" data-ez="${esc(ezUrl(p))}" data-i="${i}" alt="${esc(p.caption)}" loading="lazy">`).join('');
  $('pv').hidden = false; showAt(V.idx);
}
async function showAt(i) {
  if (!V.list.length) return;
  V.idx = (i + V.list.length) % V.list.length;
  const p = V.list[V.idx], f = photoFacts(p.imageId);
  const img = $('pvImg'); img.dataset.ez = ezUrl(p); delete img.dataset.tried; img.src = photoUrl(p.imageId); img.alt = p.caption || '';
  $('pvCap').textContent = `${p.caption || 'No caption'} · ID ${p.imageId}`;
  $('pvPos').textContent = `${V.idx + 1} / ${V.list.length}`;
  pvFit();
  for (const t of $('pvStrip').querySelectorAll('img')) t.classList.toggle('on', Number(t.dataset.i) === V.idx);
  $('pvStrip').querySelector('img.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  await loadInfo(p, f);
}
/** What the AI saw for this photo. A failed request (network, sign-in) is not kept, so "Try again" or opening the
 *  photo again asks once more; only an answer from the server can say "not checked by the AI". */
async function loadInfo(p, f = photoFacts(p.imageId)) {
  if (!(p.imageId in V.insights)) {
    renderInfo(p, f, null);
    const r = await send({ type: 'API', method: 'GET', path: `/v1/orders/${V.orderId}/photos/${p.imageId}/insight` }).then(d => ({ ok: true, d }), () => ({ ok: false }));
    if (r.ok) V.insights[p.imageId] = r.d?.insights?.at(-1) || null;
    if (V.list[V.idx] !== p) return;
    if (!r.ok) return renderInfo(p, f, null, true);
  }
  renderInfo(p, f, V.insights[p.imageId]);
}
function renderInfo(p, f, ins, failed = false) {
  const none = !V.analysis ? 'Not reviewed yet. Press Run AI review in the panel.'
    : f.unchecked ? 'The AI has not checked this photo yet. Run the review again from the panel to include it.'
    : 'This photo was not reviewed by the AI.';
  $('pvInfo').innerHTML = `<h2>${esc(p.caption || 'No caption')}</h2><div class="small muted">Photo ${p.order ?? '–'} of ${photos().length} · ID ${esc(p.imageId)}</div>
    ${tags(f) ? `<div class="tags">${tags(f)}</div>` : ''}
    <h3>What the AI sees</h3>${ins ? `<p>${esc(ins.description)}</p>`
      : failed ? `<p class="muted">Couldn't load what the AI saw for this photo. <button class="link sm" data-pv="retry">Try again</button></p>`
      : `<p class="muted">${p.imageId in V.insights ? esc(none) : 'Loading…'}</p>`}
    ${f.hz.length ? `<h3>Hazards</h3>${f.hz.map(i => `<div class="hz ${i.severity}"><b>${esc(i.title)}</b>${esc(i.message || '')}${i.recDrafted ? '<div class="small muted" style="margin-top:4px">A recommendation has been drafted: see the Recs tab in the panel.</div>' : i.suggestedRec ? `<div class="small muted" style="margin-top:4px">Suggested rec: ${esc(i.suggestedRec)}</div>` : ''}</div>`).join('')}` : ''}
    ${f.ren ? `<h3>Suggested name</h3><div class="rn"><s>${esc(f.ren.current)}</s> → <ins>${esc(f.ren.suggested)}</ins></div>` : ''}
    ${f.recs.length ? `<h3>Used for recommendation</h3>${f.recs.map(r => `<p class="small">${esc(r.text)}</p>`).join('')}` : ''}
    ${f.marked ? '<h3>Inspector</h3><p class="small">Marked as a hazard by the inspector.</p>' : ''}`;
}

// ---------------------------------------------------------------- narrative
const fieldsOf = s => (s?.forms || []).flatMap(f => (f.sections || []).flatMap(sec => (sec.fields || []).map(x => ({ ...x, form: f.name }))));
/** The narrative the review checked: the box its draft writes to, else (as the server picks it) the first narrative
 *  box with text. 1169277 (2026-11-13) has two, General Form (empty) and Seneca General Form (2,832 characters), and
 *  the viewer said "The narrative is empty" from the first one (it looked for a rewrite card, gone since 2026-11-05). */
function narrativeField() {
  const it = itemsOf(['narrative']).find(i => ['draft', 'rewrite'].includes(i.kind) && i.proposedWrites?.length), key = it?.proposedWrites?.[0]?.key;
  const fs = fieldsOf(V.snapshot), all = fs.filter(f => f.type === 'longtext' && /^narrative($| \()/i.test((f.label || '').trim()));
  return (key && fs.find(f => f.key === key)) || all.find(f => String(f.value || '').trim()) || all[0];
}
const narrativeIssues = () => itemsOf(['narrative']).filter(i => i.kind !== 'rewrite' && i.kind !== 'draft');   // old reviews may still carry a rewrite
const narrativeDraft = () => itemsOf(['narrative']).find(i => i.kind === 'draft' && i.after);
const norm = s => String(s || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/** Wrap each issue's quoted sentence in <mark>; quotes are matched ignoring whitespace and curly quotes. */
function markIssues(text, issues) {
  const spans = [];
  issues.forEach((i, n) => {
    for (const t of i.evidence?.text || []) {
      const at = locate(text, t); if (at) spans.push({ ...at, n, sev: i.severity });
    }
  });
  spans.sort((a, b) => a.start - b.start);
  let out = '', pos = 0;
  for (const s of spans) { if (s.start < pos) continue; out += esc(text.slice(pos, s.start)) + `<mark class="${s.sev}" data-n="${s.n}">${esc(text.slice(s.start, s.end))}</mark>`; pos = s.end; }
  return out + esc(text.slice(pos));
}
function locate(text, quote) {
  const q = norm(quote); if (!q) return null;
  const i = text.indexOf(quote.trim()); if (i >= 0) return { start: i, end: i + quote.trim().length };
  // whitespace / quote-insensitive search: map normalised positions back to the original text
  const map = [], chars = [];
  for (let k = 0; k < text.length; k++) {
    let c = text[k].replace(/[“”]/, '"').replace(/[‘’]/, "'");
    if (/\s/.test(c)) { if (chars.length && chars[chars.length - 1] === ' ') continue; c = ' '; }
    chars.push(c); map.push(k);
  }
  const j = chars.join('').indexOf(q); if (j < 0) return null;
  return { start: map[j], end: map[j + q.length - 1] + 1 };
}
function renderNarrative() {
  const text = String(narrativeField()?.value || ''), issues = narrativeIssues(), draft = narrativeDraft();
  if (!draft) V.nMode = 'current';
  $('nMode').hidden = !draft;
  for (const b of $('nMode').querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === (V.nMode || 'current')));
  if (V.nMode === 'draft') {   // the drafted narrative, with the facts to confirm marked
    $('nStats').textContent = `Draft · ${(draft.after.match(/\S+/g) || []).length} words${V.client ? ` · ${V.client} style` : ''}`;
    $('nText').innerHTML = esc(draft.after).replace(/\[\[confirm:([^\]]*)\]\]/gi, '<mark class="advisory">confirm:$1</mark>');
  } else {
    $('nStats').textContent = text ? `${(text.match(/\S+/g) || []).length} words` : '';
    $('nText').innerHTML = text ? markIssues(text, issues) : '<div class="empty">The narrative is empty.' + (draft ? ' A draft is ready: choose Draft above.' : '') + '</div>';
  }
  $('nIssues').innerHTML = issues.length ? issues.map((i, n) => `<article class="item ${isOpen(i) ? i.severity : 'pass'}${V.nActive === n ? ' on' : ''}" data-n="${n}" tabindex="0">
      <div class="hd"><span class="sev">${{ blocker: 'Must fix', warning: 'To check', advisory: 'Advisory' }[i.severity] || 'Note'}</span>${(i.evidence?.text || []).some(t => locate(text, t)) ? '<span class="goto">Show in text ›</span>' : ''}</div>
      <h4>${esc(i.title)}</h4><p>${esc(i.message || '')}</p></article>`).join('') : '<div class="empty good">No issues in the narrative</div>';
}
function focusIssue(n, from) {
  V.nActive = n;
  for (const el of document.querySelectorAll('.nside .item')) el.classList.toggle('on', Number(el.dataset.n) === n);
  for (const m of document.querySelectorAll('.ntext mark')) m.classList.toggle('on', Number(m.dataset.n) === n);
  if (from !== 'text') document.querySelector(`.ntext mark[data-n="${n}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (from !== 'card') document.querySelector(`.nside .item[data-n="${n}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------------------------------------------------------------- events
function setView(v) {
  V.view = v; render();
  const u = new URL(location.href); u.searchParams.set('view', v); history.replaceState(null, '', u);
}
function initEvents() {
  for (const b of document.querySelectorAll('.vtabs [role=tab]')) b.onclick = () => setView(b.dataset.view);
  $('pFilters').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { V.filter = b.dataset.f; renderPhotos(); } };
  $('pSearch').oninput = e => { V.search = e.target.value; renderPhotos(); };
  for (const b of document.querySelectorAll('.vsize [data-size]')) b.onclick = () => {
    V.size = b.dataset.size; $('pGrid').dataset.size = V.size;
    document.querySelectorAll('.vsize [data-size]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    chrome.storage.local.set({ viewerTile: V.size }).catch(() => {});
  };
  $('pGrid').onclick = e => { const t = e.target.closest('[data-photo]'); if (t) openPhoto(t.dataset.photo); };
  $('btnRefresh').onclick = async () => { await load(); toast('Showing the latest review'); };
  const order = ['system', 'light', 'dark'];
  $('btnTheme').onclick = () => { themePref = order[(order.indexOf(themePref) + 1) % order.length]; applyTheme(); chrome.storage.local.set({ theme: themePref }).catch(() => {}); };
  darkMq.addEventListener('change', () => themePref === 'system' && applyTheme());
  chrome.storage.onChanged?.addListener((ch, area) => {
    if (area === 'local' && ch.theme) { themePref = ch.theme.newValue || 'system'; applyTheme(); }
    if (area === 'session' && V.analysis && ch['items_' + V.analysis.analysisId]) { V.itemState = ch['items_' + V.analysis.analysisId].newValue || {}; render(); }   // applied / dismissed in the panel
  });
  // narrative
  $('nText').onclick = e => { const m = e.target.closest('mark'); if (m) focusIssue(Number(m.dataset.n), 'text'); };
  $('nIssues').onclick = e => { const c = e.target.closest('.item[data-n]'); if (c) focusIssue(Number(c.dataset.n), 'card'); };
  $('nIssues').onkeydown = e => { const c = e.target.closest('.item[data-n]'); if (c && e.key === 'Enter') focusIssue(Number(c.dataset.n), 'card'); };
  $('nCopy').onclick = async () => { await navigator.clipboard.writeText(V.nMode === 'draft' ? narrativeDraft()?.after || '' : $('nText').innerText).catch(() => {}); toast(V.nMode === 'draft' ? 'Draft copied' : 'Narrative copied'); };
  $('nMode').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) { V.nMode = b.dataset.mode; renderNarrative(); } };
  // photo viewer
  const stage = $('pvStage');
  $('pv').onclick = e => {
    const a = e.target.closest('[data-pv]')?.dataset.pv, i = e.target.closest('#pvStrip img')?.dataset.i;
    if (a) ({ prev: () => showAt(V.idx - 1), next: () => showAt(V.idx + 1), in: () => pvZoom(0.25), out: () => pvZoom(-0.25), fit: pvFit, info: () => $('pv').classList.toggle('no-info'), close: () => ($('pv').hidden = true), retry: () => V.list[V.idx] && loadInfo(V.list[V.idx]) })[a]();
    else if (i != null) showAt(Number(i));
  };
  stage.addEventListener('wheel', e => { e.preventDefault(); pvZoom(-e.deltaY * 0.0015 * Math.max(1, PV.scale), e.clientX, e.clientY); }, { passive: false });
  stage.addEventListener('dblclick', e => (PV.scale > 1 ? pvFit() : pvZoom(1.5, e.clientX, e.clientY)));
  stage.addEventListener('pointerdown', e => { if (PV.scale <= 1 || e.button !== 0) return; PV.drag = { x: e.clientX - PV.tx, y: e.clientY - PV.ty }; stage.classList.add('is-dragging'); stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!PV.drag) return; PV.tx = e.clientX - PV.drag.x; PV.ty = e.clientY - PV.drag.y; pvApply(); });
  stage.addEventListener('pointerup', () => { PV.drag = null; stage.classList.remove('is-dragging'); });
  addEventListener('keydown', e => {
    if ($('pv').hidden || e.target.closest?.('input')) return;
    const k = { Escape: () => ($('pv').hidden = true), ArrowLeft: () => showAt(V.idx - 1), ArrowRight: () => showAt(V.idx + 1), '+': () => pvZoom(0.25), '=': () => pvZoom(0.25), '-': () => pvZoom(-0.25), 0: pvFit, i: () => $('pv').classList.toggle('no-info') }[e.key];
    if (k) { e.preventDefault(); k(); }
  });
  // the panel re-points this window at another order / view
  chrome.runtime.onMessage.addListener(m => {
    if (m?.type !== 'VIEWER_SHOW') return;
    if (m.orderId && m.orderId !== V.orderId) { location.search = new URLSearchParams({ order: m.orderId, tab: m.tab || '', origin: m.origin || '', script: m.script || V.script, view: m.view || V.view }).toString(); return; }
    if (m.view) setView(m.view);
    if (m.photo) openPhoto(m.photo);
  });
  addEventListener('focus', async () => {   // pick up a re-run done in the panel
    const a = await send({ type: 'LATEST', orderId: V.orderId }).catch(() => null);
    if (a?.analysisId && a.analysisId !== V.analysis?.analysisId) { await load(); toast('Updated to the latest review'); }
  });
}

(async function init() {
  const st = await chrome.storage.local.get(['theme', 'viewerTile']).catch(() => ({}));
  themePref = st.theme || 'system'; applyTheme();
  if (st.viewerTile) { V.size = st.viewerTile; $('pGrid').dataset.size = V.size; document.querySelectorAll('.vsize [data-size]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.size === V.size))); }
  initEvents();
  send({ type: 'AUTH_STATE' }).then(st => st?.signedIn && (renderBrand($('brand'), st.org), V.client = st.org?.brand?.name || st.org?.name || '')).catch(() => {});   // the customer's logo
  if (!V.orderId) { $('vOrder').textContent = 'No order'; return; }
  try { await load(); } catch (e) { $('pGrid').innerHTML = '<div class="empty">SmartFill is offline. Start it, then press reload.</div>'; }
  const photo = q.get('photo'); if (photo && V.view === 'photos') openPhoto(photo);
})();
