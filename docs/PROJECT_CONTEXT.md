# TIS SmartFill Extension: Project Context

> The project guide is `../../CLAUDE.md` (how to run, verify and change things). This file is the "why".
> Last updated 2026-11-05. Current status and next steps: `ROADMAP.md`. Licences and sign-in: `LICENSING.md`.

## The client

**Technical Insurance Services (TIS)** is a loss-control inspection company. Insurance
carriers and brokers (Seneca, Church Mutual, K&K, Markel, Hagerty, …: 48 active
clients) order property/liability **surveys**. Field inspectors fill in forms and
take photos on **EZSurveyForm ("EZ")**. TIS **QC reviewers** then check every
report before it goes to the client.

## The goal

A Chrome (MV3) extension that sits on EZ and makes QC **as autonomous as
possible**. The AI checks and fixes the report. The human reviewer approves.

AI requirements from TIS (`Requirement that need to done by AI.txt`):

1. **Recommendation**: write a recommendation for every flagged hazard (question
   answered with the trigger value, e.g. "No") and for hazards seen in photos;
   rewrite weak recommendations to the TIS standard (action verb, no
   "Recommend…", no duplicates, hazard location named where the client requires it).
2. **Yes or No Questions**: verify or answer the form's choice questions
   (F2/F4) against photos, narrative and other answers; fill blanks.
3. **Narrative rewriting**: rewrite or repair the narrative so it is complete
   (form's embedded instructions), consistent with the form/photos/recs, and
   correctly spelled. *(2026-11-05: TIS dropped the generated rewrite. 2026-11-06: brought back as an optional
   draft at the user's request, now built from TIS's building question set and 50 example narratives; the
   reviewer applies it or not.)*
4. **Recommendation photo addition**: attach the right photo to each
   recommendation (`RECIMAGEID` picker on the Recommendations form).
5. **Renaming of images** (added 2026-10-29): replace generic or odd photo names
   (`130 east 72nd st-IMG_3673 sidewalk`, typos) with clean TIS-style captions.

From the recorded walkthrough (`RECORDING_NOTES.md`), TIS's own value ranking:
missed hazards in photos without recs (#1, "a total win") → underwriter concerns
answered ("major pain point") → if-A-then-B logic checks → rec applicability
(emergency lighting, panic hardware) → narrative contradictions (narrative last,
never the source of truth; TIS has its own narrative tool v1) → inspector scorecard →
pricing check. TIS wants to **edit client/form rules themselves**.

Implied by the client docs (the KB is literally a *QC* knowledge base):

5. **Whole-report QC**: apply the universal + form + client rules from
   `Documentation/TIS_QC_Synchronized_Master.json` and pre-fill the form's own
   **QC Checklist** (sections 1–7 + 1–10 rating) with findings and evidence.

## Inputs we were given

| Path | What |
|---|---|
| `Documentation/TIS_QC_Synchronized_Master.json` | **Authoritative** QC rules: `global_quality_control_standards` (12 universal rules), `global_forms` (129 form definitions), `clients` (51 clients → their forms + notes), `normalization_decisions`. Schema v3. |
| `Documentation/TIS_QC_Synchronized_Knowledge_Base.md` | Same content as readable markdown (152 KB). |
| `Documentation/Hazard_reference_doc.docx` | TIS hazard guide (~60 hazard types, 202 example photos). Text in `extension/docs/reference/hazard_reference.txt`. |
| `Documentation/ISO_reference_doc.docx` | ISO construction class guide (ISO 1–6, brick veneer vs true brick, wall-depth rule). Text in `extension/docs/reference/iso_reference.txt`. |
| `Recordings/*.mp4`, `Recordings/*.cc.vtt` | Login procedure + 68-min QC walkthrough with TIS (captions added). Notes in `docs/RECORDING_NOTES.md`. |
| `Credentails for the platform.txt` | EZ credentials. **Never copy into code, docs or chat.** |
| `Extesnion for reference/NSR/` | Our previous extension ("Smart Fill" for LossControl360 / NSR). Patterns to reuse, see `ARCHITECTURE.md`. |

## Key facts

- EZ is a server-rendered CGI app with no API. **The extension's only data source is the
  DOM** (+ same-origin GETs with the user's session). See `PLATFORM_ANALYSIS.md`.
- The QC user is `Boost_QC1` (role "Quality Control"). **Boost AI** is the TIS
  test company with 6 sample orders (`SAMPLE_ORDERS.md`). It is excluded from client QC
  in the KB, so it's our sandbox.
- The General Form contains a **QC Checklist section** that mirrors the KB's
  universal rules. It is the natural output target for the AI's QC verdicts.
- Recommendations are tied to questions via `flag()` and a hidden `F13` box,
  and photos are attached via a `RECIMAGEID` select. Both are writable from a content
  script.
- Photos: `/orders/<7-digit oid split by digit>/<imageId>l<ext>` (841×630). The extension is case-sensitive
  (`.jpg` on 1166305, `.JPG` on the other sandbox orders). Captions are edited on the Images page and saved there
  with EZ's "Process Changes".
- The backend (`../../backend/`) was built in this project and implements `BACKEND_REQUIREMENTS.md`. (Originally a
  separate team was to build it; that spec is still the contract if it is handed over.)

## Decisions so far

- 2026-11-13: photos the AI didn't check are named in the panel and viewer ("35 of 38 photos were checked by the AI",
  Not checked filter); a failed load in the viewer says so with Try again instead of "not reviewed".
- 2026-11-10: no final check in the panel. Save QC outcome records every finding's decision (applied / dismissed +
  reason / undone / not acted) for later analysis.
- 2026-11-10: no backup (word-matching) check of the underwriter's instructions: only the AI checks them. Without the
  AI the panel says they were not checked.
- 2026-11-10: when the photo AI describes a problem but lists no hazard, code adds it (`backstopHazards`, starting
  with fire extinguishers), the same "code has the last word" approach as the 22-order fixes.
- 2026-11-10: the product is called **SmartFill** (was "Smart QC") everywhere the customer sees it: extension name,
  panel, viewer, dashboard, sign-in and licence messages. The backend package id stays `tis-smart-qc-backend`.
- 2026-11-08 (22-order test): code, not the model, has the last word on Yes/No changes (direction of the answer,
  evidence about the question's subject, no hedged reasons), on duplicate photo recs, and on what a merge may clear.
  The inspector pay in the pricing guide is a minimum. A prior report with a different building count is a scope
  note, not a mismatch. The narrative check reports only the facts the QC checklist compares.

- MV3 side-panel extension, same shape as NSR (service worker proxies the API,
  content scripts scrape and write, side panel for review).
- **Human-in-the-loop for persistence**: the extension writes into the page but
  never clicks Save/Submit and never changes status. "Autonomous" means it
  pre-computes everything, auto-applies high-confidence fixes into the page, and
  queues the rest for one-click review.
- Read-only on the order page. Never touch the orders-list filter.
- Upload photos once per order. Later AI calls reference photo ids.
- (2026-10-29) Backend spec v0.2 is **not bound to NSR**: one order snapshot → one
  async analysis (SSE progress) made of modules (`orderBrief, uwConcerns, checks,
  photoReview, recommendations, recPhotos, questions, captions, narrative,
  qcChecklist, pricing, priorReport`), plus `final-check` pre-flight, feedback,
  inspector analytics and a **TIS-editable rules store** (no extension release for
  rule changes). Deterministic rule engine for logic checks, LLM/vision for the rest.
- (2026-10-29) LLM: user plans OpenAI `gpt-4o`. Recommended A/B with gpt-4.1-mini/4.1 and
  gpt-5.4-mini/5.4. Reference docs go in as an order-specific rules pack + cached hazard
  taxonomy + rule-engine rules, not as one big prompt or generic RAG (`AI_DESIGN.md`).
  API keys live in `backend/.env`, never in chat or code.
- Side panel tabs follow the QC order: Brief → Checks → Photos → Recs → Questions →
  Narrative → Finish (`FRONTEND_SPEC.md`).
- (2026-10-30) Backend lives in `TIS/backend`: Neon Postgres store, OpenAI `gpt-4o` for vision and reasoning,
  per-photo insight cache, per-review cost cap with fallback to practice heuristics, prompts as editable markdown.
- (2026-10-30) **No internals in the client UI**: no model names, costs, engine/fallback labels or raw errors in the
  panel. Calm neutral theme with TIS navy as the one accent; light + dark.
- (2026-10-30) Click any finding to jump to its question/photo in EZ; Undo restores values captured at Apply time
  (works after reload); NSR-style footer and photo viewer (scroll zoom, drag).
- (2026-10-31) AI claims that an area is "not photographed" are checked against the photo review in code
  (`photoClaimRefuted`), not left to the prompt; a photo-based finding with no photo cited is never a blocker.
- (2026-10-31) The Google Earth footprint check (QC Checklist 1.4) stays manual; a helper is on the roadmap.
- (2026-11-01) Full-size viewer window for all photos and the narrative (`extension/viewer/`), read-only.
- (2026-11-01) Built from the click-saving list (`ROADMAP.md`): #14 square-footage / Google Earth helper, #13 renames
  only for bad captions / typos / wrong subjects (code rule, not just the prompt), #12 order facts pinned under the
  tabs, #6 rec photo thumbnails + picker + "Use N suggested photos", #8 section jump bar on EZ forms.
- (2026-11-05) TIS asked to remove: the review **score**, the narrative **suggested rewrite**, and the **"No answer
  needs a comment"** check with the AI's comment drafts (the client handles comments). Removed in backend, panel and
  viewer; old saved reviews are filtered by the server too (`forClient` in `server.mjs`).
- (2026-11-05) **Sold as a licensed, hosted service**: accounts per customer organisation, roles admin (us) /
  customer, access + rotating refresh tokens, licence = plan (fixed photos per month: customers are charged by photos) + seats + valid until, enforced by
  the backend; `/dashboard` with admin (tokens, cost) and customer (data only) views. `LICENSING.md`.
- (2026-11-05) **Charged by photos**: each plan has a fixed number of photos per month; a photo counts once per
  customer per month (re-runs free); a review that doesn't fit is refused. Backend restarted on the new code; admin
  (the user's email) + demo customer accounts created (passwords only in `backend/data/ACCOUNTS.txt`).
- (2026-11-05) Full review of gaps written to `ROADMAP.md` → Improvement list (A security/licensing, B billing,
  C scale, D operator). A1–A4 and A7 should be fixed before a paying customer uses it.
- (2026-11-06) **Pricing follows TIS's Client and Inspector Pricing Guide V.10** (`backend/rules/pricing.json`):
  expected inspector pay, client fee and fee type with the reason. **Suggest only**: the panel never fills the fee
  inputs or touches Set Fees. Ambiguous guide lines are flagged "assumption" in the file and in the panel.
- (2026-11-06) **Narrative = check + draft** (user's choice, reversing the 2026-11-05 "issues only"): TIS's
  building question set + global coverage rule GLOBAL-001 + a draft in the style of TIS's example narratives,
  in one AI call. The draft never invents facts (`[[confirm: …]]` for missing core facts) and is outside the score.
- (2026-11-06) **Prepare on open, AI on click** (user's request): reading the order, the snapshot and the photo upload
  start when an order is opened; the AI (the only part that costs) starts only on Run AI review. EZ is read 6 pages
  (3 until 2026-11-09) and 6 photos at a time at most.
- (2026-11-06) Before publishing: the panel has no server-address / developer-token fields and no sample-order
  demo; the backend will be hosted (the user sets the address in `common/config.js` + manifest). Customers must
  see whether photos were analysed without the hidden engine label (`summary.vision`).
- (2026-11-09) **Photos stay on the server for reviewed orders** (re-runs reuse the AI's photo results; each photo
  counts against the allowance once a month). Photos of orders opened but **never reviewed are deleted after 24 h**.
- (2026-11-11) **SmartFill is Boost's product, sold to TIS and later to other customers** (user's request): the
  extension is named SmartFill with the Boost star (no TIS logo before sign-in); after sign-in it shows the customer's
  logo. The customer and its web tool (`org.platform`) come from the account at sign-in, never from a choice on the
  sign-in card. One extension for all customers; the per-platform split waits until the second platform is decided.
- (2026-11-10) **A seat = a computer, not a person** (user's request): the customer gets one operator login for the
  dashboard and the extension; each computer signed in to the extension uses one seat, dashboard sign-ins none; when
  seats are full the extension says so and the operator signs a computer out from the dashboard (Licence & team →
  Computers signed in). Several logins per customer still work the same way. Answers the open question "whether one
  login may be used on two computers": yes, up to the seats. A computer not used for 8 hours frees its seat by itself
  (user's request; `SEAT_IDLE_HOURS`).
- (2026-11-10) Measured AI cost per order (gpt-4o): first review ≈ $0.38 (≈ $0.15 + $0.004 per photo), re-run ≈ $0.13;
  ≈ $0.0075 per photo all-in, not the earlier $0.0025 (`AI_DESIGN.md` §4b).
- (2026-11-09) **Every Run AI review is a fresh review**: the Fresh run box was removed; Run reads the order again and
  never returns the saved review, so hand edits in EZ always count. Photo results are still reused (no extra cost).
- (2026-11-01) Tests stay (they let a change be checked without touching live EZ) and live in `backend/test/`;
  one-off leftovers (old eval reports, video keyframe tool, unused icon, dead code) were deleted.

## Docs map

| File | Purpose |
|---|---|
| `../../CLAUDE.md` | Project guide: folder map, run/verify, where to change logic, hard rules |
| `PROJECT_CONTEXT.md` | This file: why, what, decisions |
| `ROADMAP.md` | Built / next / click-saving suggestions |
| `LICENSING.md` | Licence model, accounts, tokens, dashboard, go-live checklist |
| `PLATFORM_ANALYSIS.md` | EZ screens, DOM, field scheme, flags, photos, save model |
| `SAMPLE_ORDERS.md` | The 6 Boost AI orders + seeded QC issues (acceptance tests) |
| `ARCHITECTURE.md` | Extension files, messages, flows, autonomy levels, writer rules |
| `BACKEND_REQUIREMENTS.md` | API contract the backend implements |
| `FRONTEND_SPEC.md` | Side panel, on-page overlay, viewer window, orders-list badges, web admin |
| `AI_DESIGN.md` | Model choice, how reference docs reach the AI, cost per order |
| `../../backend/README.md` | The backend: config, how a review runs, files, tests |
| `../content/snapshot.js` | EZ → OrderSnapshot scraper (verified on the 6 Boost AI orders; fixtures in `backend/fixtures/`) |
| `QC_RULES_MAPPING.md` | KB rules ↔ QC checklist ↔ data the extension must send |
| `RECORDING_NOTES.md` | What the walkthrough video shows |
| `reference/*.txt` | Plain-text hazard + ISO guides |

## Open questions (ask TIS)

See `PLATFORM_ANALYSIS.md §10`. Also: can the AI auto-tick QC checklist boxes, or
only suggest (`ROADMAP.md` #4)? Who signs off on auto-save? Is the prior report for the same
location reachable (`Matches:` links)?
For the sale: photo amounts and prices per plan, seats (computers) per plan. Which renames does TIS actually want (only bad captions, or also
more descriptive ones)?
