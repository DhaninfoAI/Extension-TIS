# SmartFill (Chrome extension)

AI-assisted QC for Technical Insurance Services reports on EZSurveyForm. **v0.4.0** (2026-11-05).
Reads an EZ order (forms, recommendations, photos), sends it to the backend (`../backend`), and shows the review
in a TIS-branded side panel. Every suggestion can be **applied into the EZ form**, undone, or dismissed with a
reason. Nothing is saved in EZ until the reviewer clicks EZ's own Save. Project guide: `../CLAUDE.md`.

## Run it

1. Backend: `cd backend && npm install && npm start` (http://localhost:4010).
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → this `extension/` folder (after code
   changes: ↻ on the extension card, then reload the EZ tab).
3. Open the panel (toolbar icon) and **sign in** with your SmartFill account (create one: `cd backend && npm run
   create-user -- --email you@company.com --role admin`). Then open an order in EZ (it is read in the background as soon as it opens) → **Run AI review** (always
   reads the order again and runs a new review). Licences, roles and the dashboard: `docs/LICENSING.md`.

Preview without Chrome: http://localhost:4010/ext/sidepanel/sidepanel.html?harness=1&order=1166305
(`&page=none` = not on EZ, `&present=1` = pretend fields are on the page to try Apply).

## What the reviewer gets

- **Page strip** under the header: which EZ page is open, what can be done there, "N to apply here".
- **Quick links** under it: Order · each form · Images · Report, the open page marked, and **Photo viewer** (the large
  viewer, available as soon as the order is read, before any review); pinned while scrolling.
- **Review summary** (no score): must-fix / to-check / advisory / missed-hazard counts and when the review ran.
  Updates live as findings are applied or dismissed.
- **Tabs** in TIS's QC order:
  - **Overview**: must-fix items, underwriter questions (✅/⚠️/❌, "Insert drafted answers"), order facts, pricing.
  - **Checks**: logic checks and the proposed QC checklist §1–§5.
  - **Photos**: thumbnail grid with Hazard / Rename / Rec badges; **View all N photos ↗** opens the viewer window.
  - **Recs**: missing / rewrite / remove / merge, with before → after and a photo for each.
  - **Answers**: Yes/No answers that differ and logic conflicts (comments are left to the reviewer).
  - **Narrative**: issues (no rewrite); **Read the full narrative ↗**.
  - **Finish**: final check, §6 inspector issues, §7 rating, §8 note, Save QC outcome.
- **Click any finding** to jump to its question (opening the right form) or photo; **Undo** per card, toast Undo,
  undo bar (Undo last / Undo all).
- **On the EZ page**: green "AI" tags on applied fields, coloured outlines on flagged ones, "Next issue ›" bar,
  NSR-style photo viewer (scroll to zoom, drag, ← →). On the Images page a photo click outlines that one photo.
- **Order facts strip** pinned under the tabs; **Square footage** helper (Checks tab) with Google Earth / Maps
  links and a measured-vs-expected check for QC checklist 1.4.
- **On EZ forms**: "☰ Sections" jump bar on the left edge. **On the Recommendations form**: thumbnail + "Pick photo ▾"
  next to each photo drop-down; the Recs tab can "Use N suggested photos" in one click.
- **Viewer window**: every photo in one grid (filters, search, sizes, AI notes, Show in EZ) and the narrative with
  issues highlighted.
- Light / dark / system theme; footer with Online / Offline (re-checked every 20 s) and the version.

## Layout

| Path | Contents |
|---|---|
| `manifest.json` | MV3 · host access `*.ezsurveyform.com`, `localhost:4010` |
| `background/background.js` | Service worker: pipeline (scrape → snapshot → photos → analysis), API proxy, feedback |
| `common/config.js` | Backend address + token (editable in the panel's Settings) |
| `content/snapshot.js` | EZ → OrderSnapshot scraper (verified on the 6 Boost AI orders) |
| `content/writer.js` | Apply / Undo into EZ fields (checkbox groups, selects, text, recs, free-form rec slots, rec photos, captions) |
| `content/overlay.js`, `content.css` | Outlines, "Next issue" bar, photo viewer |
| `content/content.js` | Page router + detection, photo fetch, focus/flash |
| `sidepanel/` | The panel (TIS brand: navy #12254a, Geologica; theme tokens shared with the viewer) |
| `viewer/` | Full-size photos + narrative window |
| `icons/` | Extension icons + `brand/` (TIS and Boost logos) |
| `fonts/` | Geologica (latin + latin-ext variable WOFF2, weights 400–600) + `OFL.txt` licence; loaded by `sidepanel.css`, so nothing comes from Google Fonts |
| `docs/` | Context, roadmap, platform analysis, architecture, backend/frontend specs, AI design, recordings |
| `CLAUDE.md` | Pointer to the project guide `../CLAUDE.md` |

## Not built yet

See `docs/ROADMAP.md`: the click-saving ideas and the improvement list (security and licensing gaps to fix
before selling, billing, scale, operator experience).
