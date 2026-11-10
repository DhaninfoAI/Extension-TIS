# Extension Architecture

Product name: **TIS SmartFill** (renamed from "TIS Smart QC" on 2026-11-10). Manifest V3, side panel, modelled on our
earlier NSR "Smart Fill" extension (`../Extesnion for reference/NSR`, LossControl360) but rebuilt for EZ.

## 1. What we reuse from NSR

| NSR piece | Reuse for TIS |
|---|---|
| MV3 service worker proxies all backend calls (`background/background.js`) | Yes. Same message router + `PASS_THROUGH` pattern |
| Content scripts as single-purpose `window.NSR_*` modules, re-injected on demand | Yes, as `window.TIS_*` |
| Side panel with detection card, Activity log, progress ring, toasts | Yes (design system can be copied) |
| Accept / Reject / Reconsider queue with **All / Different / Matched** filters | Yes, for Yes/No and recs |
| Click card → scroll + yellow flash on the page (`highlighter.js`) | Yes |
| On-page full-res image modal (zoom/pan/gallery) (`imageModal.js`) | Yes. Photos are same-origin on EZ too |
| Feedback with `reviewStatus` + ground-truth re-read + auto-send (alarm / panel close) | Yes, important for measuring the AI |
| Images fetched by content script with page cookies, then sent multipart | Yes |
| Case-type-aware form registry (`common/forms.js`) | **Replace** with an EZ form registry keyed by form name + `formid` |
| LC360 DOM extractor | **Rewrite** for the EZ `F<type>_` scheme |

Lessons from NSR to carry over: no shared secret in the repo (the `X-Ext-Key`
leak); use a real bearer token. Keep staging/prod behind one `API_BASE`
constant. A backend must tolerate additive fields.

## 2. Pages and capabilities

| EZ page | Detected by | Capability |
|---|---|---|
| Orders list `g=1` | `.../aa.cgi` + "Current Orders" header + results table | **Queue view**: list OIDs in the user's current filter (read-only), show AI status per order, start a batch pre-analysis |
| Order page `g=3&orderid` (no formid) | "Order Info" + "Complete Inspection" | **Order overview**: scrape order form + forms list + counts; run *Full QC* |
| Form page `g=3&orderid&formid` | `form[name=myform]` with `F<type>_` fields | **Form review**: Yes/No verify, recs, narrative, QC checklist fill |
| Recommendations form (`formid=2001` / name "Recommendations") | `select[name^=RECIMAGEID_]` | **Rec photo match** + rec rewrite |
| Report view `g=F` | `#imshow0` | **Caption source**; read-only |

Manifest host permission: **`*://*.ezsurveyform.com/*`** (the walkthrough uses
`http://d15.ezsurveyform.com`, today's session uses `https://server-ezsm.ezsurveyform.com`)
plus the backend host. Content scripts on `*://*.ezsurveyform.com/cgi-bin/current/aa.cgi*`.
Never hardcode the host. Build URLs from `location.origin` + the page's `scriptname`.

## 2a. Implementation status (v0.4, 2026-11-05)

Built and verified (harness + live EZ on the sandbox orders): the review pipeline, side panel, on-page overlay,
Apply/Undo writer, Images-page photo focus, full-size viewer window, and the backend in `TIS/backend`
(Neon store, OpenAI modules, per-photo cache, cost cap with fallback, `/rules` editor, tests in
`backend/test/`). What is not built yet and the click-saving ideas: `ROADMAP.md`. History: v0.1 (2026-10-29)
proved scrape → 38 real photos → analysis → SSE on 1166305; v0.2 (2026-10-30) added the writer, overlay and
OpenAI; v0.3 (2026-11-01) the viewer window, offline recovery and the photo-claim guard; v0.4 (2026-11-05) sign-in
(access + rotating refresh tokens), licences with photo plans, the admin/customer dashboard, and the removal of the
score, the narrative rewrite and the comment checks; 2026-11-06 pricing from TIS's pricing guide
(`backend/rules/pricing.json` + `backend/lib/fees.mjs`; the snapshot also reads the Set Fees box, pricing notes and
comments), the order prepared in the background when it is opened (PREPARE: read + snapshot + photos; Run only
starts the AI; up to 6 EZ pages at once, the forms known from the last read start together with the order page, the
prior report only on the first read; photos 2 batches at once) and the narrative check + draft (`backend/lib/narrative.mjs` + `rules/narrative-questions.json`,
`coverage-rules.json`, `narrative-examples.json`). Note: `backend/lib/pricing.mjs` is the **OpenAI token price
list** (cost tracking), not client pricing. Licensing design: `LICENSING.md`. Known gaps: `ROADMAP.md` →
Improvement list.

## 3. Files and messages (as built)

```
extension/
├── manifest.json            MV3; hosts *.ezsurveyform.com + localhost:4010; side panel; content scripts on /cgi-bin/*
├── common/config.js         apiBase (default localhost:4010) + optional developer token (empty by default)
├── background/background.js service worker: sign-in (tokens in chrome.storage.local.auth, refresh before expiry,
│                            one retry after a 401), message router, backend proxy (api()), order pipeline
│                            (BUILD_SNAPSHOT → PUT snapshot → FETCH_PHOTOS in batches of 6 → POST photos →
│                            POST analyses), re-injects content scripts into old tabs
├── content/                 loaded in this order on every EZ page:
│   ├── snapshot.js          TIS_SNAPSHOT: EZ DOM → OrderSnapshot (order page, every form via same-origin GET,
│   │                        Images page captions + per-photo ext), photoUrl()
│   ├── writer.js            TIS_WRITER: apply / revert / present / blockFor (EZ writer rules, §6)
│   ├── overlay.js           TIS_OVERLAY: severity outlines, "Next issue" bar, photo viewer (zoom/pan/← →),
│   │                        rec photo thumbnails + picker (Recommendations form), section jump bar (forms)
│   ├── content.js           router: DETECT, BUILD_SNAPSHOT, FETCH_PHOTOS, FOCUS_FIELD, FOCUS_PHOTO, APPLY,
│   │                        REVERT, PRESENT, HIGHLIGHT, CLEAR_HIGHLIGHT, SHOW_PHOTOS; sends PAGE_DETECTED
│   └── content.css
├── sidepanel/               the panel (sidepanel.html/.css/.js): sign-in card, page strip, summary, 7 tabs, apply/undo/dismiss,
│                            settings, theme; the CSS tokens are shared with the viewer
├── viewer/                  full-size window (viewer.html/.css/.js): all photos + narrative, read-only
└── icons/                   extension icons + brand/ (TIS logos, Boost logos for the footer)
```

Panel → worker messages: `AUTH_STATE, LOGIN, LOGOUT, GET_CONFIG (incl. `bearer` for `?token=` URLs), SET_CONFIG, HEALTH, DETECT, ANALYZE, ANALYZE_DEMO, FIXTURES, LATEST, API,
FEEDBACK, FOCUS, FOCUS_PHOTO, APPLY, REVERT, PRESENT, HIGHLIGHT, CLEAR_HIGHLIGHT, SHOW_PHOTOS` (the worker forwards
page actions to the EZ tab's content script). Worker → panel: `PROGRESS`, `AUTH_CHANGED` (session ended → sign-in card). Every worker reply to a call that needs
sign-in carries `signIn: true` when nobody is signed in. Content → panel: `PAGE_DETECTED`.
Panel → viewer: `VIEWER_SHOW` (re-point an open viewer window). The viewer uses the same worker messages
(`GET_CONFIG, LATEST, API, FOCUS, FOCUS_PHOTO`). Panel state that must survive closing it (item decisions, undo
values) is in `chrome.storage.session` as `items_<analysisId>`; the theme and tile size in `chrome.storage.local`.

### Scrape output (sent to backend)

```jsonc
{
  "order": { "orderId": 1166310, "client": "Boost AI", "status": "Complete",
             "insured": "T.I.S", "location": "816 Harbor Street, …, MD 21231",
             "state": "MD",
             "orderForm": { "requestType": "New", "telephoneSurvey": false,
                            "photosRequired": true, "diagramRequired": true,
                            "coverages": ["Package"], "liability": ["Commercial General Liability"],
                            "natureOfBusiness": "", "additionalInstructions": "The last inspection noted …" },
             "counts": { "photos": 66, "diagrams": 1, "attachments": 0 },
             "forms": [{ "formId": 2055, "name": "General Form", "version": 68 }, …] },
  "forms": [{
     "formId": 2055, "name": "General Form",
     "sections": [{ "sectionId": "111470", "copy": 1, "title": "Property Hazards", "omitted": false,
                    "instructions": "…tooltip/heading text…",
                    "fields": [{ "key": "F2_111470_1_10707236", "type": "choice",
                                 "label": "1. Risk secured from unauthorized access …",
                                 "options": ["Yes","No","N/A"], "value": "Yes",
                                 "comment": { "key": "F1_111470_1_10707159", "value": "" },
                                 "rec": { "recId": "111470_1_11384147", "trigger": ["No"], "text": "", "imageId": "" },
                                 "help": "" }] }] }],
  "recommendations": [{ "recKey": "F13_1056_1_11384160", "source": "question|freeform",
                        "text": "…", "imageId": "18441033", "questionKey": "F2_…" }],
  "photos": [{ "imageId": "18441033", "caption": "Interior - extension cord chaining", "order": 19 }]
}
```

## 4. Flows

(Endpoints per `BACKEND_REQUIREMENTS.md` v0.2 + sign-in/licence routes in `LICENSING.md`. UI per `FRONTEND_SPEC.md`.)
Every backend call carries the signed-in person's access token; the worker renews it with the refresh token.

1. **Open order** → scrape the order page + fetch every QC-relevant form + prior
   "Matches" orders in the background → build `OrderSnapshot` →
   `PUT /v1/orders/{oid}/snapshot` → upload only `photosNeeded` (`l.jpg` blobs) to
   `POST /v1/orders/{oid}/photos`.
2. **Analyse** → `POST /v1/orders/{oid}/analyses` → subscribe to SSE → panel tabs
   fill as modules finish (Brief, Checks, Photos, Recs, Questions, Captions,
   Narrative, Finish).
3. **Apply** → the writer applies `proposedWrites` on whichever form page is open (or
   prompts to open the Recommendations form for rec photos).
4. **After edits** → new snapshot → `…/rerun` for `narrative` (always last) and any
   module the edits affect.
5. **Finish** (final check removed 2026-11-10) → §6/§7/§8 applied →
   `POST /v1/feedback` + `POST /v1/orders/{oid}/qc-outcome`.

Forms are separate pages, but the backend analyses the **whole order** once. The
extension fetches every form of the order in the background (same-origin GET of
`g=3&orderid&formid`, parsed with `DOMParser`, verified to work). So the user can
be on any page and still get order-wide results.

## 5. Autonomy levels (planned panel setting; today everything runs as level 0)

| Level | Behaviour |
|---|---|
| 0 Assist | Analyse on demand; every change is a card the user accepts |
| 1 Auto-apply (default target) | Analysis runs on page open; changes with confidence ≥ threshold are **written into the page** automatically and marked (yellow outline + "AI" badge, revertable). Low-confidence ones stay as cards. User still clicks Save |
| 2 Pre-compute queue | From the orders list, run order-level analysis for every OID in the current filter in the background (throttled, one at a time), so results are ready when the reviewer opens an order |
| 3 Auto-save (future, needs TIS sign-off) | Programmatic Save of AI-applied forms. Not built until TIS agrees; must handle `confirm()` and `onbeforeunload` |

Never automated at any level: status changes, Submit Form, sending reports,
assignment, fees, deleting/removing forms, the orders-list filter.

## 6. Writer rules (EZ specifics)

- Snapshot every field before writing so it can be reverted.
- F2: `el.click()` on the checkbox whose `value` equals the target (fires
  `flag()`, which opens/closes the rec box). Do not set `.checked` directly.
- F4: set `selectedIndex`, dispatch `change` (fires `flag('radio',…)`).
- Text/textarea: set `.value`, dispatch `input` + `change`.
- Recs: ensure `#flagrecshow<recId>` is visible (the answer triggers it); write `F13_<recId>`.
  Free-form: call page `addrec(idx)` to reveal the next `F14` slot, then write.
- `RECIMAGEID_*`: set `.value = "<id>t.jpg"` (match an existing option exactly,
  including `.JPG` case), dispatch `change`.
- Never call `submit()`, `buttonclick()`, `navbuttonclick()`, or anything that opens
  `alert/confirm`.
- Mark touched fields so the user can see what the AI changed. Leave the page's own
  `saved` flag logic alone (its beforeunload warning protects unsaved AI edits).

## 7. Risks

- EZ HTML changes (version string in footer `ver. 2.999944R1`). Log the version
  and fail soft.
- Very large forms (~3,900 inputs). Scrape once and diff incrementally.
- Session expiry mid-analysis. Detect the login page in fetched HTML.
- PII: the QC role already sees masked values. Send only what rules need.
