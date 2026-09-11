"""Closed one-tile hipped metal cap; graphics fits its nine upper profile points."""

import bpy
from bpy_kit import material

FOOTPRINT = (1, 1)
EAVE = 0.12
PEAK = 0.37


def build() -> None:
    """A four-sided hip with a closed ceiling and a grounded one-tile pivot."""
    vertices = [(x, y, PEAK if x == 0 and y == 0 else EAVE)
                for y in [-0.5, 0, 0.5] for x in [-0.5, 0, 0.5]]
    perimeter = [0, 1, 2, 5, 8, 7, 6, 3]
    vertices += [(vertices[i][0], vertices[i][1], 0) for i in perimeter]
    # Each top square follows the diagonal through the ridge. The consumer
    # keeps this rule for fitted corner tiles, where the ridge may run either way.
    faces = []
    for row in range(2):
        for col in range(2):
            a = row * 3 + col
            b, c, d = a + 1, a + 4, a + 3
            if vertices[a][2] + vertices[c][2] >= vertices[b][2] + vertices[d][2]:
                faces += [(a, b, c), (a, c, d)]
            else:
                faces += [(a, b, d), (b, c, d)]
    for i, top in enumerate(perimeter):
        j = (i + 1) % len(perimeter)
        faces.append((top, 9 + i, 9 + j, perimeter[j]))
    faces.append(tuple(reversed(range(9, 17))))
    mesh = bpy.data.meshes.new("hipped-roof-cap")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material("env-roof-green"))
    mesh.update()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = False
