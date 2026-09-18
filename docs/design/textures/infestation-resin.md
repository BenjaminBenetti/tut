# Colony resin PBR material

Source: `tools/art/build-infestation-textures.py`.

Three seamless 1024×1024 PNGs under `public/assets/textures/infestation/`: albedo (sRGB), OpenGL normal (linear), and roughness (linear). Deterministic periodic domain warping bends a Voronoi plate network; layered harmonic grain and fibres soften the cells. Dark wet seams, restrained chestnut plate variation and lighter fracture rims carry material detail without baked lighting.

The tactical renderer projects the field continuously over four world tiles and adds a narrow, irregular substrate contact band. The same roughness field supplies fine shell bump on infestation structures and invaded city assets. The texture source owns originals; each map disposes only its sampling and material clones.

Rebuild with `art-python tools/art/build-infestation-textures.py`.
