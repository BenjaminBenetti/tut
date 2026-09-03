# Handoff: Art Director

Last updated: 2026-09-03 (session 1, thirteenth update)

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
| **Tactical tile textures** (Director ask for M2): env atlas for 16 environment tokens applied to every tile, building and prop through the cell pipeline | #394 | PR #398 open. |
| **VFX animation sheets** (Director ask for M2): muzzle flash, impact, egg burst frame sheets + `sheet` metadata on the sprite manifest | #395 | PR #396 open; #338 briefed. |
| Image generation recipe (incl. transparent sprites) | — | **Working.** See §5. |
| Headless GLB / page render checks (Playwright) and Blender review renders | — | **Working.** See §7 and §8. |

Issues #2, #3, #4, #93, #102, #119, #143, #144, #145 are on project 5; #162, #163, #169, #190 were filed by REST during the rate-limit outage and need the Producer to add them.

## 2. Open PRs / issues I own

- PR #398 (env atlas, #394) and PR #396 (VFX sheets, #395) open. #274 (replacement track) is paused after batches A–D; batch E is demand-driven (first request, `prop.table` #213, is done). Zoom check: every unit rendered at exactly 64 px per tile through the three.js harness keeps its silhouette (style guide §1 rule 1 holds for the Blender models).

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
- **Chamfer border trick**: `.tut-panel`/`.tut-btn` are two clipped layers (line colour behind, surface colour inset 1 px) so the 1 px border follows the 45° cut. `--surface` custom property selects the inner colour per variant.

## 4. Next, in order

1. Land PR #398 (env atlas) and PR #396 (VFX sheets); remove the `wt-395` worktree afterwards (`git worktree remove`).
2. Director round-2 notes on any model or texture: edit the builder or painter, rerun, regenerate previews, PR.
3. Batch E props and kit pieces on demand (mapgen/tactical asks like #213).
4. If #338 wants hand-drawn intermediate frames instead of scaled ones, draw them at 128 px into the same sheet layout; the manifest stays as is.

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

