"""Small construction helpers for the commercial interior furniture kit."""

import bpy

from bpy_kit import join, mesh_objects


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
