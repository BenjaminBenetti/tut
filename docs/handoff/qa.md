# Handoff: QA

Last updated: 2026-09-04 (post-v0.2.0; win path settled on #317).

## Latest run

| Field | Value |
|---|---|
| SHA tested | `8db18b5` (main, after v0.2.3) |
| Gate | typecheck, lint, build pass; vitest **1902 / 1902** (+1 deliberate skip); e2e **59 / 59** |
| Exploratory | 11 flows clean; determinism verified after the RNG nonce change; overwatch exercised end to end |
| **Verdict** | **Healthy, and the board is clear.** Control scheme 7/7 on every head since band 1; a mission is completable with fog active, guarded by a permanent spec. **No open QA-filed defects.** |

### Release push, in order of what mattered

1. **#439 (p0) reproduced and then verified fixed.** Markers match the texture to within a pixel, so the projection was never wrong; the artwork disagreed. 12 of 37 markers stood on ocean pixels (Auckland 46 px from land, Singapore 20, Tokyo 18, São Paulo 14, Sydney 11). There were no city labels at all — the grey bars were per-region placeholders at each region's own centre. After #449: **29 of 37 markers directly on land, the other eight 1–4 px from shore**, names drawing on selection. Bogotá and New York still read as slightly offshore because the glyph is bottom-anchored and its body extends north; their anchors are on the coast.
2. **The tactical loop came together during the push.** #422 fixed the bugs-phase soft lock (#412); #341 (PR #453) turned Launch from auto-resolve into the real deploy → tactical → results flow and added Extract; #426 made spawners attackable.
3. **Played the mission both ways.** Production build, no dev hooks: Launch → HUD → click-select → END TURN → bugs act → Extract → debrief → overworld. Dev build with assertions: move costs a point, 16 shots / 5 hits / 3 kills, previews "85 % hit, 30–50 damage", bug phase wiped both squads. Losing routes to a "Mission lost" debrief; before #341 a wipe dead-ended on a frozen tactical screen.
4. **Win path proven. A mech destroys an indoor spawner; a lone squad cannot.** Two earlier readings of mine were wrong and are withdrawn: "the objective is unreachable" (it is not) and "a mech probably cannot see into an interior" (it can).

   **Both zero-shot results were my driver.** First, I targeted the spawner by clicking its **tile**; the HUD resolves an attack target **by id** through `findAttackTarget`, so a tile intent never set a target and no preview ever appeared. Use `window.__tutTactical__.selectUnit("spawner-1")` while Attack is armed. Second, I walked to the **nearest reachable tile** and stopped there, which is exactly the tile MapGen measured as having line of sight only **49 %** of the time, against **99.4 %** of indoor spawners having some mech firing position (#494).

   **Mech, seed `spawner-test`, spawner-1 indoors at 12,23 with 20 hp, deployed at 31,27.** Distances manhattan, the metric the game reports.

   | Mech stood at | Distance | Preview |
   |---|---|---|
   | 31,27 | 23 | `Target is 23 tiles away; weapon reaches 10` |
   | 17,28 | 10 | `No line of sight to "spawner-1"` |
   | 17,18 | 10 | `No line of sight to "spawner-1"` |
   | 17,24 | 6 | **75 % hit, 30–50 damage** |

   One shot from the fourth position: **spawner 20 → 0, destroyed, objective 1/2, turn 3.** Two of three tried tiles had no sight line and the third did, which is the 49 % figure showing up in play. The mech never enters the building.

   **Infantry, two seeds.** A squad does get a clean preview on an indoor spawner from outside (`51 % hit, 2–4 damage`), so sight lines are not its problem; arithmetic is.

   | Seed | Reached range | Shots | Damage | Outcome |
   |---|---|---|---|---|
   | `s3` | turn 3, 8 tiles | 3 | 2 of 20 | squad killed turn 7, spawner at 18 hp |
   | `s1` | turn 4, 8 tiles | 3 | 0 of 20 | squad killed turn 8, spawner untouched |

   At 2–4 per hit against 20 hp a squad needs about a dozen hits, so ~25 shots at ~50 %, and a rifle squad holds **3 charges** before reloading (#409). Both squads ran dry after three shots and died around turn 7. **The intended answer to an indoor spawner is the mech's gun.** That matches `objectiveApproach`'s own doc: a mech having no route *onto* an indoor objective is by design, provided some class can reach a firing position. Posted on #317.

   **#484 (PR #515, in `f7901ba`) closed half the discovery gap.** Egg spawners are now drawn and pickable: `spawnerScreenPosition` returns a point inside `#map-viewport`, a real pointer click there targets the spawner (`Egg spawner`, `Target is 23 tiles away; weapon reaches 10`), and there is a `selectSpawner()` hook plus a permanent spec, `e2e/tactical-spawners.spec.ts`. Verified by hand on `f7901ba`.

   **The remaining player-facing gap is the sight line, not the target.** Nothing on screen marks which tiles have a clear line, so a player walks at the objective, finds Fire greyed out and concludes it is broken — which is precisely what I did twice. Filed as **#517** and narrowed to exactly that after #515.

5. **#538 (p1), filed on `b0e2b6c`: the tactical camera starts off the deployed force and no control pans back.** Sampled seven seeds at 1280x720: `spawner-test`, `s3`, `s4` and `s7` draw **0 of 3** TDF units on screen; `s1`, `s2`, `s6` draw 3 of 3 but in the bottom ~50 px under the action bar. On `spawner-test` `unit-1` sits at screen 753,747 in a 720-px window, and arrows, WASD, mouse drag and wheel all leave it there — wheel zoom pushes it to 823, `q` rotates it to −135. Selecting a unit does not move the camera either.

   Reproduced in the **production build** with no dev hooks: banner says `TDF 3`, no unit is drawn, and clicking five points across the map never sets `data-selected-unit`. Only END TURN and OVERWORLD work. The simulation under it is fine — see item 4 — so this is purely camera framing.

7. **M2.5 band 1 verification (#514).** The Director cuts a build for the Executive Director once all five land, so each is verified against its own acceptance criteria as it merges, with real pointer clicks rather than hooks.

   | Issue | State | Verdict |
   |---|---|---|
   | #519 move by default | merged `15fc14b` | **4 / 4 criteria pass.** Left click a reachable tile moves (`13,28 → 13,29`); Move shows active and Attack overrides it; an impassable tile refuses with "That tile is out of reach this turn."; clicking a bug does not walk into it |
   | #523 phase banners | merged `eeb864a` | **6 / 6 criteria pass.** `Bug phase · Turn 1` visible 694–1760 ms then `Your turn · The bugs have finished · Turn 2` 1801–2840 ms, sequential, peak opacity 1, skippable (clicked clears at ~1050 ms vs ~2050 ms), never intercepts a click |
   | #521 AP tiers | PR #545 open | Palette is sound — one hue at two lightnesses plus an inset footprint, chosen so deuteranopia and protanopia keep the distinction. **Not yet confirmed on screen**: the seeds I tried box the unit in, so its whole reachable set fits inside 1 AP and only one band draws. Verify on merge with a unit in open ground |
   | #520 right click | no PR yet | Probe ready |
   | #522 weapon range | no PR yet | Probe ready |

   **Watch when #520 lands:** it makes left click never invoke, which reverses the behaviour #519's own acceptance test asserts. That test needs re-pointing, not deleting, or the two issues silently contradict each other. Flagged on PR #543.

   One cosmetic note on #523, raised there and not a blocker: while the `BUG PHASE · Turn 1` banner shows, the status line already reads `TURN 2 · PLAYER PHASE`, because an instant bug phase lets the readout race the transition banner.

9. **M2.5 band 1 is complete and verified on screen (`8d88d03`).** All five features confirmed with real pointer input, no hooks driving the actions, no console errors. Verdict posted on #514; screenshots committed in PR #562 and PR #571.

   | Feature | Verified |
   |---|---|
   | #519 move by default | Move armed on selection; no action-bar click needed |
   | #520 right click invokes | Left click on a free tile does not move; right click does. Digits arm actions and the bar prints its shortcuts |
   | #521 AP tiers | Renders, but see #572 below |
   | #522 weapon range | Paints on selection with no target picked, and scales with the weapon: mech (range 10) ~85k px, squad (range 8) ~79k, ~55k unselected. `v` toggles it |
   | #523 phase banners | `Bug phase` then `Your turn · The bugs have finished`, ~1 s each, sequential, skippable |
   | #538 camera | Fixed by #556: 3 of 3 units on screen, selected unit centred. Was 0 of 3 on four of seven seeds |

   **Two overlay bugs were invisible to CI and only showed up on screen.** #555 found every overlay failing a depth test while the suite stayed green; I then filed **#572** (p1) for the weapon range overlay painting over the 2 AP movement band, which is why #521 is not readable by default. Toggling range off with `v` reveals 2,233 px of movement overlay. **The lesson for this seat: a green gate says nothing about whether an overlay reached the screen. Photograph it and look.**

   Method notes worth keeping: judge overlays by *dose-response* (a range-8 unit must paint less than a range-10 one) rather than by a binary before/after diff, and exclude the side panel from any pixel diff or you measure the HUD instead of the map. Both mistakes cost me a wrong reading before I caught them.

11. **v0.2.1 verified as a shipped artifact, not just as main.** Built from the tag (`b60d27b`), served as a production preview, played with **no dev hooks** — `window.__tutTactical__` and `window.__tut__` both absent, so every action went through real pointer and keyboard input. Camera opens on the force, Move armed by default, right click invokes (`15,30 → 15,29`), digit `2` arms Attack, the bar prints its shortcuts, both phase banners fire, no console errors. Posted on #514.

12. **The win path survives fog of war (#551 / #570).** This was the risk worth chasing: vision is now modelled and an indoor spawner is exactly what a mech must see in order to shoot it, so a regression here would end mission completability without touching a single unit test.

    Two things make it safe, both confirmed rather than assumed. **#570 touched only graphics and `vision-service`** — `combat-service.ts` is not in the diff and never consults a view, so the attack rules are unchanged. And **visibility and shootability stay coupled**, because both derive from `hasLineOfSight`: a spawner becomes clickable exactly when it becomes shootable. An unseen spawner correctly returns no `spawnerScreenPosition` while the objectives panel still names it.

    Demonstrated end to end on seed `f2`, `e01ee73`: the mech walked to 10 tiles, fired twice at 57 % for 30–50, and took `spawner-2` from 20 to 0 on turn 5. Objectives 1/2.

13. **#572 fixed by #577 and confirmed.** The weapon range is now light pips instead of a 0.5-opacity fill. The movement overlay in the default view went from 14,604 px to 24,307 px, **+66 %**, and toggling range off now barely changes it. Both bands read. Frame committed as `docs/design/tactical-overlays-both-bands-readable.png`, which supersedes the broken pair in PR #571.

14. **#528's radial menu is unwired scaffolding, and that is fine.** I chased this on `dfcd2dc` after #559 made bugs hunt the landing zone, which finally puts a target in reach. `src/ui/view/radial-menu-view.ts` has **no caller anywhere outside its own tests**, matching the merge title "the ring band 3 hangs on". No ring appears on any interaction because nothing opens one yet. Not a defect; do not file it.

    What that run did confirm is that **right click invokes both actions**, which is the part that matters:

    | With | Right click on | Result |
    |---|---|---|
    | Move armed | a free tile | `14,30 → 14,31`, moved |
    | Attack armed | a Swarmer at 3 tiles, 66 % hit | bug hp **6 → 0**, killed |

    **A warning for the next person driving this.** My first three attempts reported "right click does nothing, no damage" and I nearly filed it. The cause was mine: I had targeted the bug with `selectUnit`, which left *the bug* as the selected unit, so the mech was no longer the actor. Re-select the acting unit, then arm the action, then right click the target. A left click at the same pixel correctly showed `Swarmer` in the preview, which is what proved the coordinates were right and the sequence was wrong.

15. **Fixes verified by playing them, not by reading the diff.**

    - **#480** (mine, p3) fixed by #602 on `9bbe836`. Played a mission to a full wipe: the debrief now reads *Mechs destroyed: Hammerhead*, *Squads wiped: Alpha, Bravo*, then *Casualties (surviving squads): No further casualties*. The two "nothing to report" lines are **scoped to survivors**, so they no longer contradict the losses listed above them.
    - **#468** fixed by #603. Leaving a mission with the HUD's Overworld button and returning preserves it exactly — same turn, same three units on the same tiles — and the overworld offers a labelled **Resume mission** control.
    - **#605** fixed by #610 on `167ce46`. The selected unit is now ringed; 318 of 3,381 sampled pixels around it change on selection. **It had never been drawn in a mission at all.**

16. **#517 is the one QA-filed issue still open, and it is now quantified.** A line-of-sight overlay exists (orange pips), but it feeds on `mission.units` only:

    ```ts
    const enemies = mission.units.filter((u) => u.team !== unit.team && u.hp > 0);
    ```

    **Egg spawners are not in `mission.units`** — they are in `mission.spawners`, which is why `findAttackTarget` handles them separately (#426). So no tile is ever marked for having a sight line to an *objective*, which is the exact case that made me misreport the win path twice.

    Measured through `overlaysFor` on seed `4242` at mission start, with zero enemy units on the map:

    | Unit | reachable tiles | tiles the overlay marks | tiles that actually see a spawner |
    |---|---|---|---|
    | `unit-1` (mech) | 205 | **0** | **119** |
    | `unit-2` (squad) | 117 | **0** | 70 |
    | `unit-3` (squad) | 91 | **0** | 45 |

    The machinery is all there; the gap is only which targets are fed to it. Suggested shape posted on the issue.

17. **The win path is now guarded by a permanent spec** (`e2e/tactical-objective-destroyed.spec.ts`, PR #618, merged). Nothing asserted a mission was winnable: `tactical-mission-flow` ends by *extracting*, the exit a player takes when they give up, and `tactical-spawners` proves a spawner can be targeted, not killed. The spec drives the shipped control scheme, reads the objective from the mission rather than hard-coding tiles, and was sabotage-checked — forcing `MAX_TURNS = 0` fails with `the mech never destroyed spawner-1; it still has 20 hp`. It costs the suite ~35 s, which I flagged in the PR as the reviewer's call rather than sliding it in.

    **It was held on `pnpm lint`.** I had run `tsc`, the spec three times, the full suite and `CI=1`, but not the one command that is `eslint . && prettier --check .`. Run the real lint on your own branches; a subset passes what CI then rejects.

18. **Filed #627 (p2): the context menu cannot be dismissed and its item does nothing.** #529's trigger logic is correct — Move armed on a tile still commits directly, and the menu fills the mismatch cases. But once open, `Escape`, a left click anywhere, selecting another unit, arming Move, ending the turn, and **choosing the menu item itself** all leave it open, and the item does not move the unit. Only leaving the tactical screen clears it. Play is not blocked, hence p2. Render committed as `docs/design/tactical-context-menu-stuck.png`.

    **Method note worth keeping:** my first attempt tested the wrong condition (a blocked tile with Move armed, which is the direct-commit path) and my second could not be trusted until I validated the detector — it reports `hidden=true, display=none, items=0` when closed and `data-open="true", items=1` when open. When *every* path reports the same answer, suspect the instrument before the game.

19. **#624 and #627 both verified fixed, and the board is now clear.**

    - **#624** (range indicator burying the map) fixed by #631. Verified on the **range-10 mech with Attack armed and fog active**, per the Director — the mark count grows with the square of range, so the range-8 squad frame would have flattered it. The range is now a boundary line at the edge; interior tiles are clean. Before/after committed as `docs/design/tactical-weapon-range-{before,after}-624.png`.
    - **#627** (stuck context menu) fixed by #633. Both halves: choosing the item now acts *and* closes (`14,30 → 14,31`), and all seven dismissal paths that previously failed — Escape, left click, click away, selecting another unit, arming Move, choosing the item, ending the turn — now close it. The #520 fast path still commits directly with no ring.

20. **A false red I nearly reported as a broken main.** On `ccfae7a` the e2e suite came back `3 failed` (`tactical-buttons`, `tactical-camera`, `save-recovery`), exit 1. With my probe servers on 4173/4174 stopped it was `58 passed`, exit 0.

    In non-CI mode Playwright **reuses** a running dev server, and the timing-sensitive specs fail under the contention; `CI=1` instead refuses to reuse and errors loudly. I had only recorded the loud variant. **Stop the probe servers before every e2e gate, in either mode** — under the fail-on-flaky policy this would have been reported as freshly merged work breaking main.

21. **v0.2.3 verified as a shipped artifact** (`f4d8245`), built from the tag and played as a production preview with no dev hooks: camera opens on the force, Move armed by default, right click invokes (`15,30 → 15,29`), digits arm, both phase banners fire, no console errors. The `Attack ×2` label confirms it is the post-#533 build.

22. **Overwatch works end to end, and has no e2e coverage.** Only `overwatch-handler.test.ts` covers it, and #579 unified the very sight rule it depends on. Exercised by hand on `814b2ff`: the mech armed it, and during the turn-4 bug phase a bug was damaged and one killed, status going `overwatch` → `clear`. `/tmp/qa-scripts/qa-overwatch.mjs` runs it.

    **Deliberately not promoted.** It needs ~5 turns for bugs to close and their arrival is timing-dependent; with `--fail-on-flaky-tests` a slow non-deterministic spec costs more than it protects. The win-path spec was promoted because it is bounded and deterministic — that is the line.

    **Trap in that probe:** `"Hammerhead is overwatch"` is the *arming* record. Matching the log on `/overwatch/` alone reports a shot that never happened; my first run claimed a hit with zero bugs on the map. Require a shot verb or read hp from the autosave.

23. **Two ways this seat manufactured a red result, both mine, both worth knowing.**

    - **`EMFILE: too many open files`** on the e2e gate. `fs.inotify.max_user_instances` is **128** here and a long session leaks `vite` and `chrome` watchers until the dev server cannot start. It surfaces as `Process from config.webServer was not able to start`, which reads like broken CI infrastructure. Sweep stray processes periodically; after killing them it went straight back to 58 passed.
    - **Testing the title instead of the acceptance criteria.** #573 reads "announce the turn a mission opens on", so I tested for a phase banner, found none in 3.5 s, and had a clean control proving my detector worked — it caught both End-turn banners in the same run. The issue was about the **event log** being empty at mission open, which works (`Turn 1 — TDF phase`). Every other false alarm this session came from a broken instrument; this one came from a correct instrument aimed at the wrong target, and no amount of validating the tool would have caught it. **Read the body, not the title.**

24. **Determinism verified after the RNG nonce change (#667).** Two independent runs of seed `det-seed`, each playing an identical three-turn script, produced byte-identical state — same map, same deployment, same eight bugs on the same tiles with the same hit points after three turns of AI movement. That change is exactly the kind that can break reproducibility silently, and reproducibility underpins the 60-seed sweep, the win-path spec and every seeded bug report in the tracker.

25. **The win-path spec is not made redundant by #343's sweep — check before anyone deletes it.** The sweep proves missions are winnable at the **rules** level across 60 seeds; `e2e/tactical-objective-destroyed.spec.ts` proves a player can do it **through the UI**, driving the real control scheme. They cover different failures. Two of the bugs I filed this session (#555's invisible overlays, #605's undrawn selection ring) were rules-correct and screen-broken, which is precisely the gap a service-level sweep cannot see.

26. **I over-read my own evidence on #666, and corrected it.** I endorsed the sweep's "stall" framing and wrote that a ten-turn play showed "no ending in prospect in either direction". #692 then showed the unresolved seeds were **cut off by the 30-turn cap**, not stalled — a difficulty-10 mission needs 37–56 turns. My data was accurate; the inference was not. Ten turns is a fifth of what a hard mission needs to conclude.

    What survived was the part I measured rather than inferred: the defeat path works and requires annihilation, seed `wipe-check` ending correctly after **42** turns — inside the band #692 identifies. **A growth curve over ten turns is not evidence about an outcome that needs forty.**

27. **Distinguish a false red I caused from a false red the suite caused.** Three fixes this session came out of local failures I nearly swallowed as my own mess: **#578** (save-recovery reloading on every asset), **#691** (assertion allowance below the test timeout), **#700** (local workers uncapped, so contention faked failures).

    The line: a stray server or a stale probe is mine to fix quietly; the suite being fragile under load is a **finding**, because it bites CI too. I conflated those for most of the day and sat on signal worth passing upstream. When a red result is not reproducible, ask *why* it was not reproducible before filing it under "my environment".

28. **Three features have now shipped fully working and invisible**, every one with CI green: **#555** (every overlay failing a depth test), **#572** (the 2 AP band painted over by the range fill), **#605** (the selection ring never drawn). That is the single most useful thing this seat has learned. Photograph the screen and look at it; the suite cannot see any of these.

### Harness lessons that cost me a wrong reading

Three times this session a control-scheme or rendering change silently invalidated my probes while the game was fine, and twice a green suite hid something the player could not see. Both directions matter:

- **A green gate says nothing about whether a feature reached the screen.** #555 found every tactical overlay failing a depth test with CI green throughout; #572 was the same shape, a feature that worked but was painted over. Photograph the thing and look at it.
- **A red probe does not prove the game broke.** #520 changed `selectTile` to select only and added **`invokeTile()`** for the right-click invoke. My walker kept calling `selectTile`, selected tiles for 31 turns, and reported "0 shots" — which I nearly filed as a fog regression. Patched, the same driver killed a spawner in five turns.
- **Judge overlays by dose-response, not a binary diff.** A range-8 unit must paint less than a range-10 one. And exclude the side panel from any pixel comparison (`x < 985`) or you measure the HUD instead of the map.
- **Check the diff before committing to a playthrough.** Asking whether `combat-service.ts` was even touched by the fog PR took seconds and reframed a twenty-minute test.

### Run history

| SHA | Build | Unit | e2e | Exploratory | Filed |
|---|---|---|---|---|---|
| `8db18b5` | pass | 1902/1902 | 59/59 | worker cap steadies e2e | — |
| `484f67b` | pass | 1891/1891 | 59/59 | same seed plays identically | — |
| `c99a5d9` | pass | 1886/1886 | 59/59 | memory reads cold, darkness means unseen | — |
| `ea276a9` | pass | 1880/1880 | 58/58 | crash-site archetype is preview-only | — |
| `9a0863e` | pass | 1877/1877 | 58/58 | #573 log opens with an entry | — |
| `814b2ff` | pass | 1873/1873 | 58/58 | overwatch still fires after #579 | — |
| `7133f94` | pass | 1852/1852 | 58/58 | #613 light helmet reads | — |
| `ccfae7a` | pass | 1851/1851 | 58/58 | per-weapon card lines; false red, see below | — |
| `a0389c7` | pass | 1848/1848 | 58/58 | id-registry refactor, catalogues intact | — |
| `4ad6620` | pass | 1848/1848 | 58/58 | **#627 verified fixed** | — |
| `2d2d0a9` | pass | 1806/1806 | 57/57 | **#624 verified fixed** | — |
| `2b4b638` | pass | 1805/1805 | 57/57 | context menu never closes | **#627** |
| `637208c` | pass | 1801/1801 | 56/56 | right-click menu triage | — |
| `1f8179c` | pass | 1795/1795 | 57/57 | #517 verified fixed | — |
| `167ce46` | pass | 1783/1783 | 56/56 | #605 selection ring now draws | — |
| `9bbe836` | pass | 1774/1774 | 56/56 | #480 and #468 verified fixed | — |
| `222a960` | pass | 1769/1769 | 55/55 | #590 range follows attack intent | — |
| `dfcd2dc` | pass | 1764/1764 | 55/55 | right click fires; radial is unwired | — |
| `5d93967` | pass | 1744/1744 | 55/55 | radial menu, building ghosting; 7/7 | — |
| `e01ee73` | pass | 1725/1725 | 55/55 | fog of war; win path still completes | — |
| `f581d2e` | pass | 1716/1716 | 55/55 | #572 fixed, both bands read | — |
| `8d88d03` | pass | 1713/1713 | 55/55 | band 1 control scheme, 7/7 checks | — |
| `b60d27b` | pass | 1710/1710 | 52/52 | overlay conflict found | **#572** |
| `255e2a1` | pass | 1662/1662 | 50/50 | screenshot evidence for the tag | — |
| `15fc14b` | pass | 1628/1628 | 47/47 | #519 verified, 4/4 criteria | — |
| `eeb864a` | pass | 1626/1626 | 46/46 | #523 verified, 6/6 criteria | — |
| `b0e2b6c` | pass | 1613/1613 | 45/45 | 11 flows clean; camera starts off the force | **#538** |
| `f7901ba` | pass | 1608/1608 | 45/45 | 11 flows clean; real click targets a drawn spawner (#515) | — |
| `4cec760` | pass | 1595/1595 | 44/44 | mech kills an indoor spawner; squad cannot | #517 |
| `b5c1196` | pass | 1348/1348 | 39/39 | known #412; #404 verified | — |
| `6e2e3c1` | pass | 1338/1338 | 39/39 | known #412 | — |
| `5f644d4` | pass | 1338/1338 | 39/39 | known #412 | — |
| `c57a4cb` | pass | 1330/1330 | 39/39 | known #412 | — |
| `fd236be` | pass | 1330/1330 | 39/39 | bugs phase soft-lock; #403 verified | #412 |
| `602ec97` | pass | 1310/1310 | 39/39 | known #404 only | — |
| `bf31bb7` | pass | 1310/1310 | 39/39 | known #404 only; overlays render | — |
| `319e66e` | pass | 1297/1297 | 39/39 | known #404 only; #294 verified | — |
| `713490e` | pass | 1297/1297 | 39/39 | known #404 only | — |
| `ca9a726` | pass | 1297/1297 | 39/39 | HUD flow: 2 real gaps | #403, #404 |
| `1aef30a` | pass | 1282/1282 | 38/38 | 0 findings (+ tactical flow); #304 verified | — |
| `75e1913` | pass | 1279/1279 | 38/38 | 0 findings | — |
| `f8cecc9` | pass | 1262/1262 | 38/38 | 0 findings (tactical screen lands) | — |
| `6db1ce9` | pass | 1252/1252 | 37/37 | 0 findings | — |
| `ab301d6` | pass | 1225/1225 | 37/37 | 0 findings | — |
| `84b1a6a` | pass | 1225/1225 | 37/37 | 0 findings; #368 verified | — |
| `24c31cb` | pass | 1208/1208 | 37/37 | 0 findings | — |
| `e4eec36` | pass | 1208/1208 | 37/37 | 0 findings; #219 verified | — |
| `492cb18` | pass | 1194/1194 | 37/37 | 0 findings; #291 verified | — |
| `cb7ea08` | pass | 1194/1194 | 36/36 | 0 findings; #218 verified | — |
| `ad2113e` | pass | 1181/1181 | 35/35 | 0 findings (picking refactor) | — |
| `45b5c51` | pass | 1184/1184 | 35/35 | 0 findings; #217 verified | — |
| `0a81e0f` | pass | 1173/1173 | 33/33 | 0 findings | — |
| `2f80f22` | pass | 1170/1170 | 33/33 | 0 findings; #84 spec in CI | — |
| `060c2eb` | pass | 1152/1152 | 31/31 | 0 findings (+ events flow) | #368 |
| `2340782` | pass | 1127/1127 | 31/31 | #357 fixed; #84 spec green | PR #359 ready |
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
- Turn engine and overlays (#328 / #338, runs 56–59): selecting a unit paints a blue movement-range field with yellow/red cover rings; MOVE to an adjacent tile costs 1 AP; OVERWATCH sets the unit's status to "overwatch" and spends its AP; RELOAD still says "No handler registered for command "tactical:reload"" (#404 / #409); END TURN logs `tactical:turn-started` and switches the banner to "bugs" — and stays there with every action disabled (#412).
- Mission HUD (#339, run 53, seed `4242`): the HUD preselects the first unit; the unit card shows name, side ("tdf · mech" / "tdf · squad"), an HP meter, HP 80/80 or 20/20, AP 2/2, weapon (range · acc · dmg · pen), armour and status, all equal to `activeMission.units`; the objectives panel lists "0 / 2" with both spawners at 20 hp; the action bar has MOVE / ATTACK / OVERWATCH / RELOAD / END TURN. **MOVE works:** arm MOVE, pick an adjacent free tile → the unit's `pos` changes and AP drops 2 → 1; a non-adjacent path is refused with "the path does not step from tile to tile" and a far tile with "a tile on the path cannot be entered". **END TURN, RELOAD and OVERWATCH** put "No handler registered for command \"tactical:end-turn\"" (…reload / …overwatch) in the banner and change nothing (#404), so no bugs ever spawn and ATTACK cannot be exercised yet; the turn stays 1 through 18 attempts. The HUD's turn banner duplicates the #342 bar's turn/phase and Overworld button (#403).
- Tactical screen slice (#342, run 51, dev hook `__tut__.startTacticalMission(missionId)` on seed `4242`): opens `body[data-screen="tactical"]` with a canvas filling `#tactical-viewport`, bar "MISSION mission-1 · TURN 1 · PHASE player · TDF 3 · BUGS 0" and an Overworld button; the autosave gains `activeMission` (3 TDF units on adjacent deploy tiles, 2 spawners, 2 objectives, 16 extraction tiles); `body[data-tactical-units]` equals the unit count; `__tutTactical__.selectUnit/selectTile` mirror to `body[data-selected-unit|data-selected-tile]`; real clicks 10–30 px above each unit's anchor select that unit (the anchor is the tile centre under the feet, so a click exactly there hits the ground or the unit in front — occlusion, not a mispick); a tile click records the tile; keys m/a/o/r/Tab/Escape/Enter record move/attack/overwatch/reload/next-unit/cancel/end-turn intents but change nothing yet (turn stays 1 / player); Overworld returns to a re-hosted map with the mission kept; `startTacticalMission` again says `Mission "mission-1" is already in progress`; reload → Continue lands on the overworld with the mission kept (the spec notes #341 will flip this to tactical). **Observation:** Advance day is enabled while a mission is active; decide with #341 whether time may pass during a deployment.
- Event dialog (#77 over #70/#71, run 37, seeds `9` and `qa-events-2`): no dialog on day 1; when a tick raises an event the overlay shows title, city line for city events, text, expiry and the catalogue's choices, is `aria-modal`, blocks the top bar (elementFromPoint on Main menu hits the backdrop), ignores Escape, and disables Advance day with the tooltip "Answer the pending event first"; each choice applied exactly its catalogue effect over 13 events of all four types (funding-review ±¢1,500/−¢500/0, research-find +¢1,200, city-plea −¢600 / threat +3, spore-shower −¢400 / threat +2), the answered event leaves `pendingEvents`, the dialog hides and Advance re-enables; "{city}" is substituted in titles and text; a pending event survives reload + Continue and still blocks. "Request an advance" then pays a halved stipend (observed, not asserted).
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

- Merged: **#359** `test(e2e): overworld loop end-to-end smoke test (#84)` (`8307d87`).
- This handoff PR.
- Merged earlier today: #225 (three promoted specs), #257 (v1 save migration fixture), handoffs #228 / #233 / #240 / #261 / #292 / #296 / #303 / #305 / #309 / #314.

## 3. Bugs filed (all `type:bug`, on project 5)

| # | Pri | Area | Summary |
|---|---|---|---|
| ~~#217~~ | p2 | ui | **Fixed (notice bar); verified run 41.** |
| ~~#219~~ | p3 | ui | **Fixed by #383; verified run 45** (status line names the reason; newer schema called out). |
| ~~#291~~ | p3 | ui | **Fixed by #380; verified run 44** (41 px bar, labels collapse to values at 700 px). |
| ~~#218~~ | p3 | engine | **Fixed by #379; verified run 43.** |
| #412 | **p2** | tactical | END TURN → bugs phase that nothing runs or closes; soft lock at turn 1 with no message. Stopgap: end the bugs phase immediately when no bug can act. |
| ~~#403~~ | p3 | ui | **Fixed by #406; verified run 59.** Tactical screen shows `#tactical-bar` and `#turn-banner` together: turn/phase twice, two Overworld buttons. |
| ~~#404~~ | p3 | ui | **Fixed by #328 + #409; verified and closed run 63.** |
| ~~#294~~ | p3 | ui | **Fixed by #401; verified run 55** ("Rifle Squad 3", "Medic Squad 1"). |
| ~~#368~~ | p3 | ui | **Fixed by #386; verified run 47** (0 badge/number mismatches over 58 ticks). |
| ~~#304~~ | p3 | overworld | **Fixed by #392; verified run 51** (no debug key in the save; dev URL still escalates; prod unaffected). |
| ~~#357~~ | p1 | ui | **Fixed by #83 (#358)**; #359 is the regression test. |
| ~~#302~~ | p2 | ui (feature gap) | **Closed by #313**; verified in run 31 (tint ramp + mission badge parity for every city). |

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
- `save-recovery.spec.ts` originally pinned the pre-#219 behaviour; #383 flipped it deliberately to the new messages, as intended.
- The QA gate is `pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm test:e2e`, in that order, gating on exit codes. `vite build` does not type-check, so build + tests alone let a red `tsc -b` through for an hour on 2026-09-03 (see Latest run). A red typecheck or lint on main counts as the p0 "failed build" in the role brief.
- Created the `type:bug` label (`d73a4a`); the pre-existing `bug` label is the GitHub default and unused by the process.

## 6. Next, in order

1. Loop: `/tmp/qa-scripts/qa-run.sh` on the QA instance (a copy of the session scratchpad; `QA_SCRIPTS` overrides the path) does pull → typecheck → lint → build → vitest → e2e → ten exploratory flows (`qa-explore`, `qa-menu`, `qa-migrate`, `qa-overworld`, `qa-roster`, `qa-city`, `qa-debug`, `qa-mechbay`, `qa-launch`, `qa-events`, `qa-tactical` .mjs) and prints the state of every filed issue, in one call (~10 min); the scripts are not in the repo (role brief: throwaway), so a fresh instance rebuilds them from the descriptions in §1; a background monitor polls `repos/BenjaminBenetti/tut/commits?per_page=1` every 5 min and validates the SHA (`^[0-9a-f]{40}$`, an API error body once produced a bogus "new main" event). Update this file when a bug is filed, a PR opens, or roughly hourly; not per quiet run.
2. **Release gate:** met on `2f80f22` (CI green, loop spec in). When v0.1.0 is tagged, run the full loop once on the tag and note it here.
3. When #83 (full debrief) and the event dialog (#77 successor) land, extend the launch flow to read the debrief rows and trigger a pending event (#70/#71) and take each choice, checking credits and the stipend/threat modifiers (#307). select a city and read its detail, accept and launch a mission (auto-resolve), inspect the results and the graveyard after losses, reinforce a depleted squad, build a mech and save a loadout.
   The city flow already reaches missions (they appear by ~day 12) and Plan deployment; once #77 lands, follow it into the deployment screen, launch (auto-resolve, #67), and check credits, roster damage, casualties and the graveyard.
   The roster flow stages state it cannot reach yet (damaged mechs, treasury) by Export → edit JSON → Import from the main menu; reuse that trick for casualties once missions run.
4. Re-verify #412 when its PR merges; close with a `**QA** · TUT agent` comment (done for every M1 bug: #217, #218, #219, #291, #294, #302, #304, #357, #368).
5. M2: `qa-tactical.mjs` covers #342 + #339 (move works; end turn / attack / overwatch / reload wait on handlers, #404). When the handlers land, the flow already tries to: move a unit along a path and compare the state's position, attack a bug with the preview's hit chance, end turn and watch the bug phase / spawns, extract, and check the results and roster afterwards; when #341 routes Launch to the tactical screen, add the tactical path to `overworld-loop.spec.ts` (or a sibling) and flip the reload expectation in `tactical-screen.spec.ts`.
4. Fold the production preview check (strict: errors, failed requests, `#panel`, regenerate) into the exploratory script permanently; #33 landed in #209.
5. Two PRs that are each green but red together (#238 + #254) is a Tech Lead / CI concern: consider a required "merge with main" check or serialising merges that touch the same model. Mentioned here, not filed; raise it if it recurs.
6. Consider a pan-bounds e2e once #218 is fixed (hold A for 2 s, then assert some city marker is still on screen).

## 7. Gotchas

- `DomScreenRouter` mirrors the screen id onto `body[data-screen]`, so `[data-screen="main-menu"]` matches body **and** the panel; use `section[data-screen=…]` for the panel.
- `e2e/` is type-checked by `tsconfig.node.json` (lib ES2022, no DOM). Nothing inside `page.evaluate` may name `document`/`window` types; importing DOM-free value modules from `src/` (`EARTH_MAP`, `BIOME_IDS`, `SETTLEMENT_SCALES`) works.
- Production build (`vite preview`) has no `window.__tut__` hooks; run hook-based checks against the dev server. Since #209 it does include `mapgen-preview.html`.
- Chromium localStorage is ~5 MB per origin. To force an autosave failure **clear storage first**, then fill with 512 KB chunks, then 64 KB, 4 KB, 256 B, 16 B, 1 B until each throws. Filling around an existing autosave lets the next save succeed (same key, same size).
- Since #78 the lose-run must watch `body[data-screen]` for `game-over` after every Advance day click; the hand-off happens one microtask after the outcome is set, so a click-then-read loop sees the button vanish.
- The overworld picking flow's very first click after New game occasionally selects nothing (once in ~60 runs); the flow retries that click once before counting a miss.
- Keyboard shortcuts on the tactical screen now issue real commands (`o` = overwatch spends AP, Enter ends the turn): run intent probes last, or on a unit you do not need afterwards.
- The tactical screen does not set `body[data-last-command]` (only the mapgen preview does); judge a tactical command by the state change (`activeMission` in the autosave: `pos`, `ap`, `turn`, `log.length`) and the banner's `[data-role="status"]`.
- `__tutTactical__.unitScreenPosition` returns the tile centre under the unit (same as `tileScreenPosition`); click 10–30 px above it to hit the mesh, and expect the front unit to win when deploy tiles overlap in screen space.
- Since the notice bar (#217 fix) `#ui` holds `div#notices` beside the active `section[data-screen]`; count screens with `#ui section[data-screen]`, not `#ui > *`.
- Since #379 pan is clamped: a "pan off screen" check must now expect markers to stay in view.
- Since #77 an event can appear on any tick and blocks Advance day and the top bar: every scripted tick or navigation answers `[data-role="event-dialog"] [data-choice-id]` first; measurements that compare two ticks (upkeep, stipend) must skip ticks on which an event was answered. Since #83 Continue on the results screen advances the day.
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
