# Campaign Arc

> Status: **approved plan** (Executive Director, 2026-09-26). This is the guiding document for the campaign build: every engineer and agent working on progression, new missions, new species, story, or campaign tech reads it first. Architecture decisions it relies on are in [ADR 0013](../adr/0013-campaign-progression.md). The illustrated proposal is the "TUT Campaign Arc" artifact (https://claude.ai/artifact/DK93wHyKnZyrmsWPw6QKzu); where the two differ, this file wins.

## 1. Goal

An average campaign lasts **about 50 tactical missions** and ends in a win or a loss the player can see coming. It has a beginning, a middle and an end. Something new arrives every four to six missions.

Measured on `main` @ 3c812b9d, before this plan:

- The campaign could not be won. Over 40 simulated campaigns where the player won every mission, no city was ever cleared to 0. Offers start at infestation 20, and a win removes 10 + 2 × difficulty (about 14).
- 28–47 missions were open at once by mid-campaign, so choosing one carried no weight.
- The species mix (swarmer, lurker, brute at 6:3:1) was the same from mission 1 to mission 100, and every bug was melee.
- The 728 TP tech tree was finished at mission 25.

**The fix:** victory moves to a story spine. The Earth map stays the threat.

```
  Act I  Emergence      Act II  Incubation        Act III  Reclamation     Finale
  M1 ─────────── M12 │ M13 ─────────────── M32 │ M33 ─────────── M47 │ M48 ─ M50
  d1–4               │ d3–7                    │ d5–9                │ d8–10
  eggs under cities  │ hives take root         │ strike the beacons  │ the spore platform
        gate: Intel I + Live Specimen   gate: Intel II + Intact Pod   gate: Great Hives ×3 + Intel III
```

Mission numbers are targets for an average player. Acts are gated by research, so a player moves faster or slower through them depending on what they research (§4).

## 2. Final decisions

| # | Question | Decision |
|---|---|---|
| D1 | Where does victory come from? | **The finale.** Destroying the spore platform wins. Infestation and threat stay the loss condition (threat ≥ 100 is defeat). The "every city at 0" victory stub retires. |
| D2 | What gates each act? | **Research only.** No mission-count floor. Each act ends when an Intel project is researched and its story mission is won. Intel projects are priced so research is the natural limit (§4). |
| D3 | Cap the offer board? | **Yes.** At most 3, 4 and 5 open offers in Acts I, II and III. Story and hive offers are pinned on top and do not count against the cap. |
| D4 | Hive caverns | **Very large caverns that mechs can enter, full of bugs.** Most bugs sleep in chambers and wake on contact or noise (§7.5). |
| D5 | First-attempt win-rate targets for an average new player | **90% in Act I, 75% in Act II, 65% in Act III, 55% for the finale.** An experienced player must find every act easy (≥ 90%). |
| D6 | Wreck Recovery | **Keep it.** It pays parts only, gives one attempt, and expires after three days. The chassis and the pilot's rank stay lost. |
| D7 | Platform assault fails | **Every city gains +30 infestation** (capped at 100), and a hidden tech node, **Last Hope**, appears. Researching it re-offers the platform assault. A second failure ends the campaign in defeat. The average player reaches the finale at **threat 40–55** so the +30 leaves room to research Last Hope. |
| D8 | Infantry tech | **Yes.** Infantry get their own research branch. |
| F1 | Act I mix | **A third each:** Infestation Clearance, Crash Site, Evacuation. Defend Installation sits on top, offered when an installation the player built is threatened. |
| F2 | Smart enemies | **Jev drives them, on by default** when the relay is configured, for select named enemies only (Broodmother, named alphas, Sovereign). Every one has a deterministic fallback behaviour (§9). |
| C3 | Intel pricing | The three Intel projects cost about 650–700 TP together. Each needs a recovered item or event as a prerequisite (§4). |

## 3. Acts

| Act | Target missions | Difficulty band | What arrives | Ends when |
|---|---|---|---|---|
| I · Emergence | 1–12 | d1–4 | Crash Site from M2 (First Skyfall, scripted), Evacuation from M3, brutes from M5, spitters from M8, autopsies, first sitreps at M10 | Intel I *Pheromone Analysis* researched, then **Live Specimen** won |
| II · Incubation | 13–32 | d3–7 | Hive formation and Hive Assault at act start (the first hive is scripted), Hive Guard, Wreck Recovery on the first mech loss, burrowers and Tunnel Sabotage about 5 missions in, the Broodmother and Alpha Hunt about 10 missions in, the infantry branch | Intel II *Pod Telemetry* researched, then **Intact Pod** won |
| III · Reclamation | 33–47 | d5–9 | Armoured variants, two sitrep slots, **Uplink** at act start, the three **Great Hives** after Uplink | All three Great Hives destroyed and Intel III *Platform Approach* researched |
| Finale · The Platform | 48–50 | d8–10 | **Launch Window** (a defend mission), then the two-stage **Spore Platform** assault with the Sovereign | Platform destroyed: **victory** |

**Debuts within an act count missions played in that act**, so they follow the player's pace. This is not a gate: a type or species that has debuted simply joins the director's pool (§5) or the spawn table (§8).

**Difficulty.** Mission difficulty is still derived from 0.7 × city infestation + 0.3 × threat. It is then **clamped into the current act's band**. Story missions use fixed difficulties from their definitions.

Days: each mission costs at least one day, and there are about 0.75 missions a day on average. So an average campaign is about 65–70 days.

## 4. Story gates and Intel projects

Each gate is a hidden tech node (§10.1). It appears when its prerequisite item or event is acquired, and it competes with parts for the same tech points.

| Intel project | Appears when | Starting price | On completion |
|---|---|---|---|
| I · Pheromone Analysis | The first Crash Site is won (a **spore sample** is recovered) | 180 TP | Grants the **capture net** and pins **Live Specimen** |
| II · Pod Telemetry | The first Hive Assault is won (a **hive core sample**) | 240 TP | Pins **Intact Pod** |
| III · Platform Approach | **Uplink** is won (beacon tracking data) | 280 TP | With all three Great Hives destroyed, pins **Launch Window** |
| Last Hope | The first Spore Platform assault fails | about 3 missions of TP (≈ 100 TP) | Re-pins the Spore Platform assault (§6.9) |

Pacing targets, pinned by the campaign sweep (§12):

- **Average player:** reaches the finale at a median of 45–55 missions.
- **Story-only player** (researches nothing but Intel): no earlier than about mission 30–35, with stock mechs.
- **Tech budget:** the tree holds more than one campaign can buy, so research is a real choice.

A story mission that is pinned stays on the board until it is played. It does not expire, and it ignores the cap.

**Losing a story mission** delays it five days, then re-pins it. Launch Window works the same way. The Spore Platform follows D7.

## 5. The offer board and the mission director

Today each mission type has its own trigger and rolls its own offers. This design replaces that with a **mission director**, a day-tick step that keeps the board at its cap:

1. Drop expired offers.
2. Leave pinned offers (story missions, hives, Great Hives, Wreck Recovery, Defend) where they are. They do not count against the cap.
3. While the unpinned offers number fewer than the act cap (**3 / 4 / 5**), draw a mission type by the act's weights from the types that have debuted and are **eligible** today, pick its location by that type's eligibility rule, and create the offer.

Weights by act. A type that has not debuted or has no eligible location drops out, and the others are renormalised:

| Type | Act I | Act II | Act III |
|---|---|---|---|
| Infestation Clearance | 33% | 25% | 20% |
| Crash Site | 33% | 10% | 10% |
| Evacuation | 33% | 10% | 10% |
| Hive Assault (non-pinned hives) | – | 20% | 20% |
| Tunnel Sabotage | – | 20% | 20% |
| Alpha Hunt | – | 15% | 20% |

**Event-triggered offers** are pinned and sit outside the weights:

- **Defend Installation** keeps its current trigger: an installation in a region whose mean infestation is 40 or more.
- **Wreck Recovery** is offered after a mech is destroyed.
- **Hive Assault** is pinned for every hive that exists.
- **Story missions** are pinned by the gates in §4.

**Mop-up rule.** A won Infestation Clearance that leaves the city under 15 purges the city to 0. The city loses its egg overlay, so the player can see the progress.

**Offers left behind cost something.** Each type's "ignored" consequence is in §6.

## 6. Mission types

Each new type pays something the others do not, so choosing between offers is a trade. "Reuses" names existing systems to build on.

### 6.1 Infestation Clearance (shipped)

- **Objective:** destroy every egg spawner, then board the drop ship.
- **Changes:** the mop-up rule, plus species mix and sitreps by act.
- **Eligible:** a detected city at infestation ≥ 20. In Act I, from ≥ 10.
- **Pays:** credits, TP, the city's infestation cut, and the purge when the city is left under 15.

### 6.2 Defend Installation (shipped, #1175)

- **Objective:** hold at least one generator through every counted wave.
- **Changes:** from Act II, burrowers can surface inside the perimeter. Uplink and Launch Window are built on this mission.

### 6.3 Crash Site (Act I, from M2)

- **Objective:** a spore pod came down in open ground. Destroy the pod before it matures at the **end of turn 8**. Maturing releases a large wave and fails the objective. Then extract.
- **Map:** the crater / crash-site archetype (the #662 prototype): open ground, a scorched crater and scattered debris cover.
- **Eligible:** a region with at least one detected city. Every crash site starts a fresh landing (a new infestation seed of 10) at a city in that region. From Act II, regions with a sensor array are weighted ×2.
- **Scripted first one:** **First Skyfall**, the second mission of every campaign (d1).
- **Pays:** high TP (a TP reward ×1.5), the landing erased (the seeded city goes back to its pre-landing value), and the first win's **spore sample** (§4).
- **Ignored or lost:** the landing takes root as a normal infestation (+15 on the city).
- **New:** an objective timer (turn limit) and a pod objective unit.

### 6.4 Evacuation (Act I, from M3)

- **Objective:** civilians are trapped in a city. Free **3–5 civilian groups** inside buildings (a unit ends its move adjacent and uses Interact), then walk them to the drop ship. Civilians are friendly, unarmed units that the player moves. Win: at least half the groups extracted.
- **Eligible:** a detected city at infestation ≥ 25, weighted towards larger cities.
- **Pays:** credits, plus a **stipend bonus of +50% for 10 days** (population saved). Each extracted group adds to the reward.
- **Ignored or lost:** the stipend drops 10% for 10 days.
- **Reuses:** friendly objective units (generators), Interact, boarding at extraction. **New:** controllable civilian units.

### 6.5 Hive Assault (Act II)

- **Objective:** enter the cavern, destroy the **hive core** and the spawners in its chambers, then extract at the mouth.
- **Map:** a very large mech-passable cavern (§7.5).
- **Formation:** a region whose mean infestation stays at ≥ 60 for 7 days forms a hive. The first hive is scripted when Act II opens, in the worst region. The offer is pinned and never expires, but the hive **gains a difficulty step every 7 days**.
- **Engine:** a region with a hive grows faster (`hiveSpreadMultiplier`).
- **Pays:** the region is liberated. The hive is gone, its cities drop 20, and growth pauses for 10 days. Large TP. The first win recovers the **hive core sample** (§4).
- **Reuses:** spawners, the Hive Guard, the #447/#760 hive sketch.

### 6.6 Wreck Recovery (event)

- **Objective:** a mech went down. Reach the wreck, have an infantry squad strip it over **two turns**, then extract.
- **Trigger:** a mech destroyed on a lost or abandoned mission. The offer is pinned, gives one attempt, and expires in 3 days.
- **Pays:** that mech's parts, back in the inventory. The chassis and the pilot's rank stay lost.
- **Reuses:** the tech carcass harvest (interact over turns).

### 6.7 Tunnel Sabotage (Act II, about 5 missions in)

- **Objective:** the bugs are tunnelling toward the next city. Set charges on **three tunnel mouths** (Interact), survive the fuse (**3 turns**), then extract. Burrowers come up through any mouth still open.
- **Eligible:** a city at ≥ 60 whose spread cooldown is nearly over. This makes overworld spread visible and stoppable.
- **Pays:** that spread is cancelled, and the city cannot spread for 10 days.
- **Ignored or lost:** the spread happens as normal.
- **Reuses:** the breaching charge and demolition. **New:** tunnel-mouth map hooks.

### 6.8 Alpha Hunt (Act II, about 10 missions in)

- **Objective:** a **Broodmother** is laying clutches across a region. Kill her before she reaches the map edge. She lays a clutch (a new egg spawner) every 3 turns and **flees at half health**.
- **If she escapes:** she returns later, stronger (+1 difficulty, +25% HP). The briefing names her scar. This is the **nemesis record** on the overworld.
- **Trigger:** the first one is a story beat (a Broodmother sighting). After that, any region that holds a hive can offer one.
- **Pays:** the **Broodmother autopsy** (a unique part), and the region's growth drops.
- **Jev:** the Broodmother is Jev-driven by default when the relay is configured (§9).

### 6.9 Story missions

| Mission | Act | Summary | Built on |
|---|---|---|---|
| **First Skyfall** | I, M2 | The first Crash Site, d1, with a scripted pod landing near the start | Crash Site |
| **Live Specimen** | I → II | Bring a lurker to 0 HP with the **capture net** (an equipment item) instead of killing it, then extract with it. Winning opens Act II. | Clearance map, new capture action |
| **Intact Pod** | II → III | A Crash Site where the pod must **survive** to be recovered: defend it until the recovery turn. Winning opens Act III. | Crash Site, generator-style objective |
| **Uplink** | III start | Defend a tracking array through its counted waves. Winning reveals the three Great Hives and makes Intel III appear. | Defend Installation |
| **Great Hives ×3** | III | Oversized Hive Assaults on the platform's beacons, one per continent-scale region. Pinned. | Hive Assault |
| **Launch Window** | Finale | Defend the launch site. A loss delays the launch 5 days; it does not end the campaign. | Defend Installation |
| **Spore Platform** | Finale | **Two linked maps** with no repairs or swaps between them. Damage and ammo carry over. The Sovereign waits at the core. Win: **victory**. First loss: D7. Second loss: **defeat**. | Linked missions, new platform archetype |

## 7. Maps

New archetypes, each passing the ADR 0004 invariants and the property tests:

1. **Crater** (Crash Site, Intact Pod): open ground, a central crater with the pod, debris cover. Promote the #662 crater-pass prototype.
2. **Settlement + civilians** (Evacuation): the settlement pipeline with civilian placement hooks inside buildings.
3. **Settlement + tunnel mouths** (Tunnel Sabotage): the settlement pipeline with three tunnel-mouth hooks spread across the map.
4. **Wreck** (Wreck Recovery): the settlement or crater pipeline with the fallen mech's wreck as the objective hook.
5. **Hive cavern** (Hive Assault, Great Hives): see 7.5.
6. **Spore platform** (finale): two stages of alien structure. Stage 1 is the outer hull and the docking ring. Stage 2 is the core chamber with the Sovereign.

### 7.5 Hive caverns (D4)

- **Large:** bigger than any current preset, with a long footprint. Chambers are linked by tunnels **at least two tiles wide**, so mechs fit everywhere on the main route.
- **Full of bugs, mostly dormant:** each chamber holds a dormant brood that wakes when a player unit enters the chamber, attacks into it, or makes noise nearby. Only woken bugs act in the bug phase, so the cavern can hold 50+ bugs while about 10–15 act each turn.
- **Hive core:** a large destructible objective in the deepest chamber, guarded by Hive Guard.
- **Performance:** the map must render within the SwiftShader budget. Keep per-fragment work bounded and check the bug phase's length.

## 8. Bestiary

Species debut by missions played. Shares are of rolled hatches and waves, per act:

| Species | Role | Debut | Act I | Act II | Act III | Finale |
|---|---|---|---|---|---|---|
| Swarmer | Fast melee, numerous | M1 | 60 | 40 | 20 | 15 |
| Lurker | Flanker | M1 | 25 | 20 | 12 | 10 |
| Brute | 2×2 breacher | M5 (held back so its arrival is an event) | 5 | 10 | 8 | 8 |
| **Spitter** | Ranged acid. The first bug cover protects against | M8 | 10 | 15 | 13 | 12 |
| **Burrower** | Moves under the ground, surfaces beside a unit or from a tunnel mouth | Act II + 5 | 0 | 15 | 12 | 10 |
| **Armoured variants** | Armoured swarmer, lurker and brute, same AI, + armour | Act III | 0 | 0 | 35 | 30 |
| **Sovereign** | The platform's apex (GDD M4) | Finale | 0 | 0 | 0 | 15* |
| **Hive Guard** | Stationary spine thrower (ranged) that never leaves its chamber | Act II | placed in hives | | | |
| **Broodmother** | Mobile egg-layer; flees at half HP | Alpha Hunt | placed by its mission | | | |

\* The Sovereign is placed, not rolled. The 15 in its column is the share of platform waves drawn from its escort.

**Named alphas** (Alpha Present sitrep): one bug on the map gets a name, +50% HP, +1 damage and Jev control.

Each new species needs:

- a model (placeholder first, then art);
- HUD and event vocabulary;
- an AI behaviour;
- an **autopsy** node (§10), offered after its first kill.

## 9. Smart enemies and Jev (F2)

- **Who:** the Broodmother, named alphas and the Sovereign, with **at most 1–3 Jev-driven actors per mission**. The swarm always uses ordinary AI.
- **Default:** **on by default** whenever the relay is configured (`VITE_JEV_RELAY_URL`). A settings toggle turns it off. With no relay, or when any call fails, the actor uses its deterministic fallback behaviour (ADR 0012).
- **Fallback first:** each smart enemy ships with a deterministic behaviour before its Jev layer. That behaviour is what unit tests, the sim sweeps and players without the relay get:
  - Broodmother: lay clutches, keep distance, flee at half HP.
  - Alpha: its species behaviour plus focus-fire on the weakest target.
  - Sovereign: buff nearby bugs, summon guards, retreat to the core.
- **Personality:** the mission definition authors the commander and entity prompts.
  - Broodmother: protects her clutches, retreats when wounded, resents the squad that scarred her.
  - Sovereign: sacrifices the swarm to protect the core.
- **Fair play:** Jev sees only faction-shared vision, as ADR 0012 already enforces.
- **Validation:** before Act II depends on Jev, a Jev Broodmother is played in combat under fog and the result is reviewed. ADR 0012 lists distance scoring as experimental.
- **Calibration:** the win-rate targets are calibrated on the fallback behaviours. If Jev plays much harder, tune its prompts, not the targets.

## 10. Tech over fifty missions

A 50-mission campaign earns about 1,400–1,500 TP. The tree grows past that, so the player chooses.

1. **Hidden and conditional nodes (new mechanism).** A node can require a **campaign flag or item** (a spore sample, a species kill, a failed platform). It is invisible until then. Intel projects and Last Hope use this mechanism.
2. **Autopsies.** Five nodes at 20–40 TP, each appearing on the first kill of a new species. Each unlocks its counter:
   - Spitter → acid-resistant plating.
   - Burrower → a seismic sensor utility that reveals burrowed bugs.
   - Hive Guard → spine-plate armour.
   - Broodmother → a unique part.
   - Armoured carapace → armour-piercing rounds.
3. **Infantry family (D8).** Six nodes:
   - squad armour I and II;
   - better grenades (frag, then incendiary);
   - field medic training;
   - a **new squad type**: heavy weapons infantry.
4. **Intel projects.** Three nodes (§4), priced at about 45% of a campaign's income.
5. **Capstones.** Tier 3 as needed.

The #1171 pacing test changes from "the tree is finished at mission 25" to "the whole tree costs 1.3–1.6 × an average campaign's income, and parts alone are finished by about mission 35".

## 11. Sitreps

- **What:** a sitrep is a modifier decided when the mission is offered and shown on the briefing, the way the tech carcass is.
- **When:** none before mission 10. One slot at 40% chance until Act III, up to two in Act III.
- **Balance:** two of the nine help the player, so a tag can be a reason to take an offer.

| Sitrep | Effect | From | Built on |
|---|---|---|---|
| Nightfall | Sight −4 for both sides | M10 | Vision service |
| Spore Fog | Smoke clouds scattered at the start | M10 | Mech smoke system |
| City Ablaze | Burning tiles that rekindle every three turns | M10 | Fire effect |
| Salvage Rich (helps the player) | Two tech carcasses | M10 | Tech carcass |
| Local Guides (helps the player) | The map starts explored | M10 | Fog knowledge |
| Hardened Clutches | Spawner HP +50% and one extra hatch | M16 | Spawn tuning |
| Swarm Tide | Edge waves 50% larger and a turn sooner | M16 | Spawn tuning |
| Dust-off Window | The drop ship leaves on a set turn | M20 | Objective timer |
| Alpha Present | One bug on the map is a named alpha (§8) | M24 | Nemesis record, Jev |

**As built for Act I (#1179).** These numbers are placeholders until the sitreps have been played. They live in `SITREP_TUNING` (`tactical/data/sitrep-tuning.ts`).

- **Debut:** "M10" is the campaign mission number, `missionsPlayed + 1`, whatever the act. Story offers carry no sitreps. One offer never carries the same sitrep twice.
- **Nightfall:** sight is reduced by 4 but never below 3, and a sight already under 3 is not raised. Infantry see 8, mechs 10, bugs 6, turrets 8 and generators 3. Weapon range is unchanged.
- **Spore Fog:** one cloud per 576 tiles, so 4 on a small map, 9 on a medium one and 16 on a large one. Each cloud is a radius-2 diamond (up to 13 tiles) of ordinary smoke. It lasts 16 phases instead of a grenade's 4, and none of it lands within 4 tiles of the deploy zone.
- **City Ablaze:** one blaze per 1728 tiles, clamped to 2..4. Each blaze is up to 5 fire tiles on the hazard clock. It is kept 6 tiles from the deploy zone and 3 from objectives, extraction, spawns and carcasses. It relights at the start of turns 4, 7, 10 and so on. The cap exists because every fire carries a point light.
- **Salvage Rich:** "two tech carcasses" is read as **two extra**, on top of any the offer reports. They are placed in tactical at mission start, not by map generation, and priced like the offer's own (10 + 2 per difficulty). Each is reachable by infantry from the deploy zone, at least 8 tiles from it, and 4 from objectives.
- **Local Guides:** the squad's side starts with every tile explored. Terrain, nests and carcasses show at once, but units stay hidden until they are seen.

## 12. Measurement

**Campaign sweep:** `src/app/service/campaign-sweep.sim.test.ts`, run with `pnpm test:sim`. It composes the real game (`composeGame`) and drives `AdvanceDay` with modelled players.

| Player | Model | Pin |
|---|---|---|
| Average | 70% won, 10% extracted, 20% lost; takes the best-paying offer; researches parts and Intel about half and half | Finale reached at a median of 45–55 missions; threat at finale arrival 40–55; after a first platform failure, Last Hope is researched before threat 100 in most runs |
| Strong | 95% won; mostly Intel | Finale reached, and the campaign won |
| Story-only | 70% won; researches only Intel | Finale not before about mission 30 |
| Idle | Plays nothing | Defeat, as today |

**Tactical calibration (#734):** the mission sweep gets two modelled players:

- a **new player**, who hits 90 / 75 / 65 / 55 by act band;
- an **expert**, who wins at least 90% everywhere.

The gap between them must come from decisions (cover, focus fire, abilities), not dice.

## 13. Build order

Each phase ends in a campaign that can be finished. The spine ends the game after the last act that exists.

**Phase 0 · spine and measurement**

- Campaign progress state: act, missions played, story flags, items, nemeses. Save migration. ADR 0013.
- Mission-type module contract (ADR 0013), so new types plug in without editing a switch in every domain.
- Mission director with the capped board (replaces per-type triggers). Pinned offers.
- Story triggers on research. Victory on the finale.
- The mop-up rule. The hive model and growth hook.
- Species mix and difficulty band by act.
- The sitrep framework.
- Objective timers.
- Hidden and conditional tech nodes.
- The threat retune.
- The campaign sweep. #734 calibration.

**Phase 1 · Act I**

- Crash Site and First Skyfall.
- Evacuation and civilians.
- Spitter.
- Live Specimen and the capture net.
- Autopsies.
- Act I sitreps.
- Intel I.
- A Jev validation run.

**Phase 2 · Act II**

- Hive caverns and Hive Assault. Hive Guard.
- Burrower and Tunnel Sabotage.
- Broodmother, Alpha Hunt and the nemesis record, with the fallback first, then Jev.
- Wreck Recovery.
- Intel II and Intact Pod.
- The infantry branch.

**Phase 3 · Act III and the finale**

- Armoured variants.
- Uplink and Great Hives. Intel III.
- Launch Window.
- The platform archetype. Linked missions with carry-over.
- The Sovereign.
- Last Hope.
- The victory screen.

## 14. Art

- **3D models** come from the Blender kit (`tools/art/models/*.py`, one palette atlas; see `docs/design/art-tooling.md`). Placeholders come first (`pnpm art:placeholders`), because gameplay never blocks on art.
- **Concept sheets, portraits, icons and textures** are generated with the Codex CLI through `tools/art/gen-image.sh <prompt-file> <out.png>`. Each generated image is committed with a `.md` sidecar holding its prompt.
- **Verification:** every asset is checked with a same-code render A/B, never by tests alone.
