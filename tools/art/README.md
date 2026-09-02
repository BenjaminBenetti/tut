# tools/art

Art Director build scripts. See `docs/design/style-guide.md` and `docs/handoff/art-director.md`.

| Script | Purpose |
|---|---|
| `build-placeholders.mjs` | Builds every placeholder GLB under `public/assets/models/` from primitives, deterministically, and writes `placeholders.manifest.json`. Run with `pnpm art:placeholders`. |
| `gen-image.sh <prompt.txt> <out.png>` | Generates an image with the Codex CLI built-in image tool (concept art, textures, sprites). Recipe and environment fixes in the handoff §5. |
| `preview/render-placeholders.mjs` | Renders each placeholder from two isometric yaws with headless Chromium into `preview/out/` (git-ignored) for visual checks. Needs Playwright. |
| `preview/harness.html` | The three.js page the renderer drives: orthographic camera at 35°, 64 px per tile by default, the unit's tile highlighted. |

Rules: no `Math.random()` anywhere in these scripts; every model follows style guide §6 (axes, pivot, materials named after palette tokens).
