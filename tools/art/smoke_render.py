"""Headless Blender smoke test for the art toolchain (#190).

    blender -b --python tools/art/smoke_render.py -- [--out DIR] [--samples 32] [--size 640]

Builds a chunky mech-like block figure from bpy primitives, exports it to GLB
with +Y up and the pivot at the base centre, validates the GLB with trimesh
(watertight, bounds, triangle count), and renders three fixed isometric
angles with Cycles on the CPU. No display or GPU is needed. Writes
``report.json`` and prints a Markdown summary.

    bpy primitives ──► GLB (export_scene.gltf) ──► trimesh report
                   └──► Cycles CPU, 3 cameras ──► PNG ×3
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time

import bpy
from mathutils import Vector

# ===========================================
# Palette (style guide §4.1), sRGB hex → linear RGBA
# ===========================================

PALETTE = {
    "tdf-grey-dark": "#2E3440",
    "tdf-grey-mid": "#5B6573",
    "tdf-olive": "#6B7A3F",
    "tdf-orange": "#F08A24",
    "tdf-visor": "#7FD1FF",
}

EMISSIVE = {"tdf-visor"}


def srgb_to_linear(channel: float) -> float:
    """Convert one sRGB channel (0–1) to linear light."""
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(hex_colour: str) -> tuple[float, float, float, float]:
    """Parse ``#RRGGBB`` into a linear RGBA tuple for Blender node sockets."""
    r, g, b = (int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


# ===========================================
# Scene helpers
# ===========================================


def reset_scene() -> None:
    """Start from an empty file so the script is repeatable."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(token: str) -> bpy.types.Material:
    """Create (or reuse) a flat Principled material named after a palette token."""
    existing = bpy.data.materials.get(token)
    if existing:
        return existing
    mat = bpy.data.materials.new(token)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    colour = hex_to_linear_rgba(PALETTE[token])
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Roughness"].default_value = 0.6 if "grey" in token else 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    if token in EMISSIVE:
        bsdf.inputs["Emission Color"].default_value = colour
        bsdf.inputs["Emission Strength"].default_value = 3.0
    return mat


def box(name: str, size: tuple[float, float, float], at: tuple[float, float, float], token: str) -> bpy.types.Object:
    """Add a flat-shaded box. Blender axes: X right, Y back, Z up; the figure faces -Y.

    Sizes and positions are in world units (1 tile = 1 u, style guide §3).
    """
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=at)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(material(token))
    for poly in ob.data.polygons:
        poly.use_smooth = False
    return ob


def build_mech() -> list[bpy.types.Object]:
    """A chunky block mech in the placeholder proportions (about 2.8 u tall).

    Returns the created objects. Front is -Y so the glTF exporter (which maps
    Blender -Y to glTF +Z) gives a +Z-forward model.
    """
    parts: list[bpy.types.Object] = []
    for side in (-1, 1):
        x = side * 0.3
        parts += [
            box(f"foot_{side}", (0.34, 0.56, 0.14), (x, -0.05, 0.07), "tdf-grey-dark"),
            box(f"shin_{side}", (0.26, 0.3, 0.55), (x, 0.05, 0.4), "tdf-grey-mid"),
            box(f"knee_{side}", (0.3, 0.36, 0.16), (x, 0.0, 0.7), "tdf-grey-dark"),
            box(f"thigh_{side}", (0.28, 0.32, 0.42), (x, -0.02, 0.95), "tdf-grey-mid"),
        ]
    parts += [
        box("hip", (0.96, 0.5, 0.28), (0, 0, 1.28), "tdf-grey-dark"),
        box("torso", (1.0, 0.7, 1.0), (0, 0, 1.92), "tdf-grey-mid"),
        box("chest_plate", (0.7, 0.08, 0.5), (0, -0.37, 1.87), "tdf-olive"),
        box("shoulders", (1.36, 0.6, 0.3), (0, 0, 2.32), "tdf-grey-dark"),
        box("pad_l", (0.3, 0.62, 0.34), (-0.55, 0, 2.34), "tdf-olive"),
        box("pad_r", (0.3, 0.62, 0.34), (0.55, 0, 2.34), "tdf-olive"),
        box("cockpit", (0.44, 0.44, 0.32), (0, -0.05, 2.63), "tdf-grey-mid"),
        box("visor", (0.32, 0.03, 0.08), (0, -0.28, 2.65), "tdf-visor"),
        box("marking", (0.2, 0.02, 0.12), (-0.3, -0.36, 2.02), "tdf-orange"),
        box("arm_l", (0.26, 0.3, 0.5), (-0.82, 0, 1.92), "tdf-grey-mid"),
        box("forearm_l", (0.24, 0.4, 0.24), (-0.82, -0.27, 1.62), "tdf-grey-mid"),
        box("arm_r", (0.26, 0.3, 0.5), (0.82, 0, 1.92), "tdf-grey-mid"),
        box("cannon", (0.16, 0.7, 0.16), (0.82, -0.45, 1.62), "tdf-grey-dark"),
        box("muzzle", (0.18, 0.06, 0.18), (0.82, -0.83, 1.62), "tdf-orange"),
        box("pod", (0.5, 0.5, 0.34), (0.3, 0.25, 2.62), "tdf-grey-mid"),
    ]
    return parts


# ===========================================
# Export and validation
# ===========================================


def export_glb(path: str) -> int:
    """Export the whole scene as a binary glTF with +Y up. Returns file size."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True)
    return os.path.getsize(path)


def validate_glb(path: str) -> dict:
    """Run trimesh validation in-process if available, else through art-python."""
    try:
        import trimesh  # noqa: F401
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from validate_glb import report_for

        return report_for(path, max_triangles=4000, max_bytes=500 * 1024)
    except ImportError:
        python = os.environ.get("ART_PYTHON", "/usr/local/bin/art-python")
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "validate_glb.py")
        out = subprocess.run([python, script, path], capture_output=True, text=True, check=False)
        return json.loads(out.stdout)


# ===========================================
# Rendering
# ===========================================


def setup_render(size: int, samples: int) -> None:
    """Cycles on the CPU, square frame, denoised, neutral grey world."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = hex_to_linear_rgba("#3A3F4A")
    bg.inputs["Strength"].default_value = 1.0
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 4))
    sun = bpy.context.active_object
    sun.data.energy = 4.0
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "ground"
    ground.data.materials.append(material("tdf-grey-dark"))


def render_angles(out_dir: str, yaws_deg: tuple[int, ...], target: Vector, ortho_scale: float) -> list[str]:
    """Render one PNG per yaw from a fixed isometric elevation with an orthographic camera."""
    elev = math.radians(35.264)
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho_scale
    bpy.context.scene.camera = cam
    paths: list[str] = []
    for yaw in yaws_deg:
        y = math.radians(yaw)
        offset = Vector((math.sin(y) * math.cos(elev), -math.cos(y) * math.cos(elev), math.sin(elev))) * 10
        cam.location = target + offset
        direction = target - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(out_dir, f"mech_{yaw:03d}.png")
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    return paths


# ===========================================
# Entry point
# ===========================================


def parse_args() -> argparse.Namespace:
    """Arguments after ``--`` on the Blender command line."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Blender smoke render")
    parser.add_argument("--out", default="tools/art/preview/blender-smoke")
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--size", type=int, default=640)
    return parser.parse_args(argv)


def main() -> None:
    """Build, export, validate, render, report."""
    args = parse_args()
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)
    started = time.time()
    reset_scene()
    parts = build_mech()
    triangles = sum(len(ob.data.polygons) * 2 for ob in parts)  # quads → 2 tris each on export
    glb_path = os.path.join(out_dir, "smoke-mech.glb")
    glb_bytes = export_glb(glb_path)
    validation = validate_glb(glb_path)
    setup_render(args.size, args.samples)
    renders = render_angles(out_dir, (45, 135, 225), Vector((0, 0, 1.4)), 4.2)
    report = {
        "blender": bpy.app.version_string,
        "engine": "CYCLES/CPU",
        "samples": args.samples,
        "size": args.size,
        "parts": len(parts),
        "triangles_authored": triangles,
        "glb": {"path": glb_path, "bytes": glb_bytes},
        "validation": validation,
        "renders": renders,
        "seconds": round(time.time() - started, 1),
    }
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    v = validation
    print("\n## Blender smoke render report")
    print(f"- Blender {report['blender']}, Cycles CPU, {args.samples} samples, {args.size} px, {report['seconds']} s")
    print(f"- GLB: {glb_bytes} bytes, {v.get('meshes')} meshes, {v.get('triangles')} triangles, height {v.get('height', 0):.2f} u")
    print(f"- Watertight: {all(v.get('watertight', {}).values())}, bounds {v.get('bounds')}")
    print(f"- Validation ok: {v.get('ok')} {v.get('problems')}")
    for path in renders:
        print(f"- {path}")


main()
