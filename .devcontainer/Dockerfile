# Terra Under Threat devcontainer.
#
# Base: the same Microsoft javascript-node image the project already used
# (Node, pnpm via corepack, git, sudo). This layer adds the headless art
# toolchain so any rebuilt instance can produce and validate real models
# without a display or a GPU:
#
#   Blender 4.x  official tarball under /opt, symlinked to /usr/local/bin/blender,
#                with the X/GL runtime it dlopens even in background mode;
#                trimesh installed into Blender's bundled Python so bpy scripts
#                can validate their own exports.
#   openscad     apt, for CSG-style parts.
#   art-python   /opt/art-venv with trimesh + cadquery, wrapped by
#                /usr/local/bin/art-python (a wrapper, not a symlink: Python
#                locates the venv from the real executable path; the base Python is
#                externally managed, so a venv rather than system pip).
#   xvfb         only needed if a script insists on Eevee/Workbench GPU paths;
#                Cycles CPU renders run without it.
#
# Playwright + Chromium and Codex stay in postCreateCommand (devcontainer.json)
# because they track package.json / the user's login, not the image.
FROM mcr.microsoft.com/devcontainers/javascript-node:latest

ARG BLENDER_VERSION=4.5.13
ARG BLENDER_SERIES=4.5

# ---- system packages: Blender runtime libs, openscad, venv support, xvfb ----
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libegl1 libsm6 xz-utils \
        openscad python3-venv xvfb \
    && rm -rf /var/lib/apt/lists/*

# ---- Blender ----
RUN curl -fsSL "https://download.blender.org/release/Blender${BLENDER_SERIES}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
        | tar -xJ -C /opt \
    && ln -s "/opt/blender-${BLENDER_VERSION}-linux-x64/blender" /usr/local/bin/blender \
    && BPY="$(find /opt/blender-${BLENDER_VERSION}-linux-x64/${BLENDER_SERIES}/python/bin -maxdepth 1 -name 'python3.[0-9]*' ! -name '*-config' | head -n 1)" \
    && "$BPY" -m ensurepip \
    && "$BPY" -m pip install --no-cache-dir trimesh \
    && blender -b --version

# ---- art-python: trimesh + cadquery in a venv ----
RUN python3 -m venv /opt/art-venv \
    && /opt/art-venv/bin/pip install --no-cache-dir trimesh cadquery \
    && printf '#!/bin/sh\nexec /opt/art-venv/bin/python "$@"\n' > /usr/local/bin/art-python \
    && chmod +x /usr/local/bin/art-python \
    && art-python -c "import trimesh, cadquery"
