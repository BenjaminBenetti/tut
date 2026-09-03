# Handoff: QA

Last updated: 2026-09-03 (session 1, run 24, ~10:20 UTC). Read `docs/process/roles/qa.md` first.

## Latest run

| Field | Value |
|---|---|
| SHA tested | `99763ef` (main, 2026-09-03 ~10:00 UTC; runs 21–24 covered #274 art atlases, #67 LaunchMission, #69 part upgrades, **#75 city panel + deployables**) |
| Gate | typecheck, lint, build all pass |
| `pnpm test` (vitest) | 994 / 994 (+1 deliberate skip) |
| `pnpm test:e2e` on main | 25 / 25 (#75 added `overworld-deployables.spec.ts`) |
| Exploratory pass | standard, menu, migration, overworld, roster and the new **city flow**: 0 findings at `99763ef` |
| Filed this run | **#302** (p2, feature gap): map markers do not show infestation or missions |
| **Health** | **Green.** The city panel matches the save state exactly (infestation, region mean, meter), deployables enforce cost and cap with clear rejections, upkeep measures 149/day against a catalogue total of 150, installations go offline when broke and recover, missions appear on the panel with expiry and vanish when expired. |

### Run history

| SHA | Build | Unit | e2e | Exploratory | Filed |
|---|---|---|---|---|---|
| `99763ef` | pass | 994/994 | 25/25 | 0 findings (+ city flow) | #302 (gap) |
| `8c033fb` | pass | 969/969 | 24/24 | 0 findings | — |
| `5f7de06` | pass | 953/953 | 24/24 | 0 findings | — |
| `bcea04a` | pass | 953/953 | 24/24 | 0 findings | — |
| `1627a55` | pass | 953/953 | 24/24 | 0 findings (+ roster flow) | #294 |
| `696f8e1` | pass | 937/937 | 23/23 | 0 findings (+ overworld flow) | #291 |
| `2fb2c6d` | pass | 920/920 | 23/23 | 1 race in my check, fixed | #291 |
| `81d0612` | pass | 920/920 | 23/23 | scripts adapted to #73 | — |
| `e8769e3` | pass | 885/885 | 22/22 | 0 findings | — |
| `10c17b0` | pass | 882/882 | 22/22 | 0 findings (+ next-seed) | — |
| `5a49fb4` | pass | 866/866 | 22/22 | 0 findings | — |
| `cfe0504` | pass | 866/866 | 22/22 | 0 findings | — |
| `833cf73` | pass (tc/lint added) | 828/828 | 22/22 | 0 findings | — |
| `85a2630` | pass (typecheck was red, unnoticed) | 828/828 | 19/19 | 0 findings | — |
| `f7f33d6` | pass | 775/775 | 19/19 | 0 findings (+ migration flow) | — (PR #257) |
| `bb1b5bd` | pass | 774/774 | 19/19 | 0 findings | — |
| `8350c27` | pass | 759/759 | 19/19 | 0 findings | — |
| `3240963` | pass | 757/757 | 19/19 | 0 findings | — |
| `71d633f` | pass | 756/756 | 19/19 | 0 findings | — |
| `9efbf50` | pass | 737/737 | 19/19 | 0 findings | — |
| `74dd9ef` | pass | 736/736 | 19/19 | 0 findings | — |
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
- City panel and deployables (#75, run 24, dev server via `__tut__.selectCity`): before selection both sections show their "select a city" notes; Auckland shows region Oceania, scale, infestation and region mean equal to the save (mean of Perth / Sydney / Auckland), the meter's `--value` matches; three Build buttons at ¢1,500 / ¢1,000 / ¢800 with 0/2, 0/1, 0/1; sensor → 1/1 disabled "Region cap of 1 reached", two batteries → 2/2, a DOM-forced third battery is rejected with "Region "oceania" already holds 2 of "defensive-battery""; London (Western Europe) lists nothing and with ¢200 every Build is disabled "Need ¢800, have ¢200" and a forced click is rejected; Sydney shows Oceania's four; one tick with four installations pays ¢342 vs ¢491 without (upkeep 149 ≈ 50+50+30+20); Decommission removes rows with no refund and clears the cap; with ¢0 all four go **offline** on the first tick and return **online** the next once the stipend covers upkeep, badge and save agreeing; selection and installations survive Main menu → Continue and reload; by day 19 five missions exist and their cities show "Infestation Clearance · difficulty N · ¢reward · expires day D" with a Plan deployment button whose click says "Deployment planning arrives with #77."; a mission disappears from the panel once expired; the side panel scrolls (overflow auto) at 1024×600 and the last Build button is reachable.
- Roster screen (#79, run 20): starter roster is Alpha + Bravo (Rifle, 5/5) and Hammerhead (Vanguard · Autocannon / Missile Pod, 0 damage); credits match the overworld bar; hiring each of the 5 types charges its listed price (¢500/750/800/650/600) and adds a 5/5 row; names "<b>Bold</b>", 200 chars, duplicate "Alpha" and "Bögötá 🐛" are accepted and rendered as text (no HTML injection; no length cap; duplicates allowed); Hire disables at < ¢500 with a "Not enough credits" tooltip and a DOM-forced click is rejected with "Needs 500 credits but only 200 are available."; Rename applies (and is disabled for empty / unchanged); a mech imported with 30 damage shows "Repair ¢300", repair charges ¢300 and clears it, and an unaffordable repair is disabled and rejected when forced; roster changes survive reload + Continue; camera keys typed in the name box stay in the box; layout holds at 800×600 through 1920×1080 with no horizontal scroll. Mech bay button disabled with a tooltip naming #80.
- Overworld screen (#73, runs 17–19): day 1 on New game; ten single ticks each bump the day, pay the stipend (¢5,000 → ¢9,856 by day 11), raise threat and rewrite the autosave; the threat badge flips ok→warn at 34 and warn→danger at 69 (thresholds ≤33 / ≤66); 25 rapid clicks all register; Main menu → Continue and reload → Continue keep the day and credits; Export carries the day; New game over an active campaign resets to day 1 with a new seed; running idle ends in "Campaign over · defeat" on day 58 with threat 100, Advance day disabled, the outcome persisted and kept after Continue, and Enter on the disabled button does nothing; the map canvas lives in `#map-area` beside the side panel (960×679 at 1280×720) and returns to the full window one frame after leaving the screen; layout holds at 1024×600, 1280×720 and 1920×1080 (800×600 is #291).
- Preview seed stepping (#275, run 15): terra-01→terra-02, seed9→seed10, coast→coast-2, coast-2→coast-3, a-009→a-010; deltas shown inline; 20 rapid steps land on rapid-21 with no error.
- Save migration (run 9–10): an autosave captured at `35857b2` (schema v1) loads at `bb1b5bd`+ (schema v2) through Continue and Import, seed preserved, `spreadCooldowns` added by the migration, slot rewritten as v2, no console errors.
- Main menu (#72, run 3): seed box resolves `12345` verbatim, `4294967295` verbatim, `0` verbatim, blank / whitespace to a random seed, `terra-01` / `-5` / `99999999999` / emoji to a stable hash; New game and Import write the autosave on session start; Export fills the text box with the envelope JSON and a status line; Import restores an export (seed preserved after reload), accepts a hand-edited export, and rejects empty, whitespace, non-JSON, `42`, `[]`, `{}`, schema v999 ("this build reads up to v1"), stripped state and a 2 MB blob, each with a message; typing q/e/wasd in the seed box does not move the camera; the panel fits 800×600 and up.

## 2. Open PRs / issues I own

- This handoff PR (#261).
- Merged earlier today: #225 (three promoted specs), #257 (v1 save migration fixture), #228 / #233 / #240 (handoffs).

## 3. Bugs filed (all `type:bug`, on project 5)

| # | Pri | Area | Summary |
|---|---|---|---|
| #217 | p2 | ui | Autosave failure on New game is never shown: `MainMenuScreen.startNewGame` shows the status then navigates, and the router unmounts the panel in the same task. Reproduced with storage at quota: overworld opens, no message, no save, Continue later disabled silently. |
| #218 | p3 | engine | Overworld camera pan is unbounded: hold A for 13 s and the markers sit at x≈8300 px on a 1280 px viewport; black screen, no recentre. |
| #302 | p2 | ui (feature gap) | Map markers look identical at infestation 0 and 99 and do not flag active missions; hot spots are only findable by clicking every city. Not in #41's task list. |
| #294 | p3 | ui | Squad hired without a name is called "Rifle Squad squad" (`squad-list-view.ts:310` appends "squad" to "Rifle Squad"). One-line fix. |
| #291 | p3 | ui | Overworld top bar wraps below ~1000 px: buttons break onto two lines, the outcome badge spills out of the bar. Fine at 1024+. |
| #219 | p3 | ui | Continue is silently disabled when the autosave exists but its envelope cannot be decoded; a state-level failure instead shows "Could not load autosave…". Inconsistent. |

Commented on **#33** at `35857b2` (preview missing from the build); #209 fixed it and run 2 verified `/mapgen-preview.html` serves the panel from `dist/`.

## 4. Observations not filed (expected for placeholders, or too minor)

- The overworld now shows day, credits, threat and the outcome; missions, city detail and the roster screen are still the M1 backlog (#75, #76, #79). The Roster button is disabled with a tooltip naming #79.
- **Tuning note for the Director:** with no player action the campaign is lost on day 58 (threat +~1.7/day; ok→warn on day 32, warn→danger on day 44). Whether that pace is right is a design call, not a bug.
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
- The QA gate is `pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm test:e2e`, in that order, gating on exit codes. `vite build` does not type-check, so build + tests alone let a red `tsc -b` through for an hour on 2026-09-03 (see Latest run). A red typecheck or lint on main counts as the p0 "failed build" in the role brief.
- Created the `type:bug` label (`d73a4a`); the pre-existing `bug` label is the GitHub default and unused by the process.

## 6. Next, in order

1. Loop: `qa-run.sh` in the scratchpad does pull → build → vitest → e2e → standard, menu and migration exploratory flows in one call (~4 min); a background monitor polls `repos/BenjaminBenetti/tut/commits?per_page=1` every 5 min and validates the SHA (`^[0-9a-f]{40}$`, an API error body once produced a bogus "new main" event). Update this file when a bug is filed, a PR opens, or roughly hourly; not per quiet run.
2. When #76 (mission list), #77 (deployment) and #80 (mech bay) land, extend the flows: select a city and read its detail, accept and launch a mission (auto-resolve), inspect the results and the graveyard after losses, reinforce a depleted squad, build a mech and save a loadout.
   The city flow already reaches missions (they appear by ~day 12) and Plan deployment; once #77 lands, follow it into the deployment screen, launch (auto-resolve, #67), and check credits, roster damage, casualties and the graveyard.
   The roster flow stages state it cannot reach yet (damaged mechs, treasury) by Export → edit JSON → Import from the main menu; reuse that trick for casualties once missions run.
3. Re-verify #217 / #218 / #219 when their PRs merge; close with a `**QA** · TUT agent` comment.
4. Fold the production preview check (strict: errors, failed requests, `#panel`, regenerate) into the exploratory script permanently; #33 landed in #209.
5. Two PRs that are each green but red together (#238 + #254) is a Tech Lead / CI concern: consider a required "merge with main" check or serialising merges that touch the same model. Mentioned here, not filed; raise it if it recurs.
6. Consider a pan-bounds e2e once #218 is fixed (hold A for 2 s, then assert some city marker is still on screen).

## 7. Gotchas

- `DomScreenRouter` mirrors the screen id onto `body[data-screen]`, so `[data-screen="main-menu"]` matches body **and** the panel; use `section[data-screen=…]` for the panel.
- `e2e/` is type-checked by `tsconfig.node.json` (lib ES2022, no DOM). Nothing inside `page.evaluate` may name `document`/`window` types; importing DOM-free value modules from `src/` (`EARTH_MAP`, `BIOME_IDS`, `SETTLEMENT_SCALES`) works.
- Production build (`vite preview`) has no `window.__tut__` hooks; run hook-based checks against the dev server. Since #209 it does include `mapgen-preview.html`.
- Chromium localStorage is ~5 MB per origin. To force an autosave failure **clear storage first**, then fill with 512 KB chunks, then 64 KB, 4 KB, 256 B, 16 B, 1 B until each throws. Filling around an existing autosave lets the next save succeed (same key, same size).
- The infestation meter sets a CSS custom property (`--value`) on `.tut-meter__fill`, not an inline width; read `style.getPropertyValue("--value")`.
- Playwright refuses to click a disabled button (it waits 30 s); assert `disabled` instead, and use `el.disabled = false; el.click()` in `page.evaluate` to prove the service rejects a forced command.
- Since #73 the overworld's back button is `[data-action="main-menu"]`, the created-at field is gone, and the map canvas is inside `#map-area` (not the window): compare canvas size to `#map-area`, and allow one frame (poll up to 2 s) for it to regrow after returning to the menu.
- `pnpm test` reports "1 skipped" since #244: `MAPGEN_WIDE=1` enables the wide property sweep. Not a regression.
- Keep `/tmp/qa-35857b2/C-autosave.json` (also `e2e/fixtures/autosave-v1.json` after #257) as the v1 fixture; never regenerate it.
- The #72 menu puts the seed `<input>` first in tab order and reuses `data-field="seed"` (the overworld's seed `<dd>` has the same attribute); scope selectors by `section[data-screen=…]`.
- `pkill -f 'vite --port 4173'` kills your own shell because the pattern matches the calling command line (exit 144); kill by port via `ss -ltnp` instead.
- Playwright reuses an already-running :4173 dev server; start it as `timeout 1800 pnpm exec vite --port 4173 --strictPort &` so it cannot outlive the session.
- The harness prints a "GitHub API rate limit exceeded" reminder whenever that phrase appears in tool output, including inside `docs/handoff/tech-lead.md`. Check `gh api rate_limit` before believing it.
- First `git pull` over ssh in a fresh instance fails on host key verification: keyscan `github.com`, verify the ed25519 fingerprint `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`, append to `~/.ssh/known_hosts`.
