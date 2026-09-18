"""The colony's structural kit: grown chambers, shell buttresses and resin floors.

Thirty authored forms share the Crescent bugs' continuous-UV chitin surfaces.
Build one with make_model.py --build-arg kind=<key> --no-register. Hero pieces
are deliberately larger than municipal props: they replace lots and routes.
"""

from __future__ import annotations

import math
import os
import random
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
from bpy_kit import box, cut_below, material, mesh_objects  # noqa: E402
from crescent_geometry import bead, mesh, rim, scute, shell, sweep  # noqa: E402


def curve(points, count=13):
    """Sample a cubic Bezier for the fluid outer silhouette of a grown support."""
    a, b, c, d = map(Vector, points)
    return [(1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d
            for t in (i/(count-1) for i in range(count))]


def root(name, points, width=0.065, token="bug-flesh", sides=8):
    """A tapering surface root, thick at its socket and fine at the growing tip."""
    path = curve(points)
    radii = [max(0.004, width*(1-i/(len(path)-1))**0.6) for i in range(len(path))]
    return sweep(name, path, radii, [r*0.7 for r in radii], token, sides)[0]


def horn(name, at, direction, height, width, lean=0.45, token="bug-chitin-dark"):
    """A swept blade with a broad rooted foot, ribbed back and sharpened edge."""
    x, y, z = at
    dx, dy = math.cos(direction), math.sin(direction)
    points = curve([(x, y, z+0.04), (x-dx*width, y-dy*width, z+height*0.45),
                    (x+dx*lean*0.4, y+dy*lean*0.4, z+height*0.95),
                    (x+dx*lean, y+dy*lean, z+height)])
    widths = [max(0.006, width*(1-i/12)**0.72*(1+0.055*math.sin(i*2.1+height)))
              for i in range(13)]
    ob, frames = sweep(name, points, widths, [r*0.48 for r in widths], token, 10, smooth=False)
    edge = [p+u*w*0.8 for p, w, (u, _) in zip(points[4:12], widths[4:12], frames[4:12])]
    sweep(name+"_seam", edge, [max(0.003, w*0.065) for w in widths[4:12]],
          token="bug-chitin-tan", sides=6)
    for k in (2, 6):
        p, (u, v), w = points[k], frames[k], widths[k]
        rib = [p + u*math.cos(t)*w*1.025 + v*math.sin(t)*w*0.49
               for t in [0.31*k+math.pi*j/16 for j in range(7)]]
        sweep(name+f"_growth_band_{k}", rib, [width*0.035*(0.25+math.sin(j*math.pi/6)) for j in range(7)],
              token="bug-chitin-black" if k==2 else "bug-chitin-mid", sides=5)
    return ob


def apron(name, radius=0.46, height=0.12, seed=1, aspect=1):
    """Irregular layered shell footing without a visible geometric plinth."""
    rng = random.Random(seed)
    foot,_=shell(name+"_under", (0, 0, 0.022), radius, radius*aspect, height*0.23,
                 "bug-flesh", thickness=0.022, segments=32, rings=3)
    # The footing is a ragged growth front, not a circular miniature stand.
    for vertex in foot.data.vertices:
        p=vertex.co+foot.location
        a=math.atan2(p.y/max(aspect,0.01),p.x)
        radial=0.85+0.10*math.sin(a*3+seed)+0.07*math.cos(a*7+0.4)
        p.x*=radial
        p.y*=radial
        vertex.co=p-foot.location
    for i in range(7):
        a = i*math.tau/7 + rng.uniform(-0.2, 0.2)
        r = radius*rng.uniform(0.52, 0.72)
        ob, outline = shell(name+f"_skirt_{i}", (math.cos(a)*r, math.sin(a)*r*aspect, 0.025),
                            radius*0.38, radius*0.21, height*rng.uniform(0.65, 1.05),
                            "bug-chitin-dark" if i % 3 else "bug-chitin-mid",
                            thickness=0.025, segments=16, rings=3)
        ob.rotation_euler.z = a


def chamber(name, at=(0,0,0), radius=0.38, height=0.4, flare=0.18, angle=0):
    """A hollow fluted nest throat: continuous inner wall, rolled lip and dark floor."""
    cx, cy, cz = at
    n = 28
    vertices=[]
    profiles=[(radius, 0.035), (radius*0.84, height*0.30),
              (radius*(0.82+flare), height*0.8), (radius*(0.93+flare),height),
              (radius*(0.68+flare),height*0.94), (radius*0.56,height*0.35),
              (radius*0.55,0.035)]
    for r, z in profiles:
        for j in range(n):
            a=j*math.tau/n
            ripple=1+0.075*math.sin(5*a+angle)+0.045*math.cos(3*a+0.9)
            notch=-0.19*math.exp(-((j-7)/1.5)**2)-0.13*math.exp(-((j-22)/1.1)**2)
            lip=height*(0.095*math.cos(3*a+angle)+notch)*(z/height)**3
            vertices.append((cx+math.cos(a)*r*ripple,cy+math.sin(a)*r*ripple,cz+z+lip))
    faces=[]
    for i in range(len(profiles)):
        k=(i+1)%len(profiles)
        for j in range(n):
            q=(j+1)%n
            faces.append((i*n+j,i*n+q,k*n+q,k*n+j))
    mesh(name,vertices,faces,"bug-flesh",True)
    lip=vertices[3*n:4*n]
    for start,end in [(0,5),(12,17),(24,27)]:
        segment=lip[start:end]
        sweep(name+f"_worn_lip_{start}",segment,[radius*0.022]*len(segment),
              token="bug-chitin-tan",sides=5)
    lining=[]
    inner_profiles=[(radius*(0.68+flare)*0.99,height*0.84),(radius*0.56,height*0.34),
                    (radius*0.55,0.035),(radius*0.56,0.035),
                    (radius*0.57,height*0.34),(radius*(0.68+flare)*0.99+0.009,height*0.84)]
    for r,z in inner_profiles:
        for j in range(n):
            a=j*math.tau/n
            ripple=1+0.075*math.sin(5*a+angle)+0.045*math.cos(3*a+0.9)
            lining.append((cx+math.cos(a)*r*ripple,cy+math.sin(a)*r*ripple,cz+z))
    lining_faces=[]
    for i in range(len(inner_profiles)):
        k=(i+1)%len(inner_profiles)
        for j in range(n):
            q=(j+1)%n
            lining_faces.append((i*n+j,i*n+q,k*n+q,k*n+j))
    mesh(name+"_recess",lining,lining_faces,"bug-chitin-black",True)
    shell(name+"_dark",(cx,cy,cz+0.014),radius*0.62,radius*0.62,0.018,
          "bug-chitin-black",thickness=0.012,segments=24,rings=2)
    for i in range(7):
        a=i*math.tau/7+angle
        pts=[(cx+math.cos(a)*r,cy+math.sin(a)*r,cz+z)
             for r,z in [(radius*1.1,0.035),(radius*0.9,height*0.25),
                         (radius*0.84,height*0.57),(radius*(0.89+flare),height*0.91)]]
        root(name+f"_flute_{i}",pts,radius*0.06,"bug-chitin-mid",6)


def plate(name, at, size, rotation=0, token="bug-chitin-dark", edge=True):
    """An overlapping swept carapace plate with thin cut rim and central keel."""
    ob, outline=shell(name,at,size[0],size[1],size[2],token,crescent=0.24,
                     thickness=min(0.03,size[2]*0.35),segments=24,rings=5)
    rng=random.Random(name)
    cuts=[rng.randrange(2,10),rng.randrange(13,22)]
    scales=[rng.uniform(0.965,1.025) for _ in range(24)]
    for index in cuts:
        scales[index]=0.65+rng.random()*0.12
        scales[(index+1)%24]=0.90
    centre=Vector(at)
    for vertex in ob.data.vertices:
        index=vertex.index
        if 1<=index<=120:
            k=(index-1)%24
            reach=((index-1)//24+1)/5
        elif index>=122:
            k=(index-122)%24
            reach=1
        else:continue
        p=vertex.co+ob.location
        factor=1+(scales[k]-1)*reach*reach
        p.x=centre.x+(p.x-centre.x)*factor
        p.y=centre.y+(p.y-centre.y)*factor
        if 1<=index<=120 and k in cuts and reach<1:
            p.z-=size[2]*0.27*reach
        vertex.co=p-ob.location
    outline=[(at[0]+(p[0]-at[0])*scales[i],at[1]+(p[1]-at[1])*scales[i],p[2])
             for i,p in enumerate(outline)]
    parts=[ob]
    if edge:
        for start in [0,12]:
            chosen=[outline[(start+i)%24] for i in range(6) if (start+i)%24 not in cuts]
            parts.append(sweep(name+f"_cut_{start}",chosen,
                               [min(0.008,size[0]*0.018)]*len(chosen),
                               token="bug-chitin-tan",sides=5)[0])
    for part in parts:
        part.rotation_euler.z=rotation
    return ob


def egg(name,at,size=0.19,lean=0):
    """Opaque ribbed brood capsule held in a protective basal cup."""
    x,y,z=at
    bead(name+"_membrane",(x,y,z+size*1.18),size,"bug-flesh-light",(0.78,0.75,1.28),18,12)
    for j in range(5):
        a=j*math.tau/5
        path=[(x+math.cos(a)*r,y+math.sin(a)*r,z+h)
              for r,h in [(size*0.65,size*0.25),(size*0.81,size*0.9),
                          (size*0.67,size*1.8),(size*0.13,size*2.42)]]
        root(name+f"_seam_{j}",path,size*0.055,"bug-chitin-dark",6)
    plate(name+"_cup",(x,y,z+size*0.15),(size*1.03,size*0.83,size*0.42),lean,
          "bug-chitin-dark",False)
    bead(name+"_life",(x-size*0.65,y-size*0.30,z+size*1.03),size*0.075,
         "bug-bio-green-dim",(0.5,0.7,1.7),8,6)


def nest(variant="nest"):
    """Burrows use actual open mouths and asymmetric shell buttresses."""
    big=variant=="nest-large"
    r=0.83 if big else 0.43
    apron("nest",r,0.15,8)
    chamber("throat",radius=r*0.68,height=0.38 if big else 0.24,flare=0.10)
    for i in range(5):
        a=i*math.tau/5+0.2
        h=([1.48,1.2,0.76,0.56,0.91] if big else [0.88,0.61,0.38,0.31,0.69])[i]
        horn(f"buttress_{i}",(math.cos(a)*r*0.65,math.sin(a)*r*0.65,0.04),
             a+0.7,h,r*0.24,lean=r*0.23)
    if big:
        for i in range(5):
            a=i*math.tau/5
            root(f"outer_root_{i}",[(math.cos(a)*r*0.6,math.sin(a)*r*0.6,0.18),
                                   (math.cos(a)*r*0.9,math.sin(a)*r*0.65,0.08),
                                   (math.cos(a+0.3)*r,math.sin(a+0.3)*r,0.035),
                                   (math.cos(a+0.3)*0.96,math.sin(a+0.3)*0.96,0.02)],0.06)


def split_nest():
    """Two communicating burrow throats under a broken shared carapace."""
    for i,x in enumerate([-0.46,0.37]):
        before=set(mesh_objects())
        apron(f"foot_{i}",0.47,0.09,18+i)
        chamber(f"throat_{i}",radius=0.28,height=0.20+i*0.08,angle=i)
        for ob in set(mesh_objects())-before: ob.location.x+=x
    for x in [-0.6,-0.1,0.5]:
        horn("fractured_rib",(x,0.27,0.015),-math.pi/2,0.8-abs(x)*0.25,0.13,0.24)


def spines(kind):
    """Structural blades read as crooked grown bone, with visible interlocking feet."""
    apron(kind,0.43,0.12,11)
    if kind=="spine-tall":
        horn("dominant",(-0.1,0.1,0.02),-0.8,1.55,0.23,0.36)
        horn("daughter",(0.23,-0.13,0.02),2.0,0.69,0.12,0.10)
    else:
        for i in range(5 if kind=="spine-cluster" else 3):
            a=i*2.4
            horn(f"crook_{i}",(math.cos(a)*0.2,math.sin(a)*0.2,0.02),a,
                 [0.92,0.71,0.56,0.43,0.66][i]*(0.5 if kind=="spine-low" else 1),
                 0.12,0.10)


def fan(kind):
    """Overlapping shell fins make low and high cover without cone silhouettes."""
    count=5 if kind=="shell-fan" else 6 if kind=="shell-ridge" else 9
    width=0.42 if kind!="shell-barricade" else 0.91
    apron(kind,width,0.12,34,aspect=0.48 if width>0.5 else 0.8)
    for i in range(count):
        t=i/(count-1)
        x=(t-0.5)*width*1.5
        height=(0.36+0.38*math.sin(t*math.pi))*(0.65 if kind=="shell-ridge" else 1)
        horn(f"fan_rib_{i}",(x,0.05*math.sin(i),0.03),-math.pi/2+(t-0.5)*0.7,
             height,0.14,0.13)
        ob=plate(f"fin_{i}",(x,-0.06,0.10),(0.14,0.23,height*0.58),t*0.4,
                 "bug-chitin-mid" if i%3==0 else "bug-chitin-dark")
        ob.rotation_euler.x=-0.65


def hive(kind):
    """Large colony heart: overlapping vaulted chambers buttressed by sickle blades."""
    apron(kind,0.87,0.18,28)
    if kind=="hive-spire":
        chamber("central_lung",radius=0.4,height=1.28,flare=-0.09)
        for i in range(4):
            a=i*math.tau/4+0.45
            horn(f"spire_{i}",(math.cos(a)*0.56,math.sin(a)*0.56,0.025),a+1.1,
                 [2.06,1.8,1.5,1.28][i],0.26,0.25)
            for j in range(3):
                plate(f"armour_{i}_{j}",(math.cos(a)*0.47,math.sin(a)*0.47,0.19+j*0.22),
                      (0.29,0.32,0.32),a,"bug-chitin-dark" if j%2 else "bug-chitin-mid")
    else:
        chamber("crown_chamber",radius=0.54,height=0.57,flare=0.11)
        for i in range(7):
            a=i*math.tau/7
            horn(f"crown_blade_{i}",(math.cos(a)*0.62,math.sin(a)*0.62,0.03),a+math.pi,
                 1.08+0.23*math.sin(i*1.7),0.20,0.21)
        for i in range(3):
            egg(f"crown_brood_{i}",(0.2*math.cos(i*2.4),0.2*math.sin(i*2.4),0.025),0.15)


def arch():
    """A hollow grown gate whose negative space survives all camera orientations."""
    for side in [-1,1]:
        before=set(mesh_objects())
        apron(f"arch_foot_{side}",0.32,0.12,26+side)
        for ob in set(mesh_objects())-before: ob.location.x+=side*0.64
    path=curve([(-0.64,0,0.10),(-0.65,0,1.8),(0.56,0,1.8),(0.66,0,0.09)],25)
    sweep("arch_back",path,[0.15+0.045*math.sin(i*math.pi/24) for i in range(25)],
          [0.17]*25,"bug-chitin-dark",12)
    for i in range(1,24,2):
        p=path[i]
        plate(f"arch_segment_{i}",tuple(p),(0.16,0.25,0.14),0,
              "bug-chitin-mid" if i%4==1 else "bug-chitin-dark")
    for side in [-1,1]:
        line=[p+Vector((0,side*0.15,0)) for p in path]
        sweep(f"arch_suture_{side}",line,[0.022]*25,token="bug-chitin-tan",sides=6)


def vent(kind):
    """Fluted trumpet vents with dark hollow cores and thick scalloped apertures."""
    apron(kind,0.43,0.13,14)
    tall=kind=="vent-tall"
    chamber("vent",radius=0.23,height=1.18 if tall else 0.41,flare=0.33)
    for i in range(3):
        a=i*math.tau/3
        plate(f"vent_buttress_{i}",(0.21*math.cos(a),0.21*math.sin(a),0.08),
              (0.18,0.25,0.32 if tall else 0.17),a,"bug-chitin-dark")
    if tall:
        chamber("daughter_vent",at=(0.24,-0.17,0),radius=0.11,height=0.46,flare=0.3)


def brood(kind):
    """Brood gathers in cradles of overlapping shell scales, never a plain sphere pile."""
    big=kind=="egg-clutch"
    apron(kind,0.86 if big else 0.44,0.13,41)
    positions=[(-0.34,0.12,0.24),(0.17,0.3,0.27),(0.43,-0.18,0.21),
               (-0.15,-0.35,0.20),(0.10,-0.05,0.3),(-0.55,-0.22,0.15)] if big else [
                   (-0.17,0.12,0.18),(0.14,0.08,0.2),(-0.02,-0.20,0.15)]
    for i,(x,y,size) in enumerate(positions): egg(f"brood_{i}",(x,y,0.055),size,i*0.4)
    if big:
        for i in range(3):
            a=i*2.15
            horn(f"cradle_{i}",(0.55*math.cos(a),0.55*math.sin(a),0.02),a+math.pi,
                 0.68,0.14,0.21)


def roots(kind):
    """Resin arteries branch from grown nodes or cling to the edge of a colony."""
    if kind=="tendril-node":
        apron("node",0.42,0.12,38)
        for i in range(3): plate(f"node_plate_{i}",(0.025*i,0.05*i,0.07+i*0.10),
                                 (0.25-i*0.04,0.29-i*0.03,0.15),i*0.25)
    count=7 if kind!="edge-growth" else 5
    for i in range(count):
        a=i*math.tau/count if kind!="edge-growth" else (i/(count-1)-0.5)*2.4
        r=0.47
        start=(0.02,0.01,0.12 if kind=="tendril-node" else 0.042)
        root(f"artery_{i}",[start,(math.cos(a+0.5)*0.2,math.sin(a+0.5)*0.2,0.065),
                             (math.cos(a-0.25)*0.34,math.sin(a-0.25)*0.34,0.04),
                             (math.cos(a)*r,math.sin(a)*r,0.02)],0.042)
        root(f"capillary_{i}",[(math.cos(a)*0.25,math.sin(a)*0.25,0.04),
                               (math.cos(a+0.5)*0.32,math.sin(a+0.5)*0.32,0.034),
                               (math.cos(a+0.6)*0.40,math.sin(a+0.6)*0.40,0.025),
                               (math.cos(a+0.5)*0.48,math.sin(a+0.5)*0.48,0.014)],0.018,
             "bug-chitin-mid",6)
    if kind=="edge-growth":
        for i in range(3): plate(f"edge_scale_{i}",(-0.24,0.22*(i-1),0.02),
                                 (0.18,0.14,0.10),i*0.12)


def remains(kind):
    """Discarded colony anatomy creates low cover and readable biological debris."""
    if kind=="carapace":
        plate("shed_shell",(-0.04,0,0.09),(0.35,0.39,0.34),0.17)
        for i in range(3):
            plate(f"shell_fragment_{i}",(0.26-i*0.24,-0.28,0.035),
                  (0.13,0.1,0.085),i*0.7,"bug-chitin-mid")
    else:
        for i in range(5):
            y=(i-2)*0.135
            plate(f"empty_segment_{i}",(math.sin(i)*0.07,y,0.025),
                  (0.3-abs(i-2)*0.045,0.15,0.21),i*0.06)
        for side in [-1,1]:
            root(f"dried_tendon_{side}",[(side*0.22,0.3,0.06),(side*0.38,0.14,0.035),
                                         (side*0.38,-0.16,0.024),(side*0.25,-0.42,0.015)],
                 0.028,"bug-chitin-tan",6)


def pool():
    """A broad, low resin sump surrounded by broken crust and feed channels."""
    surface,_=shell("wet_sump",(0,0,0.034),0.93,0.83,0.027,"bug-chitin-black",thickness=0.032,
                    segments=40,rings=4)
    for vertex in surface.data.vertices:
        p=vertex.co+surface.location
        a=math.atan2(p.y/0.83,p.x/0.93)
        reach=0.87+0.07*math.sin(3*a)+0.06*math.cos(7*a+0.9)
        p.x*=reach
        p.y*=reach
        vertex.co=p-surface.location
    for i in range(9):
        a=i*math.tau/9+math.sin(i*3.3)*0.19
        reach=0.9+0.10*math.sin(i*1.4)
        plate(f"sump_crust_{i}",(math.cos(a)*0.65*reach,math.sin(a)*0.57*reach,0.03),
              (0.21+0.025*math.sin(i),0.17,0.075),a,
              "bug-chitin-mid" if i%3==0 else "bug-chitin-dark")
    for i in range(3):
        plate(f"sump_islet_{i}",(-0.24+i*0.18,0.1*math.sin(i*2.3),0.042),
              (0.065,0.046,0.018),i*1.1,"bug-flesh",False)
    for i in range(4):
        a=i*1.7
        root(f"feed_channel_{i}",[(math.cos(a)*0.8,math.sin(a)*0.7,0.06),
                                  (math.cos(a)*0.48,math.sin(a)*0.48,0.065),
                                  (math.cos(a+0.4)*0.33,math.sin(a+0.4)*0.33,0.061),
                                  (0.05,0,0.06)],0.024,"bug-flesh-light",6)


def ribs():
    """Exposed burrow ribs form a low vaulted remnant with a clear open tunnel."""
    for i in range(5):
        x=(i-2)*0.31+0.025*math.sin(i*1.7)
        h=[0.68,0.91,0.80,1.03,0.75][i]
        lean=0.05*math.cos(i*2.3)
        path=curve([(x,-0.38,0.04),(x+lean,-0.42,h),(x-lean,0.42,h*0.9),
                    (x,0.38,0.04)],17)
        sections=[path[:7],path[11:]] if i==2 else [path]
        for j,section in enumerate(sections):
            sweep(f"vault_{i}_{j}",section,
                  [0.045+0.014*math.sin(k*1.5+i) for k in range(len(section))],
                  token="bug-chitin-dark",sides=9,smooth=False)
        if i!=2:
            sweep(f"vault_ridge_{i}",[p+Vector((0,0,0.051)) for p in path[4:10]],
                  [0.005,0.007,0.011,0.013,0.009,0.004],token="bug-chitin-tan",sides=6)
        if i in [0,3]:
            plate(f"rib_foot_scale_{i}",(x,-0.31,0.025),(0.14,0.16,0.085),i*0.4)
    for side in [-1,1]:
        root(f"burrow_sill_{side}",[(-0.86,side*0.36,0.035),(-0.2,side*0.40,0.11),
                                   (0.35,side*0.43,0.045),(0.91,side*0.31,0.015)],0.07)


def feeder():
    """A low hooked feeding funnel flanked by paired grown shell shields."""
    apron("feeder",0.43,0.10,51)
    chamber("funnel",at=(0,-0.12,0),radius=0.20,height=0.36,flare=0.16)
    for side in [-1,1]:
        horn(f"feeder_hook_{side}",(side*0.27,0.18,0.03),-math.pi/2,0.94,
             0.15,0.43)
        plate(f"feeder_shield_{side}",(side*0.22,0.06,0.08),(0.19,0.30,0.29),side*0.32)


def floor_fragment(name, outline, height=0.055):
    """A nearly flush irregular crust fragment; continuous terrain material owns its color."""
    n=len(outline)
    vertices=[(x,y,z) for z in (0.049,height) for x,y in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces.extend((j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n))
    return mesh(name,vertices,faces,"bug-chitin-dark",False)


def floor_channel(name,points,width=0.008):
    """A half-buried artery with only millimeters of relief above the shared slab."""
    root(name,[(x,y,0.05) for x,y in points],width,"bug-chitin-dark",6)


def ground(kind):
    """Sparse flush relief leaves the continuous world-space resin texture uninterrupted."""
    box("resin_ground",(1,1,0.05),(0,0,0.025),"bug-chitin-dark")
    if kind in ("ground-cracked","ground-nest-floor"):
        outlines=[
            [(-0.5,-0.5),(-0.065,-0.5),(-0.14,-0.19),(-0.17,-0.065),(-0.49,0.045)],
            [(-0.035,-0.5),(0.5,-0.5),(0.5,-0.105),(0.13,0.015),(-0.135,-0.06)],
            [(-0.5,0.075),(-0.155,-0.025),(0.09,0.16),(0.055,0.5),(-0.5,0.5)],
            [(0.145,0.045),(0.5,-0.075),(0.5,0.5),(0.085,0.5),(0.125,0.16)],
        ]
        for i,outline in enumerate(outlines):
            floor_fragment(f"fractured_crust_{i}",outline,0.054+i*0.001)
        if kind=="ground-nest-floor":
            floor_channel("throat_feed_a",[(-0.5,-0.19),(-0.24,-0.23),(-0.17,0.13),(0.5,0.12)],0.010)
            floor_channel("throat_feed_b",[(0.09,-0.5),(-0.07,-0.26),(0.24,0.20),(0.16,0.5)],0.009)
    elif kind=="ground":
        floor_fragment("resin_flake_a",[(-0.34,-0.24),(-0.17,-0.31),(-0.04,-0.19),
                                        (-0.09,-0.12),(-0.28,-0.10)],0.055)
        floor_fragment("resin_flake_b",[(0.15,0.23),(0.30,0.14),(0.38,0.20),(0.31,0.32),
                                        (0.20,0.34)],0.053)
        floor_fragment("resin_flake_c",[(-0.27,0.24),(-0.13,0.15),(-0.09,0.20),
                                        (-0.19,0.32)],0.054)
    elif kind=="ground-ribbed":
        floor_channel("resin_rib_a",[(-0.5,-0.30),(-0.2,-0.25),(0.15,-0.36),(0.5,-0.30)])
        floor_channel("resin_rib_b",[(-0.5,0.03),(-0.19,0.16),(0.10,-0.15),(0.5,0.03)],0.010)
        floor_channel("resin_rib_c",[(-0.5,0.30),(-0.2,0.39),(0.18,0.21),(0.5,0.30)],0.006)
    else:
        width=0.014 if kind=="ground-rooted" else 0.007
        floor_channel("low_artery",[(-0.5,-0.20),(-0.1,-0.28),(0.11,0.28),(0.5,0.17)],width)
        floor_channel("low_branch",[(-0.13,-0.09),(-0.01,0.11),(-0.28,0.27),(-0.16,0.5)],width*0.65)
        if kind=="ground-rooted":
            floor_fragment("rooted_crust",[(0.04,-0.27),(0.16,-0.29),(0.28,-0.12),
                                           (0.23,-0.02),(0.17,-0.08)],0.057)
        else:
            floor_channel("capillary",[(0.11,0.12),(0.18,-0.03),(0.31,-0.17),(0.33,-0.5)],0.005)


def build(kind="nest"):
    """Build one authored environmental role and close every surface at the ground."""
    if kind.startswith("ground"): ground(kind)
    elif kind in ("nest","nest-large"): nest(kind)
    elif kind=="nest-split": split_nest()
    elif kind.startswith("spine"): spines(kind)
    elif kind.startswith("shell"): fan(kind)
    elif kind.startswith("hive"): hive(kind)
    elif kind=="arch": arch()
    elif kind.startswith("vent"): vent(kind)
    elif kind.startswith("egg"): brood(kind)
    elif kind in ("tendril-node","roots","edge-growth"): roots(kind)
    elif kind in ("carapace","husk"): remains(kind)
    elif kind=="resin-pool": pool()
    elif kind=="burrow-ribs": ribs()
    elif kind=="feeder": feeder()
    else: raise ValueError(f"unknown organic kit member: {kind}")
    # Flesh is moist, shell is satin: restrained roughness contrast reads better
    # than a noisy texture or neon painted seams at tactical camera distance.
    for name,value in [("bug-flesh",0.58),("bug-flesh-light",0.53),
                       ("bug-chitin-black",0.86),("bug-chitin-dark",0.68),
                       ("bug-chitin-mid",0.69),("bug-chitin-tan",0.77)]:
        material(name).node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value=value
    material("bug-chitin-black").node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value=0.12
    bpy.context.view_layer.update()
    for ob in mesh_objects():
        if min((ob.matrix_world@Vector(v)).z for v in ob.bound_box)<-0.0001:
            cut_below(ob)
