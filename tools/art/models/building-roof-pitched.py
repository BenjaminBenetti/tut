"""Closed one-tile roof cap; the graphics consumer fits the three ridge-profile heights."""
import bpy
from bpy_kit import material

FOOTPRINT = (1, 1)
EAVE = 0.12
PEAK = 0.37


def build() -> None:
    """A base-centred gabled prism, ridge along Blender Y / glTF Z, in the roof atlas cell."""
    # Six points around the cross-section: split the base below the ridge
    # so both gable quads remain valid when the consumer makes a straight run.
    profile = [(-0.5, 0), (0, 0), (0.5, 0), (0.5, EAVE), (0, PEAK), (-0.5, EAVE)]
    vertices = [(x, y, z) for y in [-0.5, 0.5] for x, z in profile]
    faces = [(0, 1, 4, 5), (1, 2, 3, 4), (6, 11, 10, 7), (7, 10, 9, 8)]
    for i in range(6):
        j = (i + 1) % 6
        faces.append((i, i + 6, j + 6, j))
    mesh = bpy.data.meshes.new("pitched-roof-cap")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(material("env-roof"))
    ob = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(ob)
    for poly in mesh.polygons:
        poly.use_smooth = False
