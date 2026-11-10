// Page-side router on EZ pages: detection, snapshot build, photo fetch, focus/flash.
// Read-only: never submits forms, never clicks EZ buttons, never triggers dialogs.

(function () {
  if (self.TIS_CONTENT) return;
  self.TIS_CONTENT = true;

  function detect() {
    const u = new URL(location.href);
    const text = document.body?.innerText || '';
    const denied = /Access Denied/i.test(document.title);
    const orderId = Number(u.searchParams.get('orderid') || document.querySelector('input[name=orderid]')?.value
      || (text.match(/Order (?:Number:\s*)?(\d{6,8})/) || [])[1] || 0) || null;
    const formId = Number(u.searchParams.get('formid') || document.querySelector('form[name=myform] input[name=formid]')?.value || 0) || null;
    let page = 'other';
    if (denied) page = 'logged_out';
    else if (/Image Upload/i.test(document.title)) page = 'images';
    else if (document.querySelector('#imshow0') || u.searchParams.get('g') === 'F') page = 'report';
    else if (formId) page = 'form';
    else if (/Current Orders/.test(text) && document.querySelector('form[name=myform]') && !orderId) page = 'orders_list';
    else if (orderId && /Order Info/.test(text)) page = 'order';
    const formName = page === 'form' ? (document.querySelector('.reptitle, h2, td b')?.textContent || '').trim() : null;
    const script = /^\/cgi-bin\/[\w/]*\w+\.cgi$/.test(location.pathname) ? location.pathname : null;   // aa.cgi or ss.cgi, depends on the login
    return { page, orderId, formId, formName, script, host: location.host, title: document.title, version: (text.match(/ver\. ([\w.]+)/) || [])[1] || null };
  }

  async function blobToB64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }

  const EXTS = ['.jpg', '.JPG', '.jpeg', '.JPEG', '.png', '.PNG'];
  /** Fetch photo files with the page's own session (same origin). exts: imageId → extension from the Images page;
   *  if that's missing or wrong, the other spellings are tried (the EZ file server is case-sensitive). */
  async function fetchPhotos(orderId, imageIds, size = 'l', concurrency = 3, exts = {}) {
    const one = async id => {
      let last = '';
      for (const ext of [...new Set([exts[id], ...EXTS].filter(Boolean))]) {
        try {
          const r = await fetch(TIS_SNAPSHOT.photoUrl(orderId, id, size, ext), { credentials: 'include' });
          const b = await r.blob();
          if (r.ok && /image/.test(b.type)) return { imageId: id, ext, b64: await blobToB64(b), bytes: b.size };
          last = `HTTP ${r.status} ${b.type}`;
          if (r.status !== 404) break;   // only a wrong extension is worth retrying
        } catch (e) { last = e.message; break; }
      }
      return { imageId: id, error: last };
    };
    // a few at a time: one-by-one took ~8 s per 6 photos on EZ; don't hammer the server either
    const out = [];
    for (let i = 0; i < imageIds.length; i += concurrency) out.push(...await Promise.all(imageIds.slice(i, i + concurrency).map(one)));
    return out;
  }

  /** Scroll to an EZ field by name (e.g. F2_111470_1_10707236) and flash it. */
  function focusField(key) {
    const el = document.querySelector(`[name="${CSS.escape(key)}"]`);
    if (!el) return { ok: false, reason: 'Field not on this page. Open the form that contains it.' };
    // the question's row (or the one photo's box on the Images page); if it is hidden (collapsed rec box,
    // omitted section) use the nearest visible row above it
    let target = /^caption\d/.test(key) ? TIS_WRITER.blockFor(el) : el.closest('td[id^=fixedcol]')?.parentElement || el.closest('tr') || el;
    while (target && !target.getClientRects().length) target = target.parentElement?.closest('tr');
    if (!target) return { ok: false, reason: 'That question is in an omitted (hidden) section.' };
    if (/^caption\d/.test(key)) { const r = focusPhoto(key.slice(7)); setTimeout(() => el.focus({ preventScroll: true }), 400); return r; }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el.getClientRects().length) setTimeout(() => el.focus({ preventScroll: true }), 400);
    target.classList.remove('tisqc-flash'); void target.offsetWidth; target.classList.add('tisqc-flash');
    setTimeout(() => target.classList.remove('tisqc-flash'), 2200);
    return { ok: true };
  }

  /** Images page: scroll to one photo's box and flash only that box. */
  function focusPhoto(imageId) {
    const img = document.getElementById('img' + imageId) || document.querySelector(`[name="caption${CSS.escape(String(imageId))}"]`);
    if (!img) return { ok: false, reason: 'That photo is not on this page. Open the Images page.' };
    const box = TIS_WRITER.blockFor(img);
    document.querySelectorAll('.tisqc-photo-focus').forEach(x => x.classList.remove('tisqc-photo-focus'));
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box.classList.remove('tisqc-flash'); void box.offsetWidth; box.classList.add('tisqc-flash', 'tisqc-photo-focus');
    setTimeout(() => box.classList.remove('tisqc-flash'), 2200);
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    (async () => {
      switch (msg.type) {
        case 'DETECT': return detect();
        case 'BUILD_SNAPSHOT': {
          const snap = await TIS_SNAPSHOT.build(msg.orderId, p => chrome.runtime.sendMessage({ type: 'PROGRESS', orderId: msg.orderId, ...p }).catch(() => {}), { prior: msg.prior !== false, knownForms: msg.knownForms || [] });
          return { ok: true, snapshot: snap };
        }
        case 'FETCH_PHOTOS': return { ok: true, photos: await fetchPhotos(msg.orderId, msg.imageIds, msg.size, 3, msg.exts) };
        case 'FOCUS_FIELD': return focusField(msg.key);
        case 'FOCUS_PHOTO': return focusPhoto(msg.imageId);
        case 'APPLY': { const r = TIS_WRITER.apply(msg.writes); TIS_OVERLAY.recPhotos(); return r; }   // a revealed rec slot gets its thumbnail
        case 'REVERT': return TIS_WRITER.revert(msg.keys);
        case 'PRESENT': return TIS_WRITER.present(msg.keys);
        case 'HIGHLIGHT': return TIS_OVERLAY.highlight(msg.items || []);
        case 'CLEAR_HIGHLIGHT': TIS_OVERLAY.clear(); return { ok: true };
        case 'SHOW_PHOTOS': return TIS_OVERLAY.showPhotos(msg.imageIds.map((id, i) => TIS_SNAPSHOT.photoUrl(msg.orderId, id, 'l', msg.exts?.[i])), msg.captions || [], msg.index || 0);
        default: return { ok: false, error: 'unknown message ' + msg.type };
      }
    })().then(reply, e => reply({ ok: false, error: e.message }));
    return true;   // async reply
  });

  // Tell the panel which page this is (best effort; the panel also asks).
  chrome.runtime.sendMessage({ type: 'PAGE_DETECTED', detection: detect() }).catch(() => {});
})();
