"""Modular grown carapace curtains: joining walls, bends, branches and buttresses.

Every tile is a component, never a standalone hut. Straight pieces join at local
X ±0.5. In Blender, a curve joins east/+X and north/+Y; a fork joins west, east
and north; an end joins west only. glTF exports north to −Z. All high joins share
one 1.34-u cross section, so the generator can assemble continuous structures.

Build with make_model.py --build-arg kind=wall-ridge|wall-overlap|wall-ribbed|
wall-curve|wall-fork|wall-end|wall-broken|spine-buttress --no-register.
"""

from __future__ import annotations

import importlib.util
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
from bpy_kit import cut_below, join, material, mesh_objects  # noqa: E402
from crescent_geometry import mesh, sweep  # noqa: E402

spec = importlib.util.spec_from_file_location("organic_kit", os.path.join(HERE, "infestation-organic-kit.py"))
organic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(organic)
FOOTPRINT = (1, 1)
JOIN_HEIGHT = 1.34


def curtain(name, path, heights, token="bug-chitin-dark", widths=None):
    """Loft a closed, faceted chitin curtain with shared joining cross sections."""
    vertices=[]
    count=8
    for i,((x,y),height) in enumerate(zip(path,heights)):
        previous=Vector((*path[max(i-1,0)],0))
        following=Vector((*path[min(i+1,len(path)-1)],0))
        tangent=(following-previous).normalized()
        outward=Vector((-tangent.y,tangent.x,0))
        width=widths[i] if widths else 1
        cross=[(-0.21,0),(-0.24,0.13),(-0.17,height*0.57),(-0.095,height),
               (0.084,height),(0.16,height*0.59),(0.23,0.14),(0.21,0)]
        for side,z in cross:
            vertices.append(Vector((x,y,z))+outward*side*width)
    faces=[tuple(reversed(range(count)))]
    for i in range(len(path)-1):
        for j in range(count):
            k=(j+1)%count
            faces.append((i*count+j,i*count+k,(i+1)*count+k,(i+1)*count+j))
    faces.append(tuple((len(path)-1)*count+j for j in range(count)))
    return mesh(name,vertices,faces,token,False)


def straight_core(name="continuous_curtain", heights=None):
    """A complete opaque spine joins neighboring modules without gaps at their bases."""
    path=[(-0.5,0),(-0.34,0),(-0.19,0),(-0.025,0),(0.17,0),(0.34,0),(0.5,0)]
    tops=heights or [JOIN_HEIGHT,1.48,1.33,1.54,1.40,1.47,JOIN_HEIGHT]
    return curtain(name,path,tops)


def shell_plate(name, at, width, height, side=-1, yaw=0, token="bug-chitin-mid", lean=0):
    """A broad concave shell plate with real edge notches and depressed radial fissures.

    A shallow closed concavity creates large angled faces instead of a rounded
    blob. The asymmetric silhouette rises into two irregular cutting points;
    the centre crease and two missing edge wedges are geometry, not decals.
    """
    cx,cy,base=at
    outline=[(-0.52,0),(-0.59,0.22),(-0.47,0.57),(-0.31,0.86),(-0.09,1.0),
             (0.012,0.77),(0.15,0.83),(0.29,0.95),(0.49,0.64),(0.59,0.23),(0.38,0)]
    n=len(outline)
    centre_height=0.43
    vertices=[]
    for scale,depth in [(1,0.066),(0.68,-0.018),(0.22,0.034)]:
        for i,(px,pz) in enumerate(outline):
            z=centre_height+(pz-centre_height)*scale
            x=px*width*scale+lean*z
            hook=0.105*max(0,(z-0.55)/0.45)**2
            y=side*(depth+0.10*(1-z)**2+hook)
            if i in [3,8] and scale<1:
                y-=side*0.045
            vertices.append((x,y,z*height))
    vertices.append((lean*centre_height,side*0.023,centre_height*height))
    centre=3*n
    faces=[]
    for ring in range(2):
        for i in range(n):
            j=(i+1)%n
            faces.append((ring*n+i,ring*n+j,(ring+1)*n+j,(ring+1)*n+i))
    for i in range(n):faces.append((2*n+i,2*n+(i+1)%n,centre))
    back_start=len(vertices)
    for px,pz in outline:
        hook=0.105*max(0,(pz-0.55)/0.45)**2
        vertices.append((px*width+lean*pz,side*(-0.068+0.1*(1-pz)**2+hook),pz*height))
    faces.append(tuple(reversed(range(back_start,back_start+n))))
    for i in range(n):
        j=(i+1)%n
        faces.append((i,back_start+i,back_start+j,j))
    c,s=math.cos(yaw),math.sin(yaw)
    transform=lambda p:(cx+p[0]*c-p[1]*s,cy+p[0]*s+p[1]*c,base+p[2])
    mesh(name,[transform(p) for p in vertices],faces,token,False)
    # Sparse exposed tips preserve the walnut silhouette; no continuous piping.
    for index in [3]:
        a=Vector(vertices[index]);b=Vector(vertices[(index+1)%n])
        path=[transform(a.lerp(b,t)+Vector((0,side*0.004,0))) for t in [0.25,0.40,0.56]]
        sweep(name+f"_chipped_tip_{index}",path,[0.002,0.007,0.002],
              token="bug-chitin-tan",sides=5,smooth=False)


def shield_scale(name,at,width,height,side=-1,yaw=0,token="bug-chitin-dark"):
    """A broad convex scute with an underlapping dark lip and fractured lower edge."""
    outline=[(-0.52,0.31),(-0.40,0.07),(-0.09,0.0),(0.045,0.065),(0.16,0.035),
             (0.47,0.19),(0.51,0.47),(0.26,0.81),(0.025,1.0),(-0.25,0.82),(-0.44,0.60)]
    n=len(outline)
    c,s=math.cos(yaw),math.sin(yaw)
    transform=lambda p:(at[0]+p[0]*c-p[1]*s,at[1]+p[0]*s+p[1]*c,at[2]+p[2])
    for backing in [True,False]:
        expansion=1.04 if backing else 1
        vertices=[]
        for scale,depth in [(1,0.025),(0.57,0.122)]:
            for i,(x,z) in enumerate(outline):
                px=x*width*scale*expansion
                pz=(0.47+(z-0.47)*scale*expansion)*height
                py=side*(depth-(0.025 if backing else 0))
                if i in [1,6] and scale<1:py-=side*0.03
                vertices.append((px,py,pz))
        vertices.append((0.03*width,side*(0.155-(0.025 if backing else 0)),height*0.45))
        centre=2*n
        faces=[]
        for i in range(n):
            j=(i+1)%n
            faces.extend([(i,j,n+j,n+i),(n+i,n+j,centre)])
        back=len(vertices)
        vertices.extend((x*width*expansion,side*(-0.025-(0.025 if backing else 0)),
                         (0.47+(z-0.47)*expansion)*height) for x,z in outline)
        faces.append(tuple(reversed(range(back,back+n))))
        for i in range(n):faces.append((i,back+i,back+(i+1)%n,(i+1)%n))
        mesh(name+("_underlip" if backing else "_armour"),[transform(p) for p in vertices],faces,
             "bug-chitin-black" if backing else token,False)
    edge=[transform((outline[i][0]*width,side*0.031,outline[i][1]*height)) for i in [1,2,3]]
    sweep(name+"_broken_lip",edge,[0.003,0.009,0.002],token="bug-chitin-tan",sides=5,smooth=False)


def laminar_faces(name,front=True,back=True):
    """Transverse courses interrupt vertical blades and give the curtain armored thickness."""
    if front:
        shield_scale(name+"_lower_left",(-0.235,-0.195,0.10),0.47,0.64,-1,
                     token="bug-chitin-dark")
        shield_scale(name+"_lower_right",(0.20,-0.19,0.22),0.51,0.58,-1,
                     token="bug-chitin-mid")
        shield_scale(name+"_upper_scale",(-0.065,-0.145,0.82),0.74,0.48,-1,
                     token="bug-chitin-dark")
    if back:
        shield_scale(name+"_back_lower",(0.025,0.19,0.13),0.76,0.65,1,
                     token="bug-chitin-dark")
        shield_scale(name+"_back_upper",(-0.075,0.15,0.84),0.68,0.43,1,
                     token="bug-chitin-mid")


def foot_roots(name, rotation=0, offset=(0,0)):
    """Low lateral roots blend the curtain into resin without a display plinth."""
    before=set(mesh_objects())
    for i,(x,side) in enumerate([(-0.27,-1),(0.21,1)]):
        organic.root(name+f"_root_{i}",[(x,side*0.12,0.16),(x+0.065,side*0.24,0.075),
                                      (x-0.065,side*0.31,0.039),(x-0.10,side*0.415,0.020)],
                     0.055,"bug-flesh",7)
    if rotation or offset!=(0,0):
        matrix=Matrix.Translation((offset[0],offset[1],0))@Matrix.Rotation(rotation,4,"Z")
        for ob in set(mesh_objects())-before:ob.matrix_world=matrix@ob.matrix_world


def ridge():
    """High serrated curtain, dominated by three wide fused shell blades."""
    straight_core()
    for i,(x,w,h,lean) in enumerate([(-0.27,0.35,0.92,-0.018),(0.06,0.51,1.16,0.025),
                                    (0.33,0.27,0.77,-0.014)]):
        shell_plate(f"ridge_front_{i}",(x,-0.13,0.725),w,h,-1,
                    token="bug-chitin-mid" if i==0 else "bug-chitin-dark",lean=lean)
    shell_plate("ridge_back_left",(-0.23,0.13,0.525),0.41,1.03,1,token="bug-chitin-dark")
    shell_plate("ridge_back_right",(0.21,0.13,0.525),0.43,1.17,1,token="bug-chitin-mid",lean=-0.02)
    laminar_faces("ridge")
    foot_roots("ridge")


def overlap():
    """Layered directional shell plates overlap into a complete grown wall."""
    straight_core(heights=[JOIN_HEIGHT,1.45,1.47,1.40,1.43,1.38,JOIN_HEIGHT])
    for i,(x,w,h) in enumerate([(-0.29,0.34,1.49),(-0.10,0.39,1.75),
                              (0.14,0.42,1.62),(0.34,0.25,1.48)]):
        shell_plate(f"overlapping_front_{i}",(x,-0.13-i*0.008,0.565),w,h-0.55,-1,
                    token="bug-chitin-dark" if i%2 else "bug-chitin-mid",lean=0.027)
    for i,(x,h) in enumerate([(-0.24,1.55),(0.21,1.64)]):
        shell_plate(f"overlapping_back_{i}",(x,0.12,0.575),0.40,h-0.55,1,
                    token="bug-chitin-dark",lean=-0.028)
    laminar_faces("overlap")
    foot_roots("overlap")


def ribbed():
    """Uneven fused ribs rise from a continuous plate curtain, without fence-post gaps."""
    straight_core(heights=[JOIN_HEIGHT,1.49,1.43,1.56,1.44,1.41,JOIN_HEIGHT])
    for side in [-1,1]:
        for i,(x,h) in enumerate([(-0.36,1.53),(-0.20,1.68),(0.025,1.84),(0.23,1.60),(0.38,1.47)]):
            path=organic.curve([(x,side*0.23,0.06),(x-0.07,side*0.27,h*0.35),
                                (x+0.05,side*0.18,h*0.77),(x-0.025,side*0.055,h)],10)
            widths=[0.085*(1-k/11)**0.63+0.007 for k in range(10)]
            sweep(f"fused_rib_{side}_{i}",path,widths,[r*0.58 for r in widths],
                  "bug-chitin-dark" if i%2 else "bug-chitin-mid",8,False)
            if i in [1,3]:
                sweep(f"rib_chip_{side}_{i}",[p+Vector((0,side*0.04,0)) for p in path[6:9]],
                      [0.005,0.012,0.004],token="bug-chitin-tan",sides=5,smooth=False)
    shell_plate("ribbed_low_apron",(-0.05,-0.21,0.01),0.69,0.77,-1,token="bug-chitin-dark")
    shield_scale("ribbed_transverse_front",(-0.025,-0.19,0.54),0.76,0.50,-1,
                 token="bug-chitin-dark")
    shield_scale("ribbed_transverse_back",(0.035,0.19,0.76),0.71,0.46,1,
                 token="bug-chitin-mid")
    foot_roots("ribbed")


def curve():
    """A grown ninety-degree bend, joining north and east along orthogonal centre lines."""
    path=[(0.5,0),(0.32,0),(0.18,0.035),(0.065,0.14),(0,0.32),(0,0.5)]
    curtain("continuous_organic_bend",path,[JOIN_HEIGHT,1.43,1.52,1.58,1.46,JOIN_HEIGHT])
    shell_plate("bend_east_outer",(0.285,-0.11,0.018),0.33,1.66,-1,token="bug-chitin-dark")
    shell_plate("bend_middle_outer",(0.085,0.042,0.02),0.44,1.83,-1,-math.pi/4,
                token="bug-chitin-mid")
    shell_plate("bend_north_outer",(-0.10,0.29,0.018),0.33,1.62,-1,-math.pi/2,
                token="bug-chitin-dark")
    shell_plate("bend_inner_fold",(0.18,0.18,0.02),0.34,1.54,1,-math.pi/4,
                token="bug-chitin-dark")
    shield_scale("bend_outer_lamella",(0.035,0.015,0.37),0.67,0.68,-1,-math.pi/4,
                 token="bug-chitin-dark")
    shield_scale("bend_inner_lamella",(0.20,0.19,0.85),0.42,0.47,1,-math.pi/4,
                 token="bug-chitin-mid")
    organic.root("bend_outer_root",[(0.17,-0.10,0.13),(-0.13,-0.20,0.06),
                                    (-0.25,0.01,0.04),(-0.38,0.13,0.015)],0.06,"bug-flesh",7)


def fork():
    """Three fused curtain branches form a structural T junction, not a central trophy."""
    straight_core("fork_cross_curtain")
    curtain("fork_north_branch",[(0,0.01),(0,0.21),(0,0.36),(0,0.5)],
            [1.55,1.49,1.40,JOIN_HEIGHT])
    shell_plate("fork_front_left",(-0.24,-0.12,0.02),0.42,1.63,-1,token="bug-chitin-dark")
    shell_plate("fork_front_right",(0.19,-0.13,0.02),0.46,1.78,-1,token="bug-chitin-mid")
    shell_plate("fork_north_east",(0.13,0.29,0.02),0.35,1.64,1,-math.pi/2,
                token="bug-chitin-dark")
    shell_plate("fork_north_west",(-0.13,0.27,0.02),0.36,1.56,-1,-math.pi/2,
                token="bug-chitin-mid")
    laminar_faces("fork",back=False)
    shield_scale("fork_branch_lamella",(-0.14,0.28,0.49),0.40,0.57,-1,-math.pi/2,
                 token="bug-chitin-dark")
    foot_roots("fork")


def end():
    """West-joining wall tapers into a broken, exposed carapace end toward east."""
    curtain("tapered_curtain",[(-0.5,0),(-0.31,0),(-0.09,0),(0.15,0),(0.37,0)],
            [JOIN_HEIGHT,1.43,1.23,0.74,0.20],widths=[1,1,0.93,0.72,0.38])
    shell_plate("end_main_plate",(-0.26,-0.12,0.018),0.35,1.67,-1,token="bug-chitin-mid",lean=-0.02)
    shell_plate("end_torn_plate",(-0.005,-0.12,0.018),0.34,1.36,-1,token="bug-chitin-dark",lean=0.06)
    shell_plate("end_small_fracture",(0.225,-0.07,0.015),0.26,0.60,-1,token="bug-chitin-mid")
    shell_plate("end_reverse_fold",(-0.22,0.12,0.018),0.39,1.45,1,token="bug-chitin-dark")
    shield_scale("end_lower_scale",(-0.17,-0.17,0.28),0.53,0.53,-1,token="bug-chitin-dark")
    shield_scale("end_reverse_scale",(-0.17,0.15,0.63),0.48,0.40,1,token="bug-chitin-mid")
    organic.root("broken_end_root",[(0.03,0.07,0.18),(0.21,0.08,0.07),
                                    (0.28,-0.03,0.04),(0.46,-0.17,0.015)],0.048,"bug-flesh",7)


def broken():
    """Low fractured wall remains retain west/east continuity and readable half cover."""
    straight_core("low_broken_core",[0.46,0.53,0.38,0.57,0.42,0.48,0.46])
    for i,(x,w,h) in enumerate([(-0.31,0.30,0.58),(-0.02,0.45,0.66),(0.30,0.31,0.50)]):
        shell_plate(f"fractured_front_{i}",(x,-0.13,0.008),w,h,-1,
                    token="bug-chitin-mid" if i==1 else "bug-chitin-dark",lean=0.018)
    shell_plate("fractured_back",(-0.03,0.13,0.008),0.59,0.61,1,token="bug-chitin-dark")
    shield_scale("fractured_transverse",(0.025,-0.18,0.06),0.61,0.39,-1,token="bug-chitin-mid")
    foot_roots("broken")


def spine_buttress():
    """A tall cluster of broad curved blades buttresses the continuous west/east wall."""
    straight_core("buttressed_curtain")
    shell_plate("buttress_front_wall",(-0.05,-0.15,0.02),0.67,1.64,-1,token="bug-chitin-dark")
    shell_plate("buttress_back_wall",(0.07,0.15,0.02),0.66,1.57,1,token="bug-chitin-mid")
    organic.horn("dominant_anchored_blade",(-0.14,0.045,0.02),math.pi*0.12,2.43,0.22,0.22,
                 "bug-chitin-dark")
    organic.horn("supporting_hook",(0.19,-0.045,0.015),math.pi*0.83,1.99,0.16,0.16,
                 "bug-chitin-mid")
    organic.horn("lateral_buttress",(-0.23,0.16,0.014),-math.pi*0.44,1.22,0.12,0.13,
                 "bug-chitin-dark")
    laminar_faces("buttress")
    foot_roots("buttress")


BUILDERS={"wall-ridge":ridge,"wall-overlap":overlap,"wall-ribbed":ribbed,
          "wall-curve":curve,"wall-fork":fork,"wall-end":end,"wall-broken":broken,
          "spine-buttress":spine_buttress}


def finish():
    """Seat rooted surfaces and consolidate immutable geometry by palette material."""
    for token,roughness in [("bug-chitin-dark",0.73),("bug-chitin-mid",0.76),
                            ("bug-chitin-tan",0.83),("bug-chitin-black",0.89),("bug-flesh",0.67)]:
        material(token).node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value=roughness
    bpy.context.view_layer.update()
    for ob in mesh_objects():
        if min((ob.matrix_world@Vector(v)).z for v in ob.bound_box)<-0.0001:
            cut_below(ob)
    groups={}
    for ob in mesh_objects():groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for token,parts in groups.items():
        result=join(parts,"carapace_"+token) if len(parts)>1 else parts[0]
        result["atlas_preserve_uv"]=True
    bpy.context.view_layer.update()


def build(kind="wall-ridge"):
    """Build one joining wall module; generation owns its neighbors and structure layout."""
    if kind not in BUILDERS:raise ValueError(f"unknown carapace module {kind!r}")
    BUILDERS[kind]()
    finish()
