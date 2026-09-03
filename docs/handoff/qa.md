# Handoff: QA

Last updated: 2026-09-03 (session 1, run 35, ~16:10 UTC; resumed after a ~2.5 h usage-limit stall). Read `docs/process/roles/qa.md` first.

## Latest run

| Field | Value |
|---|---|
| SHA tested | `257b395` (main, 2026-09-03 ~16:00 UTC; runs 30–35 covered #71 event tick, **#82 deployment + launch + results**, **#302 marker fix (#313)**, #307 threat offset, mapgen/art updates) |
| Gate | typecheck, lint, build all pass |
| `pnpm test` (vitest) | 1118 / 1118 (+1 deliberate skip) |
| `pnpm test:e2e` on main | 30 / 30 (`overworld-markers.spec.ts` added by #313) |
| Exploratory pass | ten flows (standard, menu, migration, overworld, roster, city + markers, debug, mech bay + build, **launch**): **1 finding** at `257b395` |
| Filed this run | **#357 (p1, ui)**: overworld is blank after Continue from mission results; one-line fix confirmed. **PR #359 (draft)**: `e2e/overworld-loop.spec.ts` for #84, red on main only because of #357, green in 2.4 s with the fix. |
| **Health** | **Amber for the release.** Everything else is green, but every mission currently ends in a dead overworld until the player leaves and returns (#357). It blocks the #84 end-to-end proof and therefore v0.1.0; the fix is one line and #359 becomes its regression test. |

### Run history

| SHA | Build | Unit | e2e | Exploratory | Filed |
|---|---|---|---|---|---|
| `257b395` | pass | 1118/1118 | 30/30 | #357 reproduces (launch flow) | — |
| `5c5453f` | pass | 1115/1115 | 30/30 | #357 reproduces; #84 spec written | #357, PR #359 |
| `c68b7b0` | pass | 1111/1111 | 30/30 | launch flow added; #302 verified fixed | — |
| `958807d` | pass | 1090/1090 | 29/29 | 0 findings | — |
| `7b43372` | pass | 1071/1071 | 29/29 | 0 findings (mission list, build) | — |
| `178caed` | pass | 1042/1042 | 27/27 | 0 findings | — |
| `13c83b3` | pass | 1017/1017 | 27/27 | 0 findings (+ mech bay flow) | — |
| `e355fc4` | pass | 1009/1009 | 26/26 | 0 findings (+ debug flow) | — |
| `d2cd2c3` | pass | 1009/1009 | 26/26 | lose-run adapted to game-over | #304 |
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
- Deployment, launch and results (#82, runs 31–35, seed `qa-launch`): the deployment screen shows the mission title and briefing, one checkbox row per squad ("Alpha | Rifle Squad | 5/5") and mech ("Hammerhead | 0 % damage"), Launch disabled with nothing picked; the assessment moves with the picker (force 10 → 20 → 149 against an even-fight target of 60, win chance 22 % → 27 % → 90 %) and its tone follows `ODDS_BAND_LOWER` (ok ≥ 66 %, warn ≥ 40 %); Launch → `mission-results` ("Mission extracted", mission id, credits ¢150, squads wiped 0, mechs destroyed 0, infestation 0, "The full debrief arrives with #83"); the stored `lastMissionResult` matches the screen, the treasury rises by exactly `creditsAwarded`, the city's infestation moves by exactly `infestationDelta`, the mission leaves the list, squad strengths drop by the reported losses (3 and 1), the mech takes the reported 30 damage; nine single-unit launches later one squad was wiped and appears in the graveyard, UI and state agreeing. **After Continue the overworld is blank (#357)**; the flow recovers via Roster → Overworld.
- Map markers (#302 → #313, run 31, dev hook `cityMarkerLook`): for 36 cities the marker tint equals the infestation ramp (stops #7ccb5a / #9cff3d / #f0c63c / #e0453c, ±3 per channel) and the mission badge equals "city has a mission in state" (6 badges); the selected city is drawn in the selection colour.
- Mission list and deployment placeholder (#76, run 29): by day 19 the Missions section lists exactly the state's 5 missions (city, type, difficulty, reward, days left); clicking a row selects its city and opens the Briefing with description, type, city, difficulty "D7", reward, "5 d", biome, settlement, size and penalty "+10 infestation"; Plan deployment (from the city card or the briefing) opens `body[data-screen="deployment"]` showing the mission id and city id, and Back to overworld returns with the selection kept.
- Mech bay Save / Load / Delete / Build (#81 via #300, run 29): Save adds "Brawler" to Saved loadouts without spending; saving the same name replaces (no duplicate); a blank name is rejected: `"   " is not a valid name.`; Load restores the template's pickers and name; an invalid draft disables Save and Build and a forced save is rejected with `Loadout "Brawler" is not buildable: Fitted parts weigh 44t but the Vanguard carries at most 40t.`; Build ¢3,300 with mech name Anvil reports "Built Anvil.", charges exactly the sheet's total cost (¢5,000 → ¢1,700), adds `Anvil:Brawler` to the roster ("Vanguard · Pulse Laser / Missile Pod"); the now-unaffordable Build is disabled "Not enough credits" and a forced click says `Needs 3300 credits but only 1700 are available.`; Delete removes the template but not the built mech; saved templates and the mech survive reload + Continue.
- Mech bay (#80, run 27): opens from the roster with the roster's credits; shows Hammerhead's Skirmisher loadout (Vanguard / Strider / Manipulator / Autocannon / Missile Pod / Radiator + one empty utility); starter sheet Buildable, firepower 40, weight 60, power balance 10, combat rating 129, total cost ¢3,250. A 108-combination sweep (3 chassis × 3 legs × 4 arm weapons × 3 back weapons, arms and one radiator fixed) matched a mirror of `parts.ts`: verdict tone, `overweight` / `over-power-budget` codes and the per-slot error line on every invalid draft, and cost / firepower / balance / weight on every valid one (77). Utility pickers follow the chassis (2 / 3 / 4); Atlas with four utilities is Buildable and dropping to Vanguard keeps the first two and reports overweight; three auxiliary generators on Bulwark are allowed (balance 52). Only a Roster button exists (build / save land with #81); leaving and returning discards the draft and restores the saved loadout; the name box accepts HTML text without rendering it; no horizontal scroll at 800×600.
- Game-over screens and debug switch (#78, runs 25–26): at threat 100 the overworld hands off (next microtask) to `body[data-screen="game-over"]`: kicker "Campaign over", title "Earth overrun", tagline, rows Day reached 58 · Cities lost 32 / 37 · Cities infested 36 / 37 · Missions run 0 · Final threat 100, all equal to `outcome.summary` in the autosave; no Advance day button remains; Return to main menu works; Continue is enabled and lands on the game-over screen again; New game afterwards is a fresh day 1. Importing a save with every city at 0 and threat 0 reaches `victory-stub` on the next tick: "Earth secured · Every city is clean and no hive remains. The final mission arrives with M4…". Dev `?threatEscalation=10` (seed `qa-esc`): defeat on day 42 vs 65 baseline; `abc`, `0`, `-3` and empty leave threat identical to baseline at day 21; the production build with the same URL is unaffected. The multiplier is written to `overworld.debug` and a dev export imported into production escalates there too (#304).
- City panel and deployables (#75, run 24, dev server via `__tut__.selectCity`): before selection both sections show their "select a city" notes; Auckland shows region Oceania, scale, infestation and region mean equal to the save (mean of Perth / Sydney / Auckland), the meter's `--value` matches; three Build buttons at ¢1,500 / ¢1,000 / ¢800 with 0/2, 0/1, 0/1; sensor → 1/1 disabled "Region cap of 1 reached", two batteries → 2/2, a DOM-forced third battery is rejected with "Region "oceania" already holds 2 of "defensive-battery""; London (Western Europe) lists nothing and with ¢200 every Build is disabled "Need ¢800, have ¢200" and a forced click is rejected; Sydney shows Oceania's four; one tick with four installations pays ¢342 vs ¢491 without (upkeep 149 ≈ 50+50+30+20); Decommission removes rows with no refund and clears the cap; with ¢0 all four go **offline** on the first tick and return **online** the next once the stipend covers upkeep, badge and save agreeing; selection and installations survive Main menu → Continue and reload; by day 19 five missions exist and their cities show "Infestation Clearance · difficulty N · ¢reward · expires day D" with a Plan deployment button whose click says "Deployment planning arrives with #77."; a mission disappears from the panel once expired; the side panel scrolls (overflow auto) at 1024×600 and the last Build button is reachable.
- Roster screen (#79, run 20): starter roster is Alpha + Bravo (Rifle, 5/5) and Hammerhead (Vanguard · Autocannon / Missile Pod, 0 damage); credits match the overworld bar; hiring each of the 5 types charges its listed price (¢500/750/800/650/600) and adds a 5/5 row; names "<b>Bold</b>", 200 chars, duplicate "Alpha" and "Bögötá 🐛" are accepted and rendered as text (no HTML injection; no length cap; duplicates allowed); Hire disables at < ¢500 with a "Not enough credits" tooltip and a DOM-forced click is rejected with "Needs 500 credits but only 200 are available."; Rename applies (and is disabled for empty / unchanged); a mech imported with 30 damage shows "Repair ¢300", repair charges ¢300 and clears it, and an unaffordable repair is disabled and rejected when forced; roster changes survive reload + Continue; camera keys typed in the name box stay in the box; layout holds at 800×600 through 1920×1080 with no horizontal scroll. Mech bay button disabled with a tooltip naming #80.
- Overworld screen (#73, runs 17–19): day 1 on New game; ten single ticks each bump the day, pay the stipend (¢5,000 → ¢9,856 by day 11), raise threat and rewrite the autosave; the threat badge flips ok→warn at 34 and warn→danger at 69 (thresholds ≤33 / ≤66); 25 rapid clicks all register; Main menu → Continue and reload → Continue keep the day and credits; Export carries the day; New game over an active campaign resets to day 1 with a new seed; running idle ends in "Campaign over · defeat" on day 58 with threat 100, Advance day disabled, the outcome persisted and kept after Continue, and Enter on the disabled button does nothing; the map canvas lives in `#map-area` beside the side panel (960×679 at 1280×720) and returns to the full window one frame after leaving the screen; layout holds at 1024×600, 1280×720 and 1920×1080 (800×600 is #291).
- Preview seed stepping (#275, run 15): terra-01→terra-02, seed9→seed10, coast→coast-2, coast-2→coast-3, a-009→a-010; deltas shown inline; 20 rapid steps land on rapid-21 with no error.
- Save migration (run 9–10): an autosave captured at `35857b2` (schema v1) loads at `bb1b5bd`+ (schema v2) through Continue and Import, seed preserved, `spreadCooldowns` added by the migration, slot rewritten as v2, no console errors.
- Main menu (#72, run 3): seed box resolves `12345` verbatim, `4294967295` verbatim, `0` verbatim, blank / whitespace to a random seed, `terra-01` / `-5` / `99999999999` / emoji to a stable hash; New game and Import write the autosave on session start; Export fills the text box with the envelope JSON and a status line; Import restores an export (seed preserved after reload), accepts a hand-edited export, and rejects empty, whitespace, non-JSON, `42`, `[]`, `{}`, schema v999 ("this build reads up to v1"), stripped state and a 2 MB blob, each with a message; typing q/e/wasd in the seed box does not move the camera; the panel fits 800×600 and up.

## 2. Open PRs / issues I own

- **#359 (draft)** `test(e2e): overworld loop end-to-end smoke test (#84)`: red on main only at the post-Continue assertion (#357); mark ready and merge once #357 lands. Runs in ~3 s.
- This handoff PR.
- Merged earlier today: #225 (three promoted specs), #257 (v1 save migration fixture), handoffs #228 / #233 / #240 / #261 / #292 / #296 / #303 / #305 / #309 / #314.

## 3. Bugs filed (all `type:bug`, on project 5)

| # | Pri | Area | Summary |
|---|---|---|---|
| #217 | p2 | ui | Autosave failure on New game is never shown: `MainMenuScreen.startNewGame` shows the status then navigates, and the router unmounts the panel in the same task. Reproduced with storage at quota: overworld opens, no message, no save, Continue later disabled silently. |
| #218 | p3 | engine | Overworld camera pan is unbounded: hold A for 13 s and the markers sit at x≈8300 px on a 1280 px viewport; black screen, no recentre. |
| #357 | **p1** | ui | Overworld renders nothing after Continue from mission results: `OverworldScreen.render` clears the stale mission selection and returns before updating any view, and the selection subscription is attached only after that first render. One-line fix (`render(state)` again after `clearMission()`), verified locally: the #84 loop goes green. |
| #304 | p3 | overworld | `threatEscalationMultiplier` rides along in the save (`overworld.debug`) and the production build applies it on Continue/Import; the URL switch itself is correctly dev-only. Low impact; label accuracy. |
| ~~#302~~ | p2 | ui (feature gap) | **Closed by #313**; verified in run 31 (tint ramp + mission badge parity for every city). |
| #294 | p3 | ui | Squad hired without a name is called "Rifle Squad squad" (`squad-list-view.ts:310` appends "squad" to "Rifle Squad"). One-line fix. |
| #291 | p3 | ui | Overworld top bar wraps below ~1000 px: buttons break onto two lines, the outcome badge spills out of the bar. Fine at 1024+. |
| #219 | p3 | ui | Continue is silently disabled when the autosave exists but its envelope cannot be decoded; a state-level failure instead shows "Could not load autosave…". Inconsistent. |

Commented on **#33** at `35857b2` (preview missing from the build); #209 fixed it and run 2 verified `/mapgen-preview.html` serves the panel from `dist/`.

## 4. Observations not filed (expected for placeholders, or too minor)

- The overworld now shows day, credits, threat and the outcome; missions, city detail and the roster screen are still the M1 backlog (#75, #76, #79). The Roster button is disabled with a tooltip naming #79.
- Two "weights" in the mech bay: the stat sheet's Weight is the whole mech (chassis + fitted, e.g. 60 for the starter) while the capacity check and its message count fitted parts only ("Fitted parts weigh 40t but the Vanguard carries at most 40t"). Consistent with the code, but a player may read Weight 60 against a 40t limit. Design note for #81's owner, not filed.
- Leaving the mech bay silently discards an unsaved draft (Save exists now, but there is no "unsaved changes" prompt).
- Defeat day depends on the seed: 58 for the overworld flow's seed, 65 for `qa-esc`.
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

1. Loop: `/tmp/qa-scripts/qa-run.sh` on the QA instance (a copy of the session scratchpad; `QA_SCRIPTS` overrides the path) does pull → typecheck → lint → build → vitest → e2e → ten exploratory flows (`qa-explore`, `qa-menu`, `qa-migrate`, `qa-overworld`, `qa-roster`, `qa-city`, `qa-debug`, `qa-mechbay`, `qa-launch` .mjs) and prints the state of every filed issue, in one call (~10 min); the scripts are not in the repo (role brief: throwaway), so a fresh instance rebuilds them from the descriptions in §1; a background monitor polls `repos/BenjaminBenetti/tut/commits?per_page=1` every 5 min and validates the SHA (`^[0-9a-f]{40}$`, an API error body once produced a bogus "new main" event). Update this file when a bug is filed, a PR opens, or roughly hourly; not per quiet run.
2. **Release gate:** when #357 is fixed, rerun `qa-run.sh` (the launch flow must report 0 findings), flip PR #359 from draft to ready, and confirm CI is green with `overworld-loop.spec.ts` before v0.1.0 is tagged.
3. When #83 (full debrief) and the event dialog (#77 successor) land, extend the launch flow to read the debrief rows and trigger a pending event (#70/#71) and take each choice, checking credits and the stipend/threat modifiers (#307). select a city and read its detail, accept and launch a mission (auto-resolve), inspect the results and the graveyard after losses, reinforce a depleted squad, build a mech and save a loadout.
   The city flow already reaches missions (they appear by ~day 12) and Plan deployment; once #77 lands, follow it into the deployment screen, launch (auto-resolve, #67), and check credits, roster damage, casualties and the graveyard.
   The roster flow stages state it cannot reach yet (damaged mechs, treasury) by Export → edit JSON → Import from the main menu; reuse that trick for casualties once missions run.
4. Re-verify #217 / #218 / #219 / #291 / #294 / #304 when their PRs merge; close with a `**QA** · TUT agent` comment.
4. Fold the production preview check (strict: errors, failed requests, `#panel`, regenerate) into the exploratory script permanently; #33 landed in #209.
5. Two PRs that are each green but red together (#238 + #254) is a Tech Lead / CI concern: consider a required "merge with main" check or serialising merges that touch the same model. Mentioned here, not filed; raise it if it recurs.
6. Consider a pan-bounds e2e once #218 is fixed (hold A for 2 s, then assert some city marker is still on screen).

## 7. Gotchas

- `DomScreenRouter` mirrors the screen id onto `body[data-screen]`, so `[data-screen="main-menu"]` matches body **and** the panel; use `section[data-screen=…]` for the panel.
- `e2e/` is type-checked by `tsconfig.node.json` (lib ES2022, no DOM). Nothing inside `page.evaluate` may name `document`/`window` types; importing DOM-free value modules from `src/` (`EARTH_MAP`, `BIOME_IDS`, `SETTLEMENT_SCALES`) works.
- Production build (`vite preview`) has no `window.__tut__` hooks; run hook-based checks against the dev server. Since #209 it does include `mapgen-preview.html`.
- Chromium localStorage is ~5 MB per origin. To force an autosave failure **clear storage first**, then fill with 512 KB chunks, then 64 KB, 4 KB, 256 B, 16 B, 1 B until each throws. Filling around an existing autosave lets the next save succeed (same key, same size).
- Since #78 the lose-run must watch `body[data-screen]` for `game-over` after every Advance day click; the hand-off happens one microtask after the outcome is set, so a click-then-read loop sees the button vanish.
- After a mission the overworld may be blank (#357): scripts that continue past results must check `#top-bar [data-field="day"]` for "—" and recover via Roster → Overworld until the fix lands.
- `page.click` on a disabled button waits 30 s; to prove a rejection use `el.disabled = false; el.click()` inside `page.evaluate`. Marker tints are read with `__tut__.cityMarkerLook(id)` (dev only).
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
