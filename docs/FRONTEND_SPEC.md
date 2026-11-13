# Frontend Spec: what the QC reviewer sees (v0.4)

> What is built: §2.8 below (kept current). Status and next steps: `ROADMAP.md`. Sections 2.1–6 are the
> original design; items in them that are not in §2.8 are not built yet.

Goal: turn TIS's ~15-minute manual QC (`RECORDING_NOTES.md`) into a few
minutes of **reviewing AI proposals**, without the reviewer holding the order in their
head or hunting through 3,900 fields. Three surfaces:

1. **Side panel** (main workspace, follows the QC checklist order)
2. **On-page overlay** inside EZ (badges and highlights on the actual fields)
3. **Orders-list badges** (queue triage)

Plus a separate **web admin** for TIS managers (rules, hazard library, analytics).

## 1. Principles from the walkthrough

- **Follow the QC order**: brief → checks → photos/hazards → recs → rec photos →
  questions → narrative (last) → finish. Each step builds on the previous one.
- **Never make them remember the order form.** It stays pinned in the panel.
- **Evidence one click away**: every item links to the field (scroll + flash), the
  photo (full-res modal) or the narrative sentence.
- **Required vs advisory** is always visible. Over-flagging kills trust.
- **Nothing persists without the human.** The AI writes into fields and marks them; the
  reviewer saves.

## 2. Side panel layout

```
┌──────────────────────────────────────────────┐
│ Order 1164320 · Seneca Insurance- NYBO       │  header (sticky)
│ Pending Review · Seneca General Form v20     │
│ [Package] [CGL] [New] · 130 E 72nd St, NY ↗  │  chips; ↗ = Maps / Earth
│ 46 photos · 1 diagram · Prior: 1161189       │
│ ● Analysis 100%   3 blockers · 7 warnings    │  progress / summary
├──────────────────────────────────────────────┤
│ Brief | Checks | Photos | Recs | Questions | │  tabs, with count badges
│ Narrative | Finish                           │
└──────────────────────────────────────────────┘
```

### 2.1 Brief (order form, always available)
- Coverage, request type (telephone survey, rec check…), location, client's expected
  area, ITV, required supplements, photos/diagram required.
- **Underwriter concerns tracker**: each concern from Additional Instructions as a row:
  ✅ answered (link to where) / ⚠ partial / ❌ not answered. **Insert drafted answer**
  button writes the numbered answer list into the U/W response box.
- Client watch-outs pulled from rules (e.g. "Seneca: flag every sidewalk crack;
  narrative must name tenants & operations").
- Prior report card: SF / ISO / sprinkler / units vs this report, differences highlighted.

### 2.2 Checks (QC checklist §1–§5 as cards)
- Grouped exactly like the checklist: **Square footage · ISO class · Access & systems ·
  Photos · Recs & narrative**.
- Each card: status icon, one-line message, evidence chips, **Fix** (applies the
  `proposedWrites`) / **Dismiss (reason)**.
- **SF widget**: narrative / form / diagram / order / prior numbers side by side, the
  SF-per-unit calculation shown (`(6,915 − 500) × 0.9 ÷ 4 = 1,443 sf/unit` → amber),
  link to Google Maps satellite + Earth for the footprint check.
- **Apply checklist ticks**: ticks every §1–§5 item whose checks all passed. Items
  with open issues stay unticked and are listed.

### 2.3 Photos (hazard review: the highest-value tab)
- Grid of all photos with caption, AI badges (hazard type, **Required**/**Advisory**),
  ✓ when a rec already covers it, ⚑ when the inspector marked it as hazard.
- Filters: **Hazards without rec** (default) · All hazards · Marked by inspector ·
  GL photos on property-only · Caption issues.
- Click → on-page full-res modal (zoom/pan/gallery). Side card: AI description,
  hazard reasoning, matching hazard-guide entry (e.g. "Tape on breakers"),
  **Create rec** (pre-filled text + this photo) / **Not a hazard** (feedback).
- **Captions**: inline "IMG_3673 sidewalk → *Front sidewalk – cracked/uneven*",
  per-photo accept, **Accept all captions**.

### 2.4 Recs (recommendations + photos)
- One list in report order (`2026-001…`), sections:
  **Missing** (from flagged answers / photo hazards / marked photos) · **Needs rewrite**
  (starts with "Recommend", no action, typo, no location) · **Duplicate** (merge) ·
  **Not applicable** (e.g. emergency lighting on a 3-unit building, with the rule) ·
  **OK**.
- Each rec card: text (editable before apply), Required/Advisory, source link,
  **photo slot** with the suggested thumbnail + alternatives strip, or "No photo
  needed (absent item)".
- **Apply** writes F13/F14 text, opens a free-form slot when needed, and sets
  `RECIMAGEID`. A Recs-form helper shows which writes need the Recommendations form
  open ("Open Recommendations form ↗" + auto-apply on arrival).

### 2.5 Questions (Yes/No verification)
- Queue filtered **Differ · Blank · Logic violations · Matched**.
- Card: question text, current vs suggested answer (no comment drafts since 2026-11-05), photo
  evidence, confidence. Click → scrolls to the field.
- Accept / Reject / Edit. **Accept all ≥ threshold**.

### 2.6 Narrative (enabled last; prompts a re-run if the form changed since analysis)
- Issues list: contradictions (with the form value that wins), missing required
  content, stale values (e.g. old SF), spelling.
- ~~Side-by-side or inline **diff** of the rewrite.~~ (removed 2026-11-05) `[[confirm: …]]` tokens
  highlighted. Inspector facts kept are marked "kept: not in form".
- ~~Apply rewrite~~ / copy.

### 2.7 Finish
- ~~**Final check**~~ (removed 2026-11-10 at the user's request; Save QC outcome records every finding's decision) (was: pre-flight on a fresh snapshot): blockers must be zero → green
  "Ready for Reviewed". Lists stale values, blank required fields, recs without photos,
  unanswered U/W concerns, rating vs recs conflicts.
- **Inspector feedback**: suggested §6 flags (SF / ISO / missed hazards / operations /
  narrative), suggested §7 rating with reasons, §8 note draft → **Apply to checklist**.
- **Pricing check**: selected fee vs expected (e.g. NYC → $135).
- Session summary: AI items accepted / edited / rejected, time on order → sent as
  feedback + `qc-outcome`.

### 2.8 Always-on
- **Images page** (2026-10-30, changed 2026-11-10): a photo (tile or thumbnail) or a finding's "Show photo ›"
  opens the large viewer, on every page. On EZ's Images page, a click on the rest of a photo finding scrolls to that
  photo's box (`imageordertagP<n>`) and outlines it (rename findings: its caption box is ready to edit). Hint on the
  Photos tab there: "Click a photo to see it larger. Click a finding to find its photo on this page."
  **Images** (quick links; "Open Images page ↗" on rename cards) opens `aa.cgi?g=O&orderid=…&buttonact=Upload` in a new
  tab next to the form (GET works, so the form's unsaved edits are untouched), or switches to it if open.
- **Full-size viewer window** (built 2026-11-01, `viewer/`): "View all N photos ↗" (Photos tab) and "Read the full
  narrative ↗" (Narrative tab) open one large popup window (1440×940, reused if already open; the panel re-points it
  with a `VIEWER_SHOW` message). **Photos**: every photo in one grid (filters Hazards / Rename / Rec photos / Marked by
  inspector / Not checked by AI, caption search, S/M/L tiles); click → zoom/pan viewer with a filmstrip and a notes column (what the AI
  sees, hazards + suggested rec, suggested name, the rec it is used for). Photos the AI has no result for (2026-11-13):
  "N of M photos were checked by the AI…" note in the panel's Photos tab (with a **Not checked N** filter) and in the
  viewer; a failed load of what the AI saw shows "Couldn't load what the AI saw for this photo." + **Try again**. "Show in EZ" and "Copy caption" were removed
  2026-11-10. **Narrative**: the full text in a reading column with the
  flagged sentences highlighted (click ↔ issue card), word count, Copy text ("Show in EZ" removed 2026-11-10); a **Current / Draft** switch when
  a draft exists (2026-11-06; `[[confirm: …]]` facts highlighted, Copy copies the draft). Read-only: the window never writes into EZ.
- **Narrative tab: draft + question set** (built 2026-11-06): "Draft narrative" block above the issues (word count,
  "N facts to confirm" note, collapsed text with Show all, **Replace narrative in EZ** / Put draft in EZ (Apply → Undo
  restores the old text), Copy, Don't use; Open General Form when the narrative box isn't on the page), then "TIS
  question set: n of m answered · GL questions included / property only · restaurant questions", then the issues
  (contradictions, left-out facts, not in the report, ordered coverage not addressed).
- **Prior report** (built 2026-11-06): Overview → "Prior report <order> · <date> Open ↗" with three rows
  "SF / ISO / Sprinkler coverage – Prior report = … – current = …" and ✓ same / ✗ differs ("not on the form" when a
  value is missing). Open ↗ opens the prior order in a new tab. Since 2026-11-08: when the two surveys cover a
  different number of buildings, a "Buildings" row is added and SF says "different scope" with a note under the
  table instead of ✗ differs.
- **Inspector pay as a minimum** (2026-11-08): Overview → Pricing shows "$90 ✓ at or above the $70 minimum" or
  "at least $70 · not entered"; only pay below the minimum is a finding.
- **Photo source** (built 2026-11-06): Photos tab "Where the photos came from" section ("Photo may be from Street
  View: The AI reports … Check that the inspector took this photo on site." / "Check where this photo came from")
  and an amber "Street View?" badge on the photo tile.
- **AI didn't run note** (built 2026-11-06): amber box at the top of the results card when an AI step failed:
  "The AI part of this review didn't run" (or "Part of the AI review didn't run"), a plain reason by category
  (setup problem, incl. an AI account with no credits left → tell your administrator; busy / no answer → try again in a few minutes; size limit; other), the
  affected steps, and for admins only a cleaned technical detail.
- **Order prepared on open** (built 2026-11-06, quiet since 2026-11-10): the order is read and its photos uploaded in
  the background with no message; the line under Run AI review only appears if that failed ("Couldn't get the order
  ready (…). It will be read when you press Run AI review"). On Run the first three steps show ✓ at once and only the
  AI step runs.
- **Overview → Pricing** (built 2026-11-06): a table of expected **inspector pay**, **client fee** and **Order Fee
  Type** from TIS's pricing guide, each with ✓ matches EZ / EZ has $X / not entered and the reason (minimum, notes,
  travel, hours; client table or Seneca tier; supplements); "Check pricing by hand" notes for ambiguous cases;
  "Enter the fees in EZ yourself (Set Fees)". Never writes fees. It follows the panel's theme and applied/dismissed state, and
  reloads when a newer review exists. Images come from SmartFill's photo store, falling back to EZ's own file.
- **Photos → "Hazards with a drafted recommendation"** (2026-11-10): a photo hazard the review wrote a recommendation
  for is a one-line pointer (thumbnail, hazard, what was seen, "See in Recs ›"), not a card of its own and not counted;
  "Hazards without a recommendation" lists only hazards with no rec at all.
- **Prior report on Overview** (redesigned 2026-11-10): "Prior report 1161189 · 9/21/26 · Open ↗" and a table
  Prior | Now | mark per fact (Square footage, Buildings, ISO class, Sprinklers). Marks: "Same" (green),
  "Differs" (red), "Other scope" (amber: the reports cover a different number of buildings), "Not compared" (one side
  has no value). A differing Now value is bold; square footage shows the change ("−272 sf (−6%)"). One plain note when
  the building counts differ. The "Explain each change…" line and the "From TIS's pricing guide…" line under Pricing
  were removed.
- **Settings** (2026-11-10): a panel under the gear (closes on ✕, outside click, Esc): profile card with initials,
  name, email · organisation and plan chip; Photos this month (used of plan, left, bar, reset date); Appearance switch
  System / Light / Dark with icons; footer with the version and Sign out (hidden for the developer token).
- **Photos left** (2026-11-10): footer chip "N photos left" (amber < 10 %, red at 0) with a "used of plan, resets"
  tooltip; Settings shows the same as a bar. From `/v1/auth/me`, refreshed on open, after each review, every 5 min.
- **Order info on Overview** (2026-11-10; replaces the order facts strip under the tabs; briefly its own tab, merged
  into Overview the same day). Overview reads: Must fix first → Order info → Underwriter instructions + questions →
  Pricing → Prior report. Order info is everything read about the order in one place. Order (number, location, additional addresses, insured, nature of business, request), Coverage ordered
  (coverage, liability, climatic supplements), Required by the order (photos, diagram, files on the order), Building
  from the forms (total area, stories, units, year built, construction / ISO class, sprinklered) and the underwriter
  instructions. Empty or "*****" values are left out. The client company is never shown anywhere in the panel
  (order card, Overview, pricing notes).
- **Square footage helper** (Checks tab, QC checklist 1.4, built 2026-11-01): form / narrative / prior SF, stories,
  expected outline (total ÷ stories); "Open in Google Earth ↗" and "Google Maps ↗" at the order address; measuring
  hint; "Measured outline" input → "✓ Within N%: tick 1.4" (≤ 15 %) or "✗ N% smaller/larger: question the square
  footage". The measurement is kept for the session only.
- **Recommendations form helpers** (built 2026-11-01): thumbnail of the chosen photo next to each visible rec photo
  drop-down (click → large viewer) + "Pick photo ▾" grid (click = choose, same as picking in the drop-down).
  Recs tab: "Use N suggested photos" applies every photo-only suggestion whose picker is on the open page.
- **Section jump bar** (EZ forms, built 2026-11-01): "☰ Sections" tab on the left edge → list of the form's sections
  (omitted greyed, current bold, issue counts after Highlight); click scrolls there. Display only.
- **Photo viewer** (on-page and in the panel), as in NSR: scroll to zoom (100–600%), drag to pan,
  double-click to zoom/fit, + / − / 0 keys, ← → to browse, Esc to close.
- **Page status strip** (under the header): icon + the page type ("General Form", "Images page", "Order page",
  "Report view · Read only") + a green "N to apply here" count. Since 2026-11-10 each fact is shown once: the page
  type only here, the order number only on the order card ("**Order 1166305**" bold, the address under it in smaller text),
  coverages and U/W instructions only on Overview. The strip keeps a sub-line only for problems or guidance (EZ
  session expired, orders list, not on EZ, "The review shown is for order …"). When the EZ tab moves to another page
  the strip flashes and a toast says "Now on: …". The count is taken after the panel has checked which fields exist
  on the new page.
- **Quick links** (built 2026-11-09, pinned under the page strip with it): "Go to  Order · General Form · Recs ·
  Images · Report | Photo viewer", one chip per form of the order (from its snapshot; before that only the form that is open). The
  page the EZ tab shows is marked. Order, forms and Report open in the EZ tab (GET only; a toast warns that EZ will
  ask before leaving unsaved changes); Images opens next to it as before. **Photo viewer** opens the full-size viewer as
  soon as the order has been read (photos uploaded), so before any AI review too; the viewer then says "Not
  reviewed yet" instead of hazard tags. Shown only while the EZ tab is on the reviewed order. Replaces the strip's
  old "Images ↗" button. The tab bar sticks under it (`--head-h`).
- **Review summary** (no score: removed 2026-11-05, TIS said it is not needed): a line such as "3 must-fix items
  before Reviewed" / "A few things to check" / "Only advisory items left", the must fix / to check / advisory /
  missed-hazard counts (live as findings are applied or dismissed), "Reviewed <date> · took 17s", Highlight on page.
  The backend still computes `summary.score` for admins only; customers never receive it.
- **Removed 2026-11-05 at TIS's request**: the "No answer needs a comment" check (rule `general.no_answer_needs_comment`,
  the AI's comment findings and comment drafts: the reviewer writes comments) and the narrative **suggested rewrite**
  (panel, viewer and backend: the narrative step now only lists issues; the reviewer edits the text in EZ).
- **Sign-in** (2026-11-05, `LICENSING.md`): a sign-in card when nobody is signed in (email + password; friendly
  messages for wrong password, locked account, all seats in use, licence expired); Settings shows the person,
  organisation, licence (plan · valid until · photos used of the plan's photos this month) and Sign out. A session that ends (expired licence,
  disabled user, signed out elsewhere) brings the sign-in card back.
- **Photo allowance notice** (2026-11-11): when the order's new photos don't fit in what is left of the month, a red
  "Not enough photos left this month" box under Run AI review gives the numbers, the reset date and "ask your
  administrator"; shown as soon as the order is ready and again if Run is refused.
- **Settings → Dashboard** (2026-11-11): "Open the SmartFill dashboard" opens `<apiBase>/dashboard` in a new tab,
  with a line on what it shows (seats, computers signed in, photos this month, reviews).
- **Branding** (2026-11-11): header = Boost star + "SmartFill" when signed out (and when the organisation has no
  logo); after sign-in the customer's logo (light/dark) + "SmartFill". The footer keeps the Boost logo. If the
  organisation's platform is not supported by this version: a "SmartFill can't open here yet" card instead of the
  panel (Settings and Sign out still work).
- **Computers and seats** (2026-11-10): the sign-in card has an optional "Name for this computer" (remembered on that
  computer and shown on the dashboard); Settings shows "This computer: …". A computer signed out from the dashboard
  sees the sign-in card with "This computer was signed out from the SmartFill dashboard. Sign in again to continue."
  The dashboard's Licence & team lists the computers signed in (each uses a seat) with Sign out (click twice).
- **No internals for the client** (decision 2026-10-30): the panel never shows model names, AI costs,
  engine/practice/fallback labels or server errors. The run line reads "Reviewed <date> · took 17s";
  errors are reworded ("The review could not finish. Please try again"); the footer only says Online /
  Offline. Cost and model data stay in the backend (`usage`, `/v1/analytics/summary`, eval reports).
- **Theme**: System / Light / Dark (header icon cycles it; also in Settings), saved in
  `chrome.storage.local`. Neutral gray surfaces with TIS navy as the single accent; dark mode is
  charcoal, not navy.
- **Click a finding to find it** (built, v0.2): every check / blocker / photo card is clickable
  ("Go to question ›" or "Show photo ›"). It scrolls EZ to the question row and flashes it; if the
  question is on another form, the panel opens that form and scrolls once it loads. A rec box on the
  General Form jumps to the question that triggers it. Photo-only findings open the photo viewer on the
  page (lightbox when the order is not open in EZ). Keyboard: Tab to a card, Enter.
- **Undo** (built): toast "Applied in EZ … Undo" after every Apply, per-card Undo, and a sticky bar
  "N changes applied in EZ, not saved yet · ↶ Undo · Undo all" above the footer. Undo restores the
  values captured at Apply time, so it still works after the panel was closed or the page reloaded.
- **Footer** (same layout as the NSR extension): connection dot + status (Online / Working… /
  Backend offline / Review failed) on the left, Boost logo | version on the right.
- Activity log (collapsible), toasts, environment badge (staging/prod),
  autonomy switch (Assist / Auto-apply high confidence), "Re-analyze" button,
  "Report a problem" (attaches analysis id).

## 3. On-page overlay (inside EZ)

- Coloured left border on fields the AI touched or flagged: **green** applied by AI,
  **amber** needs review, **red** blocker. Small "AI" pill; hover → reasoning + Undo.
- Floating mini-bar at the bottom of EZ pages: `3 blockers · 7 warnings · Next issue ▸`
  (jumps field to field, like Ross's Ctrl+F habit but targeted).
- In the QC Checklist section: a ✓/⚠ hint next to each checklist item from the AI.
- On the Recommendations form: thumbnail preview next to each ImageID drop-down
  (instead of the tiny VIEW popup).
- Never covers EZ's own Save/Submit buttons. Never triggers dialogs.

## 4. Orders list (queue triage)

- Extra badge column on the results table, injected client-side (the filter is never touched):
  `● ready · 2 blockers · 5 missed hazards`, or `not analyzed`.
- Panel action **Pre-analyze this list** (uses the user's current filter, one
  order at a time in the background) so results are ready when the reviewer opens each
  order.
- Sort hint: orders with most blockers first (advisory only).

## 5. Web admin (TIS managers, outside the extension)

| Page | Purpose |
|---|---|
| Rules | Tree client → form → rules. Markdown guidance + structured rules editor. Draft → **Test on sample orders** → Publish. Changelog with diffs |
| Hazard library | Upload/label hazard photos (type, severity, rec text, clients) |
| Inspector scorecards | Per inspector: avg rating, % SF/ISO/missed-hazard/narrative issues, top missed hazards, trend. Drill into orders |
| AI quality | Acceptance rate per module/client/rule, top rejected items with reasons, thresholds |
| Settings | Feature flags, auto-apply thresholds, users/roles |

## 6. States & edge cases

- Not an EZ page / unsupported form → explain and list supported forms.
- Session expired (fetch returns the login page) → "Log into EZ again".
- Snapshot changed since analysis → banner "Form changed: re-analyze changed parts".
- Backend slow → finished tabs show results as they arrive (SSE). Others show
  skeletons with module status.
- Form not QC-relevant (e.g. *Inspection Protocol*) → greyed out with the reason.
