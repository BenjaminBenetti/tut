"""Enclosed colony architecture: a lodge, segmented hall and tiered carapace keep.

These are solid map obstacles, not enlarged nests or enterable human buildings.
Paired elytra, armored vaults, grown buttresses and sealed biological valves make
their construction readable from every tactical camera angle. Build with
make_model.py --build-arg kind=lodge|hall|keep --no-register.
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
from crescent_geometry import bead, mesh, shell, sweep  # noqa: E402

spec = importlib.util.spec_from_file_location("organic_kit", os.path.join(HERE, "infestation-organic-kit.py"))
organic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(organic)


def closed_grid(name, points, rows, columns, thickness, token="bug-chitin-dark", smooth=True):
    """Thicken an authored roof surface into a closed shell with a clean underside."""
    n = len(points)
    vertices = list(points) + [(x, y, z-thickness) for x, y, z in points]
    faces = []
    for row in range(rows-1):
        for column in range(columns-1):
            a = row*columns+column
            b = a+1
            c = b+columns
            d = a+columns
            faces.extend([(a, b, c, d), (d+n, c+n, b+n, a+n)])
    boundary = list(range(columns))
    boundary += [row*columns+columns-1 for row in range(1, rows)]
    boundary += [(rows-1)*columns+column for column in range(columns-2, -1, -1)]
    boundary += [row*columns for row in range(rows-2, 0, -1)]
    for a, b in zip(boundary, boundary[1:]+boundary[:1]):
        faces.append((a, a+n, b+n, b))
    return mesh(name, vertices, faces, token, smooth)


def body(name, width, depth, shoulder, peak, base=0.03, axis="y", token="bug-chitin-black"):
    """A closed vaulted volume with substantial walls and rounded armored end caps."""
    sections = 9
    arch_steps = 14
    vertices = []
    ring_count = arch_steps+3
    for j in range(sections):
        longitudinal = -1+2*j/(sections-1)
        taper = 0.80+0.20*math.sin(math.pi*j/(sections-1))**0.5
        w = width*0.5*taper
        h = peak-(0.19*peak)*abs(longitudinal)**2
        coords = [(w*0.90, base)]
        for k in range(arch_steps+1):
            a = k*math.pi/arch_steps
            coords.append((w*math.cos(a), shoulder+(h-shoulder)*math.sin(a)**0.84))
        coords.append((-w*0.90, base))
        for cross, z in coords:
            point = (cross, longitudinal*depth*0.5, z)
            vertices.append(point if axis=="y" else (point[1], point[0], point[2]))
    faces = [tuple(reversed(range(ring_count)))]
    for j in range(sections-1):
        for k in range(ring_count):
            q = (k+1)%ring_count
            faces.append((j*ring_count+k, j*ring_count+q, (j+1)*ring_count+q, (j+1)*ring_count+k))
    faces.append(tuple((sections-1)*ring_count+k for k in range(ring_count)))
    return mesh(name, vertices, faces, token, True)


def footing(width, depth):
    """Irregular rooted corners seat the architecture directly into the colony floor."""
    for side in [-1, 1]:
        for end in [-1, 1]:
            x, y = side*width*0.35, end*depth*0.31
            organic.plate(f"rooted_corner_{side}_{end}", (x, y, 0.035),
                          (width*0.14, depth*0.15, 0.19), side*end*0.35, "bug-chitin-dark", False)
            organic.root(f"foundation_root_{side}_{end}",
                         [(x*0.82, y*0.82, 0.23), (x*1.06, y*0.94, 0.11),
                          (x*1.16, y*1.2, 0.045), (side*width*0.49, end*depth*0.46, 0.022)],
                         0.10, "bug-flesh", 8)


def buttress(name, start, shoulder, width=0.17, token="bug-chitin-mid"):
    """A fluted load-bearing rib rooted at the ground and fused into the roof wall."""
    a = Vector(start)
    d = Vector(shoulder)
    delta = d-a
    path = organic.curve([a, a+Vector((delta.x*0.08, delta.y*0.08, delta.z*0.63)),
                          d-Vector((delta.x*0.18, delta.y*0.18, delta.z*0.08)), d], 10)
    radii = [width*(1-0.36*i/9)*(1+0.09*math.sin(i*1.8)) for i in range(10)]
    sweep(name, path, radii, [r*0.62 for r in radii], token, 8, False)
    outer = Vector((a.x, a.y, 0)).normalized()
    stripe = [path[i]+outer*radii[i]*0.7 for i in range(2, 6)]
    sweep(name+"_fracture", stripe, [0.009, 0.017, 0.016, 0.005], token="bug-chitin-tan", sides=5)


def sealed_valve(name, at, width, height, turn=0):
    """A recessed black membrane closed by overlapping armored folds and a rib grille."""
    before = set(mesh_objects())
    x, y, z = at
    bead(name+"_backing", (x, y, z+height*0.51), 1, "bug-chitin-black",
         (width*0.5, 0.07, height*0.53), 20, 12)
    for side in [-1, 1]:
        points = [(x+side*width*0.45, y-0.075, z+0.09),
                  (x+side*width*0.46, y-0.11, z+height*0.55),
                  (x+side*width*0.23, y-0.13, z+height*0.97),
                  (x+side*width*0.05, y-0.095, z+height*1.03)]
        path = organic.curve(points, 13)
        sweep(name+f"_valve_fold_{side}", path,
              [width*(0.095-0.045*i/12) for i in range(13)],
              token="bug-chitin-mid", sides=8)
    for i in range(7):
        t = (i-3)/3
        dz = height*(0.85-0.38*abs(t))
        rib = [(x+t*width*0.32, y-0.09, z+height*0.12),
               (x+t*width*0.30, y-0.15, z+dz*0.48),
               (x+t*width*0.18, y-0.13, z+dz*0.83),
               (x+t*width*0.12, y-0.10, z+dz)]
        organic.root(name+f"_closed_grille_{i}", rib, width*0.035,
                     "bug-flesh" if i%2 else "bug-chitin-dark", 6)
    # Two broad folds make the centre visibly sealed rather than a usable doorway.
    for side in [-1, 1]:
        vertices = [(x+side*width*0.055,y-0.18,z+height*0.18),
                    (x+side*width*0.29,y-0.11,z+height*0.27),
                    (x+side*width*0.22,y-0.15,z+height*0.77),
                    (x+side*width*0.018,y-0.21,z+height*0.88)]
        mesh(name+f"_sealed_leaf_{side}", vertices+[(px,py+0.038,pz) for px,py,pz in vertices],
             [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],
             "bug-flesh", True)
    if turn:
        transform = Matrix.Translation(Vector(at)) @ Matrix.Rotation(turn,4,"Z") @ Matrix.Translation(-Vector(at))
        for ob in set(mesh_objects())-before:
            ob.matrix_world = transform @ ob.matrix_world


def elytron(name, side, width=1.30, depth=1.3, base=0.81, rise=1.49, token="bug-chitin-dark"):
    """One asymmetric beetle wing case: a high inner ridge sweeping to a fractured eave."""
    rows, cols = 17, 9
    points = []
    for row in range(rows):
        t = -1+2*row/(rows-1)
        y = t*depth
        arch = max(0,1-t*t)**0.70
        notch = 0.14 if row in ([3,12] if side<0 else [5,14]) else 0
        w = width*(0.80+0.20*arch)-notch
        for column in range(cols):
            u = column/(cols-1)
            x = side*(0.033+w*u)
            z = base+rise*arch*max(0,1-u**1.78)**0.72
            z += 0.035*math.sin(row*1.8)*(u**5)
            if row in [4,11] and column>4:
                z -= 0.065*(column-4)/4
            points.append((x,y,z))
    closed_grid(name,points,rows,cols,0.075,token,True)
    # Short pale cuts are edge damage, not an ornamental outline.
    for start in ([2,10] if side<0 else [6,13]):
        edge=[Vector(points[row*cols+cols-1])+Vector((0,0,0.008)) for row in range(start,start+3)]
        sweep(name+f"_cut_{start}",edge,[0.006,0.018,0.007],token="bug-chitin-tan",sides=5)
    ridge=[Vector(points[row*cols])+Vector((side*0.009,0,0.018)) for row in range(3,14)]
    sweep(name+"_inner_seam",ridge,[0.022]*len(ridge),token="bug-chitin-black",sides=6)


def vent_slits(name, at, span, vertical=False):
    """Small closed dark vents with restrained biological glints behind armor."""
    x,y,z=at
    for i in range(4):
        dx=(i-1.5)*span/4
        bead(name+f"_slit_{i}",(x+dx,y,z),1,"bug-chitin-black",(span*0.055,0.034,0.12),10,6)
        if i in [0,3]:
            bead(name+f"_life_{i}",(x+dx,y-0.028,z-0.03),1,"bug-bio-green-dim",
                 (span*0.022,0.018,0.025),8,6)


def lodge():
    """Low paired wing cases enclose a substantial three-tile colony lodge."""
    footing(3,3)
    body("lodge_substructure",2.32,2.35,0.75,1.92,token="bug-chitin-dark")
    elytron("left_vault",-1,rise=1.53,token="bug-chitin-dark")
    elytron("right_vault",1,depth=1.26,rise=1.46,token="bug-chitin-mid")
    for side in [-1,1]:
        for i,y in enumerate([-0.79,0.0,0.77]):
            buttress(f"lodge_buttress_{side}_{i}",(side*1.30,y,0.10),
                     (side*1.04,y+0.07,1.37-0.12*abs(y)),0.15,
                     "bug-chitin-mid" if i==1 else "bug-chitin-dark")
    sealed_valve("lodge_seal",(0,-1.18,0.12),0.87,1.33)
    organic.plate("brow_armour",(0,-0.86,1.38),(0.56,0.43,0.30),0,"bug-chitin-dark")
    for side in [-1,1]:
        organic.plate(f"lodge_cheek_{side}",(side*0.71,-0.92,0.28),(0.36,0.42,0.34),
                      side*0.22,"bug-chitin-dark")
    vent_slits("lodge_rear",(0,1.215,0.69),0.69)


def roof_segment(name, x, length, width, shoulder, peak, token, phase):
    """A broad overlapping transverse armor band above the brood hall's solid core."""
    rows,cols=5,19
    points=[]
    for row in range(rows):
        t=row/(rows-1)
        along=x+(t-0.5)*length
        for column in range(cols):
            a=column*math.pi/(cols-1)
            across=width*math.cos(a)
            h=shoulder+(peak-shoulder)*math.sin(a)**0.83
            h+=0.10*(1-t)+0.025*math.sin(column*1.7+phase)*math.sin(a)
            if row==0 and column in [4+phase%3,14-phase%3]:
                along_local=along+0.09
                h-=0.065
            else:along_local=along
            points.append((along_local,across,h))
    closed_grid(name,points,rows,cols,0.095,token)
    for start in [2,12]:
        edge=[Vector(points[k])+Vector((0,0,0.012)) for k in range(start,start+4)]
        sweep(name+f"_exposed_cut_{start}",edge,[0.007,0.015,0.013,0.004],
              token="bug-chitin-tan",sides=5)


def hall():
    """An elongated brood hall whose segmented roof stands on grown external ribs."""
    footing(4,3)
    body("hall_enclosed_chambers",2.35,3.45,1.17,2.49,axis="x",token="bug-chitin-dark")
    for i,x in enumerate([-1.36,-0.69,0.0,0.68,1.32]):
        height=[2.39,2.68,2.90,2.77,2.42][i]
        roof_segment(f"hall_roof_band_{i}",x,0.91,1.30,1.16,height,
                     "bug-chitin-dark" if i%2==0 else "bug-chitin-mid",i)
        for side in [-1,1]:
            buttress(f"hall_rib_{i}_{side}",(x,side*1.33,0.12),
                     (x-0.05,side*1.06,1.76+0.1*math.sin(i)),0.14)
    sealed_valve("hall_front_seal",(-0.15,-1.19,0.15),0.99,1.48)
    organic.plate("hall_door_cowl",(-0.15,-0.83,1.47),(0.64,0.48,0.28),0,"bug-chitin-dark")
    for side in [-1,1]:
        organic.plate(f"hall_end_shield_{side}",(side*1.49,0,0.96),
                      (0.34,0.87,0.90),0,"bug-chitin-dark",False)
        vent_slits(f"hall_rear_slits_{side}",(side*0.98,1.217,0.67),0.60)
    for i,x in enumerate([-0.72,0,0.73]):
        organic.plate(f"hall_dorsal_scute_{i}",(x,0,2.71 if i==1 else 2.48),
                      (0.44,0.19,0.38 if i==1 else 0.33),math.pi/2,"bug-chitin-dark")


def tier(name, width, depth, bottom, shoulder, peak, token="bug-chitin-dark"):
    """A rounded rectangular fortified chamber with a closed vaulted crown."""
    n=32
    profiles=[(0.86,bottom),(1.0,bottom+0.23),(0.96,shoulder),(0.70,peak-0.13),(0.40,peak)]
    vertices=[]
    for scale,z in profiles:
        for i in range(n):
            a=i*math.tau/n
            c,s=math.cos(a),math.sin(a)
            x=math.copysign(abs(c)**0.55,c)*width*0.5*scale
            y=math.copysign(abs(s)**0.55,s)*depth*0.5*scale
            vertices.append((x,y,z+0.025*math.sin(i*1.4)*(z-bottom)/(peak-bottom)))
    faces=[tuple(reversed(range(n)))]
    for j in range(len(profiles)-1):
        for i in range(n):
            q=(i+1)%n
            faces.append((j*n+i,j*n+q,(j+1)*n+q,(j+1)*n+i))
    faces.append(tuple((len(profiles)-1)*n+i for i in range(n)))
    return mesh(name,vertices,faces,token,True)


def crest(name, x, y, base, height, length, side=1):
    """A broad serrated dorsal armor keel, closed and thick rather than a needle spike."""
    outline=[(-length*0.52,0),(-length*0.50,height*0.37),(-length*0.31,height*0.80),
             (-length*0.06,height),(length*0.07,height*0.80),(length*0.13,height*0.84),
             (length*0.35,height*0.43),(length*0.52,0.04)]
    vertices=[]
    for offset in [-0.065,0.065]:
        vertices.extend((x+offset+side*h*0.065,y+p,base+h) for p,h in outline)
    n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    mesh(name,vertices,faces,"bug-chitin-dark" if side<0 else "bug-chitin-mid",False)
    sweep(name+"_worn_tip",[(x+side*h*0.065,y+p,base+h+0.004) for p,h in outline[2:5]],
          [0.010,0.016,0.008],token="bug-chitin-tan",sides=5)


def keep():
    """A tiered armored keep: broad lower chamber, shoulder roofs and sealed vent crown."""
    footing(4,4)
    tier("keep_lower_body",3.49,3.28,0.04,1.40,1.95,"bug-chitin-dark")
    tier("keep_upper_chamber",2.15,1.93,1.63,3.27,3.63,"bug-chitin-dark")
    for side in [-1,1]:
        for i,y in enumerate([-0.97,0,0.91]):
            organic.plate(f"keep_shoulder_{side}_{i}",(side*1.03,y,1.31),
                          (0.78,0.69,0.73),side*0.09,
                          "bug-chitin-mid" if i==1 else "bug-chitin-dark")
        for end in [-1,1]:
            buttress(f"keep_corner_{side}_{end}",(side*1.72,end*1.48,0.11),
                     (side*1.29,end*1.03,2.04),0.24,"bug-chitin-dark")
        # Vertical facade scales interrupt the lower tier without creating human windows.
        for i,x in enumerate([-0.75,0.73]):
            organic.plate(f"keep_facade_scale_{side}_{i}",(x,side*1.32,0.50),
                          (0.46,0.40,0.55),side*0.2,"bug-chitin-mid",False)
    sealed_valve("keep_sealed_gate",(0,-1.57,0.19),1.14,1.61)
    organic.plate("keep_gate_brow",(0,-1.22,1.48),(0.72,0.59,0.46),0,"bug-chitin-dark")
    for side in [-1,1]:
        organic.plate(f"keep_upper_roof_{side}",(side*0.39,0.07,3.14),
                      (0.65,1.02,0.60),side*0.06,"bug-chitin-dark")
        crest(f"dorsal_keel_{side}",side*0.24,0.05,3.59,
              0.53 if side<0 else 0.42,1.28,side)
    # Crown vents are shallow closed grilles, backed by an armored upper chamber.
    for front in [-1,1]:
        for i in range(5):
            x=(i-2)*0.26
            bead(f"keep_crown_vent_{front}_{i}",(x,front*0.898,3.21),1,"bug-chitin-black",
                 (0.070,0.045,0.23),10,8)
            if i==1:
                bead(f"keep_crown_life_{front}",(x,front*0.935,3.13),1,"bug-bio-green-dim",
                     (0.021,0.015,0.042),8,6)
    vent_slits("keep_rear_low",(0,1.588,0.77),0.81)


def build(kind="lodge"):
    """Build one closed colony building, seat its roots and consolidate static materials."""
    builders={"lodge":lodge,"hall":hall,"keep":keep}
    if kind not in builders:
        raise ValueError(f"unknown carapace building {kind!r}")
    builders[kind]()
    for name,roughness in [("bug-chitin-dark",0.72),("bug-chitin-mid",0.74),
                           ("bug-chitin-tan",0.81),("bug-chitin-black",0.88),("bug-flesh",0.65)]:
        shader=material(name).node_tree.nodes["Principled BSDF"]
        shader.inputs["Roughness"].default_value=roughness
        if name=="bug-chitin-black":
            shader.inputs["Specular IOR Level"].default_value=0.13
    bpy.context.view_layer.update()
    for ob in mesh_objects():
        if min((ob.matrix_world@Vector(v)).z for v in ob.bound_box)<-0.0001:
            cut_below(ob)
    # These buildings never animate: one closed mesh per palette material keeps
    # the added architectural detail affordable in a populated colony precinct.
    groups={}
    for ob in mesh_objects():
        groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for token,parts in groups.items():
        result=join(parts,f"carapace_{kind}_{token}") if len(parts)>1 else parts[0]
        result["atlas_preserve_uv"]=True
    bpy.context.view_layer.update()
