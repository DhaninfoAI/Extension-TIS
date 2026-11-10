# Recording notes: TIS QC walkthrough (19 Oct 2026, 68 min)

Sources: `Recordings/Platform Walkthrough.mp4` + captions
`Recordings/GMT20261019-170201_Recording.cc.vtt`. The video was reviewed as 14 keyframe
contact sheets (an OpenCV keyframe script, removed 2026-11-01). The captions were condensed to text and
read in full. Speakers: Ross (TIS, runs QC, shares screen as a QC user); our team
(Kanchan, Saptarshi) asking questions.

## 1. Environment seen

- Host `http://d15.ezsurveyform.com` (today's session: `https://server-ezsm.ezsurveyform.com`)
  → match `*.ezsurveyform.com`.
- Order **1164320**, client **Seneca Insurance- NYBO**, status **Pending Review**,
  "Order 9 of 11" (QC works through the queue with **Next**). Forms: *Seneca General
  Form (v20)*, *Seneca Inspection Protocol* (instructions for the inspector, **not
  QC'd**), *Recommendations (v1)*. 46 photos, 1 diagram. 130 E 72nd St, NYC, 4
  apartments + 500 sf commercial, 6,915 sf, ISO 2, built 1910s.

## 2. The QC routine, step by step (Ross's words, condensed)

The checklist is meant to be done **in order, each step building on the last**
(recs before rec photos; narrative last).

1. **Order form first** (on the order page, bottom). Note location, occupancy, the
   client's expected area, **coverage** (often not recorded on the form itself) and
   **Additional Instructions / Special Coverages** (underwriter questions).
   > "This is a major pain point for us." The U/W questions must be answered
   > somewhere in the report. QC must "remember all this" while navigating away.
   TIS offered to copy coverage and other order fields into the form if that helps the AI.
2. **View Report** (`g=F`) = the client's view, a **snapshot**: it doesn't reflect
   edits until regenerated, and it **hides internal sections** (the QC Checklist
   is never shown to clients). → The AI must read the form pages, not just the report.
3. **QC Checklist §1 Square footage**
   - SF consistent across narrative, diagram, form (diagram often missing SF, or
     its dimensions don't add up: 20×88 ≈ 8,800 ≠ 6,915).
   - Matches **prior report** / order form. Prior inspections of the same risk
     appear as **"Matches:"** ids on the order page (hover shows risk info). If
     they differ, the client must be told why, or "they spend an hour on Google
     and get mad".
   - **SF per unit sanity check**: `(total SF − commercial SF) × 0.9 ÷ units`;
     flag outside **~600–1,200 sf/unit** (KB says 500–1,200). Internal red flag
     only, not sent to the client. "Could be a true/false."
   - **Google Earth** polygon measurement of the footprint. Ross assumes our tool
     can't do it but it's where his people should spend time. (Opportunity: building-
     footprint data or satellite imagery.)
   - Vacant SF correct (0 if no vacancy).
4. **§2 ISO class**: consistent wherever stated (narrative needn't mention ISO,
   but if it does it must match). **Brick veneer logic**: veneer = Yes → backing
   material must not be N/A. Veneer = No → backing must be N/A ("a classic").
   ISO matches photos, matches prior report.
5. **§3 Access & systems**
   - Access to all areas = Yes → there must be roof + basement photos. No → an
     explanation. Roof questions answered "Yes" without roof access is an error (should
     be No / Undetermined).
   - Vacancy ↔ "risk heated or utilities shut off" must agree **both ways**.
   - Aluminum wiring: by build year + use (1910s → N/A).
   - Zinsco / Stab-Lok: answer vs panel photos.
   - Sprinklers: % coverage vs where heads appear in photos (common error: 100%
     ticked but heads only in the basement); control valve chained/locked;
     inspection tag present (missing tag → rec for annual inspection).
6. **§4 Photos vs recs. "The hardest part" and the biggest value.**
   - Look at every photo with a trained eye for hazards **without a rec**. In the
     demo the inspector missed: sidewalk defects (client-specific: Seneca wants every
     sidewalk flaw), basement housekeeping (answer said "acceptable except basement"
     but no rec), sprinkler annual inspection (no tag), exposed/loose basement wiring.
   - > "If there's no rec addressing it and the AI flags it, that's a total win."
   - > "The worst thing is when an underwriter says 'you sent me these photos, what
     > the hell is that?'"
   - Grey areas (3 risers, handrail = advisory). Over-recommending is a real risk.
     Needs **guardrails / severity** (required vs advisory) and client-specific
     sensitivity.
   - Photos match coverage: property-only orders shouldn't carry GL photos (15 pool
     photos, exit-sign close-ups) → remove them.
   - **Recs have photos**: in the Images section each photo has a **hazard
     checkbox**. Marked photos fill a short list in the rec ImageID drop-down. An
     inspector marking a photo as hazard **without writing a rec** is a useful
     signal. Some recs need no photo (absent item, e.g. "install extinguishers").
7. **§5 Recs & narrative**
   - Recs not redundant (hand-written + auto-generated duplicates).
   - **Rec applicability logic**: panic hardware depends on building
     characteristics, not on presence. **Emergency lighting** (NFPA) only for ≥4
     stories or >12 units. Inspectors leave inapplicable recs in "more often than
     I'd like to admit".
   - **Narrative last.** Never a source of truth. Form + validated changes are.
     TIS has its own narrative-writing tool (v1, conversational, trained on good
     narratives) that they plan to integrate. For us: "just flag if it's
     contradictory". Exception: narrative facts that have no form question (e.g.
     an uncooperative manager) must be kept.
   - After fixes (e.g. corrected SF), **stale values left in comments/narrative**
     are easy to miss. Needs a final consistency sweep.
   - **U/W concerns** answered in the response box or narrative (e.g. "any e-bike
     exposure?").
8. **§6 Inspector issues + §7 rating (1–10) + §8 notes**: what the inspector got
   wrong. Feeds a per-inspector database ("80% of this inspector's reports have SF
   issues → remedial help"). That feedback loop is **not built yet**; they'd like it.
9. **Pricing** (QC does it on the order page): per-client fee drop-down, e.g.
   *$135 ALL NYC Risks · $156 ≤10,000 sf outside NYC · $197 10,001–20,000 · $234 ·
   $270 · $306 100,000 · $85 Exterior/Rec Check*. AI could flag a wrong fee
   (e.g. NYC entered as $197). "Least important", but cheap.
10. **Reviewed & Sent to Carrier** → PDF goes to the client.

Typical QC time: ~15 min per report.

## 3. Things TIS will provide / asked for

- **Image renaming** (now requirement #5): generic/odd names like
  `130 east 72nd st-IMG_3673 sidewalk`, typos. "It'd be great if stuff like that
  wasn't in there."
- Hazard reference doc (received) + ISO doc (received) + **a few hundred labelled
  hazard photos** ("thousands more" in their DB). Use them as a retrieval/few-shot set.
- **Per-client, per-form rule "brain dump"** (Seneca → Seneca General Form → …),
  produced with ChatGPT. About a dozen active forms, 90% identical.
- **Rule changes happen regularly** (new question, new section, a client starts
  wanting a rec, e.g. Challenger breaker panels for one client). TIS wants to edit
  rules themselves ("edit a markdown file"), e.g. as an order attachment or hidden
  form. Our team proposed pushing versions via the Chrome Web Store. **Better: a
  backend rules store TIS can edit, versioned, no extension release needed.**
- Sandbox: copies of sample reports (= the Boost AI orders), PDFs on request.

## 4. Implications for the build

| Insight | Where it lands |
|---|---|
| Order brief + U/W concern tracker is a top pain point | Frontend "Order brief" tab; `uwConcerns` module |
| Deterministic cross-field logic is most of the checklist | `checks` rule-engine module (explainable, cheap) |
| Missed hazards in photos = biggest value, needs guardrails | `photoReview` with severity + client sensitivity |
| Rec applicability (panic hardware, emergency lighting) | `recommendations.applicability` |
| Rec photos, hazard-marked photos | `recPhotos`; scrape hazard flags from Images page |
| Rename images | `captions` module + caption writer |
| Narrative: contradiction flags + rewrite with form as truth, keep extra facts | `narrative` module, runs last |
| Stale values after fixes | `final-check` pre-flight endpoint |
| Inspector scorecard | `qc-outcome` + analytics endpoints |
| Pricing check | `pricing` module |
| Prior report comparison | extension fetches "Matches" orders → `priorReports` |
| Rules editable by TIS | Rules API + admin UI |

## 5. "Login procedure.mp4" (10.6 min)

Not reviewed (to keep credentials out of view). The extension uses the
user's existing session.
