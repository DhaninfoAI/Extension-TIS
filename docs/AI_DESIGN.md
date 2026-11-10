# AI Design: models, reference docs, cost

How the backend should use the LLM (OpenAI by default) so results are curated,
explainable and cheap. Implemented in `backend/` (next to `extension/`) (mock by default, OpenAI behind a flag).

## 1. Principle: don't make the model guess what code can know

| Kind of work | Engine | Why |
|---|---|---|
| Cross-field logic (SF per unit, veneer ↔ backing, vacancy ↔ utilities, aluminum wiring by year, rating vs recs, form vs coverage, "No" needs comment, pricing) | **Rule engine** (`lib/rules.mjs`, rules in `rules/rules.json`) | Deterministic, free, testable, TIS can edit. LLMs "won't do the logic correctly" (Ross) |
| Looking at photos (hazards, captions, sprinklers, panels) | **Vision model**, once per photo, results cached | The only part that needs eyes |
| Judgement over text (U/W concerns answered? rec wording, applicability, narrative) | **Reasoning model** over a compact order text + photo insights | Language understanding |

The LLM never sees raw HTML. It sees a compact snapshot (`compactSnapshot()` in
`lib/cost.mjs`): answered fields only, about 8k tokens for a full General Form.

## 2. Giving the AI the reference documents (curated results)

**Don't dump everything into every prompt, and don't rely on generic vector search
for rules.** Each document gets the mechanism that suits it:

| Reference | Size | How it reaches the model |
|---|---|---|
| QC KB (`TIS_QC_Synchronized_Master.json`, 200 KB) | ~50k tokens total | **Deterministic selection** per order: universal rules + rules of the attached forms + client overlay + client×form notes (`lib/kb.mjs` → `rulesPack()`, ~3–5k tokens). Exact lookup by client and form name, no retrieval guessing |
| Structured logic from the KB + TIS's per-client/per-form "brain dump" | grows | Converted to **rule-engine rules** (JSON/YAML) wherever it's if-A-then-B. Only judgement rules stay as text in the rules pack |
| Hazard guide (docx, 62 hazard types) | ~4.7k tokens | **Hazard taxonomy** (`rules/hazard_taxonomy.json`): id, name, parent, guidance. Sent as a fixed system-prompt prefix to the photo model, so it is cached and cheap after the first call. The model must answer with taxonomy ids, which keeps outputs consistent and countable |
| ISO guide | ~5k tokens | Only in the ISO check prompt (on demand), not every call |
| Hazard photos (202 in the docx + TIS's labelled hundreds/thousands) | images | **Phase 2 few-shot retrieval**: embed the photos, and for each order photo add the 2–3 most similar labelled examples to the prompt (or use them to calibrate severity). Start without it and add it if precision is low |
| TIS edits (new client ask, new form question) | small | **Rules store API** (`/v1/rules/*`): markdown + structured rules, draft → test on sample orders → publish. Next analysis uses the new `rulesVersion`. No extension release, no retraining |

Prompt rules that keep results curated:
- **Structured Outputs** (`response_format: json_schema, strict: true`) for every call.
  No free-text parsing.
- Taxonomy ids + severity enum (`required/advisory/info`) + client sensitivity from the
  rules pack. This is the guardrail against over-recommending.
- Every item must cite evidence (photo id / field key). Items without evidence are dropped.
- "Form wins over narrative" and "don't invent facts; write `[[confirm: …]]`" are
  stated in every text prompt.
- **Order of operations** = TIS's: photos → recs → rec photos → questions → narrative last.
- **Feedback loop**: every reject + reason (`not_a_hazard`, `client_does_not_care`…)
  is stored. Weekly, review the top rejections → adjust rules/taxonomy/thresholds.
  This is "training" without fine-tuning.
- Fine-tuning is **not** needed to start. Consider it only after a few thousand
  labelled decisions exist (vision fine-tuning for the hazard classifier).

## 3. Model recommendation

`gpt-4o` works, but it is OpenAI's older generation: it costs more per order and is
not the strongest at vision or reasoning today. Suggested plan:

1. **Baseline with gpt-4o** (what you planned). The adapter is ready (`MODEL_PHOTO`,
   `MODEL_REASON` env vars).
2. **A/B on the Boost AI sandbox + the Seneca walkthrough order** against TIS's own
   QC notes as ground truth. Compare:
   - `gpt-4.1-mini` photos + `gpt-4.1` reasoning: **~$0.22/order**, ~⅓ of gpt-4o;
   - `gpt-5.4-mini` everywhere: **~$0.26/order**, newer model family;
   - `gpt-5.4-mini` photos + `gpt-5.4` reasoning: **~$0.52/order**, likely best quality.
3. Pick per module on measured precision/recall, not on price alone. A missed hazard
   is what TIS pays for.
4. Avoid **gpt-4o-mini for photos**. It bills images at ~25.5k tokens each, so it
   costs about the same as gpt-4o for vision and is weaker.

The provider layer is swappable (`lib/llm.mjs`). Evaluating other vendors' vision
models (e.g. Anthropic Claude) on the same eval set is a config change, worth doing
before committing.

## 4. Cost per order (estimate, OpenAI list prices 2026-10-29)

Assumptions: General Form order, compact snapshot ≈ 8k tokens, rules pack ≈ 3.5k,
hazard taxonomy ≈ 4.7k (cached after the first call), photos 841×630 at `detail: high`
in batches of 6, six reasoning calls sharing a cached prefix, reasoning models at low
effort. From `lib/cost.mjs` (`GET /v1/orders/{id}/cost-compare`).

| Photo model / reasoning model | 46 photos | **66 photos** | 120 photos | 66 photos, Batch API |
|---|---|---|---|---|
| gpt-4o / gpt-4o | $0.49 | **$0.61** | $0.95 | $0.31 |
| gpt-4o-mini / gpt-4o-mini | $0.20 | $0.28 | $0.50 | $0.14 |
| gpt-4.1 / gpt-4.1 | $0.33 | $0.41 | $0.64 | $0.21 |
| gpt-4.1-mini / gpt-4.1 | $0.19 | $0.22 | $0.30 | $0.11 |
| gpt-5.4-mini / gpt-5.4-mini | $0.21 | $0.26 | $0.40 | $0.13 |
| gpt-5.4-mini / gpt-5.4 | $0.45 | $0.52 | $0.70 | $0.26 |
| gpt-5.4 / gpt-5.4 | $0.70 | $0.86 | $1.32 | $0.43 |
| gpt-5.5 / gpt-5.5 | $1.39 | $1.73 | $2.65 | $0.86 |

- With gpt-4o, **~55% of the cost is photos** (765 tokens per photo + hazard prompt).
  Levers: `detail: low` for obviously irrelevant photos (85 tokens), caching the
  taxonomy prefix, analysing each photo once per order and reusing it across modules.
- **Batch API = −50%**. Fits the "pre-analyse the Pending Review queue overnight" mode,
  not interactive use.
- Re-runs after edits are cheap: only text modules re-run (measured $0.07–0.17, about $0.13, with gpt-4o; see
  4b). Photos are re-analysed only when we raise `PHOTO_PROMPT_V` (or change the photo model).
- At 1,000 orders/month: gpt-4o ≈ **$610**, gpt-4.1-mini/4.1 ≈ $220, batch halves those.
- **Checked against the 6 real Boost AI captures** (2026-10-29): compact snapshots are
  6.6k–10.9k tokens (the 8k assumption holds). Estimated gpt-4o cost per real order is
  **$0.44–0.67**, and gpt-4.1-mini + gpt-4.1 is $0.18–0.24 (`SAMPLE_ORDERS.md`).
- These are **estimates (±50%)**. Real numbers come from running the OpenAI engine:
  every analysis records `usage` (tokens + $), visible in `GET /v1/analyses/{id}` and
  `GET /v1/analytics/summary`.

## 4a. Measured on real orders (gpt-4o / gpt-4o, 2026-10-30)

Three evaluation runs on the 6 Boost AI orders (reports deleted 2026-11-01 as stale; re-run `npm run eval`). Only 1166305 had
its photos uploaded; the other five were reviewed from form text + captions.

| | Run 1 | Run 2 (prompt fixes) | Run 3 (final) |
|---|---|---|---|
| Total for 6 orders | $0.963 | $0.865 | $0.633 (photo results cached) |
| 1166305 with 38 photos (vision) | $0.264 | $0.252 | $0.096 |
| Text-only orders | $0.09–0.18 | $0.08–0.15 | $0.07–0.14 |
| Time per order | 11–30 s | 10–42 s | 10–20 s |

- Vision costs ≈ $0.004–0.005 per photo with gpt-4o (38 photos ≈ $0.16), paid once per order and then cached.
  Projected full order with 66 photos ≈ $0.40, below the $0.61 estimate.
- Final-run precision (manual review of 31 blockers): ~20 real, ~4 duplicates (rule + AI flag the same
  gap), ~7 wrong. The weakest step is narrative "contradictions" (about half wrong with gpt-4o). Strongest: missing
  recommendations for flagged answers, logic checks, rec-photo matching, rec duplicates, narrative rewrite text.
- (2026-11-06) Photo source: the batch photo prompt also asks where each photo came from (no extra call); photos it
  or the free checks pick out get one focused single-photo call each (`photo_source_check`, usually 0–2 per order).
  PHOTO_PROMPT_V 3 re-analyses each photo once (~$0.004 per photo with gpt-4o).
- (2026-11-10) Fire extinguishers + consistency: the photo prompt names extinguisher problems explicitly and says a
  problem in the description must also be in hazards. PHOTO_PROMPT_V 4 re-analyses each photo once more (~$0.004
  per photo; about $0.15 for a 38-photo order). `backstopHazards` adds the hazard in code when the description says
  it and the AI did not list it.
- (2026-11-06) The narrative call now also answers TIS's question set, checks ordered coverages and writes a draft
  with 2 example narratives in the prompt: about +1.5k input and +1.5–2.5k output tokens (≈ +$0.02–0.03 per
  order with gpt-4o). Still one call. Not yet measured on a real run.
- Fixes applied between runs: coverage of photo hazards decided by the recommendations step (not word
  matching); contradictions must quote both sides plus `meaningDiffers`; no photo claims without vision;
  stricter rename rule; capped score bands; "No without comment" made advisory (both the score and the comment
  check were removed on 2026-11-05 at TIS's request, as was the narrative rewrite).
- Pricing basis: customers pay per photo. **Corrected 2026-11-10**: the earlier figure ($0.0025 per photo, from
  1166305's $0.096) came from a re-run with cached photo results and was about 3× too low. A first review costs
  **≈ $0.0075 per photo all-in** (vision + text steps); see 4b.
- Next quality levers: stronger model for narrative + questions only (`gpt-4.1` / `gpt-5.4`), photos
  for all orders, TIS's own QC notes as ground truth.

## 4b. Measured cost per order from the database (gpt-4o / gpt-4o, 2026-11-10)

Every review stored in Neon up to 2026-11-10 (`usage` on each analysis). Runs that cost $0 were OpenAI failures (no
credits / wrong key on 2026-11-06 and 2026-11-10) that fell back to practice checks and are left out.

**First review (photos analysed by the AI):**

| Order | Photos | Photos cost | Text steps | Total | Per photo all-in |
|---|---|---|---|---|---|
| 1168093 | 37 | $0.179 | $0.110 | $0.289 | $0.0078 |
| 1166305 | 38 | $0.151 | $0.130 | $0.281 | $0.0074 |
| 1168082 | 40 | $0.161 | $0.130 | $0.290 | $0.0073 |
| 1168089 | 49 | $0.240 | $0.165 | $0.405 | $0.0083 |
| 1168084 | 53 | $0.221 | $0.190 | $0.411 | $0.0078 |
| 1168099 | 101 | $0.384 | $0.229 | $0.613 | $0.0061 |
| **Average** | 53 | | | **$0.38** | **$0.0075** |

- Rule of thumb: **≈ $0.15 + $0.004 × photos** per first review.
- **Re-run** (photo results reused, text steps only): $0.07–0.17, about **$0.13**, over ~35 re-runs of 8 orders.
  A re-run pays the photos again only after we raise `PHOTO_PROMPT_V` (happened on 1166305, 1166309, 1166312,
  1168099 during development); customers are not charged photos for that (`LICENSING.md` §1).
- The admin dashboard's "cost per order" divides all spend by distinct orders, so it includes every re-run
  ($0.65 on 2026-11-10 because the sandbox orders were re-run up to 21 times). Use "cost per review" or this table.
- gpt-4.1-mini (photos) + gpt-4.1 (reasoning) should cut these to about a third (§4 estimates, not yet measured).

## 5. Measuring real cost with your key

1. Copy `backend/.env.example` → `backend/.env`. Set `LLM_PROVIDER=openai` and
   `OPENAI_API_KEY=...`. **Put the key in the file, not in chat.** The file is gitignored
   and never logged.
2. Upload a real order snapshot + its photos (the extension prototype does this. The
   explorer can load fixtures).
3. Run an analysis. `usage` shows calls, input/cached/output tokens and $ per model.
   Compare with the estimate and adjust `PLAN` in `lib/cost.mjs`.

OpenAI engine status: implemented for `photoReview` (vision, batches of 6),
`uwConcerns`, and captions (from photo insights). `recommendations` uses the photo
results. `narrative` rewrite and `questions` are still mock. **Not yet run against the
live API** (no key yet).
