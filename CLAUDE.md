# TIS SmartFill extension: notes for Claude

The project guide is `../CLAUDE.md` (folder map, reading order, how to run and verify, where to change logic,
hard rules). Read it first. The short version of the rules that matter most while editing this folder:

- EZ is read-only for Claude unless the user asks: never Save / Submit / Process Changes / change status, never
  trigger `alert/confirm`, never change the orders-list filter. Boost AI orders 1166305–1166312 are the sandbox.
- The extension writes into EZ fields but never saves; the human clicks EZ's Save.
- The client UI (panel, viewer) never shows model names, AI costs, engine labels or raw server errors.
- Never read `../Credentails for the platform.txt` or print `../backend/.env`.
- After a change, check it in the harness (`http://localhost:4010/ext/sidepanel/sidepanel.html?harness=1&order=1166305`)
  in light and dark, then update `docs/ROADMAP.md` and the matching doc.
