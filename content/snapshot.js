// EZ → OrderSnapshot scraper (docs/BACKEND_REQUIREMENTS.md §3.2).
// Runs in the content script's isolated world on EZ pages. Read-only: GETs aa.cgi
// pages and one minimal POST to open the Image Upload page (no order fields sent).
// Verified on the 6 Boost AI orders (2026-10-29); see docs/PLATFORM_ANALYSIS.md §6.1–6.4.

(function () {
  if (self.TIS_SNAPSHOT) return;
  const clean = s => String(s || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
  // Page globals (window.scriptname) are not visible from the isolated world. EZ serves the same pages from
  // different scripts per login (aa.cgi, ss.cgi…); the other script answers "Access Denied", so use the page's own.
  const script = () => (/^\/cgi-bin\/[\w/]*\w+\.cgi$/.test(location.pathname) ? location.pathname : '/cgi-bin/current/aa.cgi');

  async function fetchDoc(init, params) {
    const url = init ? script() : script() + '?' + new URLSearchParams(params);
    const r = await fetch(url, { credentials: 'include', ...(init || {}) });
    const html = await r.text();
    if (/Access Denied/i.test(html.slice(0, 2000))) throw new Error('EZ session expired. Log in again.');
    return new DOMParser().parseFromString(html, 'text/html');
  }
  const get = params => fetchDoc(null, params);

  function labelFor(el) {
    const td = el.closest('td[id^=fixedcol]');
    if (td) {   // inspection forms: label is the first fixedcol cell of the row
      const first = td.parentElement?.querySelector('td[id^=fixedcol]');
      return first && first !== td ? clean(first.textContent) : '';
    }
    // order form: <tr><td><b>Label:</b></td><td>controls</td></tr>
    for (let tr = el.closest('tr'); tr; tr = tr.parentElement?.closest('tr')) {
      const cells = [...tr.children];
      if (cells.length >= 2 && !cells[0].contains(el)) return clean(cells[0].textContent);
    }
    return '';
  }
  function helpFor(el) {
    const td = el.closest('td[id^=fixedcol]');
    const mo = td?.parentElement?.querySelector('[onmouseover]')?.getAttribute('onmouseover') || '';
    const m = mo.match(/overlib\(\s*'([\s\S]*?)'\s*[,)]/);
    return m ? clean(m[1].replace(/<[^>]+>/g, ' ')) : '';
  }

  // EZ wraps each required field in <div id="reqsize<field name>" class="reqalert"> ("Show Req. Fields" toggles them).
  // Sandbox forms (2026-11-09): 2 per inspection form (Date of Survey, Opinion of Risk), 12 on the order form.
  const isRequired = (d, key, el) => !!(d.getElementById('reqsize' + key) || d.getElementById('reqsize' + el.name));

  /** Parse one form page into { sections[] } (+ recs found on a Recommendations form). */
  function parseForm(d) {
    const m = d.forms.myform; if (!m) return { sections: [], recs: [] };
    const secs = new Map();
    for (const cb of d.querySelectorAll('input[name^=cbox]')) {
      const [sid, copy] = cb.name.replace('cbox', '').split('_');
      const title = clean(cb.closest('tr')?.textContent).replace(/PgBr.*|Omit Section.*/i, '').trim();
      secs.set(`${sid}_${copy}`, { sectionId: sid, copy: Number(copy), title, omitted: cb.hasAttribute('checked'), internal: /qc checklist/i.test(title), fields: [] });
    }
    const groups = new Map();
    for (const el of m.elements) {
      const g = el.name?.match(/^F(\d+)_(\d+)_(\d+)_(\d+)(?:_(\d+)\|(\d+))?$/); if (!g) continue;
      const key = g[5] ? `F${g[1]}_${g[2]}_${g[3]}_${g[4]}` : el.name;
      if (!groups.has(key)) groups.set(key, { type: Number(g[1]), sec: `${g[2]}_${g[3]}`, els: [] });
      groups.get(key).els.push(el);
    }
    const commentFor = new Map(), recs = [];
    // EZ's flag(type, trigger, value, recId, n, text, secCopy): an answer in trigger needs a recommendation.
    // recId "111466_1_11384135" = a per-question box F13_<recId> (General Form). A bare recId (Seneca General Form)
    // = a line ("No CS burglar alarm system") added to a SHARED hazard list F7_<sec>_<copy>_<recId>: covered when the
    // list already holds that line (found on 1168084, 2026-11-08).
    const areas = [...d.querySelectorAll('textarea[name]')];
    const recOf = attr => {
      const m = /flag\(([^)]*)\)/.exec(attr || ''); if (!m) return undefined;
      const args = [...m[1].matchAll(/'([^']*)'|([^,\s][^,]*)/g)].map(x => (x[1] ?? x[2]).trim());
      const trigger = (args[1] || '').split('|').filter(t => t.trim()), id = args[3];   // 'A|B|' ends with '|': a blank answer is not a trigger if (!id) return undefined;
      const line = clean(args[5] || '');
      if (/_/.test(id) || d.getElementsByName('F13_' + id).length) return { key: 'F13_' + id, trigger, text: '', box: 'question' };
      const box = areas.find(t => t.name.endsWith('_' + id) && /^F\d+_\d+_\d+_\d+$/.test(t.name));
      // Seneca General-Property Only (v17) points to the list 10705169 but has no such box (1168090, 2026-11-08):
      // there is nowhere to write it, so the question is only whether a recommendation covers it somewhere
      if (!box) return { key: 'F13_' + id, trigger, text: '', box: 'none', line };
      const have = clean(box.textContent).toLowerCase();
      return { key: box.name, trigger, list: true, box: 'list', line, text: line && have.includes(line.toLowerCase()) ? line : '' };
    };
    for (const [key, g] of groups) {
      const e = g.els[0]; const sec = secs.get(g.sec); if (!sec) continue;
      const base = { key, label: labelFor(e), help: helpFor(e), ...(isRequired(d, key, e) ? { required: true } : {}) };
      if (g.type === 2) {   // checkbox group
        sec.fields.push({ ...base, type: 'choice', options: g.els.map(x => x.value), value: g.els.filter(x => x.hasAttribute('checked')).map(x => x.value).join('|'),
          rec: recOf(e.getAttribute('onclick')) });
      } else if (g.type === 4) {
        const sel = e.querySelector('option[selected]');
        sec.fields.push({ ...base, type: 'choice', options: [...e.options].map(o => o.text).filter(t => !/^(select|-+)$/i.test(t)),
          value: sel && e.selectedIndex > 1 ? sel.textContent.trim() : '', rec: recOf(e.getAttribute('onchange')) });
      } else if (g.type === 1) {
        // column 3 ("Comment*") belongs to the question answered in column 2 of the same row
        const td = e.closest('td[id^=fixedcol]'); const row = td?.parentElement;
        const ans = td?.id.endsWith('_3') && row?.querySelector('td[id$="_2"] [name^=F]');
        if (ans) commentFor.set(ans.name, { key, value: e.getAttribute('value') || '' });
        else sec.fields.push({ ...base, type: 'text', value: e.getAttribute('value') || '' });
      } else if (g.type === 6 || g.type === 7 || g.type === 8) {
        sec.fields.push({ ...base, type: g.type === 8 ? 'text' : 'longtext', value: e.tagName === 'TEXTAREA' ? e.textContent : (e.getAttribute('value') || '') });
      } else if (g.type === 13 || g.type === 14) {
        const sel = d.querySelector(`[name="RECIMAGEID_${key}"]`);
        const opt = sel?.tagName === 'SELECT' ? (sel.querySelector('option[selected]')?.value || '') : (sel?.getAttribute('value') || '');
        recs.push({ key, source: g.type === 13 ? 'question' : 'freeform', text: clean(e.textContent), imageOptionValue: opt,
          imageOptions: sel?.tagName === 'SELECT' ? [...sel.options].map(o => o.value).filter(Boolean) : [] });
      } else if (g.type === 16) {
        sec.grid = sec.grid || {}; sec.grid[key] = g.els.filter(x => x.getAttribute('value')).map(x => [x.name.split('_').pop(), x.getAttribute('value')]);
        // column headings (first row of the table), e.g. Camp Supplement "Total Sq. Ft. *", "Construction Class"
        const head = e.closest('table')?.rows?.[0];
        if (head) { sec.gridHeaders = sec.gridHeaders || {}; sec.gridHeaders[key] = [...head.cells].map(c => clean(c.textContent)); }
      }
    }
    for (const s of secs.values()) for (const f of s.fields) {
      const c = commentFor.get(f.key); if (c) f.comment = c;
      if (!f.label) f.label = s.title;   // Narrative, U/W response, Opinion of Risk: the section title is the label
      if (f.rec) { const r = recs.find(x => x.key === f.rec.key); if (r) f.rec.text = r.text; }
    }
    return { sections: [...secs.values()], recs };
  }

  function parseOrder(d) {
    const txt = clean(d.body.textContent);
    const pick = re => (txt.match(re) || [])[1] || '';
    const forms = [...d.querySelectorAll('a')].filter(a => /formid=/.test(a.getAttribute('href') || '')).map(a => {
      const u = new URL(a.getAttribute('href'), location.href); const t = clean(a.textContent);
      const state = clean(a.parentElement?.textContent).match(/\[([^\]]+)\]/)?.[1] || '';
      return { formId: Number(u.searchParams.get('formid')), copy: Number(u.searchParams.get('copyformnum') || 0),
        name: t.replace(/\(v\d+\)$/, '').trim(), version: Number((t.match(/\(v(\d+)\)/) || [])[1] || 0), state };
    });
    const files = txt.match(/Photo Required\? (\w+) Diagram Required\? (\w+) Photos: (\d+) Diagrams: (\d+) Attachments: (\d+)/) || [];
    const of = parseForm(d);   // the order form uses the same F<type>_ scheme
    const ofFields = of.sections.flatMap(s => s.fields);
    const findOF = re => ofFields.find(f => re.test(f.label));
    const checked = re => (findOF(re)?.value || '').split('|').filter(Boolean);
    const feeSel = d.querySelector('select[name=orderfeetypeid]') || [...d.querySelectorAll('select')].find(s => [...s.options].some(o => /NYC|sq ft/i.test(o.text)));
    const inVal = n => clean(d.querySelector(`input[name="${n}"]`)?.getAttribute('value'));
    const taVal = n => clean(d.querySelector(`textarea[name="${n}"]`)?.textContent);
    // Order form "Location(s)" field. On orders whose Order Form is shown read-only (e.g. Complete) it is plain text:
    // the label row, then a one-cell row with the address. The page-text "Location:" can be the Assign box's "Unprocessed".
    const locRow = [...d.querySelectorAll('tr')].filter(tr => /^Location\(s\)/i.test(clean(tr.textContent)) && clean(tr.textContent).length < 600)
      .find(tr => clean(tr.nextElementSibling?.textContent));
    const loc = clean(findOF(/^Location\(s\)/i)?.value?.split('\n')[0] || '')
      || clean((locRow?.nextElementSibling?.innerText || locRow?.nextElementSibling?.textContent || '').split('\n')[0])
      || clean((d.body.innerText || '').match(/Location:\s*\n?([^\n]+)/)?.[1] || '').replace(/^Unprocessed$/i, '');
    return {
      orderId: Number(pick(/Order Number: (\d+)/)), status: pick(/Status : (.+?) Located/), insured: pick(/Insured: (.+?) Policy/),
      client: pick(/Client Company: (.+?) Client User/), inspector: pick(/Inspector: (.+?) (?:Pre-Insp|Inspector Fee)/),
      location: loc, geo: { state: (loc.match(/\b([A-Z]{2})[,\s]+\d{5}\b/) || [])[1] || '', zip: (loc.match(/\b(\d{5})\b(?!.*\d{5})/) || [])[1] || '' },
      priorOrderIds: [...d.querySelectorAll('a[href^="javascript:matchpop"]')].map(a => Number(a.getAttribute('href').match(/\d+/)[0])),
      // "Matches:" = earlier surveys of the same risk; each link reads "1151477 7/21/26"
      priorMatches: [...d.querySelectorAll('a[href^="javascript:matchpop"]')].map(a => ({ orderId: Number(a.getAttribute('href').match(/\d+/)[0]),
        date: (clean(a.textContent).match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/) || (a.getAttribute('onmouseover') || '').match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/) || [])[1] || '' })),
      counts: { photos: Number(files[3] || 0), diagrams: Number(files[4] || 0), attachments: Number(files[5] || 0) },
      orderForm: {
        requestType: checked(/^Request is/i)[0] || '',
        photosRequired: /yes/i.test(findOF(/Photos .*required/i)?.value || files[1] || ''),
        diagramRequired: findOF(/Diagram/i)?.value ? /yes/i.test(findOF(/Diagram/i).value) : null,
        natureOfBusiness: findOF(/Nature of Business/i)?.value || '', coverages: checked(/^Coverage/i), liability: checked(/Indicate all that apply/i),
        additionalAddresses: findOF(/Additional Address/i)?.value || '', climaticSupplements: checked(/Climatic Perils/i),
        additionalInstructions: of.sections.filter(s => /additional instructions|special coverages/i.test(s.title)).flatMap(s => s.fields)
          .map(f => f.value).filter(v => v && !/^\*+$/.test(v)).join('\n') || findOF(/additional instructions|special coverages/i)?.value || '',
      },
      pricing: feeSel ? { selectedFeeType: feeSel.selectedIndex > 1 ? feeSel.options[feeSel.selectedIndex].text : '', feeOptions: [...feeSel.options].map(o => o.text).filter(t => /\$/.test(t)) } : null,
      // Set Fees box (read only): what is entered now, and the notes/comments where inspectors add fees
      fees: { inspector: inVal('insfee'), inspectorHours: inVal('inshours'), client: inVal('clientfee'), clientHours: inVal('clienthours'), preInspection: inVal('preinsfee') },
      pricingNotes: { inspector: taVal('pricenoteins'), qc: taVal('pricenoteqc'), admin: taVal('pricenoteadm') },
      comments: ((txt.match(/Comments:\s*(.*?)\s*Actions Taken/) || [])[1] || '').replace(/^None$/, '').slice(0, 3000),
      forms,
    };
  }

  /** Captions from the report view (fallback only: it is a snapshot and may be stale). */
  async function captions(orderId) {
    const d = await get({ g: 'F', A: 0, orderid: orderId });
    const out = [];
    for (let i = 0; ; i++) {
      const img = d.querySelector(`#imshow${i} img`); if (!img) break;
      const id = (img.getAttribute('src') || '').split('/').pop().split('?')[0].replace(/[a-z]?\.jpe?g$/i, '');
      out.push({ imageId: id, caption: clean(d.querySelector(`#imshowlabel${i} span`)?.textContent), order: i + 1, markedHazard: false });
    }
    return out;
  }

  /** Image Upload page: the order page's Upload button = POST g=O&buttonact=Upload.
   *  Only those navigation fields are sent, never the order page's fee/status fields. */
  async function images(orderId) {
    const d = await fetchDoc({ method: 'POST', body: new URLSearchParams({ g: 'O', orderid: orderId, buttonact: 'Upload', butparam: '' }) });
    const f = d.forms.imgeditform; if (!f) return [];
    return [...f.querySelectorAll('input[name^=caption]')].map((c, i) => {
      const id = c.name.replace('caption', '');
      const cell = d.querySelector(`[name="delbox${id}"]`)?.closest('td')?.textContent || '';
      const box = d.getElementById('img' + id)?.closest('table')?.textContent || '';
      // EZ keeps the uploaded file's extension and the server is case-sensitive: 1166305 is .jpg, 1166310 is .JPG
      const src = d.getElementById('img' + id)?.getAttribute('src') || [...d.images].map(im => im.getAttribute('src') || '').find(u => u.includes('/' + id + 't.')) || '';
      const ext = (src.match(/\.(jpe?g|png|gif)(?=$|[?#])/i) || [])[0] || '.jpg';
      return { imageId: id, caption: clean(c.value), order: i + 1, ext,
        markedHazard: !!f.querySelector(`[name="imageclassid${id}"]`)?.hasAttribute('checked'),
        usedAsRecImage: /Used as Rec Image/i.test(cell),
        addedAt: (box.match(/Added:\s*([\d-]+ [\d:]+)/) || [])[1] || null };
    });
  }

  /** At most n EZ requests at once across everything one build reads (current order and prior report). Jobs start
   *  in the order they were queued. */
  function limiter(n) {
    let active = 0; const queue = [];
    const next = () => { if (active >= n || !queue.length) return; active++; const [fn, ok, ko] = queue.shift(); fn().then(ok, ko).finally(() => { active--; next(); }); };
    return fn => new Promise((ok, ko) => { queue.push([fn, ok, ko]); next(); });
  }

  /** The latest earlier survey of the same risk ("Matches:"): its forms, for the prior-report comparison
   *  (square footage, ISO class, sprinkler coverage). Only answered fields are kept; no photos. */
  async function readPrior(match, lim) {
    try {
      const po = parseOrder(await lim(() => get({ g: 3, orderid: match.orderId })));
      const qc = po.forms.filter(f => !notQc(f.name) && !/recommendation/i.test(f.name));
      const forms = await Promise.all(qc.map(f => lim(async () => {
        const p = parseForm(await get({ g: 3, orderid: match.orderId, formid: f.formId, copyformnum: f.copy }));
        return { formId: f.formId, name: f.name, version: f.version, qcRelevant: true,
          sections: p.sections.filter(s => !s.omitted).map(s => ({ ...s, fields: s.fields.filter(x => String(x.value || '').trim()) })) };
      })));
      return { orderId: match.orderId, date: match.date, status: po.status, forms };
    } catch (e) {
      if (/expired/.test(e.message)) throw e;
      return { orderId: match.orderId, date: match.date, error: 'could not be read' };
    }
  }
  const matchTime = m => { const [mo, d, y] = (m.date || '').split('/').map(Number); return y ? new Date(y < 100 ? 2000 + y : y, mo - 1, d).getTime() : 0; };

  // Forms nobody QCs (Seneca Inspection Protocol, "Client Guide …"): listed in the snapshot, never downloaded.
  const notQc = name => /protocol|client guide/i.test(name || '');

  /** Read the whole order. EZ spends 3–9 s per page, almost all of it on its server, and answers 5–6 pages at once
   *  as fast as one (measured 2026-11-09: 5 pages one by one ≈ 30 s, all at once 10.3 s). So everything starts
   *  together: with `knownForms` (the order's forms from the last read) the forms don't wait for the order page,
   *  which only adds a form that was not known. At most 6 requests at once. `prior: false` skips the prior report
   *  (the server keeps the last one it got). */
  async function build(orderId, onProgress = () => {}, { prior = true, knownForms = [] } = {}) {
    const lim = limiter(6);
    let done = 0, total = null;
    const tick = what => onProgress({ step: 'forms', message: `Read ${++done}${total ? ` of ${total}` : ''} pages: ${what}` });
    const formKey = f => `${f.formId}_${f.copy || 0}`, started = new Map();
    const readForm = f => {
      if (!started.has(formKey(f))) started.set(formKey(f), lim(async () => {
        const p = parseForm(await get({ g: 3, orderid: orderId, formid: f.formId, copyformnum: f.copy || 0 })); tick(f.name); return p;
      }));
      const p = started.get(formKey(f)); p.catch(() => {});   // a known form that left the order is never awaited
      return p;
    };
    const known = (knownForms || []).filter(f => f.formId && !notQc(f.name));
    onProgress({ step: 'order', message: known.length ? `Reading the order page, ${known.length} form${known.length === 1 ? '' : 's'} and the Images page…` : 'Reading the order page…' });
    const orderP = lim(() => get({ g: 3, orderid: orderId }));
    known.forEach(readForm);
    const imagesP = lim(async () => { let ph = []; try { ph = await images(orderId); } catch (e) { if (/expired/.test(e.message)) throw e; } tick('Images page'); return ph; });
    const order = parseOrder(await orderP); tick('order page');
    const qcForms = order.forms.filter(f => !notQc(f.name));
    total = qcForms.length + 2;
    const latest = prior ? (order.priorMatches || []).filter(m => m.orderId && m.orderId !== orderId).sort((a, b) => matchTime(b) - matchTime(a))[0] : null;
    if (latest) onProgress({ step: 'forms', message: `Reading ${qcForms.length} form${qcForms.length === 1 ? '' : 's'}, the Images page and prior report ${latest.orderId}…` });
    const priorP = latest ? readPrior(latest, lim) : Promise.resolve(null);
    const parsed = await Promise.all(qcForms.map(readForm));   // a form the last read didn't know starts only now
    const imagesPhotos = await imagesP;
    const forms = []; let recs = [];
    for (const f of order.forms) {
      const i = qcForms.indexOf(f), p = i < 0 ? null : parsed[i];
      forms.push({ formId: f.formId, copy: f.copy, name: f.name, version: f.version, state: f.state, qcRelevant: !!p, sections: p ? p.sections : [] });
      if (p && /recommendation/i.test(f.name)) recs = p.recs.filter(r => r.text || r.imageOptionValue);   // 50 empty F14 slots otherwise
    }
    let photos = imagesPhotos;
    if (!photos.length) photos = await captions(orderId);
    const priorReport = await priorP;
    const { forms: _, ...orderInfo } = order;
    return { schemaVersion: 2, capturedAt: new Date().toISOString(),
      ez: { host: location.host, version: (document.body.innerText.match(/ver\. ([\w.]+)/) || [])[1] || '', user: clean(document.body.innerText.match(/Welcome (\S+)/)?.[1]) },
      order: orderInfo, forms, recommendations: recs, photos, diagram: { present: order.counts.diagrams > 0 }, priorReports: priorReport ? [priorReport] : [] };
  }

  /** /orders/<7-digit oid split by digit>/<id><size><ext>  (size: t thumbnail, r report, l large 841×630).
   *  ext is the uploaded file's own extension, case and all (.jpg, .JPG, .jpeg…). */
  function photoUrl(orderId, imageId, size = 'l', ext = '.jpg') {
    return '/orders/' + String(orderId).padStart(7, '0').split('').join('/') + '/' + imageId + size + (ext || '.jpg');
  }

  self.TIS_SNAPSHOT = { build, parseForm, parseOrder, captions, images, photoUrl };
})();
