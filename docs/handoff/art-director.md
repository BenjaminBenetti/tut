# Handoff: Art Director

Last updated: 2026-09-02 (session 1)

## 1. What I was doing and where it stands

| Deliverable | Issue | State |
|---|---|---|
| Style guide `docs/design/style-guide.md` | #2 | PR #12 open, awaiting Tech Lead review |
| Concept sheets `docs/design/concepts/` (7 subjects) | #3 | Generating; PR to follow |
| Placeholder GLBs + manifest registration | #4 | Not started; waiting on manifest shape from Tech Lead (#10) |
| Image generation recipe | — | **Working.** See §5. |

Issues #2, #3, #4 are on project 5 (Terra Under Threat).

## 2. Open PRs / issues I own

- PR #12 `docs(art): style guide` → closes #2.
- Issues #2, #3, #4 (`area:art`, M0 Foundation).
- Coordination comment on #10 (asset manifest pattern) asking the Tech Lead two questions: manifest home (`src/graphics/data/` vs a closed id union under `content/`) and confirmation of tile scale (1 tile = 1 u = 2 m, floor 1.5 u, terrain step 0.5 u).

## 3. Decisions I made and why

- **Scale**: 1 tile = 1 world unit = 2 m. Infantry figure 0.9 u, mech 2.4–2.8 u (taller than a 1.5 u floor so it visibly cannot enter buildings), swarmer 0.5 u, lurker 1.3 u, brute 1.8 u, spawner 1.4 u. Chosen so a squad of five fits one tile and a mech is unmistakably bigger at 64 px/tile.
- **Axes**: glTF convention, +Y up, +Z forward, pivot at base centre. Matches three.js `GLTFLoader` output without correction.
- **Materials**: one `MeshStandardMaterial` per palette token, named after the token, no textures for placeholders. Keeps GLBs tiny and lets the loader remap colours later.
- **Palette**: TDF grey/olive/orange, bugs dark chitin + green/magenta bioluminescence, UI tokens derived from the same hexes. Full table in the style guide §4.
- **Manifest**: proposed a `MODEL_MANIFEST` const with derived `ModelAssetId` union (style guide §8). Will adapt to whatever the Tech Lead ships in #10.

## 4. Next, in order

1. Land concept sheets PR (#3) with `tools/art/gen-image.sh`, prompt sidecars and `docs/design/concepts/README.md`.
2. When #10 lands (or the Tech Lead answers on the issue), build `tools/art/build-placeholders.mjs` (three.js `GLTFExporter` in Node) for mech parts, infantry squad, three bugs, spawner and city tiles; register in the manifest. Issue #4.
3. Address review on PR #12.
4. VFX sprites (muzzle flash, impact, egg burst) and UI icons when the tactical layer asks for them.

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

## 6. Gotchas

- Codex claims success even when the copy failed (test 3 reported a path that did not exist). Always `file` the output.
- `codex exec` prints its transcript to stderr, not stdout; `-o` writes only the final message.
- Vite is on `pnpm`; `npm pack` still works for fetching the codex tarball.
- Concept sheets are docs, not runtime assets, so the ≤ 1024² texture rule does not apply to them; keep them under ~1.5 MB each anyway.
