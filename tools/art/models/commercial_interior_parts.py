"""Small construction helpers for the commercial interior furniture kit."""

import bpy

from bpy_kit import join, material, mesh_objects


def faceted_food(name: str, at: tuple[float, float, float], radius: float, token: str,
                 scale: tuple[float, float, float] = (1, 1, 1)) -> None:
    """Make a closed twenty-triangle fruit or loaf with a readable silhouette."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=at)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material(token))


def display_glazing() -> None:
    """Use the existing blue glass token as lightly tinted display-case glazing."""
    glass = material("env-glass")
    glass.surface_render_method = "DITHERED"
    shader = glass.node_tree.nodes["Principled BSDF"]
    shader.inputs["Alpha"].default_value = 0.16
    shader.inputs["Roughness"].default_value = 0.24


def finish_prop(name: str, height: float | None = None) -> None:
    """Batch by palette, ground the pivot, and optionally fit the cover height."""
    objects = mesh_objects()
    for obj in objects:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    prop = join(objects, name)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = prop
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    if height is not None:
        prop.dimensions.z = height
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
