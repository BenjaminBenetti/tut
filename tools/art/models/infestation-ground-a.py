"""Resin Shell: continuous web with an authored Mature morph target."""
import os
import sys

import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infestation_parts import ground, finish_materials
from bpy_kit import mesh_objects, join

FOOTPRINT = (6, 6)


def build():
    """Keep Blender vertex identity through export instead of pairing two GLBs."""
    ground(0)
    sparse = join(mesh_objects(), 'resin_web')
    ground(1)
    dense = join([ob for ob in mesh_objects() if ob != sparse], 'mature_endpoint')
    bpy.context.view_layer.update()
    assert len(sparse.data.vertices) == len(dense.data.vertices)
    sparse.shape_key_add(name='Basis')
    key = sparse.shape_key_add(name='Mature')
    transform = sparse.matrix_world.inverted() @ dense.matrix_world
    for target, vertex in zip(key.data, dense.data.vertices):
        target.co = transform @ vertex.co
    bpy.data.objects.remove(dense, do_unlink=True)
    finish_materials()
