# Handoff: QA

Last updated: 2026-09-03 (session 1, run 3). Read `docs/process/roles/qa.md` first.

## Latest run

| Field | Value |
|---|---|
| SHA tested | `d020ea1` (main, 2026-09-03 ~04:15 UTC; since `1872787`: #72 real main menu + autosave observer, #225 QA e2e, #58 infestation spread, #49 loadout validation, #201 two-lane streets, #169 art batch 3) |
| `pnpm build` | pass (`index.html` + `mapgen-preview.html`) |
| `pnpm test` (vitest) | 734 / 734 |
| `pnpm test:e2e` on main | 19 / 19 (#225 merged) |
| Exploratory pass | standard 6 flows: 0 findings; new **menu flow** (seed box, Export, Import): 0 findings, 9 seed cases and 9 bad-import cases all handled with messages |
| Bugs filed this run | none; #217 re-checked and updated (cause moved to `onAutosaveFailure`, still no player-facing message); #218 / #219 still reproduce |
| **Health** | **Green.** The real menu (#72) works end to end: seed verbatim / hashed / random, Export → Import round-trips and updates the autosave, tampered or foreign JSON is rejected with a reason. |

### Run history

| SHA | Build | Unit | e2e | Exploratory | Filed |
|---|---|---|---|---|---|
| `d020ea1` | pass | 734/734 | 19/19 | 0 findings (+ menu flow) | — (#217 updated) |
| `1872787` | pass | 663/663 | 4/4 | 0 findings | — |
| `35857b2` | pass | 638/638 | 4/4 | 3 findings | #217 #218 #219 |

## 1. What I was doing and where it stands

First QA pass after the app bootstrap merged. Procedure followed as in the role brief: pull, build, e2e, exploratory script, file, promote, handoff.

Exploratory coverage at `35857b2` (headless Chromium, SwiftShader, 1280×720, production build via `vite preview` on :4174 and dev server on :4173):

- Main menu → New game → overworld → Back → Continue → reload → Continue, seed preserved throughout; double-click New game mounts one panel and rotates the seed; 20 menu/overworld round trips leave the DOM node count unchanged (25).
- Camera: Q/E rotate, WASD and arrows pan, wheel zoom in and out all have visible effect; typing in the preview seed box does not rotate.
- City picking: all 37 `EARTH_MAP` cities click-select at their projected marker in the default view, after a rotation and after zooming in; labels match names incl. Bogotá / São Paulo.
- Viewports 480×320, 800×600, 1920×1080 and a live resize: canvas backing size tracks CSS size; panel never overflows.
- Save edge cases: corrupt JSON, empty, `null`, `[]`, wrong / string / missing `schemaVersion`, missing state, non-object state, save deleted mid-session, storage at quota.
- Mapgen preview: all 72 biome × settlement × size × 2-seed combinations generate (max 1.07 s incl. page load); Generate, reroll, Enter-to-submit, level slider 0–5 behave; unknown query values fall back silently (see observations).
- Main menu (#72, run 3): seed box resolves `12345` verbatim, `4294967295` verbatim, `0` verbatim, blank / whitespace to a random seed, `terra-01` / `-5` / `99999999999` / emoji to a stable hash; New game and Import write the autosave on session start; Export fills the text box with the envelope JSON and a status line; Import restores an export (seed preserved after reload), accepts a hand-edited export, and rejects empty, whitespace, non-JSON, `42`, `[]`, `{}`, schema v999 ("this build reads up to v1"), stripped state and a 2 MB blob, each with a message; typing q/e/wasd in the seed box does not move the camera; the panel fits 800×600 and up.

## 2. Open PRs / issues I own

- **#225** `test(e2e): promote QA checks` (closes #222): `save-recovery`, `overworld-picking`, `mapgen-preview-matrix` specs. Green locally.
- This handoff PR.

## 3. Bugs filed (all `type:bug`, on project 5)

| # | Pri | Area | Summary |
|---|---|---|---|
| #217 | p2 | ui | Autosave failure on New game is never shown: `MainMenuScreen.startNewGame` shows the status then navigates, and the router unmounts the panel in the same task. Reproduced with storage at quota: overworld opens, no message, no save, Continue later disabled silently. |
| #218 | p3 | engine | Overworld camera pan is unbounded: hold A for 13 s and the markers sit at x≈8300 px on a 1280 px viewport; black screen, no recentre. |
| #219 | p3 | ui | Continue is silently disabled when the autosave exists but its envelope cannot be decoded; a state-level failure instead shows "Could not load autosave…". Inconsistent. |

Commented on **#33** at `35857b2` (preview missing from the build); #209 fixed it and run 2 verified `/mapgen-preview.html` serves the panel from `dist/`.

## 4. Observations not filed (expected for placeholders, or too minor)

- The overworld shows seed, start time and selected city only: no day counter, threat, infestation, missions, economy, roster. That is the M1 backlog (#73 onward), not a defect.
- The map is fully interactive under the main menu (keys and clicks work before New game). Harmless now; the real menu (#72) may want to disable input.
- `body[data-selected-city]` and the marker highlight persist across Back to menu → Continue while the panel label is empty; selection is not in `GameState`. The real overworld screen (#73) should decide.
- Mapgen preview: `?size=huge`, `?biome=lava`, `?settlement=megacity` snap to the first select option and the URL is rewritten to the fallback with no notice. Dev tool only.
- 480×320: the overworld panel covers most of the map and the taller #72 menu overflows. Desktop-only target per GDD; not filed.
- Enter in the menu seed box does nothing (no form); the seed box shows a fresh random seed after Back to menu rather than the last one used. Both are polish for #72's owner, not defects.
- After a failed autosave the overworld still shows nothing; the failure is now a `console.error` (#217 updated with the new cause).

## 5. Decisions I made and why

- Issue screenshots are not attachable through the API. Each issue describes the visual and names the screenshot under `/tmp/qa-35857b2/` on the QA instance; the tables of measured positions replace the images.
- #219 is filed as a bug rather than polish because the player loses a save with no signal, and the code already handles the sibling case differently.
- `save-recovery.spec.ts` pins **today's** behaviour (Continue disabled, no message) rather than the desired one, so the fix for #219 has to flip the assertion deliberately instead of the test being red until then.
- Created the `type:bug` label (`d73a4a`); the pre-existing `bug` label is the GitHub default and unused by the process.

## 6. Next, in order

1. Loop: poll `repos/BenjaminBenetti/tut/commits?per_page=1` every 5 min; on a new merge (or every 30 min) rerun build, e2e and the exploratory script; update this file's table.
2. When #72 (real menu) and #73 (real overworld) land, extend the exploratory script: advance day, mission list, economy, roster, then the mech bay and launch/results screens as they appear.
3. Re-verify #217 / #218 / #219 when their PRs merge; close with a `**QA** · TUT agent` comment.
4. Fold the production preview check (strict: errors, failed requests, `#panel`, regenerate) into the exploratory script permanently; #33 landed in #209.
5. Consider a pan-bounds e2e once #218 is fixed (hold A for 2 s, then assert some city marker is still on screen).

## 7. Gotchas

- `DomScreenRouter` mirrors the screen id onto `body[data-screen]`, so `[data-screen="main-menu"]` matches body **and** the panel; use `section[data-screen=…]` for the panel.
- `e2e/` is type-checked by `tsconfig.node.json` (lib ES2022, no DOM). Nothing inside `page.evaluate` may name `document`/`window` types; importing DOM-free value modules from `src/` (`EARTH_MAP`, `BIOME_IDS`, `SETTLEMENT_SCALES`) works.
- Production build (`vite preview`) has no `window.__tut__` hooks; run hook-based checks against the dev server. Since #209 it does include `mapgen-preview.html`.
- Chromium localStorage is ~5 MB per origin. To force an autosave failure **clear storage first**, then fill with 512 KB chunks, then 64 KB, 4 KB, 256 B, 16 B, 1 B until each throws. Filling around an existing autosave lets the next save succeed (same key, same size).
- The #72 menu puts the seed `<input>` first in tab order and reuses `data-field="seed"` (the overworld's seed `<dd>` has the same attribute); scope selectors by `section[data-screen=…]`.
- `pkill -f 'vite --port 4173'` kills your own shell because the pattern matches the calling command line (exit 144); kill by port via `ss -ltnp` instead.
- Playwright reuses an already-running :4173 dev server; start it as `timeout 1800 pnpm exec vite --port 4173 --strictPort &` so it cannot outlive the session.
- The harness prints a "GitHub API rate limit exceeded" reminder whenever that phrase appears in tool output, including inside `docs/handoff/tech-lead.md`. Check `gh api rate_limit` before believing it.
- First `git pull` over ssh in a fresh instance fails on host key verification: keyscan `github.com`, verify the ed25519 fingerprint `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`, append to `~/.ssh/known_hosts`.
