# EZ (EZSurveyForm) Platform Analysis

> Source: live read-only inspection on 2026-10-29, logged in as the TIS
> **Quality Control** user `Boost_QC1`, filter *Status Group = All, Company = Boost AI*
> (6 orders). Nothing was saved, submitted or changed on the platform.
> Version string in the footer: `ver. 2.999944R1`.

## 1. What EZ is

EZSurveyForm ("EZ") is a white-labelled, server-rendered **Perl/CGI** web app that
Technical Insurance Services (TIS) uses to run loss-control inspection orders:
order intake → inspector assignment → field inspection (forms + photos) →
QC review → report delivery to the insurance client.

- Host: `https://server-ezsm.ezsurveyform.com` (today). The walkthrough recording
  uses `http://d15.ezsurveyform.com`, so treat the host as `*.ezsurveyform.com`.
- Real QC queue (from the walkthrough): orders in **Pending Review**, e.g. Seneca
  orders using *Seneca General Form* with the same QC Checklist plus a §8 notes box.
- Every screen is the same script: **`/cgi-bin/current/aa.cgi`**, switched by the
  `g` query parameter.
- No SPA, no JSON API, no background XHR. Every action is a full-page
  `GET` or a `POST` of one giant `<form name="myform">`.
- Session is cookie-based. Page JS is plain ES5 plus a few old libs
  (`overlibmws` tooltips, `nogray` date pickers). No jQuery, no framework.
- PII (broker, contact, policy numbers, emails) is **masked as `*********`** for
  the QC role.

## 2. Screens (`g` values) we care about

| `g` | Screen | URL params | Notes |
|---|---|---|---|
| `1` | **Current Orders** (search/list) | `orderstatusgroupid`, `draid` (company), `stype`, `sstring`, `numords`, … | Status-group + company filter. Results table, OID links. Has a *Data Dump* export (Flat file / XML; Order Form / Summary). |
| `3` | **Order page** | `orderid` | Order info, forms list, files/images counts, status change, assign, fees, send report, and the embedded **Order Form** (the client's request). "Order *n* of *m*" + **Next** navigation through the current result set. |
| `3` | **Form edit page** | `orderid`, `formid`, `copyformnum` | The inspection form, editable. Buttons: Clear, Show PgBr, Show Menu Values, Show Req. Fields, **Save Form**, **Submit Form**. |
| `F` | **View Report** (read-only render of the whole inspection) | `A=0`, `orderid`, `newtarget` | All forms + recommendations + photos with captions + diagram. Cleanest place to read captions. |
| `FZ` | Hazard Report | same as `F` | Not yet inspected. |
| `r` | Recommendation Library popup | `fieldid`, `orderid` | Empty for this account ("Available Recs: N/A"). |

Order page links found: `aa.cgi?g=3&orderid=<oid>&formid=<formid>&copyformnum=<n>`.

> The Claude-in-Chrome tooling blocks reading raw query strings and cookies. That
> doesn't affect the extension. It's why some values in this doc were rebuilt
> from page JS (`scriptname`, `orderid`, `A`, `newtarget` globals).

## 3. Orders list (`g=1`)

- One results table. Columns: `OID, Order, Visit Date, Status, Status Rep, Completed,
  Insp, Policy #, Insured, Location, NOB, Assigned Form(s), Assigner Name,
  Client Company, Client User, Client Fee`.
- OID cell link → `aa.cgi?g=3&orderid=<oid>`.
- Status groups: `9_Over 30 day report, All, Complete, Delayed Due Date, Due, For RCV,
  New, Pending Review, Reply Pending, Returned, Return Inspect, Reviewed, Split`.
- Statuses seen in the legend include `Pending Review, Review-Group A/B/C,
  Return Review, Reviewed, Complete, …`. The QC queue is most likely
  *Pending Review / Review-Group X* (to confirm with TIS).
- **Leave the user's filter alone.** It is a GET form. The extension must read the
  list, never resubmit it.

## 4. Order page (`g=3&orderid=`)

Read-only sections we use:

- **Order Info**: Order Number, Status, Insured, Policy # (on the sample account
  this holds the *sample name*), dates (Order / Assign / QC Assign / QC Due /
  Visit / Submit / Review / Complete), Client Company, Client User, Inspector,
  QC Reviewer, Comments.
- **Complete Inspection → Forms**: one link per attached form, text like
  `General Form(v68) [Admin Complete]`. Form name + version + state.
- **Files/Images**: `Photo Required? Yes | Diagram Required? Yes | Photos: 38 |
  Diagrams: 1 | Attachments: 0`. Parse with
  `/Photo Required\? (\w+) Diagram Required\? (\w+) Photos: (\d+) Diagrams: (\d+) Attachments: (\d+)/`.
- **Order Form** (the client's request, same `F<type>_` field scheme as forms):
  Firm, Underwriter, Broker (masked), *Request is* (New / Renewal / Recommendation Check /
  **Telephone survey only** / Virtual / Sidewalk), Rush, Due Date,
  **Photos required Yes/No**, **Diagram required Yes/No**, ITV required,
  **Nature of Business**, Policy #, Insured, Location(s), Additional Addresses,
  Climatic Perils Supplements (Wildfire / EQ & Flood), **Coverage(s)**
  (BOP, Package, Monoline GL, **Monoline Property**, Dwelling Exterior Only, Garage,
  Auto PD, WC, Sidewalk, Rec Check), **Liability** (CGL, Auto, Professional,
  Products, Liquor, Garage/GKLL, OCP), Crime, Inland Marine,
  **Additional Instructions / Special Coverages** (free text = underwriter
  concerns, e.g. "Include Freeze Supplement – loss runs show prior freeze losses").

These order-form facts drive many QC rules (photos required unless telephone
survey, diagram per order form, property-only vs GL, U/W concerns answered).

Dangerous controls on this page (the extension must **never** touch them): Remove form, Change
Status, Change Client, Assign, Set Fees, Send Report, Archive, Hold, Copy, Add
Form, Actions Taken.

## 5. Form edit page: DOM model

One `<form name="myform" method="post" action="/cgi-bin/current/aa.cgi">`. A General Form
has ~3,900 elements.

### 5.1 Field naming

```
F<type>_<sectionId>_<sectionCopy>_<fieldId>                 e.g. F2_111470_1_10707236
F16_<sectionId>_<copy>_<fieldId>_<row>|<col>                tabular grid cell
<PREFIX>_F13_<sectionId>_<copy>_<recId>                     recommendation metadata
cbox<sectionId>_<copy>   = "Omit Section" checkbox
pgbr<sectionId>_<copy>   = page-break checkbox
```

`sectionCopy` > 1 when the inspector **duplicates a section** (e.g. Construction per
building). 1166311 had 33 sections instead of 29 because of this.

| Type | Element | Meaning |
|---|---|---|
| `F1` | `input[type=text]` | Short text / "Comment" column next to a question |
| `F2` | **group of `input[type=checkbox]` sharing one name** | Choice question. Values are the option labels (`Yes`, `No`, `N/A`, `Yes (with documentation provided)`, …). Selected = `checked`. Behaves like a radio. |
| `F4` | `select` | Choice question as a drop-down (`Select / ----------- / Yes / No / N/A`). Index 0–1 are placeholders. |
| `F6` | `textarea` | Free text (e.g. QC Checklist notes box) |
| `F7` | `textarea` | **Narrative** / long text (Narrative, Special Underwriter Concerns Response) |
| `F8` | single field | Seen once on Property-Only / Freeze forms (date-like). Treat as text. |
| `F11` (`XF11`) | hidden | Header data copied from the order (Account, Policy, Insured, Location, Broker) |
| `F13` | `textarea` inside hidden `#flagrecshow<sec>_<copy>_<recId>` | **Recommendation tied to a question** |
| `F14` | `textarea` | **Free-form ("Add another") recommendation**, only in the Recommendations form |
| `F16` | grid of text inputs | Tabular data (risk-type table, pool table) |

### 5.2 Question row layout

```
<tr>
  <td id="fixedcol<sec>_<copy>_1" class="fixedformtable"> question label text </td>
  <td id="fixedcol<sec>_<copy>_2"> answer controls (F2 checkboxes / F4 select / F1) </td>
  <td id="fixedcol<sec>_<copy>_3"> comment F1 input </td>
</tr>
```

Label = first `td[id^=fixedcol]` of the parent `tr`. Some questions carry
**embedded instructions** in an `onmouseover="return overlib('…')"` tooltip
(23 on the General Form, e.g. the Narrative's required-content list). Per the
KB, *embedded form instructions override stored rules*, so scrape them.

**Required fields** (checked 2026-11-09, read-only): EZ wraps each one in `<div id="reqsize<field name>"
class="reqalert">` (checkboxes also get an overlay `div#reqalert<field name>`); the **Show Req. Fields** button
(`buttonclick('Req')`) only toggles those divs, and `requiredfieldmark()` paints a blank one red. Few fields are
required: 2 per inspection form on the sandbox (Date of Survey, Opinion of Risk: General Form 2055, Sample General
Form 5579, General Form- Property Only 3045, Freeze 5580), 0 on Recommendations (2001), 12 on the order form
(underwriter, broker, policy number, insured, nature of business, diagram…). The scraper sets `required: true` on them.

Section header row: contains the `cbox` (Omit Section) + `pgbr` checkboxes and
the title text (strip trailing `PgBr` / `Omit Section`). Section body:
`#body<sec>_<copy>` (hidden when omitted).

Report-view rule printed under hazard sections:
*"Calls for additional data/descriptions and all 'No' responses require a 'Comment'"*.

### 5.3 Recommendation flags (key mechanism)

Every flaggable question's controls carry:

```js
onclick="flag('cbox', 'No', 'F2_111470_1_10707236', '111470_1_11384147', '', '', ...)"
//        type    trigger  question field           rec id (sec_copy_recId)  flagact flagtext othersections
// F4 selects: onchange="flag('radio','No',this[this.selectedIndex].value,'111473_1_11384182','','','')"
```

- When the selected value is in the trigger list (`'No'`, or `'A|B'`), `flag()`
  shows `#flagrecshow<recId>` containing `textarea[name=F13_<recId>]`
  ("Recommendation" box). Otherwise it hides it.
- `flagtext` (default rec text) is **empty** in the TIS forms, so inspectors write
  every recommendation by hand. **This is the "Recommendation" AI requirement.**
- `flagact == 1` hides or shows whole sections (conditional sections).
- Hidden metadata per rec: `RECCLASS_`, `RECCLASS2_`, `RECIMAGEID_` (photo),
  `RECDUEDATE_`, `RECDETAILS_`, `RECLOSSONE_`, `RECLOSSTWO_`, `RECALTLABEL_`
  (all `…_F13_<recId>`).

### 5.4 Recommendations form (`formid=2001`, "Recommendations(v1)")

- Collects **all question-linked recs** (F13, same `recId`s as the General Form,
  but under the Recommendations form's own section id, e.g. `F13_1056_1_<recId>`)
  plus **50 free-form slots** `F14_1056_1_<n>` ("ADD ANOTHER RECOMMENDATION",
  revealed by `addrec(idx)`, rows `#addrectitle<n>/#addrecbody<n>/#addreclink<n>`).
- Each rec has a **photo picker**:
  `select#RECIMAGEID_F13_<sec>_<copy>_<recId>` (or `RECIMAGEID_F14_…`), with
  `onchange="recimageshow(this)"`. Options: `Select`, `-----------`, then one per
  order photo: `value="18441067t.jpg"` text `18441067`.
  **This is the "recommendation photo addition" AI requirement:** pick the
  option whose photo shows the hazard.
- In the report the recs are numbered `2026-001, 2026-002, …` and printed with
  the chosen photo and its caption.

### 5.5 QC Checklist (section `111460` on the General Form)

The form *already contains* the human QC checklist the AI should pre-fill:

- **Section 1 – Square footage**: consistent across narrative/diagram/form; matches
  prior report / order form; matches # apartments; checks out on Google Earth;
  vacant areas correct.
- **Section 2 – ISO class**: consistent narrative/diagram/form; brick-veneer
  answer matches ISO; matches photos; matches prior report / order form.
- **Section 3 – Access & systems**: access to all areas (if not, why); non-accessed
  areas marked U/D; risk heated / utilities off; aluminum wiring correct; Zinsco &
  Stab-Lok correct; sprinkler section matches photos; matches prior reports.
- **Section 4 – Photos**: photos free of hazards without recs and labelled;
  commercial cooking tag photos match form; photos match coverage (no GL on
  property only); **recs have photos attached**.
- **Section 5 – Recs & narrative**: recs not redundant and match coverage;
  narrative matches rest of report (SF, ISO, hazards); narrative describes
  operations; U/W concerns addressed in U/W concerns box.
- **Section 6 – Issues found** (check only if significant): SF issues, ISO issues,
  missed hazards in photos, operations not described, narrative issues, plus an
  `F6` notes box (in the samples it holds a list of hazard phrases).
- **Section 7 – Rating** 1–10 of the original report.

## 6. Photos

- Stored at **`/orders/<d>/<d>/<d>/<d>/<d>/<d>/<d>/<imageId><suffix>.jpg`**: the
  order id, left-padded to 7 digits, one digit per folder
  (`recimageshow()` in `orderprocess.js`).
  e.g. order 1166305 → `/orders/1/1/6/6/3/0/5/18441067l.jpg`.
- Suffixes: **`t`** = thumbnail (~1.7 KB), **`l`** = large, **841×630** (~30 KB),
  which is good enough for vision models. No suffix / `s` / `m` = 404. Some files use
  upper-case `.JPG` (e.g. `18441284t.JPG` on 1166310), so keep the extension from the option value.
  **The file server is case-sensitive**: `18441304l.jpg` is 404 while `18441304l.JPG` is the photo. All 66
  photos on 1166310 are `.JPG`; 1166305 is `.jpg`. Checked 2026-11-05: 1166305 is the only all-`.jpg` sandbox
  order; 1166307, 09, 10, 11 and 12 are all `.JPG`. The six saved fixtures predate `photos[].ext` (no `ext`
  field), so anything using them relies on the retry below. The extension reads each photo's extension from its
  `#img<id>` thumbnail on the Images page (`photos[].ext` in the snapshot) and, on a 404, retries
  `.jpg/.JPG/.jpeg/.JPEG/.png` (fixed 2026-10-30, after a run on 1166310 uploaded 0 of 66 photos).
- Same-origin fetch with the session cookie works from a content script.
- **Captions** are only in the report view (`g=F`):
  `tbody#imshow<n> img` + `tbody#imshowlabel<n> span` (text), in report order.
  Example captions: *Front, Left Side, Rear Exposure, Roof Closeup, Sprinkler
  Inspection Tag, Interior – extension cord chaining, Drive thru window broken*.
- Order photo count is on the order page (38–72 in the samples).
- Diagram: 1 per order in the samples ("Diagram Attachments → Diagram 1").

### 6.1 Image Upload page (verified 2026-10-29, read-only)

**How to reach it.** The order page's **Upload** button runs `navbuttonclick('Upload')`, which
submits the whole order form. The order form posts with **`g=O`** (not `g=3`). A minimal
`POST aa.cgi` with `g=O&orderid=<oid>&buttonact=Upload&butparam=` returns the same page
without re-sending the order page's fee/status/send-report fields. The scraper does exactly that.
Title: *"Technical Insurance Services - Image Upload"*.

**Forms on the page:**
- `singleuploadform` (upload: File, Caption, "Use Filename For Caption", Type =
  Photo / Diagram / Attachment / Client-Order Attachment / Insured Attachment). Never used.
- **`imgeditform`** (`POST g=D`, saved by **Process Changes** → `processchange()`):

| Field | Meaning | Extension use |
|---|---|---|
| `caption<imageId>` (text) | Photo caption | **Image renaming writer** (set value) |
| `imageclassid<imageId>` (checkbox, value `1177`) | **HAZARD** flag. Marked photos form the short list in rec ImageID drop-downs | Read → `markedHazard`. Writer can tick it for AI-found hazards |
| `delbox<imageId>` (checkbox) | **DELETE** (label shows "(Used as Rec Image)" when attached to a rec) | **Never touch.** Read the label → `usedAsRecImage` |
| `imgrot<imageId>` (hidden) | Rotation | no |
| `updownamount<imageId>` (text, `rankit(this,'P')`) | Move up/down | no (future: AI ordering) |
| `imgorderstring{P,D,A,O,I}` (hidden) | Pipe-joined order per type (P photo, D diagram, A attachment, O client/order att., I insured att.), filled by `processchange()` from JS arrays `imgorderP…` | no |

Per photo the page also shows **Report** (`<id>r.jpg`, ~16 KB) and **Large** (`<id>l.jpg`,
~50 KB, 841×630) sizes, and *Added: <timestamp>*. `processchange()` mirrors captions and
order into `sessionStorage` and runs the optional spell-check (`formsc`).

Diagrams made with EZ's diagram tool (CREATE DIAGRAM) don't appear here
(`imgorderD` was empty on 1166305 although the order shows Diagrams: 1).

Boost AI samples: **0 photos hazard-marked** on all 6 orders. The "Used as Rec Image"
markers matched the recommendation photos exactly (e.g. 3/3 on 1166305).

**Caption/hazard writer (extension):** the reviewer opens this page with Upload. The
extension fills `caption<id>` / ticks `imageclassid<id>`, outlines changed rows, and the
reviewer clicks **Process Changes**. Same rule as forms: never submit, never touch delete.

### 6.2 Walkthrough notes

- **View Report is a snapshot**: it doesn't show edits until regenerated and
  hides internal sections (QC Checklist). Use it for captions only and treat them as
  possibly stale. Prefer the Images section once its DOM is mapped.
- **Matches:** on the order page = prior inspections of the same risk. The id
  hover (`matchpop(id)`) shows risk info, and `(INFO)` links to that order
  (`g=3&orderid=<prior>`), which can be fetched read-only for the prior-report comparison.
- **Where an answer's recommendation goes** (EZ `flag(type, trigger, value, recId, n, text, secCopy)`, checked
  2026-11-08 on 22 orders): General Form / Boost / MSI / Hotel & Motel / Camp: `recId` = "<sec>_<copy>_<id>" → a
  per-question box `F13_<recId>` (hidden until the answer is chosen). **Seneca General Form**: bare `recId`
  (e.g. 10705169) shared by many questions → one long-text **hazard list** `F7_<sec>_<copy>_<recId>`, and the
  answer adds its `text` ("No CS burglar alarm system") as a line. **Seneca General-Property Only (v17)** points to
  10705169 too but has **no such box** (nowhere to write it).
- **Matches / prior surveys** (checked on live order 1168099, read-only, 2026-11-06): each match is an
  `a[href^="javascript:matchpop"]` whose text is "1151477 7/21/26", newest first, with an "(INFO)" link to
  `<script>?g=3&orderid=<prior>`. Camp Supplement (v10) keeps buildings in a type-16 table in "Section IV: Property
  Survey": headings "Bldg. Name", "Total Sq. Ft. *", "Construction Class" (e.g. "ISO I"), "YB", "Condition", Smoke
  Detectors, Tagged Fire Exting., Lighted Exit Signs, Emerg. Lighting, Fire or Security Alarm, Comments (no sprinkler
  column).
- **No camera data on photos** (checked 2026-11-06): EZ re-encodes every upload (height 630 for the "large" size) and
  drops EXIF: 0 of 196 photos from 5 orders have camera make, date taken or GPS. The Images page shows per photo only
  PhotoID, Report / Large size in KB and "Added: <date time>" (upload time); no original file name.
- **The CGI script depends on the login** (found 2026-11-06): the same pages are served as `/cgi-bin/current/aa.cgi`
  for one account and `/cgi-bin/current/ss.cgi` for another. The other script answers **"Access Denied"** (HTTP 200)
  even while the user is logged in. Always build EZ links from the open page's own path (`detect().script`), never a
  fixed `aa.cgi`. Checked on 1166305 via `ss.cgi`: order page, General Form (3,960 fields), Images page (38 captions).
- **Set Fees box** (order page, checked on 1166307, 2026-11-06): `select[name=orderfeetypeid]` (Order Fee Type),
  `input` `preinsfee`, `insfee` ($ flat rate), `inshours`, `qcfee`, `qchours`, `clientfee`, `clienthours` (blank =
  `0.00`), and three **Pricing Notes** textareas `pricenoteins` (Inspector viewable), `pricenoteqc` (QC viewable),
  `pricenoteadm` (Admin only). Order **Comments** sit between "Comments:" and "Actions Taken" ("None" when empty).
  On the sandbox only 1166307 has a note (`pricenoteins` = "125"). Read only: never Set Fees.
- **Pricing**: order page → Set Fees → *Order Fee Type* drop-down, per client. Seen
  on Boost AI: `$135 ALL NYC Risks · $156 Up to 10,000 sq ft outside NYC · $197
  10,001–20,000 · $234 20,001–50,000 · $270 50,001–99,999 · $306 100,000 · $85
  Exterior/Rec Check`.
- Some forms on an order are **not QC'd** (e.g. *Seneca Inspection Protocol*, the
  inspector instructions; all "Client Guide …" forms).

### 6.3 Scraping facts learned from the real capture (2026-10-29)

- **Text questions come in pairs**: the answer input in column 2 (`fixedcol…_2`, "Data/Descriptions")
  and a comment input in column 3 (`…_3`, "Comment*"), both labelled by the same row.
  Treat column 3 as the comment of whatever answers in column 2 (choice *or* text).
- **Long-text sections have no row label** (Narrative `F7_111459…`, Special Underwriter
  Concerns Response `F7_111488…`, Opinion of Risk `F2_111472…`). Use the section title.
- **Order form layout** is `<tr><td><b>Label:</b></td><td>controls</td></tr>` (no `fixedcol`).
  Additional Instructions live in their own section ("Additional Instructions/Special Coverages").
- Order-page field `Inspector:` is followed by `Pre-Insp. Fee`.
- The Recommendations form has 50 empty `F14` slots. Keep only recs with text or a photo.
- Real key-question labels: see `backend/rules/form-registry.json` (e.g. "2. Brick (or stone)
  veneer", "3. Load-bearing substrate behind the brick veneer", "32. If building is vacant,
  what utilities, if any, remain on", "19. Is working emergency lighting provided").
- "No ⇒ comment required" applies where "No" is the adverse answer, which EZ marks with a
  rec trigger on "No". Benign "No" answers (firewalls, security guards) need no comment.
- Capture speed: ~45–60 s per order (order page + 2–3 forms + Images page, each page large).

### 6.4 Getting data out of the EZ tab (dev)

Chrome blocks `fetch` from the EZ page to `http://localhost` even after the
local-network prompt was allowed. The working dev route: build snapshots in the page →
`Blob` + `<a download>` → Downloads → `backend/fixtures/`. (EZ's `ng_all.js` overrides
`Element.remove()` and throws after the click. Harmless.) In the real extension the data
goes through the service worker, which isn't affected.

## 7. Saving model and page behaviours (affects the writer)

- **Save Form** = `buttonclick('Save')` → `confirm()` dialog → `myform.submit()`
  with `buttonact=Save`. **Submit Form** runs `textareacheckall()`,
  `requiredcheck()` and `datatypecheck()`, plus an optional spell-check (`formsc`), then posts.
  Both are full page reloads.
- `window.onbeforeunload = checkforsave`: warns if `saved == false`.
- **`localcache`** is on: the page serialises the form (`getFormString`) to
  `sessionStorage` (`orderid`, `cachedate`, `oStr`, `tabfields`, `formid`) so
  unsaved edits survive a crash. The "CACHE" / "Cached: Never" header shows it.
- Inputs have **no inline change handlers** except F2/F4 `flag(...)` and
  select `recimageshow`. Listeners are probably attached to the whole form.
- **Writer rules:** set values the way a user would. For F2 use `.click()` on the target
  checkbox so `flag()` runs and the rec box appears. For F4 set `selectedIndex` and
  dispatch `change`. For text use `value` plus `input` and `change`. For RECIMAGEID set
  `value` and dispatch `change`. **Never call `submit()`. Leave Save/Submit to
  the human**, at least until TIS signs off on auto-save.
- `alert/confirm` dialogs block the browser. The extension must never trigger them.
- Idle logout exists (`Logout-Idle`, autologout popup).

## 8. Page JS functions worth knowing (`/lib/current/screens/*.js`)

`order.js`: `flag, flagtoggle, omitsection, loadreclibrary, iview, multiphoto,
getFormString, localcacheset/load/check, navbuttonclick, checkforsave,
requiredfieldmark, textareacheckall, datatypecheck, checkreco, addremline`.
`orderprocess.js`: `addrec, recmove, recimageshow, buttonclick, requiredfieldtrap,
zoomin/zoomout`. `utils.js`: polling helpers, logout, multimenu.

Globals on a form page: `scriptname, orderid, sorderid, formid, A, newtarget,
localcache, formsc, isrecform, saved, closedsection`.

## 9. Form catalogue seen (Boost AI)

| formid | Name | Sections | Notes |
|---|---|---|---|
| 2055 | General Form (v68) | 29 | QC Checklist, U/W Concerns, Occupancy, Losses, Construction, Building Updates, Property Hazards, Liability Hazards, Fire Doors, Pool, Prof./Auto/Products Liability, Cooking, Private/Sprinkler/Public Protection, Crime, Exposures, Misc, Opinion of Risk, Disclaimer |
| 3045 | General Form- Property Only (v15) | 23 | Same pattern without the GL sections |
| 5579 | Sample General Form (v1) | 29 | Copy of General Form |
| 5580 | Sample Freeze Protection (v1) | 9 | Opinion of Risk, Operations, Freeze Preparedness Plan, Freeze Events, Building Details, Sprinkler System, Optional Comments, Disclaimer. Mostly F4 Yes/No. |
| 2001 | Recommendations (v1) | 2 | General Data Heading + Inspection Recommendations |

Carrier forms seen on the 22 open orders (2026-11-08):

| Name | Where the building facts are | Notes |
|---|---|---|
| MSI Commercial Habitational | Questions: "# of units?", "# of vacant units?", Construction section | **No square-footage or % occupied question**; Sprinkler Protection section titled "omit if no sprinkler system" (omitted = none) |
| CMIC General Form | General-Form-like questions + its own QC Checklist | No square-footage question; "16. % occupied" |
| Hotel & Motel Form (K&K) | Per-building grid "Construction (add a line…)": Yr built, # stories, **Total area**, Construction Type | "12. # of rental rooms?", "14. Avg. occupancy rate"; its "Crime" section is guest security, not Crime coverage |
| Camp Supplement (K&K) | Grid "Section IV: Property Survey": Total Sq. Ft., Construction Class, YB | No housekeeping / access / roof questions |
| REC CHECK NARRATIVE ONLY | Only "NARRATIVE" | Rec checks: building key questions don't apply |
| General Form on K&K orders | Narrative box often left empty | The Hotel & Motel narrative holds the text |

The "Add Form" list on the order page shows the whole TIS catalogue (~200
forms: CMIC, K&K, Seneca, Markel RCT, Hagerty, …), the same names as
`global_forms` in `Documentation/TIS_QC_Synchronized_Master.json`.

## 10. Open questions for TIS / to verify on a live QC order

1. Which statuses make up the real QC queue, and what status change does QC do when finished?
2. Can the QC role save forms on orders in Pending Review? (The Boost AI ones are *Complete*.)
3. Is "prior report" data reachable? (`Matches:` on the order page lists earlier
   order ids with `(INFO)` links. Could feed the "matches prior report" checks.)
4. ~~Image management screen~~ Mapped (§6.1): captions + hazard flag editable, saved by Process Changes.
5. What do `RECCLASS/RECDUEDATE/RECDETAILS/RECLOSSONE/RECLOSSTWO` hold, and should the AI set them?
6. Should AI-generated narrative replace the inspector's text or sit beside it for the QC to apply?

## 10a. EZ answers pages in parallel (measured 2026-11-09, sandbox, read-only)

Order 1166307, each page alone: order page 6.2 s (315 KB), Sample General Form 8.7 s (1 MB), Freeze form 3.8 s,
Recommendations 5.0 s, Images page 6.6 s; about 30 s one after another. **All 5 at once: 10.3 s**, each page as fast
as alone, so EZ does not queue one login's requests. Almost all of it is EZ's server (time to first byte 2.6–5.2 s,
then the page streams in); turning the HTML into data takes under 0.2 s. The reader therefore asks for up to 6 pages
at once (`content/snapshot.js` `build`).

## 11. Page sizes and operator effort (measured 2026-11-01, order 1166305, read-only)

| Page | Size | What costs the operator clicks / scrolling |
|---|---|---|
| Order page (`g=3&orderid`) | ~3,200 px, 236 inputs | Client's Order Form (U/W instructions, coverage) is at the very bottom, below the status, client (~700 entries), assign (~300 inspectors) and fee drop-downs. "Order 1 of 6 · Scroll To Next" moves through the queue. `Matches:` lists prior orders (1161187–89). |
| General Form (`formid=2055`) | ~11,600 px, 3,925 inputs, 800 tick boxes, 113 text boxes, 29 sections | No section anchors or jump menu; QC Checklist is the first section, Save Form / Submit Form at the bottom (plus Clear, Show PgBr, Show Menu Values, Show Req. Fields, Calc Form). |
| Recommendations form (`formid=2001`) | ~1,450 px, 53 rec boxes (3 filled) | Each rec's photo is a drop-down of ~40 bare image numbers (`18441067t.jpg`), no thumbnails. |
| Images page (`g=O…buttonact=Upload`, lands on `g=9`) | ~11,900 px for 38 photos (≈ 20,000 px for 66–72) | 116 px thumbnails; per photo: order box, hazard tick, caption, delete tick. One "Process Changes" button saves all captions. |
| Report view (`g=F&A=0`) | ~36,000 px, 123 images | Read-only; hides the QC Checklist. |

On orders whose Order Form is shown read-only (all 6 sandbox orders, status Complete) the order-form fields are
plain text: "Location(s) - Enter one complete location…" is a label row (with its own inner table) and the next row
holds the address. `snapshot.js` reads it from there (live runs of 1166310 / 1166312 had saved an empty location).

Screenshots of these pages via Claude in Chrome tend to fail ("navigated to a different domain"); DOM reads work.
Click-saving ideas built on these numbers: `ROADMAP.md`.
