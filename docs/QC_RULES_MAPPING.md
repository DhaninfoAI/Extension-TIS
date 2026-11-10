# QC Rules ↔ EZ data ↔ QC Checklist

How the client knowledge base (`Documentation/TIS_QC_Synchronized_Master.json`)
maps onto what the extension can scrape from EZ, and onto the QC Checklist
inside the General Form. Use it to decide **what the extension must send** and
**where the AI's answers land**.

## 1. Rule resolution (backend responsibility)

For one order:

1. `global_quality_control_standards.requirements` (12 universal rules): always.
2. For each attached form name (exact EZ name, e.g. `General Form`,
   `General Form- Property Only`, `Recommendations`, `CMIC - Freeze Protection`):
   `global_forms[<name>]`. Follow `general_requirements.inheritance` text and
   `normalization_decisions` ("same-name forms inherit"; "Client Guide*" forms are
   reference only, not QC'd).
3. Client = order page **Client Company** (e.g. `Seneca Insurance- NYBO`) →
   `clients[<name>].general_notes` + `clients[<name>].forms[<form>].client_specific_notes`
   + `inherited_client_requirements` (Church Mutual family).
4. **Embedded form instructions** scraped from the live form (tooltips, section
   titles like "omit on Property Only surveys", report-view notes) **override**
   stored rules where they conflict (universal rule "Embedded form instructions
   precedence").
5. Clients with `status: "excluded"` (Boost AI, Church Mutual Test Account,
   Millenial/DataCrest) are test accounts. For Boost AI, run with universal +
   global-form rules only so we can test.

Client-name matching must be exact-then-fuzzy. EZ truncates long names in menus
(`Arrowhead General Insurance Agency, ...`), but the order page shows the full name.

## 2. Universal rules → data needed → checklist target

| KB universal rule | Data the extension sends | QC checklist item (General Form §111460) |
|---|---|---|
| Internal consistency / cross-form consistency | All forms (Q, answer, comment), narrative, recs, captions, photos | §5 "Narrative matches the rest of the report"; §6 "Narrative issues" |
| Obvious errors; spelling and grammar | All text fields | §6 "Narrative issues" + per-field findings |
| Required questions answered | Every question + answer + omitted-section flags; required marks (`requiredcheck`) | (findings list) |
| Photographs required unless Telephone survey | Order form *Request is*, *Photos required*; photo count | §4 |
| Diagram per order form | Order form *Diagram required*; diagram count | §1 "SF consistent – narrative, diagram, form" |
| Residential occupancy definitions (≥3 units = apartment) | Occupancy answers, unit counts | — (used by other rules) |
| Narrative coverage vs consistency | Narrative + facts | §5 |
| Proactive photographic hazard detection | **All photos (`l.jpg`) + captions** + existing recs | §4 "Photos free of hazards without recs"; §6 "Missed hazards in photos" |
| Embedded form instructions precedence | Tooltip text, section titles | — |
| Water-heater straps for NV, ID, MT, WY, AZ, AR, TX, WA | Location state (order form), photos | §4 / findings |

## 3. General Form rules → checklist

| KB `global_forms["General Form"]` group | Checklist |
|---|---|
| Square footage & apartment plausibility (avg 500–1,200 sf/unit) | §1 all five items; §6 SF issues |
| Vacancy and occupancy | §1 "SF of vacant areas correct" |
| ISO construction classification (brick veneer logic; see `reference/iso_reference.txt`) | §2 all four items; §6 ISO issues |
| Access and photographic evidence (roof/apartment access explained) | §3 "Inspector got access…", "areas not accessed marked U/D" |
| Vacant building utilities (water on + heat off = freeze hazard) | §3 "Risk heated or utilities shut off" |
| Electrical (aluminum wiring 1965–1975 apartments; Zinsco/Stab-Lok vs photos) | §3 "Aluminum Wiring question correct", "Zinsco and Stab Lok questions correct" |
| Sprinklers (evidenced anywhere → section complete; partial ≠ 100%) | §3 "Sprinkler section matches photos / prior reports" |
| Prior report comparison | §1/§2/§3 "matches prior report" (needs prior order data, open question) |
| Coverage-specific hazard review (no GL photos on property only) | §4 "Photos match coverage" |
| Commercial cooking (hood quarterly, AES semi-annual vs tag dates) | §4 "Commercial cooking tag photos match form" |
| Recommendations (linked photos; no duplicates) | §4 "Rec have photos attached"; §5 "Recs not redundant and match coverage" |
| Narrative (describes occupancy/operations; facts are truth) | §5 "Narrative describes operations"; §6 "Operations not described" |
| Underwriter special concerns | §5 "U/W concerns addressed in U/W concerns box" |
| Risk rating vs recs ("Good with Recommendations"/"Poor" if recs exist) | Opinion of Risk section (§111472) |
| Omit non-applicable sections (pool, prof./auto liability…) | Omitted-section flags (`cbox`) |
| Single-exit egress / emergency lighting rec review | findings |
| Global "Recommendations" form rule: action-verb first, no "Recommend…", no bare hazard text | Recommendations form text |

§7 rating (1–10) = backend's overall score of the *original* report.

## 3a. Logic rules stated by TIS in the walkthrough

| Rule | Logic | Checklist |
|---|---|---|
| SF per unit | `(total SF − commercial SF) × 0.9 ÷ units`. Flag outside ~600–1,200 sf (internal red flag only) | 1.3 |
| Diagram SF | Diagram must show SF. Its dimensions must add up to the form SF | 1.1 |
| Prior report | SF / ISO / sprinkler must match prior report, or the difference must be explained | 1.2, 2.4, 3.7 |
| Brick veneer | Veneer = Yes → backing ∉ {N/A, blank}. Veneer = No → backing = N/A | 2.2 |
| Access | Access to all = Yes → roof and basement photos exist. = No → explanation present and roof/area questions answered No/U/D, not Yes | 3.1, 3.2 |
| Vacancy ↔ utilities | No vacancy → "heated / utilities shut off" = N/A. Answered while no vacancy → vacancy probably missing. Both directions | 3.3 |
| Aluminum wiring | N/A unless apartment/mixed-use built 1965–1975 | 3.4 |
| Sprinklers | % coverage vs where heads appear in photos (100% claimed but heads only in basement = error). Control valve chained/locked. No inspection tag → rec for annual inspection | 3.6 |
| Housekeeping | "Acceptable except X" in an answer → a rec for X must exist | 4.1 |
| Emergency lighting rec | Only if ≥ 4 stories or > 12 units (NFPA) | 5.1 |
| Panic hardware rec | Depends on occupancy/building characteristics, not on presence | 5.1 |
| Duplicate recs | Hand-written + auto-generated rec saying the same thing → keep one | 5.1 |
| Narrative | Never a source of truth. Must not contradict the form. Keep facts that have no form question | 5.2 |
| Stale values | After a correction (e.g. SF), no old value may remain in comments/narrative | final-check |
| Client sensitivity | Seneca: every sidewalk flaw is a rec. Others: advisory | 4.1 |

## 4. Client overlays (examples)

- **Seneca (all offices)**: enhanced trip/fall photo review (risers, handrails,
  small sidewalk cracks, curbs); expanded narrative naming tenants/operations; no
  liability recs on property-only.
- **MSI**: square footage only if the form asks; **every rec must name the hazard
  location**.
- **Precision Risk**: when roof photos are absent, check the report documents an
  off-platform imagery review (HOA exempt).
- **Church Mutual family**: rating system + mandatory minimums + photo rule
  (`inherited_client_requirements`).
- **K&K Cooking Supplement**: hood tag dates vs quarterly, AES vs semi-annual.

The backend owns this logic. The extension only has to send the exact client and form
names.

## 5. What the four AI features consume and produce

| Feature | Consumes | Produces (written by extension) |
|---|---|---|
| Recommendation | Flagged questions (trigger met, F13 empty or weak), hazards found in photos, existing recs, coverage, client rules | Text for `F13_<rec>` (question-linked) or a new `F14_<n>` slot; rewritten text for weak recs |
| Yes/No questions | Choice questions (options, current answer, comment, section, tooltip), photos + captions, narrative, order form | Selected option on F2 (click) / F4 (select) + optional F1 comment; confidence; evidence photo ids |
| Narrative rewriting | Narrative, embedded narrative instructions, form facts, recs, order form, client narrative rules | New text for `F7` narrative (and U/W concerns response), plus a list of issues fixed |
| Rec photo addition | Each rec text + candidate photos (images + captions) | `RECIMAGEID_*` value (`<id>t.jpg`) per rec, or "no photo possible" (absent item) |
| Whole-report QC | Everything above | QC Checklist ticks + §6 issue boxes + F6 notes + rating; findings list in the side panel |
