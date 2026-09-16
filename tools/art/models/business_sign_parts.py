"""Closed storefront canopies with embedded, reproducible printed business fasciae.

Blender -Y is outdoors, exported as glTF +Z. Back is exactly depth zero;
front fascia hangs below the roof only beyond 0.60 u of projection. At the
1.08 u mount, every door-plane component clears the 1.20 u doorway opening.
Export with make_model.py --no-textured: its optional atlas rewrite replaces
the image table and would discard the separately packed fascia artwork.
"""

from pathlib import Path
import subprocess
import sys

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from bpy_kit import PALETTE, box, join, material, mesh_objects, socket  # noqa: E402
from business_sign_texture import STYLES, TEXTURES  # noqa: E402

PALETTE.update({"env-awning-green": "#56735F", "env-awning-cream": "#D8D0B8"})


def printed_material(identity: str, compact: bool) -> bpy.types.Material:
    """Pack an opaque PNG so each GLB is self-contained in the standard loader."""
    command = ["art-python", str(HERE / "business_sign_texture.py"), identity]
    if compact:
        command.append("--compact")
    subprocess.run(command, check=True)
    suffix = "-compact" if compact else ""
    image = bpy.data.images.load(str(TEXTURES / f"{identity}{suffix}.png"))
    image.pack()
    ink = bpy.data.materials.new(f"business-print-{identity}{suffix}")
    ink.use_nodes = True
    shader = ink.node_tree.nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.82
    texture = ink.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Linear"
    ink.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return ink


def sloped_roof(width: float, token: str) -> None:
    """A closed shallow sheet falls toward the street, with no door-plane overhang below .15."""
    vertices = [(-width / 2, 0, .34), (width / 2, 0, .34),
                (width / 2, -.66, .28), (-width / 2, -.66, .28),
                (-width / 2, 0, .40), (width / 2, 0, .40),
                (width / 2, -.66, .34), (-width / 2, -.66, .34)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh = bpy.data.meshes.new("canopy-roof")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material(token))
    obj = bpy.data.objects.new("canopy-roof", mesh)
    bpy.context.collection.objects.link(obj)


def printed_fascia(width: float, identity: str, compact: bool) -> None:
    """Map front UV left-to-right onto a fully closed box; the other faces sample plain ink stock."""
    _, background, _ = STYLES[identity]
    panel = box("printed-fascia", (width, .06, .28), (0, -.63, .14), background)
    panel.data.materials.clear()
    panel.data.materials.append(printed_material(identity, compact))
    uv = panel.data.uv_layers.active or panel.data.uv_layers.new(name="UVMap")
    for polygon in panel.data.polygons:
        for loop_index in polygon.loop_indices:
            if polygon.normal.y < -.5:
                vertex = panel.data.vertices[panel.data.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = (vertex.x / width + .5, vertex.z / .28 + .5)
            else:
                uv.data[loop_index].uv = (.005, .5)


def build_business_sign(identity: str, compact: bool = False) -> None:
    """Build a 3 u or 1 u entry canopy whose fascia starts at height zero, front depth .66."""
    _, background, foreground = STYLES[identity]
    width = 1.0 if compact else 3.0
    sloped_roof(width, background)
    printed_fascia(width, identity, compact)
    box("wall-mount-rail", (width, .055, .09), (0, -.0275, .295), "env-metal")
    # Recess the trim behind the roof edge so differently coloured front faces never coincide.
    box("fascia-top-trim", (width, .045, .025), (0, -.6335, .2925), foreground)
    for x in (-width / 2 + .09, width / 2 - .09):
        box("under-canopy-arm", (.045, .57, .045), (x, -.285, .1825), "env-metal")
        box("mounting-shoe", (.07, .06, .14), (x, -.03, .23), "env-metal")
    result = join(mesh_objects(), f"business-{identity}{'-compact' if compact else ''}")
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    socket("wall", (0, 0, 0))
