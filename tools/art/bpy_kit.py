"""Shared helpers for Blender model scripts (art-blender skill, #190).

Import from a model script run inside Blender:

    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from bpy_kit import *

Conventions baked in (style guide §3, §6):

    Blender: X right, Y back, Z up; the model faces -Y.
    glTF:    exported with +Y up, so -Y forward becomes +Z forward.
    1 unit = 1 tile = 2 m. Pivot at the base centre: keep feet on z = 0.
    Materials: one flat Principled material per palette token, named after it.
    Sockets: empties named ``socket_<name>``; they survive export as nodes.

        Blender (x, y, z)  ──export──►  glTF (x, z, -y)
"""

from __future__ import annotations

import math
import os

import bpy
from mathutils import Vector

# ===========================================
# Palette (style guide §4)
# ===========================================

PALETTE = {
    "tdf-grey-dark": "#2E3440",
    "tdf-grey-mid": "#5B6573",
    "tdf-grey-light": "#9AA5B1",
    "tdf-olive": "#6B7A3F",
    "tdf-olive-dark": "#45502A",
    "tdf-orange": "#F08A24",
    "tdf-orange-dim": "#B86414",
    "tdf-visor": "#7FD1FF",
    "bug-chitin-black": "#14121A",
    "bug-chitin-dark": "#2B2436",
    "bug-chitin-mid": "#4A3B5A",
    "bug-flesh": "#7A3A4E",
    "bug-flesh-light": "#B05A6E",
    "bug-bio-green": "#9CFF3D",
    "bug-bio-green-dim": "#4C8F1A",
    "bug-bio-magenta": "#E23DFF",
    "bug-bone": "#D8CBB0",
    "env-asphalt": "#3A3D42",
    "env-concrete": "#8E8A82",
    "env-sidewalk": "#A7A297",
    "env-brick": "#8A4B3A",
    "env-glass": "#6E8FA6",
    "env-roof": "#55524C",
    "env-metal": "#6F7378",
    "env-rust": "#8C5A3A",
    "env-grass": "#5E7A3A",
    "env-dirt": "#7A6045",
    "env-sand": "#D9B87A",
    "env-snow": "#E8ECF0",
    "env-rock": "#6E6A66",
    "env-water-shallow": "#3F8FA8",
    "env-water-deep": "#1F5C73",
    "env-foliage": "#3F6B33",
    "env-bark": "#5A4634",
    "env-scrub": "#8A8A4A",
}

EMISSIVE = {"tdf-visor", "bug-bio-green", "bug-bio-magenta"}
METAL = {"tdf-grey-dark", "tdf-grey-mid", "tdf-grey-light", "env-metal", "env-rust"}


def srgb_to_linear(channel: float) -> float:
    """Convert one sRGB channel (0–1) to linear light."""
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(hex_colour: str) -> tuple[float, float, float, float]:
    """Parse ``#RRGGBB`` into a linear RGBA tuple for Blender node sockets."""
    r, g, b = (int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


# ===========================================
# Scene and materials
# ===========================================


def reset_scene() -> None:
    """Start from an empty file so scripts are repeatable."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(token: str) -> bpy.types.Material:
    """Return the flat Principled material for a palette token, creating it once."""
    if token not in PALETTE:
        raise KeyError(f"unknown palette token {token!r}; see style guide §4")
    existing = bpy.data.materials.get(token)
    if existing:
        return existing
    mat = bpy.data.materials.new(token)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    colour = hex_to_linear_rgba(PALETTE[token])
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Roughness"].default_value = 0.6 if token in METAL else 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    if token in EMISSIVE:
        bsdf.inputs["Emission Color"].default_value = colour
        bsdf.inputs["Emission Strength"].default_value = 3.0
    return mat


def _finish(ob: bpy.types.Object, name: str, token: str, smooth: bool) -> bpy.types.Object:
    """Name an object and its mesh, assign the token material, set shading."""
    ob.name = name
    ob.data.name = name
    ob.data.materials.append(material(token))
    for poly in ob.data.polygons:
        poly.use_smooth = smooth
    return ob


# ===========================================
# Primitives (sizes and positions in world units)
# ===========================================


def box(
    name: str,
    size: tuple[float, float, float],
    at: tuple[float, float, float],
    token: str,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """Flat-shaded box; ``size`` is full width/depth/height, ``at`` its centre, ``rot`` in radians."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=at, rotation=rot)
    ob = bpy.context.active_object
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(ob, name, token, smooth=False)


def cylinder(
    name: str,
    radius_top: float,
    radius_bottom: float,
    depth: float,
    segments: int,
    at: tuple[float, float, float],
    token: str,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """Flat-shaded cylinder or cone along local Z, centred at ``at``."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=segments, radius1=radius_bottom, radius2=radius_top, depth=depth, location=at, rotation=rot
    )
    return _finish(bpy.context.active_object, name, token, smooth=False)


def sphere(
    name: str,
    radius: float,
    at: tuple[float, float, float],
    token: str,
    segments: int = 8,
    rings: int = 6,
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0),
    smooth: bool = False,
) -> bpy.types.Object:
    """Low-poly UV sphere, optionally scaled per axis (an ellipsoid)."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=at)
    ob = bpy.context.active_object
    ob.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(ob, name, token, smooth=smooth)


def socket(name: str, at: tuple[float, float, float]) -> bpy.types.Object:
    """Empty named ``socket_<name>`` marking an attach point (style guide §6)."""
    bpy.ops.object.empty_add(type="PLAIN_AXES", radius=0.05, location=at)
    ob = bpy.context.active_object
    ob.name = f"socket_{name}"
    return ob


def bevel(ob: bpy.types.Object, width: float = 0.03, segments: int = 1) -> bpy.types.Object:
    """Chamfer an object's edges with a bevel modifier (angle-limited, so flat faces stay flat).

    One segment reads as a machined chamfer at isometric distance and costs
    roughly 2× the triangles of the plain box; ``export_glb`` applies it.
    """
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return ob


def cut_below(ob: bpy.types.Object, z: float = 0.0) -> bpy.types.Object:
    """Slice away everything under the plane ``z`` and cap the hole, so a sphere or
    ellipsoid sunk into the ground still exports watertight with its base on z = 0."""
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(
        plane_co=(0.0, 0.0, z), plane_no=(0.0, 0.0, 1.0), use_fill=True, clear_inner=True, clear_outer=False
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    """Join several mesh objects into one (materials are kept per face)."""
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    joined.data.name = name
    return joined


# ===========================================
# Export and measurement
# ===========================================


def mesh_objects() -> list[bpy.types.Object]:
    """All model mesh objects in the scene (render helpers such as the ground are excluded)."""
    return [ob for ob in bpy.context.scene.objects if ob.type == "MESH" and not ob.name.startswith("render_")]


def triangle_count() -> int:
    """Triangles the exporter will write for the current scene's meshes."""
    total = 0
    for ob in mesh_objects():
        for poly in ob.data.polygons:
            total += max(len(poly.vertices) - 2, 1)
    return total


def bounds() -> tuple[Vector, Vector]:
    """World-space min and max corners over all mesh objects."""
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for ob in mesh_objects():
        for corner in ob.bound_box:
            world = ob.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, world))
            hi = Vector(map(max, hi, world))
    return lo, hi


def export_glb(path: str) -> int:
    """Export the whole scene as GLB with +Y up. Returns the file size in bytes."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True)
    return os.path.getsize(path)


# ===========================================
# Review renders (Cycles CPU, isometric)
# ===========================================


def setup_render(size: int = 640, samples: int = 32, background: str = "#3A3F4A") -> None:
    """Cycles on the CPU, square frame, denoised, key + fill light, grey ground."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = hex_to_linear_rgba(background)
    bg.inputs["Strength"].default_value = 1.0
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 4))
    key = bpy.context.active_object
    key.name = "render_key"
    key.data.energy = 4.0
    key.data.angle = math.radians(8)
    key.rotation_euler = (math.radians(50), 0, math.radians(35))
    bpy.ops.object.light_add(type="SUN", location=(-3, 2, 3))
    fill = bpy.context.active_object
    fill.name = "render_fill"
    fill.data.energy = 1.2
    fill.data.angle = math.radians(20)
    fill.rotation_euler = (math.radians(60), 0, math.radians(215))
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "render_ground"
    # Own material, not a palette token: an imported GLB may already own a
    # material with that name (textured), and the ground would borrow it.
    ground_mat = bpy.data.materials.new("render_ground")
    ground_mat.use_nodes = True
    ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hex_to_linear_rgba("#2E3440")
    ground.data.materials.append(ground_mat)


def render_yaws(out_dir: str, stem: str, yaws: tuple[int, ...] = (45, 135, 225)) -> list[str]:
    """Render one PNG per yaw from the isometric elevation, framed to the model bounds."""
    lo, hi = bounds()
    target = (lo + hi) / 2
    extent = max((hi - lo).length * 0.62 + 0.3, 1.0)
    elev = math.radians(35.264)
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.name = "render_camera"
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = extent * 2
    bpy.context.scene.camera = cam
    os.makedirs(out_dir, exist_ok=True)
    paths: list[str] = []
    for yaw in yaws:
        y = math.radians(yaw)
        offset = Vector((math.sin(y) * math.cos(elev), -math.cos(y) * math.cos(elev), math.sin(elev))) * 10
        cam.location = target + offset
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(out_dir, f"{stem}_{yaw:03d}.png")
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    return paths
