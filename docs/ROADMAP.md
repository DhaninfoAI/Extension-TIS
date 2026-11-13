# Roadmap: what's built, what's next, how to save the operator clicks

> Last updated 2026-11-05 (v0.4.0). The single list of open work: click-saving ideas + the improvement list (§ at the end). When something here is built, move it to "Built"
> and note it in `FRONTEND_SPEC.md` §2.8 / `ARCHITECTURE.md` §2a.

## Built (2026-11-13): Yes/No cards that misquote another answer (1168084)

- 1168084 (live order): blocker "3. Load-bearing substrate… Concrete block → N/A: Brick veneer is marked as 'No'",
  while question 2 said "Yes (close-up photos required)" (the snapshot had it right; the AI misread it).
- `misquotesAnswer`: a card whose reason says "<subject> is marked/answered/set as '<value>'" is dropped when the
  questions about that subject (every word of it in the question) hold a different value. Subjects no question
  matches are not judged. On the local test data it drops only this card (1 of 32 stored answer cards).
- Tests: `qc-fixes.mjs` (37).

## Built (2026-11-13): Yes/No changes must be backed by the photo result (1166312)

- 1166312: blocker "21. Housekeeping satisfactory…? Yes → No: Photo 18441419 shows a dumpster area with accumulated
  refuse". The photo review had seen "A dumpster area with a blue dumpster enclosed by a brick wall", no hazards; the
  Yes/No step reads only those results (not the image) and added "accumulated refuse" itself.
- `photoBacksClaim`: a photo-based "problem" is kept only when the question's subject words (`SUBJECTS`) appear in
  what the photo review saw on the cited photos (description + hazards). Also drops, on the local test data:
  1166305 extension cord as "clutter" (housekeeping), 1166310 graffiti as "not secured". Kept: Stab-Lok panels,
  clutter in an electrical room, roof ponding. New subject: vacant-building window/door openings.
- Tests: `qc-fixes.mjs` (33).

## Built (2026-11-13): photo viewer browses the card's own photos

- Clicking a card's photo (Checks, Recs, Answers, Photos findings…) opened the on-page viewer with all the order's
  photos, so → went to the order's next photo, not the card's. `showPhoto(id, set)` now gets the card's evidence
  photos (`data-set` on the thumbnails; "Show photo ›" uses the finding's photos), and the Photos tab sends its
  current filter (Hazards / Rename / All / Not checked). Without a set, the whole order as before. Harness: the
  1166312 Stab-Lok card sends its 3 photos at index 2 of 3; Photos tab Hazards 1, All 52.

## Built (2026-11-13): documents on the Images page are not photos (1168098)

- 1168098 showed 62 of 63 photos checked by the AI. Number 63 (18489512, "SOV-Promised Land Holdings_7-15-26") is
  an Excel Statement of Values attached to the order, not a picture: EZ has no image file for it, so the download
  failed and the AI never saw it. `snapshot.js` `images()` now leaves out items whose link opens a document (EZ's
  attachment types). Checked on the live page: 63 caption boxes, 1 document, 62 photos. Takes effect on the next
  read of an order (Run AI review); EZ facts in `PLATFORM_ANALYSIS.md` §6.1.

## Built (2026-11-13): orders with two narrative boxes, and quotes from another box (1169277)

- 1169277 has two narrative boxes: General Form (empty) and Seneca General Form (2,832 characters). The review used
  the filled one, but the viewer showed "The narrative is empty": it looked for a rewrite card (gone since
  2026-11-05) and otherwise took the first box. Viewer `narrativeField` now uses the draft's box, else the first
  narrative with text (as the server does); the panel's square footage helper reads the same box.
- Its only narrative card, blocker "Narrative contradicts the form: sprinkler system", quoted "There is no sprinkler
  system at this address." That sentence is in the Special Underwriter Concerns Response, not the narrative (which
  says the building is sprinklered). `quoteIn`: a narrative card's quote must be in the narrative. Drops only this
  card among the 37 stored narrative cards with a quote. Tests: `narrative-links.mjs` (25), `test:ai` (29; the fake
  now quotes the narrative it is given).
- Open: that U/W response sentence does contradict the form ("Yes, 100% sprinklered"), and the underwriter step
  marked "Confirm there's a sprinkler system" as Answered.

## Built (2026-11-13): prior report with nothing to compare (1168085)

- 1168085 and its prior 1165501 are both recommendation checks: no square footage, ISO class or sprinklers on
  either, so the table showed only "–" and "Not compared". When every row is empty on both sides, `priorBox` now
  shows one line instead ("Neither report records square footage, ISO class or sprinklers, so there is nothing to
  compare."), plus "A recommendation check doesn't include them." on a rec-check order. Harness: 1168085 (light +
  dark); 1166305 keeps its table.

## Built (2026-11-13): "No prior report" on Overview

- An order without an earlier survey ended Overview after Pricing with nothing, which looked like a missing step.
  Now: "Prior report · No prior report for this order, so there is nothing to compare." (`priorBox`, panel only;
  shown when the prior-report step ran and found none). Checked in the harness on 1166307 (light + dark); 1166305
  still shows its comparison table.

## Built (2026-11-13): duplicate-recommendation cards removed (1166310)

- 1166310 offered "Duplicate recommendations" merging the electrician rec with the fire-extinguisher tag rec (Apply
  would have cleared the extinguisher rec). The user asked to remove the duplicate logic altogether:
  - AI: no "merge" action (schema, `prompts/recommendations.md`: "never combine two existing recommendations"),
    and the code ignores any merge the model still returns.
  - Rule `recs.duplicates` ("… look like the same recommendation") deleted from `rules.json` and `rules.mjs`, and
    retired from the live store at start-up (`server.mjs`, like `general.no_answer_needs_comment`).
  - Kept: `recSame`, so the AI still doesn't offer a new rec that an existing one already says.
- Tests: `rec-checks.mjs` (6), `test:ai` (28: a merge from the fake is ignored).

## Built (2026-11-13): property-only order with the General Form (1166307)

- "Form type does not match coverage… Order is Monoline Property but the full General Form (with GL sections) is
  attached" showed on 1166307, whose five liability sections were all omitted (the normal way to do a property-only
  survey on the General Form). `order.form_vs_coverage` now warns only about liability sections of the General Form
  still open, by name ("…not omitted: Liability Hazards, Products Liability. Omit them."). Public Protection and
  Exposures ("omit on Liability Only") are not liability sections. A filled-in Liability Hazards / Professional / Auto
  section is left to `order.omit_sections_vs_coverage`, which has the Apply that omits it.
- Tests: `qc-fixes.mjs` (27), `e2e.mjs` (1166307: no warning). The live 1166307 snapshot gives no card.

## Built (2026-11-13): narrative cards follow the draft's rules (1166305)

- Decided with the user: TIS's question set + example narratives (the draft's rules) are the standard; the checks
  follow them. Before, the AI also raised free-form "Missing from the narrative: X" cards that the draft itself never
  fixed (1166305: coverage type "Package", "no tenants", "no handrails", "no emergency lighting").
- Draft (`prompts/narrative.md` §4): covers every question of the set the report answers, in the examples' order and
  wording; never writes "not applicable"/"N/A" to tick a question off; the coverage question only decides whether
  the liability topics belong (TIS's 50 examples never state the policy type).
- Checks: the AI's issues are errors only (contradiction, stale value, spelling, grammar, style); `missing_required`
  is gone from the schema and filtered in code. Missing content comes only from the question set ("Narrative leaves
  out N facts", "Not in the report"); a "no" to hazardous tenants is not a left-out fact.
- A later run on 1166305 raised a blocker "Narrative contradicts the form: ownership duration" for "approximately
  nine years" vs Form "9 years" (fix: "six years", in neither). `restatesForm` drops a contradiction when the
  narrative quote states every number of the form value (number words read as digits: nine = 9, twenty-five = 25,
  14,450 = 14450). Values without numbers (Yes/No) are left to the other checks. Tests: `narrative-links.mjs` (23).
- Real run on 1166305 (local test server, $0.11): no narrative cards, 33 of 33 answered, draft without "not
  applicable" or the policy type. Tests: `test:ai` (28).

## Built (2026-11-13): narrative links and a follow-up question (1166305)

- "Missing from the narrative: coverage" had "Go to question" on **Date of Survey**: the AI names a form field for each
  narrative issue and that key was used unchecked. `issueField` keeps it only when the question shares a word (or word
  stem) with the issue's topic, or holds the form value the issue quotes; otherwise the card has no link. It does not
  search for another field ("coverage" also appears in a sprinkler question).
- "Not in the report: Describe the nature of any hazardous commercial operations…" on a 100% vacant building: q15 is a
  follow-up to q14 ("Are there any hazardous commercial tenants?"). `notAsked` drops q15 when the report answers q14
  with no / none / N/A / vacant, and it no longer counts in "N of M answered". "N/A" answers are left out of "Not in
  the report" too.
- Tests: `backend/test/narrative-links.mjs` (17). Takes effect on the next Run after the backend is deployed.

## Built (2026-11-13): photos the AI didn't check are shown

- A photo can end up without an AI result: its file couldn't be read from EZ or was refused, the AI left it out of
  its answer, or it was added in EZ after the review. Before, the panel said nothing and the viewer showed "not
  reviewed" only when that photo was opened.
- `photoReview.summary.checked` (backend) lists the photos the AI has a result for. Panel Photos tab: "35 of 38 photos
  were checked by the AI. Press Run AI review to check the other 3…" and a **Not checked N** filter. Viewer: the same
  note, a **Not checked by AI** filter, and "The AI has not checked this photo yet…" in the notes column. Reviews made
  before this show nothing new (they have no `checked`).
- Viewer: a failed request for what the AI saw (network, sign-in) showed "This photo was not reviewed by the AI." It
  now says "Couldn't load what the AI saw for this photo." with **Try again**, and the failure is not remembered.
- Test: `backend/test/ai.mjs` (27). Checked in the harness with the fake AI and 3 of 38 photos left out, light + dark.

## Built (2026-11-11): reset a customer's photos used this month

- Admins: Customers & licences → Edit → **Reset photos used to 0** (click twice). The month's count starts again from
  that moment (`licence.usageResetAt`, kept across licence edits); the Edit form shows "counted since …". Tests:
  `backend/test/org-brand.mjs`.

## Built (2026-11-11): photo allowance shown before Run

- The plan's photos per month were enforced only when Run was pressed, and a refusal showed as one small line in the
  progress list, easy to miss. Now the panel checks, once the order is ready, whether its new photos fit in what is
  left (`GET /v1/orders/{id}/photo-allowance`) and shows a red **"Not enough photos left this month"** notice under
  Run AI review with the numbers, the reset date and what to do; a refused Run shows the same notice. The meter
  refreshes after every Run. Already reviewed orders can still be re-run (their photos are free).
- `LICENSING.md` → photo allowance. Tests in `backend/test/auth.mjs` (40).

## Built (2026-11-11): version 1.0.0, Web Store package

- Extension version **1.0.0** for the first Chrome Web Store release. `tools/pack.ps1` builds
  `SmartFill-<version>.zip` on the Desktop: manifest at the root, forward-slash paths, only the files the extension
  uses (no docs/notes/tools), without the `localhost:4010` permission. Unused TIS logo files removed from the extension
  (the backend keeps its own copy for the TIS organisation's logo).

## Built (2026-11-11): photo shapes in words, dashboard link in Settings

- The "photo may not be from the site" card said "(1.11:1 vs 1.33:1)". It now says it in words: "(this one is almost
  square; the others are 4:3, the usual phone-camera shape)" (`shapeWords` in `backend/lib/ai-modules.mjs`; ratio =
  long side ÷ short side). New reviews only; earlier reviews keep their text until re-run.
- Panel Settings → **Dashboard → Open the SmartFill dashboard** opens `<apiBase>/dashboard` in a new tab
  (`https://dashboard.boost-usa.com/tis/dashboard`).

## Built (2026-11-11): two false alarms on recommendations (order 1169277)

- **Blank answer ≠ needs a recommendation.** EZ's flag lists sometimes end with "|" ("Yes-verbally…|No-not
  upgraded|"), which the snapshot read as "a blank answer triggers a rec": Q27 (branch aluminum wiring), unanswered,
  became a must-fix and the AI drafted an electrician rec for it. Now a blank answer never triggers (`recTriggered` in
  `backend/lib/snapshot.mjs`, used by the rule, the AI recommendations step and the practice step; the extension's
  snapshot drops empty triggers too).
- **Duplicates compare what the recs are about**, not their wording: "Restore parking lot…" and "Restore sidewalks…
  to a smooth & even condition" are no longer flagged; "Restore parking lot…" vs "Repair the parking lot potholes…"
  still is. `recs.duplicates` now uses `recSame` (moved to `snapshot.mjs`, condition words such as restore / smooth /
  even / condition ignored).
- Duplicate cards name the recommendations by their words (or "Rec 3"), not `F13_…` field codes.
- On 1169277 the rule engine now gives 1 finding (the cinderblock-stairs wording) instead of 3. Tests:
  `backend/test/rec-checks.mjs` (6).

## Built (2026-11-11): AI rules tab in the dashboard (replaces the /rules page)

- Admins get an **AI rules** tab in the dashboard (`/dashboard#rules`; the old `/rules` address forwards there). No
  code and no JSON:
  - **Notes for the AI**: pick "All clients", one client or one form (only names from the list, so a note can't be
    saved under a name the AI never sees), write plain-English instructions, add why; last change and versions kept.
  - **Automatic checks** read as sentences ("If “Brick veneer” is “Yes”, then “Veneer backing” must not be “N/A” or
    blank."), shown as Must fix / To check / Advisory, "Built in" vs "Yours". Add or edit one with dropdowns (question,
    answer, must be / must not be, values, how it shows, what the reviewer reads), **Try on saved orders**, Remove
    (click twice). Changes wait as "not published" until **Publish** with a reason.
  - **Change log** in plain words, under the admin's email.
- `GET /v1/rules/tree` now also returns the checks in full, unpublished changes, question names and the change log.

## Built (2026-11-11): hosted at dashboard.boost-usa.com/tis

- The backend + dashboard run on Boost's server under a path prefix: dashboard
  `https://dashboard.boost-usa.com/tis/dashboard`, API base `https://dashboard.boost-usa.com/tis`, rules `/tis/rules`.
  The extension's default `apiBase` points there (`common/config.js`, `manifest.json` host permission; localhost:4010
  still allowed for local work).
- Prefix support without editing files on the server: `BASE_PATH=/tis` (cookie path; the app removes the prefix
  itself if nginx passes it on), and the dashboard and rules pages work out the prefix from their own address.
- The rules page signs in with the dashboard's sign-in (no typed token) and the rules API is **admin-only**
  (customers could previously read and change rules). Changes are logged under the admin's email.
- Hosting kit and guide: `backend/deploy/` (`DEPLOY.md` → "Hosting under a path").

## Built (2026-11-11): SmartFill (Boost) branding, customer + platform from the sign-in

- The extension is now **SmartFill** (manifest name, panel title, toolbar tooltip) with the **Boost star** icons from
  the production Boost Web Store extension (`icons/icon16/48/128.png`, `icons/brand/boost-star.png`).
- **Before sign-in**: only the star + "SmartFill" (panel, viewer, dashboard sign-in). No customer logo.
- **After sign-in**: the customer's own logo from their organisation (`org.brand`), light and dark; TIS keeps its
  logo (copied into the TIS organisation once at start-up). Admins (Boost) see the star on the dashboard.
  Code: `extension/common/brand.js` (`renderBrand`, `platformProblem`).
- **Each organisation has a platform** (`org.platform`, list in `backend/lib/platforms.mjs`; only `ez` =
  EZSurveyForm today) sent with every sign-in. A sign-in whose platform this extension version has no page code for
  gets "SmartFill can't open here yet" instead of the panel. The customer is never picked on the sign-in card: it
  comes from the account.
- Dashboard → Customers & licences: platform column, platform on New customer, and in Edit the platform, the name on
  the logo and logo uploads (light, optional dark, remove). Logos are stored as small data: URLs (PNG, JPEG, WebP,
  SVG; ≤ 110 KB).
- "TIS question set" / "TIS style" now use the customer's name.
- Tests: `backend/test/org-brand.mjs` (6).
- **Next, when the second customer or platform is decided**: move EZ's page code into `extension/platforms/ez/`
  and its prompts/rules into `backend/platforms/ez/`; make each platform's site an `optional_host_permissions`
  entry requested after sign-in (so adding a platform does not disable the extension for existing users); replace
  `http://localhost:4010` with the hosted address before the Web Store release.

## Built (2026-11-10): final check removed, QC outcome records every finding

- The Finish tab's **Run final check** is gone (panel button, `POST /v1/orders/{id}/final-check`, `FINAL_CHECK_RULES`,
  the worker's snapshot-only read). At the user's request.
- **Save QC outcome** now stores, next to the inspector feedback (6–8), every finding of the review the reviewer could
  act on with what happened to it: `applied`, `dismissed` (+ reason), `undone` (applied, then undone) or `not acted`
  (`items[]` in the outcome; info notes, passes and photo pointers left out). The Finish tab shows "N applied · N
  dismissed · N undone · N not acted on". Each apply / dismiss / undo is still also sent the moment it happens
  (`/v1/feedback`, used by the dashboard). `test/e2e.mjs` (50).

## Built (2026-11-10): photos left this month, in the panel

- Footer, next to Online: "184 photos left" (amber under 10 % left, red "No photos left"); tooltip "316 of 500 photos
  used this month. Resets Dec 1." Settings: "Photos this month 316 of 500" with a bar, "184 left · resets Dec 1 · a
  photo counts once, re-running an order is free". Read fresh from `GET /v1/auth/me` (org licence + usage) when the
  panel opens, after each review and every 5 minutes (it used to show the count from sign-in, in Settings only).

## Built (2026-11-10): no field codes in underwriter answers (1168089)

- The AI's underwriter answers carried EZ field keys and photo ids ("…as confirmed in the narrative and form
  [F4_112427_1_10704437]", "…as confirmed by photos 18488889 and 18488890"); "Insert drafted answers" would have
  written them into EZ. `prompts/uw-concerns.md` now asks for plain sentences; `plainText` (`lib/ai-modules.mjs`)
  strips keys, photo ids and "as confirmed by…" from answers, the drafted response and the messages; the keys in
  "where" still drive the "↗" links. The panel cleans older reviews too (display + insert). `test/plain-text.mjs` (6).

## Built (2026-11-10): narrative "Go to question" opened the wrong question (1168089)

- The narrative card "Narrative leaves out 1 fact: How many apartment units are there? N/A" jumped to the form's
  "16. Number of years the insured has owned the building": the AI linked TIS's question q16 to the form's "16.".
  `prompts/narrative.md` now says q-ids are not form numbers, and code checks every link (`questionField`,
  `lib/ai-modules.mjs`): the AI's field is kept only if its question shares a word with ours, else the best-matching
  field (shared words weighed against question length; never internal QC or omitted sections), else none.
- "N/A" / "none" answers no longer count as facts the narrative leaves out. `test/narrative-links.mjs` (6).
- Section names in the panel (Answers group headers, "↗ section" buttons) are shortened to the plain name: EZ's titles
  carry help text in brackets, sometimes never closed ("Property Hazards (applies to both Property & Liability Only
  coverageDUPLICATE…"), so the panel showed a dangling "(". The full name, bracket closed, is the tooltip (`secName`, `secFull`).
- Settings redesigned: header with close button; profile card (initials avatar, name, email · organisation, plan chip
  "Trial plan · until Dec 4, 2026"); PHOTOS THIS MONTH (big used number, "of 500 used", "N left", bar, reset date);
  APPEARANCE as a three-way switch with icons (System / Light / Dark); footer "SmartFill v0.4.0" + Sign out.
- Settings (gear) opens as a small panel right under the header, wherever the panel is scrolled; a click outside it
  or Esc closes it (it used to sit at the top of the page, so you had to scroll up).
- Order card: "Order 1166305" is the bold title and the address sits under it in smaller text (swapped).
- Viewer window: "Show in EZ" and "Copy caption" removed from the photo notes, "Show in EZ" removed from the narrative
  view (only "Copy text" stays). The viewer no longer touches the EZ tab at all.
- Finish tab: "Inspector feedback (QC checklist 6–8)" with "6. Issues by area", "7. Suggested rating…", "8. Note to the
  inspector (draft)" (no § sign). Final check: a must-fix item you dismissed (e.g. "Already handled") no longer blocks
  "Ready to mark Reviewed" (filtered in the panel; the server does not know about dismissals).
- No ✓ / ✗ anywhere in the panel (user request): "Ready to mark Reviewed" / "1 item to fix before Reviewed", "matches EZ",
  "Applied in EZ", "Within 5%: checklist 1.4 is fine"; QC checklist and inspector feedback rows use a small coloured dot
  (word in the tooltip); finished progress steps are a filled dot.
- Underwriter requests on Overview show a word pill (Answered / Partly / Not answered / Contradicted) instead of
  ✅ ⚠️ ❌ emoji. A card no longer shows "Open <form>" when its "↗ section" button already opens that form and
  scrolls to the question.

## Built (2026-11-10): rec wording card without the AI

- The no-AI recommendations check (`MOCK.recommendations`, rule `recs.style`) offered Apply with "[[rewrite]] Observed
  wall damage…" when dropping "Recommend" did not leave an action verb: Apply would have written that tag into EZ.
  Now Apply is offered only when the fixed rec starts with an action verb ("Recommend repair the sidewalk" → "Repair
  the sidewalk"); otherwise the card only flags the wording. `test/e2e.mjs` checks no "[[rewrite]]" is ever offered.

## Built (2026-11-10): AI out of credits + backup underwriter check (1168089)

- Found on live order 1168089: the OpenAI account had no credits left (429 "You have no credits remaining"). The panel
  called it "busy, try again in a few minutes" and every call was retried 3 times (~57 s). Now `aiFailureKind`
  (`lib/pipeline.mjs`) names no credits / quota / billing a **setup** problem ("tell your SmartFill administrator"),
  and `lib/llm.mjs` does not retry it. A real rate limit is still "busy" and retried.
- Without the AI, the underwriter check split the instructions into sentences and table rows: 36 must-fix items
  ("2,274,400 272,928", "Coverage Values By Location cont.", "Dry or Wet."). It was first cleaned up, then **removed
  at the user's request**: without the AI there are no underwriter findings; Overview shows the instructions with
  "Not checked this time because the AI part of the review didn't run…" (`summary.notChecked`).
  `test/ai-failure.mjs` (4).

## Built (2026-11-10): each photo hazard counted once

- A photo hazard that got a drafted recommendation used to show on Photos ("Hazard without a recommendation") and on
  Recs ("Missing / Suggested recommendation"), and both were counted. Now the recommendations step turns the photo item
  into a pointer (`recDrafted`, `recItemId`, status needs_review, severity info): Photos → "Hazards with a drafted
  recommendation", thumbnail + what was seen + "See in Recs ›" (opens Recs and highlights the card; shows "Applied in
  EZ" / "Dismissed" once acted on). The Recs card is the one place to act. The "missed hazards" chip still counts them.
  Viewer: the photo's hazard says "A recommendation has been drafted". `test/ai.mjs` (26).
- Photo clicks: a photo (tile, thumbnail) or a finding's "Show photo ›" opens the large viewer on every page. On the
  Images page a click on the rest of a photo finding scrolls EZ to that photo and outlines it (rename findings: the
  caption box is ready to edit), with no viewer.
- Rename cards show the rename once (old name struck through → new name); the same text was also printed as a grey line.
- Photos tab: "Open Images page ↗" removed (it is in the quick links). "View all N photos ↗" was removed too, then
  brought back at the user's request, styled like "Read the full narrative ↗" on the Narrative tab.

## Built (2026-11-10): missed extinguisher hazard (1166305)

- Found: the 5 Nov reviews of 1166305 drafted "Remove the fire extinguisher from the floor…" (photo 18441051); every
  Run since 9 Nov did not. The Street View change (PHOTO_PROMPT_V 2 → 3) made the AI look at all photos again, and
  that look described "a fire extinguisher on the floor" but returned no hazard. Saved photo results are reused, so
  the miss stuck. No code dropped it.
- Fix: `prompts/photo-review.md` now tells the AI to check every visible extinguisher (on the floor, leaning, not on
  its hook, under a sink, missing / expired tag = `fire_extinguishers`; at a door or exit route also
  `blocked_egress`) and to keep description and hazards consistent. PHOTO_PROMPT_V 3 → 4: every order's photos are
  looked at once more on its next Run (not counted again against the customer's photo plan).
- Code backstop `backstopHazards` (`lib/ai-modules.mjs`): when a photo's description says an extinguisher is on the
  floor / not mounted / has a missing or expired tag and no extinguisher or egress hazard is listed, the photo step
  adds an advisory `fire_extinguishers` hazard with a drafted recommendation. Applied on every Run, also to saved
  results, never written to the cache. `test/photo-backstop.mjs` (9). On the saved results of the sandbox orders
  (120 photos, 5 mention an extinguisher) it adds exactly one: 1166305 / 18441051.
- Not yet checked with a real AI Run (costs the re-look of the order's photos).

## Built (2026-11-10): name SmartFill, less repetition in the panel

- The product is called **SmartFill** (was Smart QC) in the extension, viewer, dashboard and backend messages.
- Panel top: the page type is shown once (page strip), the order number once (order card, under the address), the
  coverages once (facts strip under the tabs; the Package / CGL chips on the order card were removed). The routine
  explanation lines ("Fixes for this form can be applied here", "Getting the order ready… / Ready: 2 forms and 38
  photos read…") are gone; only problems still show a line.
- New **Facts** tab lists every fact read about the order; the facts strip under the tabs and the Order table on
  Overview were removed. The client company (e.g. Boost AI) is no longer shown anywhere in the panel.
- Order info was then merged into **Overview** (Must fix first → Order info → Underwriter → Pricing → Prior report). Overview: the prior report is
  a clean Prior | Now | Same / Differs table (plain words, no ✓ / ✗; the changed Now value is bold) with the square-footage change; the "Explain each change…" and "From
  TIS's pricing guide…" lines are gone.

## Built (2026-11-09): photos of unreviewed orders are cleaned up

Opening an order uploads its photos (so Run starts quickly) but never calls the AI, costs nothing and uses none of
the customer's allowance. If nobody presses Run, those photos used to stay on the server for good. The backend now
deletes an order's photo folder when the order has **no review at all** and nobody has opened it for **24 hours**
(`UNREVIEWED_PHOTO_HOURS`, `0` = never; checked at start and every hour; `lib/photo-sweep.mjs`, test
`test/photo-sweep.mjs`, 10 checks). Reviewed orders keep their photos as before. Opening such an order again later
simply uploads its photos again (about 45–60 s for 50–70 photos). On the user's machine (2026-11-09) the first sweep
would remove 1151477 (99 photos, 22 MB) and 1156001 (29 photos, 5.2 MB), both opened on 2026-11-06 and never reviewed.

## Built (2026-11-09): reading EZ about twice as fast

EZ answers 5–6 pages at once as fast as one (`PLATFORM_ANALYSIS.md` §10a), so `build()` in `content/snapshot.js`:
- asks for up to **6 pages at once** (was 3);
- starts the **forms at the same time as the order page** when it knows them from the last read (the worker keeps
  each order's form list for the session, `seen_<id>`; on the first read of a session it takes them from the
  order's last snapshot on the server); a form the order page adds is read right after;
- reads the **prior report only when the server has none** (it keeps the last one; an earlier survey doesn't change):
  that chain (the earlier order's page, then its forms) was the slowest part;
- no longer downloads forms nobody QCs (Seneca Inspection Protocol, "Client Guide …"); they stay listed.

Timed on the live sandbox (old reader vs new, same session): **1166305 26.1 s → 11.8 s, 1166307 16.3 s → 8.5 s** for
a Run; same forms, fields, recommendations, photos and required fields read. A first read of a new order with a
prior report still takes about 19–21 s. Snapshots now carry each form's `copy`.

## Built (2026-11-09): every Run is a fresh review

The **Fresh run** box is gone: **Run AI review** always reads the order from EZ again and asks for a new review
(`force`), so edits typed and saved in EZ by hand always count and a saved review is never shown in place of a new
one. Still reused: photos already uploaded, and the AI's result for each photo (not sent or counted again). Cost:
every Run is a full review (about $0.35 and 30–60 s on the 22-order test), plus a few seconds to read EZ again.
The read on opening an order stays: it gets the photos to the server early. Opening an order still shows its last
saved review. (The entries below that mention Fresh run describe how it worked before.)

## Built (2026-11-09): quick links to the order's EZ pages

A row under the page strip, pinned with it: Order · each form · Images · Report, the page open in EZ marked. Replaces
the strip's "Images ↗" button (`FRONTEND_SPEC.md` §2.8). A **Photo viewer** chip opens the full-size photo viewer as soon
as the order has been read, so the photos can be looked at before the AI review (before, "View all photos" was only
on the Photos tab, which appears after a review); the viewer says "Not reviewed yet" in that case. Checked in the
harness at 440 px, light and dark, with and without a saved review.

## Built (2026-11-09): required fields read from EZ

The scraper never recorded which fields EZ requires, so two backend features never fired: the rule-based Yes/No step's
"Required question is blank" and listing blank required fields in the order text the AI reads (`compactSnapshot`).
`parseForm()` in `content/snapshot.js` now sets `required: true` on fields EZ wraps in `div#reqsize<field name>`
(`PLATFORM_ANALYSIS.md` §5.2). Checked on the live sandbox forms of 1166305, 1166307 and 1166309 (2 required fields
each, all landing on normal fields) and against the saved snapshots. Saved fixtures predate this and carry no
`required` flag until they are captured again.

## Built (2026-11-08): fixes from the 22-order test run

A real-AI review of all 22 orders on the orders page ($7.65, about $0.35 and 42 s each) showed 10 problems and
form-coverage gaps. All fixed; regression tests in `backend/test/qc-fixes.mjs` (24) and `test/ai.mjs` (25).

1. **Yes/No suggestions pointing the wrong way** ("photos show debris" → suggests Yes to "Housekeeping satisfactory?").
   The model now says what its evidence shows (`evidenceShows`); code (`answerMeans`) knows which answer means
   "problem" for "free of / good condition / satisfactory" vs "Any…?" questions and drops contradicting suggestions.
2. **Answers changed for the wrong reason** (housekeeping because of missing bricks; BBQ because of pool signage; FPE
   from "dusty breakers may indicate"). `answerGuard` needs evidence words of the question's subject (`SUBJECTS`) and
   drops hedged reasons ("may", "typically", "likely"). Prompt `questions.md` says the same.
3. **Merge that would erase a rec** (kept rec also listed as the duplicate): only other recs are cleared; a merge with
   no other rec becomes a rewrite.
4. **Inspector pay "should be $70"** when $87.50–$192.50 was entered: the guide's $70 is a minimum; warn only below it.
   Panel: "$90 ✓ at or above the $70 minimum".
5. **Multi-building square footage** ("25,722sf - B1, 25,722sf-B2, 25,722sf-B3" read as 25,722): `sqftValue` adds the
   per-building figures (a figure marked total wins); used by pricing, the prior check and the rules.
6. **Same photo hazard drafted 2–3 times**: `recSame` (shared subject words) keeps one rec and adds the photos to it;
   a rec an existing one already says is skipped. Prompt: one recommendation per hazard.
7. **Weak recs** ("Ensure the Ansul system is inspected", "Organize the office"): dropped in code (`WEAK_REC`,
   advisory + confidence < 0.6); prompt lists TIS verbs and what is not worth adding.
8. **Double counting**: the Checks tab's "action verb" / "duplicate" warnings pass when the AI drafts that rewrite/merge.
9. **Narrative check too strict**: "leaves out N facts" and "Not in the report" count only the checklist facts
   (`CORE_Q`: use, occupancy, ISO, stories, SF, roof, hazardous tenants, units, sprinklers); issues carry a topic
   ("Missing from the narrative: roof age"), one card per topic.
10. **Prior report of another scope** (prior 15 buildings vs 1): facts now carry the building count; when it differs the
    SF row says "different scope" (advisory note) instead of "differs"; a > 2× jump says to check the scope first.
11. **Non-Seneca forms**: per-building tables (Hotel & Motel "Construction", Camp "Section IV", General Form
    "Occupancy" grid) answer SF / year built / stories / ISO (`firstQ` fallback, read-only keys `grid:…`); MSI occupancy
    % from units and vacant units; an omitted "omit if no sprinkler system" section = no sprinklers; the filled narrative
    box wins (K&K: empty General Form narrative + filled Hotel one); form registry knows CMIC, MSI, Hotel & Motel, Camp,
    REC CHECK; patterns for rental rooms, "Roof(s) free of", "Working emergency lighting", "# of buildings".
    Still priced by hand: MSI and CMIC have no square-footage question at all, and "See SOV" orders.
    Also: the Hotel & Motel "Crime" section (guest security) no longer counts as "Crime not ordered".

Re-run of 6 of those orders with the fixes ($2.05): blockers 10→2 (1166311), 13→10, 9→7, 7→6, 0→0, 7→10 (1168099: 3 of its 5
Yes/No suggestions were the "dirt path" / "fire pit near vegetation" kind, guarded since); photo recs 12→1 on 1168099, 3 grease recs → 1 on 1166311, no
self-merges. Leftovers seen there are also guarded now: off-subject notes that change nothing, "no visible veneer",
flipping the inspector's "No" to "Yes" while a recommendation addresses it, "a dirt path" as a sidewalk defect.

## Built (2026-11-08): Seneca recommendation boxes

- False "Missing recommendation" on Seneca orders (1168084: 14 of 14 were already written) fixed: the snapshot reads
  EZ's `flag()` call, recognises the shared hazard list (`rec.list`, `rec.line`, covered when the list holds the
  line) and boxes that don't exist (`rec.box: 'none'`, Seneca Property Only). Apply on a shared list adds EZ's own
  line (new write kind `recLine`, never replaces the list; Undo restores it). Writer test 35/35.

## Built (2026-11-06): prior report check (SF, ISO, sprinkler coverage)

- The snapshot reads "Matches:" with dates (`order.priorMatches`), picks the **latest** prior survey and reads its
  forms alongside the current order (same 3-requests-at-a-time limit; not on the final check). The server keeps only
  the facts (`priorReports[0].facts`, `lib/prior.mjs`) and carries them over when a snapshot comes without them.
- Facts from General Forms (total square footage / construction type / sprinkler protection questions) or from
  per-building tables (Camp Supplement Section IV "Total Sq. Ft." summed, "Construction Class"; table headings are now
  kept as `sections[].gridHeaders`). ISO compared by class (JM = Joisted Masonry = ISO 2), sprinklers as
  none / partial / full (N = None).
- Overview → "Prior report 1151477 · 7/21/26 Open ↗": "SF – Prior report = 4,712 – current = 4,440 ✗ differs", ISO,
  Sprinkler coverage; each difference is a warning (QC checklist 1.2 / 2.4 / 3.7). The old prior check in the SF rule
  was removed so nothing is reported twice.
- Not checked against a live order end to end yet (1168099's Camp Supplement has no sprinkler column: shown as "not on
  the form").

## Built (2026-11-06): photos possibly from Street View

- EZ strips camera data (EXIF) from every photo (0 of 196 stored photos have any), so the source comes from:
  1. the batch photo pass: `prompts/photo-review.md` now also returns `source` (on_site / street_view / aerial /
     screenshot / other), `sourceEvidence`, `sourceConfidence` (PHOTO_PROMPT_V 2 → 3: photos are re-analysed once);
  2. a **focused single-photo check** (`prompts/photo-source-check.md`, one small call per candidate) for every
     photo the batch calls Street View, whose caption names Street View / Google / screenshot / maps, or that is a PNG
     with an unusual shape. Its answer decides; it is told nothing about why the photo was picked;
  3. free checks: caption words, `.png` file, shape differing ≥ 0.06 from the order's usual camera shape.
- Panel: "Photo may be from Street View" (warning ≥ 0.8, else advisory) or "Check where this photo came from"
  (PNG + unusual shape) in a "Where the photos came from" section of the Photos tab, "Street View?" badge on the
  tile. Telephone / virtual surveys: a note only. Satellite / map views and other screenshots: a note only.
- Tested with the real AI on 6 Wikimedia images + 10 inspector photos (throwaway file store, ~$0.06 per run): all 3
  real Street View images flagged (2 by the AI, 1 by PNG + shape), 0 of 13 real photos flagged, the same in 2 runs.
  The batch pass alone was unreliable (missed 3 of 3 in one run, invented "Google watermark visible" for 4 photos
  in another); the AI's quoted details can be wrong ("© 2012 Google" read as 2023), so the panel says "the AI
  reports…". Small test set: confirm on real TIS orders where an inspector used Street View.

## Built (2026-11-06): "The AI part of this review didn't run" note

- Found on live order 1168087: a mistyped OpenAI key (401) made every AI step fall back to the basic checks, and the
  panel showed that as a normal review. Now each failed AI step records `aiFailed` (setup / busy / limit /
  unreachable / other, `lib/pipeline.mjs` `aiFailureKind`); the server adds `aiStatus` { ok, kind, partial,
  modules, detail } to every finished review (`aiStatusOf`, also for older reviews). Customers get the category
  only; admins also get `detail`, with key fragments and links removed.
- Panel: an amber note at the top of the results card ("The AI part of this review didn't run" / "Part of…", what
  to do, which steps); Photos tab and viewer say the AI couldn't look at the photos this time.
- A review whose AI part failed is never reused: pressing Run again (without Fresh run) tries the AI again.

## Built (2026-11-06): order prepared on open, Run only waits for the AI

- When an order is opened, the panel sends **PREPARE**: the worker reads the order from EZ, sends the snapshot and
  uploads missing photos in the background (silent since 2026-11-10; a line appears only on failure).
  **Run AI review** reuses it and only starts the AI; pressed mid-preparation it joins the read in progress (one
  read, one AI call). A preparation is kept 10 min (`chrome.storage.session`); Fresh run, Apply or Undo read again;
  the final check always reads fresh. Note: opening an order now sends its data to SmartFill even if no review is run.
- **In parallel**: the forms and the Images page are read 3 at a time (sandbox 1166307, 4 pages: 22.2 s → 8.6 s);
  photos go in 2 batches at once, so one downloads while another uploads (12 photos from EZ: 21.9 s → 8.7 s at
  6 at a time). Measured read-only on EZ on 2026-11-06; the end-to-end gain in Chrome isn't measured yet.
- Click-saving idea #3 is half done: preparation on open is built; starting the AI itself on open is not (it costs).
- Preview: `&prepdelay=ms` on the harness URL slows the fake read (the hint it used to show was removed 2026-11-10).

## Built (2026-11-06): ready-to-publish clean-up

- Settings card: the **Server address** and **Developer token** boxes (and Save) are gone; the card keeps the
  account (name, licence, Sign out) and the theme. The server address now comes only from `common/config.js`
  (set it to the hosted HTTPS server, and update `host_permissions` in `manifest.json`, before publishing).
- **Run sample** demo removed (panel row, `ANALYZE_DEMO` / `FIXTURES` messages, `analyzeFixture`). `/fixtures` stays
  on the backend for tests and the preview harness.
- Photos tab / viewer said "checked by caption only" to customers even after a vision pass (they relied on
  `engine`, which `forClient` hides). The photo step now reports `summary.vision` (true/false) and both use it.
- Console logging removed from the panel and the service worker.
- **"EZ session expired" on a logged-in EZ** fixed: the extension always fetched `aa.cgi`, but some logins use
  `ss.cgi` and get "Access Denied" from `aa.cgi`. The snapshot, Open form / Images links and the viewer now use the
  page's own script. **Run AI review** first checks SmartFill is reachable and says "SmartFill is offline" instead of
  failing at "Read the order from EZ".
- **Geologica bundled** in `extension/fonts/` (latin + latin-ext WOFF2 from Google Fonts, SIL OFL 1.1 with `OFL.txt`);
  the panel and viewer no longer call fonts.googleapis.com. The preview server now serves `/ext/fonts/`.
- Still open from the publish list: `docs/`, `CLAUDE.md`, `README.md` ship inside `extension/` (move them out +
  a clean zip script); hide "% sure"? (owner decision); footer logo (owner decision);
  backend A1, A3, A5, A7, A9.

## Built (2026-11-06): pricing guide + narrative check and draft

Not live yet: the backend on :4010 still runs the old code until it is restarted, and the extension needs ↻.

- **Pricing from TIS's "Client and Inspector Pricing Guide V.10"** (`backend/rules/pricing.json`, engine
  `backend/lib/fees.mjs`, pricing step in `modules.mjs`). Inspector pay: $70 full / $35 exterior & rec check
  minimum, a higher amount or travel fee from the comments or pricing notes, hours × $35. Client fee: each client's
  table (standard $85 / $185–$315 bands, flat fees, per-building, virtual, camps, Wildfire / Freeze / RCV add-ons,
  Marsh custom pricing → management), Seneca tiers (NYC $135, size tiers, +$50 supplements, cooking supplements,
  $50 travel). Boost AI (sandbox) is priced like Seneca. Overview → Pricing shows expected vs entered, the reason,
  and the Order Fee Type option. **Suggestions only**: QC enters the fees (Set Fees is never touched).
  Snapshot now reads the Set Fees box (inspector / client fee and hours), the three pricing notes, order comments,
  additional addresses and climatic supplements. 43 tests (`test/fees.mjs`).
- **Narrative: check + draft** (replaces "issues only" of 2026-11-05, at the user's request): one AI call answers
  TIS's building question set (`rules/narrative-questions.json`: 34 questions, GL block only with GL coverage,
  restaurant / woodworking / auto-body blocks when such a tenant is present), checks ordered coverages that must be
  addressed in writing (GLOBAL-001 of the global coverage rules, `rules/coverage-rules.json`), lists issues, and
  writes a draft in TIS's style using the 2 closest of TIS's 50 example narratives (`rules/narrative-examples.json`,
  re-import with `npm run import-narratives`). Unknown core facts appear as `[[confirm: …]]`.
  Narrative tab: draft block (Show all, Replace narrative in EZ / Undo, Copy, Don't use) + question-set summary;
  viewer: Current / Draft switch. The no-AI fallback checks the same questions and coverages by keyword.
- **Open**: Seneca "+$50 supplements" and LSR "+$42 additional buildings" are readings of ambiguous guide text
  (flagged in the panel; confirm with TIS). The coverage rules' section-omission advice (GLOBAL-002/003/004) is
  not used yet; only GLOBAL-001 feeds the narrative. Building count = 1 + additional addresses (no form question
  mapped yet). Check a real run with OpenAI (`npm run eval`) before showing TIS.

## Built (v0.4, 2026-11-05)

- **Seats per computer + sign a computer out from the dashboard (2026-11-10)**: a seat = one computer signed in to
  the extension, so one operator login can fill all of a customer's seats; dashboard sign-ins are free; the same
  computer signing in again keeps its seat. The sign-in card asks for an optional computer name; the dashboard
  (Licence & team for customers, Users for admins) lists the signed-in computers with Sign out, and the signed-out
  computer is told why. A computer not used for 8 hours frees its seat by itself (`SEAT_IDLE_HOURS`) and gets one
  back when used again if one is free. `LICENSING.md` → "How seats behave".
- **Running set-up (2026-11-05)**: the backend runs on the user's machine at `http://localhost:4010` (Neon + OpenAI),
  started in the background (log `backend/data/server.log`). Accounts: admin = the user's own email, demo customer
  `reviewer@tis.demo` in the TIS organisation; passwords only in `backend/data/ACCOUNTS.txt` (gitignored; never
  print them). TIS organisation: Trial plan (500 photos/month, 2 seats, until 2026-12-04).
- **Customers are charged by photos**: plans with a fixed photo allowance per month (Plans table in the dashboard),
  a photo counts once per customer per month, reviews that don't fit are refused (402 `IMAGE_LIMIT`).
- **Sign-in, licences and dashboard** (`LICENSING.md`): accounts per customer organisation, 15-min access tokens +
  rotating 30-day refresh tokens, plans with a fixed photo allowance per month (customers are charged by photos), seats and expiry enforced on the server, customer data separated
  by organisation, `/dashboard` with an admin view (AI tokens, cost, models, customers + licences, users) and a
  customer view (their orders, findings, inspectors, licence use; nothing technical). Extension sign-in card.
- **Removed at TIS's request**: the review score, the narrative suggested rewrite, and the "No answer needs a
  comment" check + comment drafts (TIS's reviewers handle comments).

## Built earlier (v0.3, 2026-11-01)

- Review pipeline: read the order from EZ → upload new photos → AI review (OpenAI) with live progress.
- Side panel: page status strip, review summary, 7 tabs in TIS's QC order, Apply / Undo /
  Dismiss (with reason) on every finding, undo bar, click a finding to jump to its question or photo (opens
  the right form first), "Open <form>" buttons, final check, Save QC outcome, light/dark theme, NSR footer,
  Online/Offline that re-checks every 20 s. (The demo with saved sample orders was removed 2026-11-06.)
- On the EZ page: outlines on flagged fields, green "AI" tags on applied ones, "Next issue" bar, NSR-style
  photo viewer (scroll zoom, drag, ← →), Images page: click → that one photo box, "Images ↗" opens the page.
- Full-size viewer window (`viewer/`): every photo in one grid with filters and AI notes; the narrative with
  issues highlighted.
- Backend: Neon store, per-photo AI cache, cost cap with fallback, editable prompts, `/rules` editor,
  guard that drops "no photos of X" claims when photos of X exist, tests (`backend/test/`).
- From the click-saving list (2026-11-01):
  - **#14 Square-footage / Google Earth helper** (Checks tab → Square footage): form / narrative / prior SF and
    stories side by side, expected outline = total ÷ stories, "Open in Google Earth ↗" / "Google Maps ↗" at the
    address (new tab), 3-step measuring hint, and a "Measured outline" box that answers "✓ within N%: tick 1.4"
    (≤ 15 %) or "✗ N % smaller/larger". Backend note for checklist 1.4 now gives the expected outline.
  - **#13 Fewer cosmetic renames**: `renameWorthIt()` in `backend/lib/ai-modules.mjs` keeps a rename only for a bad
    caption (camera number, address, file name, blank) or when the suggestion drops/replaces a word (typo, wrong
    subject); "Roof Closeup" → "Roof with Satellite Dish" is dropped. Test: `backend/test/renames.mjs`.
  - **#12 Order facts pinned**: a strip under the tabs on every tab (coverage, CGL, request, photos/diagram
    required, SF · stories, year built, "U/W n open" → Overview).
  - **#6 Rec photo thumbnails**: on the Recommendations form each visible photo drop-down gets the chosen photo's
    thumbnail (click = view large) and "Pick photo ▾" (grid of all photos, ⤢ to enlarge, click = choose, which
    sets the drop-down like a hand pick). Panel Recs tab: "Use N suggested photos" applies every photo-only
    suggestion whose picker is on the open page, with one Undo.
  - **#8 Section jump bar**: on EZ forms a "☰ Sections" tab on the left edge opens the list of sections
    (omitted ones greyed, current one bold, open-issue counts after "Highlight on page"); click scrolls + flashes.

## Suggestions to cut clicks (from the EZ walkthrough of 2026-11-01)

What the operator faces today on a sandbox order (1166305): order page ~3,200 px tall with the client's Order
Form (U/W instructions, coverage) at the very bottom under status/assign/fee drop-downs; General Form ~11,600 px,
3,925 inputs, 800 tick boxes, 29 sections and no way to jump between them; QC Checklist ticks at the top;
Save Form at the bottom; Images page ~11,900 px for 38 photos (116 px thumbnails, ~20,000 px for 66–72 photos)
with captions saved only by "Process Changes"; Recommendations form photo picker = a drop-down of ~40 bare image
numbers; report view ~36,000 px. In the panel every finding needs its own Apply click and every new order its
own "Run review".

Ranked by clicks saved per order. ★ = needs TIS sign-off first.

| # | Idea | Today | After | Saves / order |
|---|---|---|---|---|
| 1 | **Apply all safe fixes** per tab and per page: one button applies every open, high-confidence finding whose field is on the open form (answers, recs, rec photos), with a count preview; Undo all already exists | 1 click per finding | 1 click | ~10–25 clicks |
| 2 | **Accept all renames** on the Images page + a sticky "Now press Process Changes in EZ" reminder that scrolls to that button | 1 Apply per photo + find the button | 1 click | ~6–40 clicks + scrolling |
| 3 | **Auto-start the review** when an order opens (instant when nothing changed, cached) and **pre-analyse the queue** from the orders list (read-only, one order at a time) | open panel + Run + wait 30–60 s | results already waiting | 1–2 clicks + the wait |
| 4 | **Tick the passed QC Checklist items** ★: one click ticks every §1–§5 item whose checks passed; items with open issues stay unticked and are listed | ~31 ticks + scroll to the top | 1 click | ~25–31 clicks |
| 5 | **Fixes for another form apply on arrival**: "Open Recommendations form & apply 4" queues the writes and applies them when that form loads | open form, find cards again, Apply each | 1 click | ~3–8 clicks |
| 6 | ✅ **Rec photo thumbnails** on the Recommendations form: a thumbnail strip next to each photo drop-down, plus "Use suggested photos" for all recs | guess from ~40 image numbers | pick by picture / 1 click | ~3–10 clicks + guessing |
| 7 | **"Done → next order"** in the Finish tab: when the final check is green, move the EZ tab to the next order of the queue ("Order 1 of 6") and start its review | back to order page, Scroll To Next, open form, Run | 1 click | ~3–4 clicks |
| 8 | ✅ **Section jump bar** on the EZ form: a slim floating list of the 29 sections with issue counts; click to jump (display only, writes nothing) | scroll an 11,600 px page | 1 click | scrolling |
| 9 | **"Go to Save" button** in the undo bar: scrolls EZ to its own Save Form button (never clicks it) | scroll to the bottom | 1 click | scrolling |
| 10 | **Remember decisions across re-runs**: a dismissed finding (same field + same kind) stays dismissed after a new Run (every Run is a new review since 2026-11-09) | dismiss again with a reason | nothing | 1–2 clicks per repeat |
| 11 | **Keyboard in the panel**: J / K next / previous finding, A apply, D dismiss, U undo, Enter go to it | mouse for each card | keys | speed |
| 12 | ✅ **Order facts pinned on every tab**: coverage, request type, photos/diagram required, open U/W questions, as one compact strip | Overview tab or bottom of the order page | always visible | tab switches + scrolling |
| 13 | ✅ **Fewer pointless renames**: rename only bad captions (IMG numbers, addresses, typos, wrong subject), never "Roof Closeup" → "Roof with Satellite Dish" | 6 rename cards on 1166305, most cosmetic | ~1–2 | ~4–5 clicks |
| 14 | ✅ **Google Earth / square-footage helper** (QC Checklist 1.4): satellite link at the address + reported SF, stories and expected footprint side by side; later, footprint data from public building outlines | open Google Earth, type the address, compute | 1 click | ~3 clicks + arithmetic |

✅ = built. Suggested order for the rest: 1, 2, 3, 5, 9, 10 (no sign-off needed, biggest savings), then 7, 11,
and 4 once TIS agrees.

## Improvement list (review of 2026-11-05)

Found by reading the code and running it; each item names where it lives. Priority: **A** before a paying
customer uses it · **B** soon after · **C** before many customers · **D** operator experience.

### A. Security and licensing: fix before selling

| # | Gap today | Fix | Where |
|---|---|---|---|
| A1 | Any signed-in **customer can edit the rules**, TIS notes and hazard library, and those are global (they change every customer's reviews) | rules + notes + hazard library admin-only, or per organisation (see B6) | `server.mjs` `/v1/rules/*`, `/v1/hazard-library` |
| A2 | Customer data is keyed by **EZ order number only** (snapshots, photo folder, photo results). Two customers whose EZ systems both have order 1166305 collide: the second one gets 403 | key everything by organisation + order (`orgId:orderId`), photo folder `photos/<org>/<order>` | `server.mjs` `state.snapshots[...]`, `photoDir`, `insightKey` |
| A3 | **Developer token is on by default** (acts as admin with a known value); the API explorer, `/rules`, `/writer-test`, the `/ext/` harness and `/fixtures` are served without sign-in | default the dev token **off** unless explicitly enabled (and never when `NODE_ENV=production`); dev pages + fixtures only in development or admin-only | `server.mjs` `ALLOW_DEV_TOKEN`, `serveStatic` |
| A4 | **Seats**: done 2026-11-10 (seats count computers, the operator signs any computer out from the dashboard, a computer unused for 8 h frees its seat). Kept for reference | count a seat only if used in the last ~8 h (idle seats free themselves); 1–2 computers per account (a new sign-in ends the oldest) | `lib/auth.mjs` `activeSessions`, `seatsUsed`, `login` |
| A5 | Access tokens travel **in URLs** (`?token=` for photos and the progress stream), so they end up in logs and history | short-lived signed links per photo / stream, or fetch with the header and show blob URLs | `server.mjs` photo + events routes, `sidepanel.js` `photoUrl`, `viewer.js` |
| A6 | **No rate limiting** except the per-email login lock (in memory: lost on restart, one server only) | per-IP limits on login/refresh/API; lock kept in the store | `lib/auth.mjs`, `server.mjs` |
| A7 | The **on-page helpers work without signing in** (section jump bar, rec photo thumbnails): free features for unlicensed users | start them only after the panel confirms a signed-in, licensed user | `content/overlay.js` `initPage` |
| A8 | The extension never checks `minExtensionVersion`: an old copy keeps talking to a newer backend | on start, compare and show "Please update SmartFill" | `background.js`, `/v1/config` |
| A9 | **CORS** echoes any origin | allow-list: the extension id + the dashboard origin | `server.mjs` |
| A10 | Admins sign in with a password only; admin actions (licence, users, passwords) leave no trace | 2-factor for admins; an audit log (who changed what, when) shown in the dashboard | `lib/auth.mjs`, dashboard |
| A11 | The photo allowance is checked when a review starts; two reviews started at the same moment can both pass and go over | reserve the order's photos at start (atomic), release unused ones at the end | `server.mjs` analyses route |

### B. Licensing and billing

| # | Idea | Why |
|---|---|---|
| B1 | **Billing**: plan purchase/renewal through Stripe or Razorpay, or at least a monthly **usage export (CSV)** per customer for invoicing | today plans and dates are set by hand |
| B2 | **Alerts**: email + a banner in the extension at 80 % / 100 % of the month's photos; licence-expiry warning 14 days ahead; "seats full" notice to the admin | no surprises for the customer, upsell moment for you |
| B3 | **Photo top-up packs** (extra photos valid until month end) separate from the plan's monthly photos | sell extra photos without changing the plan |
| B4 | **Show the cost of an order before running it**: "This order will use 49 photos · 312 left this month" in the panel | the customer decides, fewer refused reviews |
| B5 | **Customer manager role**: add/disable their own reviewers within their seats, see invoices/usage, request an upgrade | less admin work for you |
| B6 | **Per-customer rules, notes and knowledge base** (today rules/TIS notes are global and the KB is TIS's) | needed for a second customer |
| B7 | Password reset by email, **invite links** instead of temporary passwords, SSO (Microsoft / Google) for larger customers | standard for B2B |
| B8 | **Monthly AI-cost guard per customer** (besides the per-review cap) + alert when cost per photo rises (model/prices change) | protects the margin |
| B9 | Month boundaries in the customer's time zone (today UTC) | the meter resets at the customer's midnight |
| B10 | **Data retention**: keep snapshots/photos N days, delete on contract end, export a customer's data on request | insurance data, contracts |

### C. Scale and operations (before many customers)

| # | Gap today | Fix |
|---|---|---|
| C1 | The store loads **everything into memory** at start-up and only one server process can run | real tables + queries (orgs, users, sessions, analyses, photo results); then 2+ servers behind a load balancer |
| C2 | Photos live on the **server's local disk** | object storage (S3 / R2 / Azure Blob) with a lifecycle rule |
| C3 | Reviews run **inside the web process**; a crash or restart loses a running review | a small job queue with retry (OpenAI errors, timeouts) |
| C4 | Hosting: https, process manager with auto-restart, Neon backups / point-in-time restore, monitoring + alerts, a staging copy | needed to sell |
| C5 | Logs are plain text | structured logs without tokens or personal data |

### D. Extension (operator experience)

| # | Idea |
|---|---|
| D1 | The rest of the click-saving list above: #1 Apply all safe fixes, #2 Accept all renames + "Process Changes" reminder, #3 auto-start + pre-analyse the queue, #5 fixes for another form applied on arrival, #7 Done → next order, #9 Go to Save, #10 remember dismissals across re-runs, #11 keyboard shortcuts, #4 QC checklist ticks (after TIS agrees) |
| D2 | Photos left this month shown in the panel before **Run AI review** (with B4) |
| D3 | The viewer window does not notice a sign-out (keeps showing photos until reopened): close it or ask to sign in |
| D4 | `sidepanel.js` is one ~830-line file: split into views, actions and sign-in modules so changes stay safe |
| D5 | Automated test of the real extension in Chrome (Playwright loading the unpacked extension against the EZ replica); today only the harness and the writer page are automated |
| D6 | Queue Apply/Dismiss feedback while offline and send it later (today it is lost) |
| D7 | "Report a problem" button that sends the review id and a note |
| D8 | Existing backlog: orders-list badges (`GET /v1/orders/status`), Images-page hazard-tick writer, auto-save only after TIS signs off (must handle EZ's `confirm()` / `onbeforeunload`) |

Suggested order: A1–A4 and A7 first (small, and they protect the licence), then A5, A6, A8, A9, A11, then B2/B4
(visible to the customer), C4 hosting, B1 billing, then D1.

Open questions for TIS: `PROJECT_CONTEXT.md` → "Open questions".
