# Boost AI sample orders (test data on EZ)

Filter used: *Status Group = All, Company = Boost AI* (6 orders, all `Complete`).
Boost AI is TIS's **testing account**. The KB excludes it from client QC
(`clients["Boost AI"].status = "excluded"`), so these orders are our safe
sandbox. All were created by client user `rbrink` (Ross Brinkerhoff); QC reviewer
`Boost_QC1`. Read-only inspection on 2026-10-29.

| OID | Sample | Forms | Photos | Diag | Order form (request / coverage) | U/W instructions |
|---|---|---|---|---|---|---|
| 1166305 | VACANT BUILDING SAMPLE (ex Rite Aid, Cadia CA) | General Form v68 + Recs | 38 | 1 | — / Package + CGL | — |
| 1166307 | SCHOOL SAMPLE – PROPERTY ONLY (elementary school) | Sample Freeze Protection + Sample General Form + Recs | 66 | 1 | Renewal / Monoline Property | "Inspect main building. Include Freeze Supplement – the loss runs show prior freeze losses." |
| 1166309 | MIXED USE SAMPLE – PROPERTY ONLY (New York NY) | General Form- Property Only v15 + Recs | 49 | 1 | — / Monoline Property | — |
| 1166310 | MIXED USE SAMPLE (Eastport Heights MD) | General Form v68 + Recs | 66 | 1 | New / Package + CGL | "The last inspection noted some water damage in the common areas. Inspectors should check these areas and ensure that all water damage has been repaired." |
| 1166311 | STRIP MALL SAMPLE (Fairhaven NC) | General Form v68 (33 sections: duplicated) + Recs | 72 | 1 | Renewal / Package + CGL | — |
| 1166312 | 1970 APARTMENT COMPLEX SAMPLE (Cedarbrook NY) | General Form- Property Only v15 + Recs | 52 | 1 | — / **Package + CGL** | — |

All orders: Photos required = Yes, Diagram required = Yes, ITV = No, due 30 days.

## Real captures (fixtures)

All six orders were captured read-only on 2026-10-29 with `content/snapshot.js`
into `backend/fixtures/boost-<oid>.json` (OrderSnapshot schema v2). Text answer/comment
pairs were folded and empty labels replaced by section titles in post-processing.

| OID | Forms (fields) | Recs (with photo) | Photos | Hazard-marked | Snapshot tokens | Est. cost gpt-4o / 4.1-mini+4.1 |
|---|---|---|---|---|---|---|
| 1166305 | General Form (348) | 3 (3) | 38 | 0 | 7.7k | $0.44 / $0.18 |
| 1166307 | Freeze + Sample General (413) | 2 (2) | 66 | 0 | 10.9k | $0.62 / $0.22 |
| 1166309 | Property Only (255) | 7 (7) | 49 | 0 | 8.0k | $0.49 / $0.19 |
| 1166310 | General Form (348) | 14 (13) | 66 | 0 | 10.1k | $0.63 / $0.23 |
| 1166311 | General Form, duplicated sections (384) | 7 (6) | 72 | 0 | 10.8k | $0.67 / $0.24 |
| 1166312 | Property Only (255) | 5 (3) | 52 | 0 | 6.6k | $0.49 / $0.18 |

Dev-backend results on these (mock AI + real rule engine), asserted in `backend/test/e2e.mjs`:
1166312 Property-Only form vs Package+CGL (blocker) and 2 recs without photos; 1166310 and
1166311 one rec without photo each; 1166307 Monoline Property with the full General Form, and
its freeze-supplement instruction recognised as satisfied; 1166309 1,213 sf/apartment flag.
None of the orders has a fee type selected (pricing shows "not priced yet").

## Per-form fill statistics

`yn` = choice questions answered/total, `txt` = text fields filled/total, `rec` =
recommendation boxes filled/total, `recImg` = recs with a photo chosen.

| Order/form | Sections (omitted) | yn | txt | rec | recImg | Narrative |
|---|---|---|---|---|---|---|
| 1166305 / 2055 | 29 (11) | 121/270 | 45/365 | 3/110 | 3 | 2,318 ch |
| 1166307 / 5579 | 29 (10) | 115/271 | 57/366 | 1/111 | 1 | 4,044 ch |
| 1166307 / 5580 Freeze | 9 (0) | 39/39 | 24/69 | 0/15 | 0 | 3 op/comment texts |
| 1166309 / 3045 | 23 (3) | 110/193 | 48/253 | 6/59 | 6 | 2,388 ch |
| 1166310 / 2055 | 29 (8) | 133/270 | 66/365 | 11/110 | 10 | 2,343 ch + U/W response 286 ch |
| 1166311 / 2055 | 33 (10) | 156/296 | 61/407 | 9/134 | 7 | 2,576 ch |
| 1166312 / 3045 | 23 (6) | 90/193 | 47/253 | 4/59 | 3 | 1,300 ch |

Recommendations form (2001) per order: 3 / 1 (+1 extra image) / 6 / 11 + 3 free-form
F14 / 9 / 4.

## Things a QC pass should catch (seen in the samples)

These look like seeded test cases. They are good acceptance tests for the AI.

1. **Recs without photos**: 1166310 (11 question recs, 10 with photo),
   1166311 (9 recs, 7–8 with photo), 1166312 (4 recs, 3 with photo). QC checklist
   item *"Rec have photos attached"*.
2. **Form vs coverage mismatch**: 1166312 uses *General Form- Property Only* while
   the order form asks for **Package + CGL**. The GL sections are missing.
3. **Property-only order with GL content**: 1166307 and 1166309 are Monoline
   Property. Check the photos and recs for GL focus (sidewalks, pools). KB:
   "flag excessive photos focused on GL exposures".
4. **U/W concern must be answered**: 1166310 has a water-damage instruction. Its
   "Special Underwriter Concerns Response" box is filled (286 ch), so check that it actually
   addresses the water damage. 1166307's instruction requires the Freeze supplement,
   which is attached.
5. **1970 apartment complex**: KB electrical rule says aluminum-wiring questions are
   mandatory for apartment buildings built 1965–1975.
6. **Vacant building** (1166305): KB vacancy rules (vacant SF must be given, no
   "100% occupied", water-on/heat-off is a freeze hazard, utilities ≠ N/A). The
   narrative says 100% vacant, utilities on, sprinklered. Check the form agrees.
7. **QC Checklist notes (F6)** on 1166309/10/11/12 already hold hazard lists
   (e.g. *"Window A/C metal support brackets not installed…", "Lack of contracted
   quarterly hood/duct cleaning…"*). These are useful as ground truth / few-shot
   examples of what TIS QC reports.

## Example content

Narrative opening (1166305): *"The risk consists of a one-story,
14,450-square-foot, masonry non-combustible ISO 4 commercial building that was
previously occupied by a Rite Aid pharmacy. The building is currently 100% vacant
and is being marketed for lease…"*

Recommendations (1166305): *Ensure that any daisy chained power strips or
extension cords are unplugged and removed.* (photo 18441033 "Interior – extension
cord chaining") · *Replace cracked/damaged window glass…* (18441067 "Drive thru
window broken") · *Provide for regular snow removal services for exterior walking
areas.* (18441030 "Sidewalks should be cleared").

Recommendations (1166310, abbreviated): *Have a licensed and insured roofing
contractor inspect the roof…* · *Improve housekeeping, removing all accumulated
storage from utility areas…* · *Contract a licensed and insured electrician…* ·
*Install metal support brackets… on all window A/C units* · free-form: *Remove graffiti
from building exterior.* · *Remove all tenant-stored items from interior egress
hallways…* · *Remove all loose items and debris… from the rooftop.*

The style is imperative, action-verb first, contractor-qualified. This matches the KB's
global Recommendations rule.
