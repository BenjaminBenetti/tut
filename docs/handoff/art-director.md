# Handoff: Art Director

Last updated: 2026-09-02 (session 1, sixth update)

## 1. What I was doing and where it stands

| Deliverable | Issue | State |
|---|---|---|
| Style guide | #2 | **Merged** (PR #12); §8 rewrite to the shipped #10 shape in a docs PR (open at time of writing). |
| Concept sheets (7 subjects) | #3 | **Merged** (PR #86, #96). |
| Placeholder GLBs batch 1 (38) + tooling | #4 | **Merged** (PR #89). Registered in the typed manifest by #10. |
| Placeholder batch 2 (13) + mapgen id table | #93 | **Merged** (PR #110). |
| UI theme, 24 icons, icon manifest | #102 | **Merged** (PR #109, #114). |
| VFX sprites + sprite manifest | #119 | **Merged** (PR #121, #133). |
| Overworld Earth map texture, texture manifest, map glyphs (Director priority a) | #143 | **Merged** (PR #151); handoff comment posted on #74. |
| Mech-bay concept sheets (Director priority b) | #144 | **Merged** (PR #152). |
| First-pass unit textures: procedural atlases on unit placeholders (Director priority c) | #145 | PR open. |
| Image generation recipe (incl. transparent sprites) | — | **Working.** See §5. |
| Headless GLB / page render checks | — | **Working.** See §7. |

Issues #2, #3, #4, #93, #102, #119, #143, #144, #145 are on project 5 (Terra Under Threat).

## 2. Open PRs / issues I own

- PR for #145 (unit textures) and the style guide §8 docs PR. Both green locally.
- Offers posted, no reply yet: #74 (art delivered anyway, see #143), #42 (unit/part thumbnails).
- The Director gave three priorities in-session on 2026-09-02 (Earth map art, mech-bay concepts, unit textures); all three are delivered or in review.

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
- **Chamfer border trick**: `.tut-panel`/`.tut-btn` are two clipped layers (line colour behind, surface colour inset 1 px) so the 1 px border follows the 45° cut. `--surface` custom property selects the inner colour per variant.

## 4. Next, in order

1. Land the #145 textures PR and the §8 docs PR (address review).
2. Reply on #74 if the implementer wants a different aspect or a seam-safe edge; reply on #42 if a screen wants thumbnails (harness needs `omitBackground` + transparent clear colour).
3. Director round 2: whatever feedback lands on the mech-bay sheets or the textures. Candidates already noted in sidecars: heavy mech chassis models, alternate arm/back weapon GLBs from the concept sheets (`docs/design/concepts/mech-bay/`), snow/desert/coastal tile kits, hive core (M3).
4. Muzzle-flash 4-frame strip when tactical animation exists; normal/roughness maps only when real models arrive.

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

