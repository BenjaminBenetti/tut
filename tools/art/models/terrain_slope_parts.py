"""Five neutral, watertight terrain shapes; materials are chosen by the consumer.

Blender Z-up, high edge towards -Y (glTF +Z), base-centred 1 x 1 footprint.
All top UVs use footprint projection so corners continue adjacent wedges.
"""

import bpy
from bpy_kit import material

# One elevation layer under ADR 0008; re-emit all five shapes from this parameter.
RISE = 0.75


def build_slope(kind: str) -> None:
    """Build one of the parameterised terrain height fields."""
    if kind == "three-sided":
        build_three_sided()
        return
    corners = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]
    vertices = []

    def vertex(point):
        """Share low corners with the base so every exported wedge is closed."""
        if point not in vertices:
            vertices.append(point)
        return vertices.index(point)

    bottom = [vertex((x, y, 0.0)) for x, y in corners]
    top = []
    for x, y in corners:
        u, v = x + 0.5, 0.5 - y
        height = v if kind == "straight" else (max(u, v) if kind == "inner" else min(u, v))
        if kind == "diagonal":
            height = (u + v) / 2
        top.append(vertex((x, y, height * RISE)))
    faces = [(top[3], top[0], top[1]), (top[3], top[1], top[2]), tuple(reversed(bottom))]
    for i in range(4):
        j = (i + 1) % 4
        face = tuple(dict.fromkeys((bottom[i], bottom[j], top[j], top[i])))
        if len(face) >= 3:
            faces.append(face)
    finish_mesh(kind, vertices, faces)


def build_three_sided() -> None:
    """Three high sides around a low mouth: max(abs(2*u-1), v)."""
    # Counter-clockwise boundary in Blender XY. The extra point is the
    # low midpoint of the mouth (+Y here, -Z after the glTF conversion).
    boundary = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (0.0, 0.5), (-0.5, 0.5)]
    vertices = [(x, y, 0.0) for x, y in boundary]
    bottom = list(range(5))
    top = []
    for i, (x, y) in enumerate(boundary):
        if i == 3:
            top.append(bottom[i])
        else:
            top.append(len(vertices))
            vertices.append((x, y, RISE))
    faces = [
        (top[0], top[1], top[3]),
        (top[1], top[2], top[3]),
        (top[3], top[4], top[0]),
        (bottom[0], bottom[2], bottom[1]),
        (bottom[0], bottom[3], bottom[2]),
        (bottom[0], bottom[4], bottom[3]),
    ]
    for i in range(5):
        j = (i + 1) % 5
        face = tuple(dict.fromkeys((bottom[i], bottom[j], top[j], top[i])))
        if len(face) >= 3:
            faces.append(face)
    finish_mesh("three-sided", vertices, faces)


def finish_mesh(kind, vertices, faces) -> None:
    """Apply the shared neutral material, flat normals and projected atlas UVs."""
    mesh = bpy.data.meshes.new("terrain-slope-" + kind)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(ob)
    # Neutral material: the GLB contains no atlas or baked terrain choice.
    neutral = material("env-snow").copy()
    neutral.name = "terrain-parameter"
    mesh.materials.append(neutral)
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        poly.use_smooth = False
        for li in poly.loop_indices:
            x, y, _ = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = (x + 0.5, y + 0.5)
