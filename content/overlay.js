// On-page helpers on EZ: severity outlines on fields with findings, a "Next issue" bar,
// and a full-size photo viewer (photos are same-origin, so they load with the user's session).
(function () {
  if (self.TIS_OVERLAY) return;
  let marks = [], pos = -1, bar = null;

  function clear() {
    document.querySelectorAll('.tisqc-flag').forEach(el => { el.classList.remove('tisqc-flag', 'tisqc-blocker', 'tisqc-warning', 'tisqc-advisory'); el.removeAttribute('data-tisqc'); });
    marks = []; pos = -1; bar?.remove(); bar = null;
  }

  /** items: [{ key, severity, title }] → outline the matching rows on this page. */
  function highlight(items) {
    clear();
    const rank = { blocker: 0, warning: 1, advisory: 2 };
    const seen = new Set();
    for (const it of items.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))) {
      const el = document.getElementsByName(it.key)[0]; if (!el) continue;
      const row = /^caption\d/.test(it.key) ? TIS_WRITER.blockFor(el) : el.closest('tr'); if (!row || seen.has(row)) continue;
      seen.add(row);
      row.classList.add('tisqc-flag', 'tisqc-' + (it.severity || 'advisory'));
      row.setAttribute('data-tisqc', it.title.slice(0, 140));
      marks.push(row);
    }
    marks.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (marks.length) renderBar();
    return { onPage: marks.length };
  }

  function renderBar() {
    bar = document.createElement('div'); bar.className = 'tisqc-bar'; bar.setAttribute('role', 'navigation');
    bar.innerHTML = `<span class="tisqc-bar-logo">TIS QC</span><span class="tisqc-bar-count"></span>
      <button type="button" data-d="-1" aria-label="Previous issue">‹</button><button type="button" data-d="1" aria-label="Next issue">Next issue ›</button>
      <button type="button" data-x aria-label="Hide highlights">✕</button>`;
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-x')) return self.TIS_OVERLAY.clear();
      go(Number(b.dataset.d));
    });
    document.body.appendChild(bar); update();
  }
  function update() { if (bar) bar.querySelector('.tisqc-bar-count').textContent = `${pos + 1 > 0 ? pos + 1 + ' / ' : ''}${marks.length} on this page`; }
  function go(d) {
    if (!marks.length) return;
    pos = (pos + d + marks.length) % marks.length;
    const row = marks[pos];
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('tisqc-flash'); void row.offsetWidth; row.classList.add('tisqc-flash');
    update();
  }

  // ---------------------------------------------------------------- photo viewer (zoom + pan, as in the NSR extension)
  const MIN = 1, MAX = 6, STEP = 0.25, WHEEL = 0.0015;   // wheel sensitivity per deltaY unit
  let closeViewer = null;
  function showPhotos(urls, captions, index = 0) {
    closeViewer?.();
    let i = index, scale = 1, tx = 0, ty = 0, drag = null;
    const v = document.createElement('div'); v.className = 'tisqc-viewer'; v.tabIndex = -1;
    v.innerHTML = `<div class="tisqc-viewer-top"><span class="tisqc-viewer-cap"></span><span class="tisqc-viewer-n"></span>
        <button type="button" data-z="-1" title="Zoom out (−)" aria-label="Zoom out">−</button><span class="tisqc-zoom">100%</span>
        <button type="button" data-z="1" title="Zoom in (+)" aria-label="Zoom in">+</button><button type="button" data-fit title="Fit to screen (0)">Fit</button>
        <button type="button" data-close title="Close (Esc)" aria-label="Close">✕</button></div>
      <button type="button" class="tisqc-nav l" data-d="-1" aria-label="Previous photo">‹</button>
      <div class="tisqc-viewer-stage"><img alt="" draggable="false"></div>
      <button type="button" class="tisqc-nav r" data-d="1" aria-label="Next photo">›</button>
      <div class="tisqc-viewer-hint">${urls.length > 1 ? '← → to browse · ' : ''}scroll to zoom · drag to pan · Esc to close</div>`;
    const img = v.querySelector('img'), stage = v.querySelector('.tisqc-viewer-stage'), label = v.querySelector('.tisqc-zoom');
    const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; label.textContent = `${Math.round(scale * 100)}%`; stage.classList.toggle('is-zoomed', scale > 1); };
    const zoomBy = d => { scale = Math.min(MAX, Math.max(MIN, scale + d)); if (scale === 1) { tx = 0; ty = 0; } apply(); };
    const fit = () => { scale = 1; tx = 0; ty = 0; apply(); };
    const show = () => { img.src = urls[i]; fit(); v.querySelector('.tisqc-viewer-cap').textContent = captions[i] || ''; v.querySelector('.tisqc-viewer-n').textContent = `${i + 1} / ${urls.length}`; };
    const go = d => { i = (i + d + urls.length) % urls.length; show(); };
    v.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (e.target === v || b?.hasAttribute('data-close')) return close();
      if (b?.dataset.d) go(Number(b.dataset.d));
      if (b?.dataset.z) zoomBy(Number(b.dataset.z) * STEP);
      if (b?.hasAttribute('data-fit')) fit();
    });
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomBy(-e.deltaY * WHEEL); }, { passive: false });
    stage.addEventListener('dblclick', () => (scale > 1 ? fit() : zoomBy(1)));
    stage.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); drag = { x: e.clientX - tx, y: e.clientY - ty }; stage.classList.add('is-dragging'); });
    const onMove = e => { if (!drag) return; tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); };
    const onUp = () => { drag = null; stage.classList.remove('is-dragging'); };
    const onKey = e => {
      const k = { Escape: close, ArrowRight: () => go(1), ArrowLeft: () => go(-1), '+': () => zoomBy(STEP), '=': () => zoomBy(STEP), '-': () => zoomBy(-STEP), _: () => zoomBy(-STEP), 0: fit }[e.key];
      if (k) { e.preventDefault(); e.stopPropagation(); k(); }
    };
    function close() { document.removeEventListener('keydown', onKey, true); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); v.remove(); closeViewer = null; }
    closeViewer = close;
    document.addEventListener('keydown', onKey, true); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    document.body.appendChild(v); show(); v.focus();
    return { ok: true };
  }

  // ---------------------------------------------------------------- Recommendations form: thumbnails next to each photo picker
  // EZ's picker is a drop-down of bare image numbers ("18441067t.jpg"). Show the chosen photo, open it large, or pick
  // from a grid. Picking sets the drop-down exactly like choosing it by hand (value + change); nothing is saved.
  const orderIdOf = () => new URL(location.href).searchParams.get('orderid') || document.querySelector('input[name=orderid]')?.value || '';
  const picUrl = (value, size) => { const m = String(value || '').match(/^(\d+)[trl](\.\w+)$/i); return m ? TIS_SNAPSHOT.photoUrl(orderIdOf(), m[1], size, m[2]) : ''; };
  const picId = value => String(value || '').match(/^\d+/)?.[0] || '';
  function recPhotos() {
    let n = 0;
    for (const sel of document.querySelectorAll('select[name^=RECIMAGEID]')) {
      if (sel.nextElementSibling?.classList.contains('tisqc-rp') || !sel.getClientRects().length) continue;
      const w = document.createElement('span'); w.className = 'tisqc-rp';
      w.innerHTML = '<button type="button" class="tisqc-rp-thumb" title="View larger"></button><button type="button" class="tisqc-rp-pick" title="Choose from thumbnails">Pick photo ▾</button>';
      sel.insertAdjacentElement('afterend', w);
      const paint = () => {
        const t = w.querySelector('.tisqc-rp-thumb'); t.disabled = !sel.value;
        t.innerHTML = sel.value ? `<img src="${picUrl(sel.value, 't')}" alt="Photo ${picId(sel.value)}">` : '<span>No photo</span>';
      };
      sel.addEventListener('change', paint); paint();
      w.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const opts = [...sel.options].map(o => o.value).filter(Boolean);
        if (b.classList.contains('tisqc-rp-thumb') && sel.value) showPhotos(opts.map(v => picUrl(v, 'l')), opts.map(v => 'Photo ' + picId(v)), Math.max(0, opts.indexOf(sel.value)));
        if (b.classList.contains('tisqc-rp-pick')) openPicker(sel);
      });
      n++;
    }
    return { added: n };
  }
  function openPicker(sel) {
    document.querySelector('.tisqc-picker')?.remove();
    const opts = [...sel.options].map(o => o.value).filter(Boolean);
    const p = document.createElement('div'); p.className = 'tisqc-picker'; p.tabIndex = -1;
    p.innerHTML = `<div class="tisqc-picker-box" role="dialog" aria-label="Choose the photo for this recommendation">
      <div class="tisqc-picker-top"><b>Choose the photo for this recommendation</b><span>${opts.length} photos · click to choose · ⤢ to view larger</span><button type="button" data-close aria-label="Close">✕</button></div>
      <div class="tisqc-picker-grid">${['', ...opts].map(v => `<div class="tisqc-pt${v === sel.value ? ' on' : ''}" data-v="${v}" role="button" tabindex="0">
        ${v ? `<img src="${picUrl(v, 't')}" alt="" loading="lazy"><button type="button" class="tisqc-pt-zoom" data-zoom="${v}" aria-label="View larger">⤢</button>` : '<span class="tisqc-pt-none">No photo</span>'}
        <span class="tisqc-pt-id">${v ? picId(v) : 'Clear'}</span></div>`).join('')}</div></div>`;
    const close = () => { p.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.tisqc-viewer')) { e.preventDefault(); close(); } };
    p.addEventListener('click', e => {
      if (e.target === p || e.target.closest('[data-close]')) return close();
      const z = e.target.closest('[data-zoom]');
      if (z) { e.stopPropagation(); return showPhotos(opts.map(v => picUrl(v, 'l')), opts.map(v => 'Photo ' + picId(v)), opts.indexOf(z.dataset.zoom)); }
      const t = e.target.closest('.tisqc-pt'); if (!t) return;
      sel.value = t.dataset.v; sel.dispatchEvent(new Event('change', { bubbles: true }));   // as if picked by hand
      close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(p); p.focus();
  }

  // ---------------------------------------------------------------- section jump bar (forms): display only, writes nothing
  let nav = null, navCounts = new Map();
  const secKey = key => (String(key).match(/^(?:F\d+|cbox)_?(\d+)_(\d+)/) || []).slice(1).join('_');
  function sections() {
    const seen = {};
    return [...document.querySelectorAll('input[name^=cbox]')].map(cb => {
      const row = cb.closest('tr'), key = cb.name.replace('cbox', '');
      let title = (row?.textContent || '').replace(/\s+/g, ' ').replace(/PgBr.*|Omit Section.*/i, '').replace(/\s*\(.*$/, '').replace(/\s*DUPLICATE.*$/i, '').trim().slice(0, 42) || 'Section';
      seen[title] = (seen[title] || 0) + 1; if (seen[title] > 1) title += ' ' + seen[title];
      return { key, row, title, omitted: cb.checked };
    }).filter(s => s.row);
  }
  function sectionNav() {
    // forms only (same test as page detection): the order page's embedded Order Form has omit boxes too
    const isForm = new URL(location.href).searchParams.get('formid') || document.querySelector('form[name=myform] input[name=formid]')?.value;
    if (!isForm || !document.forms.myform || !document.querySelector('input[name^=cbox]')) return { ok: false };
    const list = sections(); if (list.length < 3) return { ok: false };
    if (!nav?.isConnected) {
      const first = !nav;
      nav = document.createElement('div'); nav.className = 'tisqc-nav-sec is-closed';
      nav.addEventListener('click', e => {
        if (e.target.closest('.tisqc-ns-toggle')) { nav.classList.toggle('is-closed'); return; }
        const b = e.target.closest('[data-sec]'); if (!b) return;
        const s = sections().find(x => x.key === b.dataset.sec); if (!s) return;
        s.row.scrollIntoView({ behavior: 'smooth', block: 'start' });
        s.row.classList.remove('tisqc-flash'); void s.row.offsetWidth; s.row.classList.add('tisqc-flash');
      });
      document.body.appendChild(nav);
      let t = 0; if (first) addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(markCurrent, 120); }, { passive: true });
    }
    const total = [...navCounts.values()].reduce((a, b) => a + b, 0);
    nav.innerHTML = `<button type="button" class="tisqc-ns-toggle" title="Jump to a section">☰ Sections${total ? ` <b>${total}</b>` : ''}</button>
      <div class="tisqc-ns-list">${list.map(s => `<button type="button" data-sec="${s.key}" class="${s.omitted ? 'omit' : ''}" title="${s.omitted ? 'Omitted section' : ''}">
        <span>${s.title.replace(/[<>&]/g, '')}</span>${navCounts.get(s.key) ? `<b>${navCounts.get(s.key)}</b>` : ''}</button>`).join('')}</div>`;
    markCurrent();
    return { ok: true, sections: list.length };
  }
  function markCurrent() {
    if (!nav) return;
    const cur = sections().filter(s => s.row.getBoundingClientRect().top < 140).pop();
    nav.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === cur?.key));
  }
  // issue counts per section follow the highlights
  const baseHighlight = highlight, baseClear = clear;
  function highlightWithNav(items) {
    const r = baseHighlight(items);
    navCounts = new Map();
    for (const row of marks) { const k = secKey(row.querySelector('[name^=F]')?.name); if (k) navCounts.set(k, (navCounts.get(k) || 0) + 1); }
    if (nav) sectionNav();
    return r;
  }
  function clearWithNav() { baseClear(); navCounts = new Map(); if (nav) sectionNav(); }

  // page helpers appear on their own; the Recommendations form's rec slots open on click, so look again after clicks
  function initPage() { sectionNav(); recPhotos(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPage); else initPage();
  let rescan = 0; document.addEventListener('click', () => { clearTimeout(rescan); rescan = setTimeout(recPhotos, 400); }, true);

  self.TIS_OVERLAY = { highlight: highlightWithNav, clear: clearWithNav, showPhotos, recPhotos, sectionNav };
})();
