# TIS SmartFill: Backend Requirements (v0.2)

> **2026-11-05:** implemented by `TIS/backend` (ours). Sign-in, licences (photo plans) and the dashboard are
> specified in `LICENSING.md`; the narrative rewrite and comment drafting were dropped at TIS's request.
> **Audience:** the backend team building the AI service for the TIS EZ extension.
> **Status:** v0.2, 2026-10-29. Redesigned from TIS's recorded QC walkthrough
> (`RECORDING_NOTES.md`). Not bound to the NSR API. Field names are proposals.
> Push back before building.
> **Read with:** `PLATFORM_ANALYSIS.md` (what EZ exposes), `QC_RULES_MAPPING.md`
> (rules), `FRONTEND_SPEC.md` (how results are shown), `SAMPLE_ORDERS.md` (test data).

## 0. What TIS needs (in their words, ranked by value)

1. **Missed hazards in photos with no recommendation**. "The hardest part…
   if the AI flags it, that's a total win."
2. **Underwriter concerns answered**. "A major pain point."
3. **Cross-field logic checks** (SF, ISO/veneer, vacancy↔utilities, access↔photos,
   sprinklers, aluminum wiring, Zinsco/Stab-Lok). "Most of this is if A then B."
4. **Recommendations**: write missing ones, fix weak ones, remove duplicates and
   **inapplicable** ones (panic hardware, emergency lighting).
5. **Rec photo attachment**, **Yes/No question verification**, **image renaming**.
6. **Narrative**: flag contradictions; rewrite with the form as source of truth,
   **last**, after other fixes.
7. Inspector scorecard (§6/§7 feedback loop, not built at TIS).
8. Pricing sanity check (least important, cheap).
9. **TIS must be able to change rules themselves** without an extension release.

## 1. Design principles

1. **One snapshot, one analysis, many views.** The extension uploads a complete
   order snapshot once. The backend runs a pipeline of modules and returns one
   result document. The UI renders tabs from it. Individual modules can be re-run.
2. **Two engines.** (a) A **deterministic rule engine** for cross-field logic
   (fast, explainable, testable, editable by TIS). (b) **LLM/vision** for photos,
   recommendations, narrative, U/W concerns. Don't use an LLM where a rule will do.
3. **Everything is evidence-backed.** Every item carries `evidence` (field keys
   + photo ids), `reasoning` (≤2 sentences), `confidence` and `severity`. The
   UI links each piece of evidence to the page.
4. **Async + progressive.** Analyses take 10–120 s. Return a job, stream module
   results as they finish (SSE), so the reviewer can start on finished tabs.
5. **Rules are data.** Client/form rules live in a versioned store that TIS edits
   (markdown + structured rule definitions). No hardcoding per client.
6. **The backend never talks to EZ.** The extension is the only EZ client. The backend
   returns *proposed writes* (`fieldKey → value`) that the extension applies.
7. **Additive schemas**: ignore unknown fields. Never 400 on extra keys.

## 2. Cross-cutting

| Concern | Requirement |
|---|---|
| Auth | `Authorization: Bearer <JWT>` per user (15-min access token + rotating 30-day refresh token). Roles `admin` (vendor) / `customer`. **No static shared key in the extension.** Header `X-EZ-User` = EZ login (e.g. `Boost_QC1`) for attribution. Built: `LICENSING.md` |
| Transport | HTTPS JSON. Multipart for photos. CORS for `chrome-extension://<id>`. SSE for job streams |
| Errors | `{ "error": { "code", "message", "retryable" } }`. Codes: `UNAUTHORIZED, FORBIDDEN, NOT_FOUND, INVALID_PAYLOAD, SNAPSHOT_STALE, MODEL_ERROR, RATE_LIMITED` |
| Caching | Snapshot keyed by `orderId` + `contentHash`. Same hash → cached result (`cached: true`). `?force=true` bypasses |
| Versioning | Every result carries `rulesVersion`, `modelVersions`, `pipelineVersion` |
| Privacy | QC users see masked PII (`*********`). Keep it masked. Photo retention: N days (TIS decides). No training on client data without TIS consent |
| Models | Provider-agnostic adapter. Baseline OpenAI `gpt-4o`. Recommended A/B: `gpt-4.1-mini` / `gpt-5.4-mini` for per-photo vision, `gpt-4.1` / `gpt-5.4` for reasoning. Photos are 841×630 JPEG, 40–120 per order. Model choice, reference-doc strategy and **cost per order** (≈ $0.61 with gpt-4o for 66 photos): see `AI_DESIGN.md` |
| Performance targets | Photo pre-processing ≤ 60 s for 70 photos. Full analysis ≤ 120 s. Single-module re-run ≤ 20 s. Final-check ≤ 5 s (rules only) |
| Cost control | Per-photo descriptions computed once per `(orderId, imageId, sha256)` and reused by every module |

## 3. Data model (snapshot)

### 3.1 Field keys

EZ input names are used as stable keys and must be echoed back unchanged:

```
F2_<sec>_<copy>_<id>   choice (checkbox group)     F4_…  choice (select)
F1_…  short text / comment    F6_/F7_…  long text (F7 = narrative, U/W response)
F13_<sec>_<copy>_<recId>  recommendation tied to a question
F14_<sec>_<copy>_<n>      free-form recommendation (Recommendations form)
RECIMAGEID_F13_… / RECIMAGEID_F14_…  photo attached to a rec (option value "<imageId>t.jpg")
cbox<sec>_<copy>          "Omit Section" checkbox
```

### 3.2 `OrderSnapshot`

```jsonc
{
  "schemaVersion": 2,
  "contentHash": "sha256:…",
  "capturedAt": "2026-10-29T10:41:00Z",
  "ez": { "host": "server-ezsm.ezsurveyform.com", "version": "2.999944R1", "user": "Boost_QC1" },
  "order": {
    "orderId": 1164320,
    "client": "Seneca Insurance- NYBO",               // exact EZ name → rules lookup
    "status": "Pending Review",
    "inspector": "mkan",                              // for scorecards
    "insured": "…", "location": "130 E 72nd St, New York, NY, 10021",
    "geo": { "state": "NY", "zip": "10021", "city": "New York" },
    "dates": { "order": "…", "visit": "2026-10-14", "qcDue": "…" },
    "orderForm": {
      "requestType": "New",                           // New | Renewal | Recommendation Check | Telephone survey only | Virtual survey | Sidewalk Only Survey
      "rush": false, "photosRequired": true, "diagramRequired": true, "itvRequired": false,
      "natureOfBusiness": "Apartments w/ mercantile",
      "clientAreaEstimate": "…",
      "coverages": ["Package"], "liability": ["Commercial General Liability"],
      "crime": false, "inlandMarine": false,
      "climaticSupplements": [],
      "additionalInstructions": "Please verify favorable conditions on walking surfaces… Any e-bike exposure? …"
    },
    "counts": { "photos": 46, "diagrams": 1, "attachments": 0 },
    "pricing": { "selectedFeeType": "$135 ALL NYC Risks", "feeOptions": ["$135 ALL NYC Risks", "$156 Up to 10,000 sq ft, outside of NYC", "…"] },
    "fees": { "inspector": "0.00", "inspectorHours": "", "client": "0.00", "clientHours": "", "preInspection": "0.00" },
    "pricingNotes": { "inspector": "125", "qc": "", "admin": "" },
    "comments": "11/1/26 12:21PM Brian Persten …",
    "priorOrderIds": [1161189]                        // "Matches:" on the order page
  },
  "forms": [ {
    "formId": 2055, "name": "Seneca General Form", "version": 20, "state": "Save",
    "qcRelevant": true,                               // false for e.g. "Seneca Inspection Protocol"
    "sections": [ {
      "sectionId": "111470", "copy": 1, "title": "Property Hazards", "omitted": false,
      "internal": false,                              // true for QC Checklist (hidden from client)
      "instructions": ["*Calls for additional data/descriptions and all \"No\" responses require a \"Comment\""],
      "fields": [ {
        "key": "F2_111470_1_10707236", "type": "choice", "number": "1",
        "label": "Risk secured from unauthorized access …?", "help": "",
        "options": ["Yes", "No", "N/A"], "value": "Yes", "required": false,   // sent only when true (EZ div#reqsize<key>)
        "comment": { "key": "F1_111470_1_10707159", "value": "" },
        "rec": { "key": "F13_111470_1_11384147", "trigger": ["No"], "text": "" }
      } ],
      "grid": null                                    // F16 tables as rows×cols when present
    } ]
  } ],
  "recommendations": [ {
    "key": "F13_1056_1_11384160", "source": "question|freeform", "questionKey": "F2_…",
    "number": "2026-001", "text": "…", "imageOptionValue": "18441033t.jpg",
    "imageOptions": ["18441067t.jpg", "…"]            // exact option values in the picker
  } ],
  "photos": [ {
    "imageId": "18441033", "caption": "Interior - extension cord chaining",
    "order": 19, "markedHazard": true, "sha256": "…"
  } ],
  "diagram": { "present": true, "imageId": "…" },
  "priorReports": [ { "orderId": 1151477, "date": "7/21/26", "forms": [ … ] } ]   // sent by the extension (latest match only);
                                                    // the server replaces forms with facts { sqft, iso, sprinkler, how }
  "priorReports (old example)": [ { "orderId": 1161189, "date": "2025-09-21", "sqft": 6800, "iso": "2", "sprinklered": "partial", "units": 4 } ]
}
```

## 4. Endpoints

### 4.1 Ingest

| Method & path | Purpose |
|---|---|
| `PUT /v1/orders/{orderId}/snapshot` | Upload/replace the `OrderSnapshot`. Response `{ snapshotId, contentHash, photosNeeded: [imageId…] }` |
| `POST /v1/orders/{orderId}/photos` | Multipart: part `meta` (JSON array `{imageId, caption, order, markedHazard, sha256}`) + repeated `files` (`<imageId>.jpg`). Only `photosNeeded`. **On receipt, pre-compute per photo:** description, scene type (roof/basement/electrical panel/sidewalk/kitchen…), hazard candidates + severity, visible text (tag dates, panel brand), suggested caption, coverage relevance (GL/property). Response `{ stored, rejected }` |
| `GET /v1/orders/{orderId}/photos/{imageId}/insight` | The pre-computed per-photo data (for the photo modal) |

### 4.2 Analysis

| Method & path | Purpose |
|---|---|
| `POST /v1/orders/{orderId}/analyses` | Body `{ snapshotId, modules?: [...], autonomy?: 0-2 }` → `202 { analysisId }`. Default = all modules |
| `GET /v1/analyses/{analysisId}` | Full `AnalysisResult` (partial while running, `status` per module) |
| `GET /v1/analyses/{analysisId}/events` | **SSE** stream: `module.started`, `module.completed {module, result}`, `analysis.completed`, `error` |
| `POST /v1/orders/{orderId}/analyses/{analysisId}/rerun` | Body `{ snapshotId (new), modules: ["narrative","checks"] }`. Re-run after the reviewer has applied changes |
| ~~`POST /v1/orders/{orderId}/final-check`~~ (removed 2026-11-10) | Body: fresh snapshot. **Rules-only pre-flight, ≤5 s.** Blocking issues before "Reviewed": stale values (e.g. old SF left in a comment), required fields blank, "No" answers without comment, recs without photos, unanswered U/W concerns, rating vs recs, omitted-section conflicts. Response `{ ready: bool, blockers[], warnings[] }` |

**Batch / queue** (pre-compute the Pending Review queue):

| Method & path | Purpose |
|---|---|
| `POST /v1/batches` | `{ orderIds:[…] }`. The extension still uploads each snapshot. The batch tracks progress |
| `GET /v1/orders/status?ids=1,2,3` | Per order: `{ analyzed, analysisId, blockers, warnings, hazardsMissed, updatedAt }` for the orders-list badges |

### 4.3 Learning & analytics

| Method & path | Purpose |
|---|---|
| `POST /v1/feedback` | Per item decision (see §6). Re-read final values from the page. Accepts unknown fields |
| `POST /v1/orders/{orderId}/qc-outcome` | When QC finishes: final §6 issue flags, §7 rating, §8 note, inspector, time spent, counts of AI items accepted/rejected |
| `GET /v1/analytics/inspectors/{inspector}` | Scorecard: reports QC'd, avg rating, % with SF/ISO/missed-hazard/narrative issues, top missed hazard types, trend |
| `GET /v1/analytics/summary?from&to&client` | AI acceptance rate per module, time saved, most-missed hazards, top failing rules |

### 4.4 Rules & knowledge (TIS-editable)

| Method & path | Purpose |
|---|---|
| `GET /v1/rules/tree` | Clients → forms → rule documents (universal, form, client, client×form) |
| `GET/PUT /v1/rules/{scope}/{id}` | Markdown guidance + structured rules (§5). `PUT` creates a new version with author + change note |
| `GET /v1/rules/changelog` | Version history, diff per change |
| `POST /v1/rules/{scope}/{id}/test` | Dry-run a draft rule against sample/recent orders → shows which orders it would flag (safety before publishing) |
| `POST /v1/rules/publish` | Publish drafts → new `rulesVersion` (results record which version they used) |
| `GET/POST /v1/hazard-library` | TIS's labelled hazard photos (few hundred now, thousands later): `{image, hazardType, severity, recText, clients[]}` for retrieval/few-shot |
| `GET /v1/form-registry` | Known EZ forms: name → type (general / property-only / supplement / recommendations / protocol-not-QC'd), QC-checklist section id, key-question map (e.g. which field is "year built", "# units", "brick veneer", "access to all areas"), so the rule engine works across 12+ form variants |
| `GET /v1/config` | Feature flags, auto-apply thresholds per module, kill switch, minimum extension version |

Seed the store from `Documentation/TIS_QC_Synchronized_Master.json`, the hazard and
ISO guides, and TIS's coming per-client/per-form "brain dump". Ship a small web admin
UI (rules editor, changelog, test runner, hazard library, analytics). This is what
lets TIS add "Client A: also look for Challenger panels" themselves.

## 5. Modules (`AnalysisResult.modules.*`)

Common item shape:
```jsonc
{ "id": "chk_sf_per_unit", "module": "checks", "severity": "blocker|warning|advisory|info",
  "status": "pass|fail|needs_review|not_applicable",
  "title": "Area per apartment looks high", "message": "(6,915 − 500) × 0.9 ÷ 4 = 1,443 sf/unit (expected 600–1,200).",
  "evidence": { "fields": ["F1_111465_…"], "photos": [], "text": [] },
  "proposedWrites": [ { "key": "F2_…", "value": "N/A", "kind": "choice|text|rec|recImage|caption|checklist|omitSection" } ],
  "confidence": 0.93, "reasoning": "…", "ruleRef": "general_form.sqft.per_unit@v3", "checklistItem": "1.3" }
```

| Module | What it does | Engine | Writes |
|---|---|---|---|
| `orderBrief` | Plain summary of the order form: coverage chips, request type, location, expected area, client-specific watch-outs from rules, prior-report facts | rules + LLM summary | none |
| `uwConcerns` | Split Additional Instructions into individual concerns. For each: `addressed: yes/partial/no`, where (field key or narrative sentence), contradiction with photos/answers, **draft answer** for the U/W response box (numbered list style TIS uses) | LLM | `F7` U/W response |
| `checks` | Deterministic cross-field rules: SF consistency (narrative/diagram/form/order/prior), **SF per unit** `(total − commercial)×0.9÷units ∉ [600,1200]`, vacancy↔vacant SF↔utilities (both directions), **veneer Yes→backing≠N/A, No→backing=N/A**, ISO consistency, access=Yes→roof & basement photos / =No→explanation + roof Qs U/D, aluminum wiring by year+use (1965–1975 apartments), Zinsco/Stab-Lok vs photo findings, sprinkler % vs photo locations + tag, "No" answers need comment, required fields, omitted sections vs coverage (pool, prof./auto liability), form type vs coverage (Property-Only form on a GL order), photos required unless telephone survey, diagram per order form, rating vs recs, state rules (water-heater straps) | rule engine (+ photo insights as facts) | choice/text fixes, omit flags |
| `photoReview` | Per photo: hazards found, severity **required / advisory**, client sensitivity applied (e.g. Seneca: every sidewalk crack), already covered by a rec?, **missed hazards** list. Inspector-marked hazard photos without a rec. GL-only photos on property-only orders (suggest removal). Guardrail: only hazards in the TIS hazard taxonomy above the client threshold become items; the rest stay `info` | vision + hazard library | new recs (via `recommendations`) |
| `recommendations` | (a) **Missing**: flagged answers with empty rec box, missed photo hazards, marked-hazard photos. (b) **Quality**: starts with "Recommend", no action verb, bare hazard text, spelling, missing location (MSI). (c) **Duplicates** (hand + auto). (d) **Applicability**: emergency lighting only if ≥4 stories or >12 units; panic hardware by occupancy/load, not presence; GL recs on property-only. Each item: text, target key (existing F13/F14 or "new"), suggested photo, `required/advisory`. Order follows the form's rec numbering | LLM + rules | `F13`/`F14` text, delete/merge proposals |
| `recPhotos` | Best photo per rec (prefer `markedHazard`), alternatives, or `noPhotoNeeded` (absent item). **Runs after `recommendations`** (TIS: "recs first, then photos") | vision | `RECIMAGEID_*` |
| `questions` | Choice-question verification/fill vs photos, narrative, other answers. `match/differ/fill` (no comment text: the reviewer writes comments, 2026-11-05). Never invents interview facts (e.g. "resident super?"): only flags contradictions. U/D allowed where not accessed | LLM + rules | `F2/F4` + `F1` comment |
| `captions` | **Image renaming**: replace generic or odd names (`IMG_3673`, `130 east 72nd st-IMG_3699 basement clutter`, typos) with TIS-style captions (`Basement – accumulated storage`, `Front`, `Sprinkler control valve – chained`). Keep good captions unchanged. Mark hazard photos | vision | caption writes (see `PLATFORM_ANALYSIS.md` open item: Images page DOM) |
| `narrative` | **Runs last, on the latest snapshot.** One call (2026-11-06): (a) answers TIS's building question set (`rules/narrative-questions.json`; GL block only with GL, hazardous-tenant blocks when present) → facts the narrative leaves out / not in the report; (b) ordered coverages that must be addressed in writing (GLOBAL-001, `rules/coverage-rules.json`); (c) contradictions (form wins), missing required content, stale values; (d) **draft** in TIS style from the 2 closest of TIS's 50 example narratives, unknown core facts as `[[confirm: …]]`. Draft = item `kind: draft`, `status: needs_review` (outside the score), `before`/`after`, write to the F7 narrative | LLM | `F7` narrative |
| `qcChecklist` | Proposed §1–§5 ticks (each tied to the module items that justify it), §6 inspector-issue flags, **§7 rating of the report as received**, §8 note draft | derived | checklist writes |
| `pricing` | TIS Client and Inspector Pricing Guide V.10 (`rules/pricing.json`, `lib/fees.mjs`): expected inspector pay (minimums, noted amounts, travel, hours × $35), client fee per client table / Seneca tiers, matching Order Fee Type option, vs what EZ has. Summary `{ inspector, client, feeType, schedule }` | rules | none (suggestions; QC enters fees) |
| `priorReport` | Diff vs prior report(s): SF, ISO, sprinkler, units, year built. Is the difference explained in the report? | rules + LLM | none |
| `footprint` *(phase 2)* | Geocode + building-footprint area (e.g. open building-footprint datasets / satellite) × stories vs reported SF. The Google Earth step QC does by hand | external data | none |

### 5.1 Structured rule format (for the rule engine; editable by TIS)

```yaml
id: general_form.veneer_backing
scope: { forms: ["General Form", "Seneca General Form", "General Form- Property Only"], clients: ["*"] }
when:  { field: "@brick_veneer", equals: "Yes" }
then:  { field: "@veneer_backing", not_in: ["N/A", ""] }
severity: blocker
message: "Brick veneer is Yes but the backing material is N/A."
checklistItem: "2.2"
```
`@brick_veneer` resolves through the form registry's key-question map, so one rule
covers every form variant. Rules that need judgement are written as markdown
guidance and go to the LLM modules instead.

## 6. Feedback item

```jsonc
{ "analysisId": "…", "orderId": 1164320, "trigger": "manual|on_finish|auto_close",
  "items": [ { "itemId": "chk_sf_per_unit", "module": "checks",
               "decision": "accepted|rejected|edited|auto_applied|auto_reverted|ignored",
               "proposedValue": "…", "finalValue": "…",        // re-read from the page
               "reason": "not_a_hazard|wrong_photo|client_does_not_care|other", "note": "" } ] }
```
Rejections with a reason are the main signal for tuning guardrails and per-client
sensitivity.

## 6a. Reference implementation

`backend/` implements every endpoint above (zero-dependency Node).
Rule engine, rules store, KB rules pack and cost estimator are real. AI modules are mock
or OpenAI behind a flag. `npm test` (`backend/test/e2e.mjs`) = 48 checks incl. 6 real EZ captures. Extra dev endpoints:
`GET /v1/orders/{id}/cost-estimate?model=…&photos=…&batch=true`,
`GET /v1/orders/{id}/cost-compare`, `GET /v1/orders/{id}/rules-pack`.

## 7. Phasing

| Phase | Scope |
|---|---|
| **P0 (MVP)** | Snapshot + photos ingest, async analysis + SSE, `orderBrief`, `uwConcerns`, `checks` (top 12 rules), `photoReview`, `recommendations`, `recPhotos`, `final-check`, feedback, config |
| **P1** | `questions`, `captions`, `narrative`, `qcChecklist`, `qc-outcome`, rules store + admin UI + test runner, hazard library, form registry for the ~12 active forms |
| **P2** | Batch queue, inspector analytics, `pricing`, `priorReport`, `footprint` |

## 8. Acceptance tests (Boost AI sandbox orders)

| Test | Expected |
|---|---|
| 1166310 / 1166311 / 1166312 | `recPhotos` / `final-check`: recs without photos reported with keys |
| 1166312 | `checks`: Property-Only form vs Package + CGL order (blocker) |
| 1166312 (1970 apartments) | `checks`: aluminum-wiring questions must be answered |
| 1166305 (vacant) | `checks`: vacancy ↔ utilities ↔ vacant SF consistent; heat/water state evaluated |
| 1166310 | `uwConcerns`: water-damage concern found, mapped to the response box, checked against photos |
| 1166307 | `uwConcerns`: freeze-supplement instruction satisfied (supplement attached) |
| 1166305 `recPhotos` | Keeps 18441033 / 18441067 / 18441030 for its 3 recs |
| All | No rec text starts with "Recommend". Every rec starts with an action verb. No emergency-lighting rec proposed for buildings < 4 stories and ≤ 12 units |
| Walkthrough order (Seneca 1164320) when the sandbox copy exists | `photoReview` finds: sidewalk defects, basement housekeeping, missing sprinkler inspection tag, loose basement wiring. `checks` flags diagram SF ≠ form SF and SF/unit ≈ 1,443 |
