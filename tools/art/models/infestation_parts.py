"""Resin Shell art: connected membranes, swept chitin blades and climbing roots."""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crescent_geometry import mesh
from bpy_kit import material, mesh_objects, join

FOOTPRINT = (1, 1)


def blade(name, cx, cy, width, length, height, angle=0, base=.015, variant=0):
    """An asymmetric pointed shell with a swept keel and a thin amber cutting lip."""
    outline = [(0,-.64),(.18,-.46),(.38,-.20),(.48,.02),(.42,.25),(.22,.45),
               (.08,.62),(-.06,.50),(-.32,.32),(-.41,.10),(-.28,-.25),(-.10,-.52)]
    verts = [(x*width,y*length,base+height*max(0,y+.1)*.12) for x,y in outline]
    verts += [(x*width*.87,y*length*.94,base+height*(.22+(y+.64)*.22)) for x,y in outline]
    verts += [(-width*.04,-length*.34,base+height*.40),
              (-width*.035,-length*.01,base+height*.86),
              (width*.055,length*.35,base+height*1.10)]
    faces = [tuple(reversed(range(12)))]
    faces += [(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)]
    faces += [(12,13,24),(13,14,24),(14,15,25,24),(15,16,25),
              (16,17,26,25),(17,18,26),(18,19,26),(19,20,26),
              (20,21,25,26),(21,22,25),(22,23,24,25),(23,12,24)]
    def place(points):
        """Rotate around the shell's growth direction before translating."""
        return [(cx+x*math.cos(angle)-y*math.sin(angle),cy+x*math.sin(angle)+y*math.cos(angle),z) for x,y,z in points]
    lip = mesh(name+'_lip',place(verts),faces,'bug-chitin-tan',smooth=True)
    cap = mesh(name,place([(x*.988,y*.994,z+.004) for x,y,z in verts]),faces,
               'bug-chitin-mid' if variant%3==1 else 'bug-chitin-dark',smooth=True)
    return join([lip,cap],name)


def ground(variant=0):
    """Six-tile continuous network, authored at two matching maturity endpoints."""
    from infestation_network import build_network
    build_network(variant)


def wall(kind='solid'):
    """Swept buttresses and connected root rails; apertures remain fully open."""
    from infestation_network import strand
    for side in (-1,1):
        objects_before = set(mesh_objects())
        # Rails meet adjacent wall pieces and climb around open frames.
        paths = [([(-.5,.09,.035),(-.22,.025,.055),(.18,.14,.04),(.5,.09,.035)], [.028,.06,.04,.028]),
                 ([(-.5,1.43,.04),(-.18,1.31,.055),(.13,1.47,.035),(.5,1.43,.04)],[.028,.06,.035,.028])]
        if kind=='door':
            paths = paths[1:]
        for x,flip in [(-.44,1),(.44,-1)]:
            paths.append(([(x,.07,.05),(x+flip*.027,.42,.06),(x-flip*.017,.91,.045),(x,1.43,.04)], [.067,.048,.055,.026]))
        for i,(pts,radii) in enumerate(paths):
            curve, widths = [], []
            for j in range(len(pts)-1):
                a,b,c,d = pts[max(0,j-1)],pts[j],pts[j+1],pts[min(len(pts)-1,j+2)]
                for k in range(3):
                    t=k/3
                    curve.append(tuple(.5*((2*b[v])+(-a[v]+c[v])*t+(2*a[v]-5*b[v]+4*c[v]-d[v])*t*t+(-a[v]+3*b[v]-3*c[v]+d[v])*t*t*t) for v in range(3)))
                    widths.append(radii[j]*(1-t)+radii[j+1]*t)
            curve.append(pts[-1]); widths.append(radii[-1])
            strand(f'{kind}_root_{side}_{i}',curve,widths,'bug-chitin-dark',.65)
        pieces = [(-.28,.22,.28,.44,.14,-.40)] if kind=='solid' else []
        for i,(x,z,w,length,h,angle) in enumerate(pieces):
            blade(f'{kind}_blade_{side}_{i}',x,z,w,length,h,angle=angle,variant=i)
        for ob in set(mesh_objects())-objects_before:
            transform_wall(ob,side)
    lower_to_ground()


def transform_wall(ob, side):
    """Turn a horizontal authored network into a wall, preserving front faces."""
    bpy.context.view_layer.update()
    matrix = ob.matrix_world.copy()
    for vertex in ob.data.vertices:
        x,y,z = matrix @ vertex.co
        vertex.co = Vector((x,side*(z+.055),y))
    if side==1:
        ob.data.flip_normals()
    ob.matrix_world.identity()
    ob.data.update()


def collar():
    """Three unequal swept buttresses rooted around an existing occupied prop."""
    from infestation_network import strand
    for i,(a,h,w) in enumerate([(0,.81,.46),(2.2,.55,.57),(4.5,.99,.39)]):
        ob = blade(f'buttress_{i}',0,h*.43,w,h,.24,angle=.13,variant=i)
        matrix=ob.matrix_world.copy()
        for vertex in ob.data.vertices:
            x,y,z=matrix @ vertex.co
            r=.25+z+(1-y/h)*.11
            vertex.co=Vector((math.cos(a)*r-math.sin(a)*x,math.sin(a)*r+math.cos(a)*x,y))
        ob.matrix_world.identity()
        strand(f'root_{i}',[(math.cos(a)*r,math.sin(a)*r,.03) for r in (.18,.32,.44)], [.04,.045,.003], 'bug-flesh')
    lower_to_ground()


def lower_to_ground():
    """Place the lowest authored vertex at the base pivot."""
    bpy.context.view_layer.update()
    low=min((ob.matrix_world @ v.co).z for ob in mesh_objects() for v in ob.data.vertices)
    for ob in mesh_objects():
        ob.location.z-=low


def finish_materials():
    """Use the brown family palette with wet tissue and matte shell keels."""
    combined=join(mesh_objects(),'resin_shell')
    combined['atlas_preserve_uv']=True
    for token in ('bug-chitin-dark','bug-chitin-mid','bug-chitin-tan'):
        material(token).node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.55
    for token in ('bug-flesh','bug-bio-green-dim'):
        material(token).node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.32
