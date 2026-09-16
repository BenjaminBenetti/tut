"""Closed silhouette helpers for the specialist shop fixture kit."""

import bpy

from bpy_kit import cylinder, join, material, mesh_objects


def silhouette(name: str, outline: list[tuple[float, float]], depth: float, at: tuple[float, float, float], token: str) -> None:
    """Extrude an X/Z outline into a closed, front-facing shaped panel."""
    x, y, z = at
    count = len(outline)
    vertices = [(x + px, y + side * depth / 2, z + pz) for side in (-1, 1) for px, pz in outline]
    faces = [tuple(range(count)), tuple(reversed(range(count, 2 * count)))]
    faces.extend((i, count + i, count + (i + 1) % count, (i + 1) % count) for i in range(count))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material(token))
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)


def lidded_tin(name: str, radius: float, height: float, at: tuple[float, float, float], token: str, lid_token: str, segments: int = 8) -> None:
    """Make separate closed can and lid meshes, including after material batching."""
    cylinder(name, radius, radius, height, segments, at, token)
    x, y, z = at
    cylinder(f"{name}_lid", radius * 1.04, radius * 1.04, 0.014, segments, (x, y, z + height / 2 + 0.007), lid_token)


def finish_retail_prop(name: str) -> None:
    """Join the closed components into material batches at an identity base pivot."""
    prop = join(mesh_objects(), name)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = prop
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
