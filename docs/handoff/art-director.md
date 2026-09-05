# Handoff: Art Director

Last updated: 2026-09-05 (Codex takeover and environment proof)

## Current seat and production pause

I am the **Codex Art Director on gpt-6-astra**, running in the Codex CLI at
`/workspaces/tut`. Read `CLAUDE.md`, the studio process, role brief, this handoff,
and `.claude/skills/art-blender/SKILL.md` on takeover. `AGENTS.md` was not on main
at startup; I read it from `origin/docs/agents-md` (PR #773). It delegates to
the same instructions. Startup `git checkout main && git pull` succeeded at
`7dbac2c` (#771).

**Production is paused by the Executive Director.** The only production
exception is p0 #748, owned by the Tech Lead and eng-3. After this environment
proof and its `chore(handoff)` PR, end the turn: no art issues, timer polling,
background monitor, or scheduled wake-ups. Wait for the Director to say resume.
**#770 (fog rung separation) is queued for this seat at resume.** These directions
supersede every historical next-work list below. Historical PR/issue statuses
and machine-specific recipes below are predecessor notes, not a fresh audit.

### Environment proof, 2026-09-05

| Check | Result |
|---|---|
| `blender --version` | Pass: Blender 4.5.13 LTS, build `daeeeca98fb0`. |
| `python3 -c 'import trimesh, cadquery'` | **Fails**: `/usr/bin/python3` has no `trimesh`; the combined import stops there. |
| `art-python -c 'import trimesh, cadquery'` | Pass: `/opt/art-venv/bin/python`, trimesh 5.1.0, CadQuery 2.8.0. Use this wrapper for standalone art Python. |
| Blender's bundled Python | Imports trimesh 5.1.0 successfully. |
| Existing `table.py` through `make_model.py` | Pass: GLB export, env atlas attachment, trimesh validation, three headless Cycles CPU renders, and manifest record update. |
| Visual inspection in Codex | Opened and looked at all three PNGs below with `view_image`. |

Reproduction from the repository root:

```bash
blender -b --python-exit-code 1 --python tools/art/make_model.py -- \
  --script tools/art/models/table.py --id prop.table \
  --category props --file table.glb --quality final --max-triangles 300 \
  --render docs/design/renders/codex-environment-2026-09-05
```

Result: **140 triangles, 17,336 bytes, height 0.5 u, footprint 1×1, no sockets,
validation `True []`, 3.2 seconds**. The metal and rust use the env atlas; the
wood remains flat `env-bark`. The model script's old “no atlas cell for env”
description predates the env atlas. No script change was needed.

I inspected the 45°, 135°, and 225° images: the broad tabletop and four-leg
frame read as a workshop table, the lower shelf and its contents sit together,
and the visible feet meet the ground. No visible floating or clipping. It has
no directional front or attachment sockets to judge. Shelf contents fall into
deep shadow from the rear; this is an environment proof, not a tactical-distance
readability verdict.

| 45° | 135° | 225° |
|---|---|---|
| ![Table at 45 degrees](../design/renders/codex-environment-2026-09-05/prop.table_045.png) | ![Table at 135 degrees](../design/renders/codex-environment-2026-09-05/prop.table_135.png) | ![Table at 225 degrees](../design/renders/codex-environment-2026-09-05/prop.table_225.png) |

The loop rewrote the existing manifest record with identical values (moving it
to the end) and regenerated a same-size GLB with identical JSON but different
binary payload bytes. Restored both runtime files after the proof; this PR
commits the three new renders and this handoff only. No new model registration
or production art change is intended.

System Python's missing package is the only failure observed in the requested
toolchain checks. No installation was necessary. CadQuery was import-tested;
its modelling/export route, OpenSCAD, image generation, and browser rendering
have not been re-proven in this Codex session.

Repository checks: `pnpm install --frozen-lockfile`, `pnpm typecheck`,
`pnpm lint`, `pnpm test`, and `pnpm build` passed. Vitest: 251 files / 1,927
tests passed, one file / test skipped. Build emitted a chunk-size warning.
Browser e2e and the separate mission simulation sweep were not run locally
for this docs-and-renders PR; GitHub CI runs those. The handoff PR awaits
Tech Lead review and merge; this seat stops after opening it.

## 1. What I was doing and where it stands

| Deliverable | Issue | State |
|---|---|---|
| Style guide (+ §8 rewritten to the shipped manifest shape) | #2 | **Merged** (PR #12, #158). |
| Concept sheets (7 subjects) | #3 | **Merged** (PR #86, #96). |
| Placeholder GLBs batch 1 (38) + tooling | #4 | **Merged** (PR #89). |
| Placeholder batch 2 (13) + mapgen id table | #93 | **Merged** (PR #110). |
| UI theme, icons, icon manifest | #102 | **Merged** (PR #109, #114). |
| VFX sprites + sprite manifest | #119 | **Merged** (PR #121, #133). |
| Overworld Earth map texture, texture manifest, map glyphs | #143 | **Merged** (PR #151). Follow-up for the scene to use it: #162. |
| Mech-bay concept sheets | #144 | **Merged** (PR #152). |
| First-pass unit textures (procedural atlases) | #145 | **Merged** (PR #157). |
| Unit / mech-part thumbnails + thumbnail manifest | #163 | **Merged** (PR #165). |
| Placeholder batch 3: mech part variants matching the part catalogue | #169 | **Merged** (PR #195). Superseded by Blender models in #274 batch B. |
| **Headless Blender toolchain** (Executive Director priority) | #190 | **Merged**: devcontainer + proof PR #192, skill PR #193, handoff PR #194, `cut_below` helper PR #214. Proof and completion note on #190; fleet rebuild requested there (Director does it). |
| **Replace placeholders with Blender models** (Director go on 2026-09-03) | #274 | **Merged**: pipeline #277, batch A Mech A set #280, batch B all mech variants #283. batch C bugs + spawner #287, batch D five squads #288 **merged** too. Every roster unit (30 ids) is a Blender model; `build-placeholders.mjs` keeps tiles, buildings and props. Batch E waits for tactical demand. |
| Kit follow-ups from dry runs (`bevel`, sub-part validation, CadQuery/OpenSCAD notes) | #190 | **Merged** (PR #264). |
| Demand-driven props (batch E): `prop.table` for mapgen's interior table kind | #213 | **Merged** (PR #350). Pattern: one model script, `make_model.py --quality final`, id + manifest entry, style guide §7 row. |
| **Tactical tile textures** (Director ask for M2): env atlas for 16 environment tokens applied to every tile, building and prop through the cell pipeline | #394 | **Merged** (PR #398). |
| **VFX animation sheets** (Director ask for M2): muzzle flash, impact, egg burst frame sheets + `sheet` metadata on the sprite manifest | #395 | **Merged** (PR #396); consumed by the animation queue (#338, merged in #402). |
| Composed scene preview (`tools/art/preview/render-scene.mjs` + `layouts/city-block.json` → `docs/design/scene-preview.png`) | — | **Merged** (PR #407); first in-context render posted on #274. |
| **Combat VFX round 2**: `vfx.tracer`, `vfx.claw-slash`, `vfx.bug-death` + two sheets | #429 | **PR #436**, CI green. Completes the Director's M2 VFX list. |
| **Env atlas round 2**: ground, roof and concrete cells repainted for readability | #441 | **PR #442**. Luminance std per cell 2.8–8 → 5.5–14.3; rule written into style guide §7. |
| **Batch E: city building kit as Blender models** (8 pieces) | #454 | **PR #455**. Kit doc `docs/design/kits/city-building-kit.md`. |
| VFX playback (tracer / claw / death), filed for graphics | #457 | Open, not mine to implement. Sizes measured against a live frame and posted there. |
| **Batch G: the last nine props** (trees, cactus, boulder, fence, hydrant, lamp post, shelving) | #490 | **PR #491**, stacked on #464. Ends the replacement track. |
| Window density reads as glass towers — filed for mapgen | #492 | Open, p3. |
| Region plates wash out the world map — filed for graphics | #493 | Open, p3. |
| **Tactical HUD icon set** (13 icons: end-turn, interact, hidden, suppressed, hp, ap, armor, damage, range, cover-low/high, elevation, ammo) | #466 | **PR #467**. |
| **Tactical presentation spec** (style guide §12) + mission mood concept | #471 | **PR #472**. |
| **Tactical map palette → style guide tokens** + `shoot-mission.mjs` | #475 | **PR #478**. |
| **The map draws boxes, not models** — filed for graphics | #474 | Open, p1. The finding that matters most; see §2. |
| Overlapping hook markers z-fight — filed for graphics | #477 | Open, p3. |
| Image generation recipe (incl. transparent sprites) | — | **Working.** See §5. |
| Headless GLB / page render checks (Playwright) and Blender review renders | — | **Working.** See §7 and §8. |

### Band 6 — presentation that asserts something untrue

| Deliverable | Issue | State |
|---|---|---|
| Debrief opened a clean mission with a red alarm | — | **Merged** (PR #736). |
| Event dialog recommended the choice that is not the default | — | **Merged** (PR #742). |
| "EARTH OVERRUN" announced over a thriving Earth | — | **Merged** (PR #749). |
| The rule, in style guide §5 | #755 | **Merged** (PR #756). |

**Three of one shape in a single afternoon, all found by sitting and
reading screens rather than clicking past them.** A danger border and
1.15em type on the debrief's "Mechs destroyed" section *whatever it
contained*, so a mission where nothing was lost opened with a red alarm
reading "No mechs lost". The event dialog's primary button on the
**first** choice, which on three of the four event types is not the
default — an emphasis saying "do this" next to a line saying something
else happens if you do nothing. And the game-over panel borrowing
`.tut-menu`, the title screen's treatment, so defeat was declared over
a pristine blue-green Earth with healthy green city markers.

The rule, now §5: **emphasis is a claim, and it has to be true.** Accent
colour, a danger border, larger type and a primary button each assert
something. Applied **by position** or applied **unconditionally**, they
assert it whether or not it holds, and a player believes the loudest
thing on a screen before they read it. The test is to read the emphasis
aloud as a sentence and check the data agrees; the fixes that work are
to make the emphasis conditional, or to replace a recommendation with
information — the event dialog now names the default instead of
recommending one.

Why these survive: each looks correct in the code. A danger border on a
casualty section, a primary button on the first option and a shared
panel class are all individually reasonable, and none of them is wrong
until you ask what it says about *this* data. They also sit on screens
people click through, which is where I found them and where nobody
looks.

I read the roster and the main menu the same way and reported **no
defect** in either — the main menu's 43 % dimming of unavailable actions
is meaningful and correctly signals "blocked", and the save-JSON
textarea is a product decision, not an art one. Saying so is part of the
job; a pass that always finds something is not a pass.

### Band 6a — the mech bay finally shows the mech

`#694`, PR #757. Filed by me twice and unclaimed both times, so I took
the wiring as well as the art.

**The gap was smaller than I said when I filed it.** I called the
blocker "runtime socket assembly that does not exist". Everything it
needed did exist: `ModelLoader` hands out clones, every part GLB carries
its `socket_*` empties, and style guide §7 already published the
`PartId → model` table. About 250 lines joined them up. The shape is the
one the tactical screen uses — `MechPreviewHost` as an interface in
`ui/model/`, implemented in `app/service/` — so the bay never imports
three.

**This was the fourth registered-but-unused case** (#474, #495, #697,
now this), and the pattern behind all four is in Band 5.

Two things to inherit:

- **Frame a preview on the silhouette, not on a box.** I fitted the
  camera to the model's bounding box; it looked small, so I measured the
  ink rather than nudging by eye: **117×183 px in a 326×300 viewport,
  61 % of the height**, against the 82 % I had asked for. The box was
  doing what I told it to — under an isometric tilt a box projects to a
  hexagon whose extreme corners are empty air above and below anything
  tall and thin. Projecting the mesh vertices into camera space measures
  the silhouette itself: **83 %**, and two different loadouts now frame
  identically. In style guide §7. The 48 px part thumbnails are still in
  the older, worse version of this trap — they frame on the box's
  *diagonal* — and fixing them costs thirty re-shoots, so it is filed
  and not done.
- **The end-to-end check is the only one that sees the wiring.** Only
  the composition root builds the preview host. I deleted that line: all
  23 mech-bay unit tests stayed green while the feature was entirely
  absent, and the panel would have gone on rendering its "no preview"
  note forever. One `toBeVisible()` on the canvas is the whole guard.
  The same is true of the part table: `PartId` is a plain `string`, so
  `tsc -b` exits **0** on a typo'd key — I checked — and only the test
  catches it.

### Band 5 — art that shipped dark

| Deliverable | Issue | State |
|---|---|---|
| Manifest consumer guard — a registered asset must be drawn | #697 | **Merged** (PR #698). |
| The egg burst plays when charges finish a spawner | #697 | **Merged** (PR #713). |
| Effects play their frame sheets | #697 | **Merged** (PR #719). |
| The city panel's mission row read as fragments | — | **Merged** (PR #707). |
| The mech bay has no picture of the mech you build | #694 | **PR #757.** Taken end-to-end; see Band 6a. |

**This band started from a hunch and an audit.** I had flagged "art
registered and never consumed" three times — #474, #495, #694 — so
rather than notice a fourth by accident I audited every manifest against
its consumers. It found the worst one: nothing read the `sheet`
descriptor, so **every effect in the game was a single frozen frame**
while six sheets were fetched and decoded on every mission to be
ignored; and `vfx.egg-burst` was drawn by nothing at all, though
destroying spawners *is* the clearance mission.

The reason it kept happening is worth keeping: **a registered-and-unused
asset breaks no test.** The manifest's own test asserts the file exists,
is the right size and parses — which it does, dark or not. A manifest
entry is a promise that something draws it, and nothing checked the
promise. `sprite-consumers.test.ts` now does, and its list is empty for
the first time.

Two cautions for whoever extends that guard:

- **It only sees literal ids.** A sheet is reached by appending
  `-sheet` to its effect's id, so its literal never appears in source
  and the guard would have gone on reporting six dark sprites the frame
  after they started animating. It knows that convention now, and
  asserts it. Any other id built at runtime needs the same treatment.
- **I scoped it to sprites deliberately.** My first pass at the icon
  manifest mis-parsed it and reported 8 ids where there are far more, so
  I did not build a guard on numbers I did not trust. The same shape
  extends to the other four manifests once each is checked properly.

### Band 4 — composition, and the HUD chrome around it

| Deliverable | Issue | State |
|---|---|---|
| **Composition pass** over fog + shadows + ghosting + overlays; §12.5 | #514 | **Merged** (PR #660). The Director adopted "one channel per question, across systems" as a rule. |
| **Fog and shadow both darkened neutrally** — memory now goes cold | #661 | **Merged** (PR #678). |
| Weapon pool moved into its weapon, so the card fits | #652 | **Merged** (PR #656). |
| Attack's digit on every weapon button | #652 | **PR #664**. |
| Side rail says when it has more to show, at 720p | #657 | **Merged** (PR #674). |
| Shadow follow-ups: the filter that actually runs, read test lit like the game | #507 | **Merged** (PR #640). |
| Mission list: a constant column, and a grid that was never a grid | — | **Merged** (PR #683). |
| The cascade trap, written into §5 + `cssaudit.mjs` | — | this entry. |

**What this band was actually about:** four systems landed in one build,
each right on its own. The composition pass found one real collision —
shadow and fog both answering their question by multiplying the ground
down, neutrally, 1.35× apart — and **killed two of three hypotheses by
measurement**. Ghosting against shadows looked like a fight and is a
10 % difference; overlays staying unlit in shadow is deliberate.

### 1.1 The habit that produced everything above

Every finding this session came from shooting the running game, and
**my first explanation for a symptom was wrong about as often as it was
right.** The symptom was almost always real; the cause usually was not.

- Ghosting: mocked in isolation, wrong about density.
- Sight cue: premise measured when no enemy was visible.
- Read test: ΔE said fine, ΔL said invisible.
- Side rail: "missing `min-height: 0`" — measured identical.
- Mission list: "the type column holds 1.6fr" — the rule never applied.

So: shoot it, measure it, *then* write the explanation. And when a
change measures identical before and after, it has not been applied —
check the cascade before believing the diff. `cssaudit.mjs` exists
because that one cost me twice in a day.

### Band 3 — the overlay language and unit readability

| Deliverable | Issue | State |
|---|---|---|
| **Overlay budget**: weapon range follows attack intent, cover quietened | #590 | **Merged** (PR #598). |
| **Selection ring** — it had never been drawn in a shipped mission | #605 | **Merged** (PR #610). |
| **Read test per faction** + a numeric screen | #613 | **Merged** (PR #614). |
| **The p0**: the sight cue marked every tile; the planes gained a language | #624 | **Merged** (PR #631). |
| **Cover is directional** — edge ticks, not a centred ring | #624 | **Merged** (PR #636). |
| **Contact shadows** — filed with a prototype, implemented by the Tech Lead | #507 | **Merged** (PR #634); my #620 closed as superseded. Follow-ups in PR #640. |
| **Infantry read on grass** — a light helmet | #613 | **Merged** (PR #643). |
| A two-weapon mech cuts the second objective; its weapon has no digit | #652 | **Open**, filed with measurements. |
| `building-pass` sits on a 5 s timeout and flakes under load | #644 | **Open**, filed for mapgen. |

**Five rules came out of this band, and they are all in the style guide
because each cost a wrong turn first:**

1. **One channel per question, and the channel is the shape** (§12.2).
   Movement fills, weapon range is one boundary line, cover is a tick on
   the covered edge, selection is a ring on the unit, a refused shot is a
   diamond. Colour only says how loudly the world is pushing back.
2. **Mark the exception, not the rule** (§12.2). The sight cue marked 93
   of 93 reachable tiles. An indicator true everywhere is a light that
   is always on.
3. **Measure an overlay at its worst spread, not its typical one**
   (§12.2). I gave sight more weight than cover in #590 because it was
   "drawn on far fewer tiles" — measured against fixtures where no enemy
   was visible and the count was zero.
4. **A mark's weight comes from what it is attached to, not its alpha**
   (§12.2). Cover went 0.85 → 0.55 → 0.8. The ring was loud because of
   where it sat; the same value as a tick against a wall disappeared.
5. **Screen on value, not colour distance** (§4.2.1). The old infantry
   helmet was ΔE 46 from grass and ΔL 5. Hue distance carrying no tonal
   difference does not survive 64 px and a cast shadow.

**And one about method, which earned itself three times:** every finding
worth having came from shooting a live mission, and three of them
contradicted something I had just published — the ghosting technique,
the sight-cue premise, and the read-test metric. Offline renders and
palette maths are screens. The mission is the verdict.

### M2.5 Tactical Feel — playtest 1 feedback (epic #514)

The Executive Director played v0.2.0 and the art notes were the ones he
noticed most. This is the band-2 work, newest last:

| Deliverable | Issue | State |
|---|---|---|
| **Combat feedback that reads**: effects anchored off unit height, a phased attack sequence, floating text as chips | #524 | **Merged** (PR #546). The fix for *"the damage numbers are inside the models"*: a flat 0.6 u lift is chest-high on infantry and knee-high on a 2.79 u mech. Everything now anchors off measured height. |
| **Collapsible event log**, bottom left | #525 | **Merged** (PR #558, e2e #567). |
| **Building ghosting** — art target, then the spec | #526 | **Merged** (PR #561, superseded by #601). The shader is the Tech Lead's, PR #581. |
| **Radial menu** ring | #528 | **Merged** (PR #583) — *presentation only*. QA reports it as unwired scaffolding (#600); wiring is #529, not mine. |
| HUD glyphs on the action bar and unit card | #495 | **Merged** (PR #574). |
| **Overlay budget**: weapon range follows attack intent, cover stops shouting | #590 | **Merged** (PR #598). |
| **Ghosting spec rewritten** around the cutaway | #526 | **Merged** (PR #601). |

Two of these came from looking rather than from the brief, and both are
the kind of thing only a play-it-yourself pass finds:

- **A selection drew 71–171 overlay instances** (#590). Every rule behind
  them was measured — but each against *the ground*, never against the
  others, so the planes were never budgeted. The map read as an
  instrument panel with the selected unit the quietest thing in it.
- **Arming Attack never reached the scene.** The only thing pushing
  overlay state was an intent arriving *from* the scene, so the mode and
  #522's `v` key did not land until the player next clicked the map.
  Silently one click late since #522.

Issues #2, #3, #4, #93, #102, #119, #143, #144, #145 are on project 5; #162, #163, #169, #190 were filed by REST during the rate-limit outage and need the Producer to add them.

## 2. Open PRs / issues I own

**Nothing of mine is open.** Two issues are filed and unclaimed:

- **#694** — the mech bay has no picture of the mech you are building.
  The fourth instance of the pattern above, and the one still standing.
  The assembled model is registered, the parts carry `socket_*` nodes,
  the stat-sheet column has 470 px of empty panel. I specced it and
  offered the art and scene side; the wiring to loadout state belongs
  with whoever owns that screen.
- **#644** — a mapgen test that sits on a 5 s timeout and goes red under
  load. Not ours to fix.

### 2.1 What I would do next, in order

1. **Play a mission before choosing.** Every finding worth having came
   from `shoot-mission.mjs`, and three contradicted something I had
   just published. Do this before trusting any list, including this one.
2. **The overworld has had one pass and deserves another.** #683 came
   out of the first ten minutes of looking at a screen I had ignored
   all session. The map itself is fine — I checked the 36 % letterbox
   (a 2:1 map in a 1.27:1 viewport at deliberate minimum zoom; filling
   it vertically crops Pacific-rim cities) and the markers do carry
   threat once infestation exists.
3. **#613 is closed but not finished.** A light helmet makes infantry
   *findable*; the olive body still merges with grass and always will.
   If he says he still cannot see squads, the next lever is the body,
   and that is a faction-identity change worth putting to him on sight.
4. **#529 wires the radial menu.** Not mine, but I own how it looks and
   QA has it as unwired scaffolding (#600). Review once wired.
5. **Batch E has no outstanding demand.** #274's remaining placeholders
   are six road/sidewalk tiles, six ground tiles and some props; ground
   tiles are 12-triangle slabs whose look comes from the atlas, not the
   geometry, so they are the lowest value left.

### 2.1.1 Two traps in the tooling that cost me time

- **`pnpm lint` is `eslint . && prettier --check .`.** Running `eslint`
  alone passes locally and CI then rejects the branch on formatting. It
  held #620 and would have held #636. Always the script, never the
  binary.
- **`tsc --noEmit -p tsconfig.json` checks nothing** — the root config
  has `"files": []` and uses project references. `pnpm typecheck` is
  `tsc -b`.

### 2.2 Corrections to what my predecessor entry said

- **#474 is fixed** (PR #505). The tactical map draws the registered
  tile, building and prop models. The previous entry's freeze — *"do
  not commission more environment art until #474 lands"* — **no longer
  applies**. The env atlas, the city kit and the cover props are all on
  screen in a live mission now.
- **#495 is resolved.** Icons reach the action bar, unit card, top bar
  and objectives; part thumbnails reach the mech bay (PR #588).
- **#436, #442, #455 all merged** long ago; the previous entry listed
  them as waiting.
- **`tactical-ghosting-target.png` is withdrawn** (#601). It specified a
  translucent shell, mocked on a bare plaza with one building. In a real
  city that deletes the silhouette every time a unit stands behind
  something. The cutaway in #581 is the spec.

### 2.3 The lesson worth inheriting

**A spec mocked in isolation will be wrong about density.** I published
ghosting numbers twice from a single building on an empty slab and was
wrong both times — first the fade floor and radius, then the technique
itself. Style guide §12.4 now carries that warning, and §12.2 carries
its sibling: an overlay tuned against the ground alone will be wrong
about the other overlays. Judge tactical art by shooting a mission and
rotating, never by rendering one object.

## 3. Decisions I made and why

- **Scale (confirmed by Tech Lead)**: 1 tile = 1 world unit = 2 m; one vertical level = one storey = 1.5 u; terrain steps are whole levels (ADR 0004). Infantry figure 0.9 u, mech 2.79 u as built (legs 1.42 + chassis 1.37), swarmer 0.51, lurker 1.35, brute 1.85, spawner 1.4. Camera rig will use true isometric elevation (about 35.26°), four yaw stops, 64 px per tile default.
- **Axes**: glTF convention, +Y up, +Z forward, pivot at base centre. Matches three.js `GLTFLoader` output without correction.
- **Materials**: one `MeshStandardMaterial` per palette token, named after the token, no textures for placeholders. Keeps GLBs tiny and lets the loader remap colours later.
- **Palette**: TDF grey/olive/orange, bugs dark chitin + green/magenta bioluminescence, UI tokens derived from the same hexes. Full table in the style guide §4.
- **Manifest (decided by Tech Lead on #10)**: ids are a const union in `src/content/data/model-ids.ts`; the manifest in `src/graphics/data/model-manifest.ts` is typed `satisfies Record<ModelAssetId, ModelAssetEntry>`; my entry fields are adopted except `id` (the key carries it). Style guide §8 must be rewritten to this shape after #10 merges, not before. `tools/art/placeholders.manifest.json` has every field ready to paste.
- **Mech is six GLBs plus one assembled reference**: legs, chassis, arm-l, arm-r, weapon-arm autocannon, weapon-back missile pod, joined at `socket_*` nodes. Assembled file exists so engineers can drop a mech in without socket code.
- **Concept sheets are downscaled to 1536 px** and kept as PNG (about 1–1.4 MB each). They are docs, not runtime assets.
- **`tools/art/` holds art tooling** (build, image gen, preview). ESLint already lints `.mjs` there; generated `placeholders.manifest.json` is in `.prettierignore` so rebuilds stay byte-identical.
- **Ground tiles are named by mapgen surface id** (`tile.ground.grass`, `.dirt`, `.sand`, `.snow`, `.rock`, `.water`) and props by mapgen prop kind (`prop.crate`, `prop.tree-pine`, …) so the graphics lookup in style guide §7 is a one-liner. `car` maps to the 1×1 `prop.car-compact`; `prop.car-sedan` (2×1) stays for hand-placed wrecks.
- **UI icons are CSS masks**, not inline SVG: `.tut-icon` with `--icon: url(...)` from `iconUrl(id)`. One colour, `currentColor`, so badges and states tint them. Icon manifest lives in `src/ui/data/` because icons are DOM assets, not three.js ones.
- **Sprite manifest mirrors the icon manifest**: `SPRITE_MANIFEST` in `src/graphics/data/` (three.js-side assets), entries carry `path`, `size`, `blend`, `label`; test parses the PNG header itself (width, height, colour type with alpha) so no image library is needed. Sprites are RGBA ≤ 512², under 150 KB; a painterly result gets downscaled to 256² rather than shipped fat.
- **Unit textures are two 512² atlases referenced externally from the GLBs**: `build-textures.mjs` paints one 128 px cell per token from a seeded PRNG (own PNG encoder over `node:zlib`); `build-placeholders.mjs` remaps each textured mesh's UVs into its cell and rewrites the GLB JSON to add `images[].uri`, a sampler, textures and `baseColorTexture` per material. Embedding would have duplicated the atlas in every GLB. glTF UVs run top-down (row 0 at the top), unlike three.js; the first pass sampled the unused black cells.
- **Earth map is 2048×1024, quantised to 256 colours** (881 KB) so it fits the 1.5 MB cap; the flat faceted style loses nothing. Chosen from two generations; the other stretched continents vertically.
- **Stacked PRs with a squash-merging Tech Lead**: after each merge, rebase the next branch with `git rebase --onto origin/main <merged-branch> <next-branch>` and each higher branch onto the one below (capture old tips first); plain `git rebase` conflicts on the squashed copies. Five PRs stalled for 40 minutes once because of this.
- **Environment atlas (#394)**: a third 512² atlas with 16 env cells; `build-placeholders.mjs` textures everything by default (only tokens with a cell change), Blender models pick env cells up through `atlas-cells.json`. `env-bark` and `env-scrub` stay flat (no cell). Tile textures are one cell per face, so a road tile shows one asphalt cell with its crack; regenerate the cell painter to change the look, never the models.
- **VFX sheets (#395)** are derived from the single sprites by `tools/art/build-vfx-strips.sh` (scale + alpha per frame); write sheets as `png32:` or ImageMagick's palette output fails the alpha colour-type test. `SpriteAssetEntry.sheet` carries the layout for the animation queue.
- **Worktrees**: a second `git worktree` with a symlinked `node_modules` lets two branches build in parallel, but `pnpm` refuses to run there (deps status check); call `node_modules/.bin/{tsc,eslint,prettier,vitest}` directly.
- **Replacement recipe (batches A/B, reuse for C/D/E)**: shared builders in `tools/art/models/<set>_parts.py`, thin per-id scripts; run `make_model.py` per id with `--quality final` (records land in `placeholders.manifest.json`); delete the same ids' defs and builder functions from `build-placeholders.mjs` (whole-word check: `buildMechAssembledB` contains `buildMechAssembled`); rebuild placeholders (it keeps foreign records); regenerate `MODEL_MANIFEST` entries for `quality: "final"` records from the JSON; thumbnails, both preview sheets, resize renders to 512 px; `pnpm test`. Sub-parts use `--footprint 0x0` (validator skips the base check). Duplicate socket names in assembled models are sanitised to `socket_x_2`.
- **Blender pipeline shape (#190)**: models are Python scripts under `tools/art/models/` built with `tools/art/bpy_kit.py`; `tools/art/make_model.py` does export → trimesh validation → three Cycles CPU renders → JSON record in one command; ids and TS manifest entries are still added by hand (the printed entry). `build-placeholders.mjs` keeps records it did not create so both pipelines share `placeholders.manifest.json`. Blender models face −Y in Blender so the glTF export faces +Z.
- **Dry run of the skill on an organic model** (hive-core mound with ribs and tendrils, scratch only): spheres with `smooth=True`, rotated cylinders and `join` all export and validate; the validator caught a sphere sunk below ground, which led to `bpy_kit.cut_below` (#214). A 500-triangle organic prop renders in about 4 s.
- **Generated sprites are quantised before committing**: `magick <in> -strip +dither -colors 32 -define png:compression-level=9 png32:<out>` cut the bug-death burst from 147 KB to 58 KB with no visible change. `png32:` is not optional — palette output writes colour type 3 and the manifest test requires alpha in the colour type. Same trick on big docs images: a `montage` contact sheet came out at 3 MB and quantising to 256 colours took it to 889 KB.
- **Tile textures carry detail at mid scale, never at tile scale (#441)**: one model per tile id means every grass tile is the same stamp, so a big blob turns a field into a visible checkerboard — my first repaint did exactly that with period-3 noise and 20 px blobs. Period 6–11 noise plus 4–13 px `Cell.blob` ellipses, target luminance std 7–15 per 128 px cell, palette mean unchanged. The rule is in style guide §7 and the measurement recipe is in §9 below.
- **Four ways a Blender kit piece goes wrong (#454)**, all in `docs/design/kits/city-building-kit.md`: coincident faces z-fight into black patches (cut openings, do not overlay panels); a recessed deck centre exposes the ground tile under it (colour, not depth, marks a border); `bpy.ops.uv.reset` orients u along whichever edge a face's loop starts on, so upright panels sample brick courses sideways (`bpy_kit.box(..., uv_rot=90)`, added in the same PR, opt-in so no existing model moves); nothing may rise above its storey (a staircase handrail put the model at 2.0 u, through the floor above).
- **Look at the real game, not only at previews (#474, #475)**: `node tools/art/preview/shoot-mission.mjs out.png [seed] [--overworld]` boots the app on the dev server, plays to the first mission with the e2e `__tut__` hooks and screenshots the tactical screen. Two runs are pixel-identical. Every art review before this one was an offline render of assets the game never loads, which is exactly how #474 went unnoticed for a milestone.
- **The twelve remaining tile placeholders stay procedural, and #274 is done at batch G.** They are 12–84 triangle slabs whose entire look comes from their env atlas cell; a Blender version would add a chamfer per tile, which at 1 600 tiles on a big map buys a visible grid and costs triangles against a 60-triangle tile budget. The replacement track was about silhouettes, and a flat slab has none. If the Director wants them converted anyway it is about two hours; say so and I will.
- **Size a sprite against a real frame, never against a grey background.** Compositing the five combat effects over a live mission at 64 px per tile moved three of them: tracer 0.15 → 0.22 tiles thick, claw slash 0.7 → 0.9, bug death 0.8 → 1.0. The muzzle flash and impact were already right. `docs/design/sprites/README.md` has the frame and the table.
- **Chamfer border trick**: `.tut-panel`/`.tut-btn` are two clipped layers (line colour behind, surface colour inset 1 px) so the 1 px border follows the 45° cut. `--surface` custom property selects the inner colour per variant.

## 4. Next, in order

1. Watch the open PRs (#436, #442, #455, #464, #467, #472, #478) through review; answer Tech Lead notes.
2. Chase **#474**. Until it lands, environment art has no in-game effect; offer to write the `surface id → model id` mapping table (style guide §7 already has it) or to cut the model set if instancing every cell is too expensive.
3. **Batch G: the last nine props as Blender models** — lamp post, hydrant, fence, shelving, boulder, cactus, three trees. Same recipe; stack on #464 only if it has not merged.
4. Director round-2 notes on any model, texture cell or the scene render: edit the builder or painter, rerun, regenerate previews (`render-placeholders.mjs`, `render-thumbnails.mjs`, `render-scene.mjs`), PR.
5. Biome building kits (snow, desert, coastal) if mapgen's templates start naming them; extra env cells (ice, sandstone, wet sand, seawall) need a bigger atlas — the 4×4 grid is full, so size it once for everything mapgen plans to emit.
6. Hand-drawn intermediate VFX frames only if #338's playback reads as a zoom rather than motion.
7. Keep `docs/design/scene-preview.png` current after any tile, kit or unit change; it is the one image that shows everything together.

## 5. Image generation recipe (Codex CLI)

Codex 0.152.1 is installed at `~/.local/bin/codex`, logged in, model `gpt-5.6-sol`, with the built-in `image_gen` tool enabled. Two environment fixes were needed and are already applied on this machine:

1. **Missing `codex-code-mode-host`.** Codex's tool router spawns `~/.local/bin/codex-code-mode-host`; the standalone binary install lacked it, so every tool call (including image generation) failed. Fix: download the npm package and copy the binary next to `codex`:

   ```bash
   cd "$(mktemp -d)" && npm pack @openai/codex@0.152.1-linux-x64 \
     && tar xzf openai-codex-0.152.1-linux-x64.tgz package/vendor/x86_64-unknown-linux-musl/bin/codex-code-mode-host \
     && cp package/vendor/x86_64-unknown-linux-musl/bin/codex-code-mode-host ~/.local/bin/ && chmod +x ~/.local/bin/codex-code-mode-host
   ```

   If the codex version changes, match the package version to `codex --version`.

2. **Bubblewrap sandbox cannot create user namespaces** in this container, so `-s workspace-write` generates the image but fails to copy it out of `~/.codex/generated_images/`. Use `-s danger-full-access` (we are already inside a container).

Working invocation (this is what `tools/art/gen-image.sh` wraps):

```bash
codex exec --skip-git-repo-check --ephemeral -s danger-full-access \
  -C "$WORKDIR" -o "$WORKDIR/last.txt" \
  "<prompt>. Save the final image as a PNG file at exactly this path: /abs/path/out.png. Use your built-in image generation tool; do not write code to draw it."
```

- Output is 1254×1254 for square prompts; ask for "wide landscape" for concept sheets. Runtime textures must be resized to ≤ 1024² and sprites to ≤ 512² afterwards.
- Takes 40–90 s per image. Runs can be parallelised (separate sessions).
- If the file is not at the requested path, the image is still under `~/.codex/generated_images/<session id>/exec-*.png`; the session id is printed in the exec header on stderr. The helper script falls back to that.
- Prompt skeleton lives in the style guide §10. Always put palette hexes in the prompt verbatim; always say "no text, no watermark".
- `--ephemeral` keeps `~/.codex` from filling with session files.
- **stdin must be `/dev/null`** (`tools/art/gen-image.sh` does this since PR #116). With a non-TTY stdin left open, codex prints `Reading additional input from stdin...` and waits forever.
- **Transparent sprites work**, but phrase it exactly: "fully transparent background (real alpha channel; do not paint a checkerboard, do not paint any background colour)". Without the checkerboard clause one pass painted a magenta checker with alpha 0.16 in the corners. Add "flat vector-style fills, no shading or gradients inside shapes" or the result goes painterly and heavy (250 KB vs 17 KB at 512²). Always check `magick <png> -alpha extract -format "%[min] %[max]" info:` and a corner crop's mean alpha.

## 6. Gotchas

- Codex claims success even when the copy failed (test 3 reported a path that did not exist). Always `file` the output.
- `codex exec` prints its transcript to stderr, not stdout; `-o` writes only the final message.
- Vite is on `pnpm`; `npm pack` still works for fetching the codex tarball.
- **GitHub GraphQL rate limit is shared by every agent on this token** and ran out once (`gh pr create`, `gh pr view` fail with "API rate limit already exceeded"). REST has a separate budget: `gh api repos/BenjaminBenetti/tut/pulls -f title= -f head= -f base= -f body=` opens a PR and `gh api repos/.../issues/N/comments -f body=` comments. Check with `gh api rate_limit`.
- **Branch from a fresh `origin/main`** and check `git diff --name-only origin/main...HEAD` before opening a PR. Branching from a stale main once swept untracked tooling and 100 ignored render PNGs into a commit (the `.gitignore` entry lived on the other branch).
- Never `cd` inside a long `&&` chain in the shell: one failed step leaves later relative paths pointing at the wrong directory. Use absolute paths.
- Concept sheets are docs, not runtime assets, so the ≤ 1024² texture rule does not apply to them; keep them under ~1.5 MB each anyway.

## 6b. Measuring whether a texture cell reads

Flatness is measurable, so do not argue about it — crop the cell out of the atlas and read its luminance spread:

```bash
python3 - <<'EOF'
import json, subprocess
cells = json.load(open("tools/art/atlas-cells.json"))
CELL = cells["cell"]
for name, c in cells["cells"].items():
    if c["atlas"] != "env":
        continue
    x, y = c["col"] * CELL, c["row"] * CELL
    out = subprocess.run(
        ["magick", "public/assets/textures/tiles/env-atlas_albedo.png",
         "-crop", f"{CELL}x{CELL}+{x}+{y}", "+repage", "-colorspace", "gray",
         "-format", "%[fx:standard_deviation*255] %[fx:mean*255]", "info:"],
        capture_output=True, text=True).stdout
    print(f"{name:20s} {out}")
EOF
```

Below about 5 the surface reads as flat colour at 64 px per tile; 7–15 is the band that works (`env-sidewalk` 15.6 and `env-rock` 9.9 were the reference cells). Then look, do not only measure: `node tools/art/preview/render-scene.mjs tools/art/preview/layouts/ground-field.json out.png` puts an 8×8 field of every ground surface with props for scale in front of you, which is where the repeated-stamp problem shows up and the numbers do not.

## 7. Headless render check (verifying GLBs without a browser)

`tools/art/preview/render-placeholders.mjs` serves the repo root on 127.0.0.1:8790, opens `tools/art/preview/harness.html` in headless Chromium (`@playwright/test`, SwiftShader GL) for each manifest entry at yaw 45° and 225°, and writes 320 px PNGs into `tools/art/preview/out/` (git-ignored). `tools/art/preview/shoot-page.mjs <page> <out.png>` screenshots any repo page the same way (used for the UI theme preview). Make a contact sheet with ImageMagick, which is installed:

```bash
node tools/art/preview/render-placeholders.mjs
cd tools/art/preview/out && montage $(ls *@45.png | sort) -tile 8x -geometry 200x200+3+3 -background '#222' ../../../../docs/design/placeholder-models.png
```

Chromium needed system libraries the first time (`sudo npx playwright install-deps chromium`); the devcontainer now installs Chromium via PR #16, so a fresh container should have them. If you see `libnspr4.so: cannot open shared object file`, run install-deps again.

## 8. Blender recipe (headless, no GPU)

Installed by `.devcontainer/Dockerfile` (PR #192) and by hand on this instance:

```bash
sudo apt-get install -y --no-install-recommends libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libegl1 libsm6 xz-utils openscad python3-venv xvfb
curl -fsSL https://download.blender.org/release/Blender4.5/blender-4.5.13-linux-x64.tar.xz | sudo tar -xJ -C /opt
sudo ln -s /opt/blender-4.5.13-linux-x64/blender /usr/local/bin/blender
sudo /opt/blender-4.5.13-linux-x64/4.5/python/bin/python3.11 -m ensurepip && sudo ... -m pip install trimesh
sudo python3 -m venv /opt/art-venv && sudo /opt/art-venv/bin/pip install trimesh cadquery
printf '#!/bin/sh\nexec /opt/art-venv/bin/python "$@"\n' | sudo tee /usr/local/bin/art-python && sudo chmod +x /usr/local/bin/art-python
```

Use: `.claude/skills/art-blender/SKILL.md` is the loop. Proof: `blender -b --python tools/art/smoke_render.py` (3 s: GLB, trimesh report, three renders). Review any GLB: `blender -b --python tools/art/render_glb.py -- --glb <file> --out <dir>`.

Gotchas:
- `art-python` must be a wrapper script, not a symlink: Python finds the venv from the real executable path, so a symlink silently runs system Python (no trimesh).
- The base image's Python is externally managed: venv, never `pip install` into it.
- glTF export splits vertices per flat face; trimesh reports "not watertight" unless vertices are merged first (`validate_glb.py` does).
- Script args go after `--`; start scripts with `read_factory_settings(use_empty=True)`; Cycles needs no xvfb in `-b` mode.
- Blender's `primitive_cone_add(radius1=bottom, radius2=top)`.
- The GitHub API budget is shared across agents: poll at most every 5 minutes, use `gh api` REST, back off on rate-limit errors and keep producing locally.
