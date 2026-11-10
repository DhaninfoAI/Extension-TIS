// Applies AI-proposed values into the open EZ page the way a user would, with Undo.
// Never submits, never clicks Save/Submit/Process Changes, never touches delete boxes.
// Proposed write kinds (backend item.proposedWrites[]):
//   choice     F2 checkbox group (click target option) or F4 select (set option + change)
//   text       text input / textarea (value + input/change events)
//   rec        recommendation textarea F13_… / F14_…;  key "F14:new" = next empty free-form slot
//   recLine    one line added to a shared hazard list (Seneca General Form F7_…); never replaces the list
//   recImage   RECIMAGEID_… select;  "RECIMAGEID_F14:new" follows the slot chosen for F14:new
//   caption    Images page caption input  caption<imageId>  (key "caption<imageId>")
//   omitSection  cbox<sec>_<copy> checkbox

(function () {
  if (self.TIS_WRITER) return;
  const undo = new Map();   // key -> { prev, kind }
  const q = name => document.getElementsByName(name);
  /** The page's field for a key. A rec box "F13_<recId>" can be another field type on some forms: the Seneca General
   *  Form keeps it as a long-text box F7_<sec>_<copy>_<recId> in another section (found on 1168084, 2026-11-06). */
  function resolve(key) {
    if (q(key).length) return key;
    const m = /^F1[34]_(\d+)$/.exec(key); if (!m) return key;
    const el = [...document.querySelectorAll('textarea[name]')].find(x => x.name.endsWith('_' + m[1]) && /^F\d+_\d+_\d+_\d+$/.test(x.name));
    return el ? el.name : key;
  }
  const fire = (el, ...types) => types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));

  /** The block to outline for a field: a form question's row, or ONE photo's box on the Images page
   *  (a caption's nearest <tr> is the row holding the whole gallery). */
  function blockFor(el) {
    if (/^caption\d/.test(el.name || '') || /^img\d/.test(el.id || '')) return el.closest('[id^=imageordertag]') || el.closest('table') || el;
    return el.closest('tr') || el;
  }

  function mark(el, cls = 'tisqc-applied') {
    const row = blockFor(el);
    row.classList.add(cls);
    if (!row.querySelector(':scope > td .tisqc-tag') && cls === 'tisqc-applied') {
      const td = row.querySelector('td') || row;
      const tag = document.createElement('span'); tag.className = 'tisqc-tag'; tag.textContent = 'AI';
      td.prepend(tag);
    }
    return row;
  }
  function unmark(el) { const row = blockFor(el); row.classList.remove('tisqc-applied'); row.querySelector('.tisqc-tag')?.remove(); }

  function readValue(els) {
    const e = els[0];
    if (e.type === 'checkbox') return [...els].filter(x => x.checked).map(x => x.value).join('|');
    if (e.tagName === 'SELECT') return e.value;
    return e.value;
  }

  function setChoice(els, value) {
    const e = els[0];
    if (e.tagName === 'SELECT') {
      const opt = [...e.options].find(o => o.text.trim() === value || o.value === value);
      if (!opt) throw new Error(`option "${value}" not found`);
      e.value = opt.value; fire(e, 'input', 'change');
      return;
    }
    const target = [...els].find(x => x.value === value);
    if (!target) throw new Error(`option "${value}" not found`);
    for (const x of els) if (x.checked && x !== target) x.click();   // EZ handlers (flag()) run on click
    if (!target.checked) target.click();
  }

  function setText(el, value) {
    el.focus({ preventScroll: true });
    el.value = value; fire(el, 'input', 'change', 'keyup');
    el.blur();
  }

  /** Reveal the EZ rec box for F13_<sec>_<copy>_<recId> if the page hides it. */
  function revealRec(key) {
    const id = key.replace(/^F1[34]_/, '');
    const box = document.getElementById('flagrecshow' + id);
    if (box && getComputedStyle(box).display === 'none') box.style.display = 'table';
  }

  /** Next empty free-form recommendation slot on the Recommendations form (F14_*), revealed like addrec(). */
  function nextFreeSlot() {
    const areas = [...document.querySelectorAll('textarea[name^="F14_"]')];
    const ta = areas.find(t => !t.value.trim());
    if (!ta) throw new Error('No empty "Add another recommendation" slot left');
    const body = ta.closest('[id^=addrecbody]');
    const idx = body?.id.replace('addrecbody', '');
    if (idx != null) {
      for (const p of ['addrectitle', 'addrecbody']) { const r = document.getElementById(p + idx); if (r) r.style.display = 'table-row'; }
      const link = document.getElementById('addreclink' + idx); if (link) link.style.display = 'none';
      const next = document.getElementById('addreclink' + (Number(idx) + 1)); if (next) next.style.display = 'table-row';
    }
    return ta.name;
  }

  function applyOne(w, slot) {
    let key = w.key;
    if (key === 'F14:new') key = slot.f14 = slot.f14 || nextFreeSlot();
    if (key === 'RECIMAGEID_F14:new') { if (!slot.f14) throw new Error('photo for a new recommendation needs the text applied first'); key = 'RECIMAGEID_' + slot.f14; }
    if (/^F1[34]_/.test(key)) revealRec(key);   // EZ hides a rec box until its answer is chosen
    // NOT resolve(key) here: on the Seneca General Form the matching F7 box is a shared hazard list, and writing
    // into it would replace the whole list (2026-11-06). Seneca recs need their own handling first.
    const els = q(key);
    if (!els.length) return { key: w.key, resolved: key, ok: false, reason: 'not on this page' };
    const el = els[0];
    if (!undo.has(key)) undo.set(key, { prev: readValue(els), kind: w.kind });
    if (w.kind === 'choice') setChoice(els, w.value);
    else if (w.kind === 'omitSection') { if (el.checked !== !!w.value) el.click(); }
    else if (w.kind === 'recImage') {
      const opt = [...el.options].find(o => o.value === w.value) || [...el.options].find(o => o.value.replace(/t\.jpe?g$/i, '') === String(w.value).replace(/t\.jpe?g$/i, ''));
      if (!opt) throw new Error(`photo ${w.value} is not in the ImageID list`);
      el.value = opt.value; fire(el, 'change');
    } else if (w.kind === 'recLine') {
      // a line in a SHARED hazard list (Seneca General Form): add it on its own line, never replace the list;
      // Undo puts the list back exactly as it was (prev holds the whole text)
      const cur = el.value || '', line = String(w.value).trim();
      if (!cur.toLowerCase().includes(line.toLowerCase())) setText(el, cur.trim() ? cur.replace(/\s+$/, '') + '\n' + line : line);
    } else {
      setText(el, w.clear ? '' : String(w.value));
    }
    mark(el);
    return { key: w.key, resolved: key, ok: true, prev: undo.get(key).prev, kind: w.kind };
  }

  function apply(writes) {
    const slot = {}, results = [];
    for (const w of writes) {
      try { results.push(applyOne(w, slot)); }
      catch (e) { results.push({ key: w.key, ok: false, reason: e.message }); }
    }
    const first = results.find(r => r.ok);
    if (first) { const el = q(first.resolved)[0]; blockFor(el).scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return { ok: results.some(r => r.ok), results };
  }

  /** entries: field names, or { key, prev, kind } from apply() so Undo also works after a page reload. */
  function revert(entries) {
    const done = [];
    for (const e of entries) {
      const k = typeof e === 'string' ? e : e.key;
      const u = undo.get(k) || (typeof e === 'object' && e.prev !== undefined ? { prev: e.prev, kind: e.kind } : null);
      const els = q(k); if (!u || !els.length) continue;
      const el = els[0];
      if (u.kind === 'choice') { if (el.tagName === 'SELECT') { el.value = u.prev; fire(el, 'change'); } else { for (const x of els) if (x.checked !== u.prev.split('|').includes(x.value)) x.click(); } }
      else if (u.kind === 'omitSection') { if (el.checked !== (u.prev === 'on' || u.prev === true)) el.click(); }
      else if (el.tagName === 'SELECT') { el.value = u.prev; fire(el, 'change'); }
      else setText(el, u.prev);
      unmark(el); undo.delete(k); done.push(k);
    }
    return { ok: done.length > 0, reverted: done };
  }

  /** Which of these keys exist on the current page (to enable/disable Apply in the panel). */
  function present(keys) {
    return Object.fromEntries(keys.map(k => [k, k === 'F14:new' ? !!document.querySelector('textarea[name^="F14_"]')
      : k === 'RECIMAGEID_F14:new' ? !!document.querySelector('select[name^="RECIMAGEID_F14_"]') : q(k).length > 0]));
  }

  self.TIS_WRITER = { apply, revert, present, blockFor };
})();
