# Choose a devcontainer

The default `devcontainer.json` requires no GPU device, so Docker can create it
on laptops and CI hosts without `/dev/dri/renderD129`. The iGPU variant shares
the same Dockerfile, packages and editor setup; it adds only the D129 mapping.
A variant keeps device selection outside container creation, where a missing
mandatory `--device` would fail before any in-container guard can run.

From the repository root on the Docker host, choose by device presence:

```sh
TUT_CONTAINER_CONFIG=.devcontainer/devcontainer.json
if [ -c /dev/dri/renderD129 ]; then
  TUT_CONTAINER_CONFIG=.devcontainer/igpu/devcontainer.json
fi
devcontainer up --workspace-folder . --config "$TUT_CONTAINER_CONFIG"
```

VS Code's default configuration stays software-only. The studio's next fleet
rebuild must explicitly select `.devcontainer/igpu/devcontainer.json`; its timing
remains the Director's call. The iGPU variant intentionally fails if selected on
a host without D129. Neither configuration maps D128 or changes host setup.

Inside the iGPU container, `ls /dev/dri` must show only `renderD129`, and
`vulkaninfo --summary` must identify AMD `1002:13c0`. In the default container no
DRM device is required; `TUT_GPU=1` rendering fails at the existing device guard.
Evidence and CI captures remain SwiftShader in both configurations.
