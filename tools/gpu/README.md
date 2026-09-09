# Container iGPU experiments (#1069)

Only `/dev/dri/renderD129` (AMD Granite Ridge, `1002:13c0`) is passed through.
`renderD128` is the discrete RX 9070 and must remain absent. The image adds
container-local RADV and Vulkan/EGL diagnostics. No host configuration changes.
The device mapping is mandatory: a host without D129 cannot create this container.
This configuration targets the studio host; other hosts need a variant without the mapping.
The Director coordinates fleet rebuild timing **after merge**, with a ten-minute warning on #968.
This checkout has no DRM node or Docker endpoint; hardware results are pending.

## Evidence boundary

Existing Playwright configuration and capture tools keep their explicit SwiftShader
flags. `TUT_GPU=1` opts **non-evidence** work into a verified hardware browser;
CI and `launchWorkBrowser()`'s default evidence purpose remain SwiftShader.
No evidence migration is proposed. Before any future migration, ten fresh runs
of the same controls on the iGPU must produce byte-identical PNGs, with the
actual renderer, revision, seeds and camera recorded. A repeated placeholder is
not valid evidence: retain asset-readiness/fallback and real-change controls.
Do not replace accepted controls with these survey outputs.

## After the approved rebuild

Run inside one rebuilt container first. Stop if D128 is visible or D129 is absent:

```sh
test -c /dev/dri/renderD129 && test ! -e /dev/dri/renderD128
cat /sys/class/drm/renderD129/device/vendor /sys/class/drm/renderD129/device/device
DRI_PRIME=1002:13c0 MESA_VK_DEVICE_SELECT=1002:13c0! vulkaninfo --summary
DRI_PRIME=1002:13c0 eglinfo -B
```

Confirm Granite Ridge / `1002:13c0` and RADV/radeonsi, not llvmpipe, softpipe or
SwiftShader. Save both probe outputs alongside the workload reports.

Start `pnpm dev`, then run paired measurements, without changing the revision:

```sh
TUT_SURVEY_OUT=test-results/maplab-cpu node tools/gpu/maplab-survey.mjs
TUT_GPU=1 TUT_SURVEY_OUT=test-results/maplab-igpu node tools/gpu/maplab-survey.mjs
python3 tools/gpu/blender-survey.py --engine cycles --out test-results/blender-cycles
python3 tools/gpu/blender-survey.py --engine eevee --out test-results/blender-eevee-cpu
TUT_GPU=1 python3 tools/gpu/blender-survey.py --engine eevee --out test-results/blender-eevee-igpu
```

`TUT_SURVEY_URL` can select another local Vite port. The fixed Map Lab workload
loads `mc-opening-01`, coastal/rural/small, all models and units, at 2400×1500,
and takes one full viewport screenshot. Reports include actual Chromium GPU
information, launch flags, revision, wall time and per-process CDP CPU deltas.
The CPU deltas exclude startup, Vite and processes that exited before sampling.
Other non-evidence QA/play scripts can import `launchWorkBrowser({purpose:"play"})`.
Both survey modes use Chromium's new headless channel; evidence keeps its existing
channel. Missing hardware or an observed software fallback fails the opt-in run.

Blender uses the unchanged bench GLB and existing camera/light rig, 640×640,
32 samples, yaw 45°, four threads. Compare **CPU Eevee against iGPU Eevee** to
isolate hardware benefit; Cycles CPU is the current production reference.
The benchmark records the whole child process's CPU/wall time, EGL log and open
DRM nodes. Background Blender cannot expose `gpu.platform.renderer_get()`;
review the saved EGL diagnostics and device probes before accepting GPU results.
A missing D129 descriptor or a software-fallback diagnostic rejects the GPU run.
Eevee remains an experiment: retain it for routine work only if faster and the
unchanged asset still renders correctly. Existing art evidence stays Cycles CPU.

Repeat each pair with the same cache conditions and record host load. Inspect the
PNGs; different render engines are not byte-equality controls. Report wall and
CPU seconds separately. Vite serving, TypeScript generation, Node simulations and
non-rendering sweeps remain CPU work; passing a GPU cannot offload those processes.

## Measurements before rebuilding

2026-09-09, main `bb28b8d`, Blender 4.5.13, Mesa 25.0.7, 32 logical CPUs:

| Existing workload | Wall seconds | Observed CPU seconds |
| --- | ---: | ---: |
| SwiftShader garden control, first run | 29.84 | Chromium 165.86; Vite 0.45 |
| Same control, second run | 18.43 | Chromium 162.91; Vite 0.40 |
| Bench, existing Cycles CPU script | 6.87 | Blender 22.10 |

The Chromium figures come from 250 ms `/proc` sampling across visible processes,
not launcher-only `RUSAGE_CHILDREN`; Blender is a directly reaped child. An idle
10-second sample saw only ~0.06 CPU cores in this PID namespace while host load
was 39/50/53. These observations identify rendering cost locally; they cannot
attribute other containers' load. CPU seconds stay high even when wall time drops.
New survey/benchmark reports provide repeatable post-rebuild comparisons; the old
garden crop and new full-view survey are different workloads, not a before/after pair.

Sources: [Chromium headless GPU support](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md),
[Playwright new headless](https://playwright.dev/docs/browsers#chromium-new-headless-mode),
[Mesa per-process device selection](https://docs.mesa3d.org/envvars.html),
[Blender 4.5 Eevee backends](https://developer.blender.org/docs/release_notes/4.5/eevee/).

[Recorded frames and measurements](../../docs/design/diagnostics/1069/) include
the inspected pre-change/head SwiftShader control and non-evidence benchmark PNGs.
The control and a fresh head repeat with `TUT_GPU=1 CI=1` share SHA-256
`d693e4d272a772309b87fd9cbe589e0378355a6537b858145069655cbb3496df`.
JSONL records preserve the runtime, recipe and measurement limits. Benchmark
PNGs show their respective workloads; they are not byte-equality controls.
