# Art tooling recipes

Environment notes for the scripts under `tools/art/`. Salvaged from the Art Director's handoff on 2026-09-15. The model loop itself is `.claude/skills/art-blender/SKILL.md`; the style rules are `style-guide.md`.

## 1. Image generation (Codex CLI)

`tools/art/gen-image.sh <prompt.txt> <out.png>` wraps this invocation:

```bash
codex exec --skip-git-repo-check --ephemeral -s danger-full-access \
  -C "$WORKDIR" -o "$WORKDIR/last.txt" \
  "<prompt>. Save the final image as a PNG file at exactly this path: /abs/path/out.png. Use your built-in image generation tool; do not write code to draw it."
```

Environment fixes the script assumes:

1. **`codex-code-mode-host` must sit next to `codex`.** The standalone binary install lacks it, so every tool call fails. Fetch it from the npm package matching `codex --version`:

   ```bash
   cd "$(mktemp -d)" && npm pack @openai/codex@<version>-linux-x64 \
     && tar xzf openai-codex-<version>-linux-x64.tgz package/vendor/x86_64-unknown-linux-musl/bin/codex-code-mode-host \
     && cp package/vendor/x86_64-unknown-linux-musl/bin/codex-code-mode-host ~/.local/bin/ && chmod +x ~/.local/bin/codex-code-mode-host
   ```

2. **Bubblewrap cannot create user namespaces in the container**, so `-s workspace-write` generates the image but cannot copy it out. Use `-s danger-full-access` (we are already inside a container).

Behaviour to know:

- Output is 1254×1254 for square prompts; ask for "wide landscape" for concept sheets. Runtime textures are resized to ≤ 1024² and sprites to ≤ 512² afterwards.
- 40 to 90 s per image; separate sessions run in parallel.
- If the file is not at the requested path, it is still under `~/.codex/generated_images/<session id>/exec-*.png`; the session id is in the exec header on stderr. The helper script falls back to that.
- Prompt skeleton is style guide §10. Put palette hexes in the prompt verbatim; always say "no text, no watermark".
- stdin must be `/dev/null` (the script does this). With a non-TTY stdin left open, codex waits forever on "Reading additional input from stdin...".
- Transparent sprites work only when phrased exactly: "fully transparent background (real alpha channel; do not paint a checkerboard, do not paint any background colour)". Add "flat vector-style fills, no shading or gradients inside shapes" or the result goes painterly. Check with `magick <png> -alpha extract -format "%[min] %[max]" info:` and a corner crop's mean alpha.
- Codex claims success even when the copy failed. Always `file` the output. `codex exec` prints its transcript to stderr; `-o` writes only the final message.

## 2. Measuring whether a texture cell reads

Crop each cell out of the atlas and read its luminance spread:

```bash
python3 - <<'PY'
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
PY
```

Below about 5 the surface reads as flat colour at 64 px per tile; 7 to 15 is the band that works (`env-sidewalk` 15.6 and `env-rock` 9.9 were the reference cells). Then look: `node tools/art/preview/render-scene.mjs tools/art/preview/layouts/ground-field.json out.png` renders an 8×8 field of every ground surface, which is where repeated-stamp problems show and the numbers do not.

## 3. Headless render check

`tools/art/preview/render-placeholders.mjs` serves the repo root on 127.0.0.1:8790, opens `tools/art/preview/harness.html` in headless Chromium (SwiftShader GL) for each manifest entry at yaw 45° and 225°, and writes 320 px PNGs into `tools/art/preview/out/` (git-ignored). `tools/art/preview/shoot-page.mjs <page> <out.png>` screenshots any repo page the same way. Contact sheet:

```bash
node tools/art/preview/render-placeholders.mjs
cd tools/art/preview/out && montage $(ls *@45.png | sort) -tile 8x -geometry 200x200+3+3 -background '#222' ../../../../docs/design/placeholder-models.png
```

If Chromium reports `libnspr4.so: cannot open shared object file`, run `sudo npx playwright install-deps chromium`.

## 4. Blender (headless, no GPU)

Installed by `.devcontainer/Dockerfile`. By hand:

```bash
sudo apt-get install -y --no-install-recommends libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libegl1 libsm6 xz-utils openscad python3-venv xvfb
curl -fsSL https://download.blender.org/release/Blender4.5/blender-4.5.13-linux-x64.tar.xz | sudo tar -xJ -C /opt
sudo ln -s /opt/blender-4.5.13-linux-x64/blender /usr/local/bin/blender
sudo /opt/blender-4.5.13-linux-x64/4.5/python/bin/python3.11 -m ensurepip && sudo /opt/blender-4.5.13-linux-x64/4.5/python/bin/python3.11 -m pip install trimesh
sudo python3 -m venv /opt/art-venv && sudo /opt/art-venv/bin/pip install trimesh cadquery
printf '#!/bin/sh\nexec /opt/art-venv/bin/python "$@"\n' | sudo tee /usr/local/bin/art-python && sudo chmod +x /usr/local/bin/art-python
```

Proof: `blender -b --python tools/art/smoke_render.py`. Review any GLB: `blender -b --python tools/art/render_glb.py -- --glb <file> --out <dir>`.

Gotchas:

- `art-python` must be a wrapper script, not a symlink: Python finds the venv from the real executable path, so a symlink silently runs system Python.
- The base image's Python is externally managed: use the venv, never `pip install` into it.
- glTF export splits vertices per flat face; trimesh reports "not watertight" unless vertices are merged first (`validate_glb.py` does).
- Script args go after `--`; start scripts with `read_factory_settings(use_empty=True)`; Cycles needs no xvfb in `-b` mode.
- Blender's `primitive_cone_add(radius1=bottom, radius2=top)`.
