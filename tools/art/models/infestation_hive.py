"""Hive organs: ribbed nursery sacs, hollow vents, shell fans and wet floor pockets.

Large organs attach to existing structures; walkable-floor details stay ankle low.
"""
import math
import os
import sys
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crescent_geometry import mesh, sweep, bead, rim
from infestation_network import strand
from infestation_parts import blade, lower_to_ground, finish_materials, transform_wall
from bpy_kit import mesh_objects


def cocoon(name, x, y, height=1.3, width=.34, depth=.27, base=.03):
    """Tapered walnut sac with seven pale transverse ribs and a split dorsal seam."""
    points, widths, depths = [], [], []
    for k in range(13):
        t=k/12
        bulge=max(.035, math.sin(math.pi*t)**.72)*(1-.22*t)
        points.append((x+.07*height*t*t,y+.025*math.sin(t*math.pi),base+height*t))
        widths.append(width*bulge)
        depths.append(depth*bulge)
    sweep(name+'_body',points,widths,depths,'bug-chitin-dark',sides=12)
    for k in range(1,8):
        t=.065+k*.105
        r=math.sin(math.pi*t)**.72*(1-.22*t)
        curve=[]
        for j in range(9):
            a=math.pi*.08+j*math.pi*1.84/8
            curve.append((x+.07*height*t*t+width*r*1.07*math.cos(a),
                          y+.025*math.sin(t*math.pi)+depth*r*1.07*math.sin(a),
                          base+height*t+.008*height*math.cos(a*2)))
        sweep(name+f'_rib_{k}',curve,[.012+width*.055]*9,token='bug-chitin-tan',sides=5)
    # Longitudinal keel breaks the ring rhythm and roots the sac into the substrate.
    for a in (0,math.pi):
        curve=[(x+.07*height*t*t+width*math.sin(math.pi*t)**.72*math.cos(a),
                y+depth*.15,base+height*t) for t in (.02,.18,.4,.65,.86,.98)]
        sweep(name+'_seam',curve,[.023,.028,.024,.021,.017,.005],token='bug-chitin-mid',sides=6)


def roots(name, count=5):
    """Asymmetric feet and forks knit a hive organ into the lower resin mat."""
    for k in range(count):
        a=k*math.tau/count+.27
        pts=[(math.cos(a)*r,math.sin(a)*r,z) for r,z in ((.13,.26),(.22,.13),(.33,.04),(.46,.012))]
        strand(name+str(k),pts,[.07,.058,.04,.006],height=.65)


def brood():
    """Three unequal ribbed sacs growing around the occupied prop's core."""
    cocoon('queen_sac',-.22,.10,1.32,.21,.22)
    cocoon('young_sac',.24,.16,.84,.16,.18)
    cocoon('sealed_sac',.05,-.27,.61,.17,.17)
    roots('nursery_root')


def vent_at(name, x, y, h, radius):
    """Bent fluted chimney with a closed deep black throat and a thick rolled lip."""
    sides=16
    profile=[(0,1),(.10,1.2),(.25,.94),(.55,.68),(.83,.58),(1,.78),
             (1,.55),(.84,.37),(.58,.30),(.5,.02)]
    verts=[]
    for t,r in profile:
        for k in range(sides):
            a=k*math.tau/sides
            wobble=1+.12*math.cos(a*5+t*3)
            verts.append((x+h*.15*t*t+math.cos(a)*radius*r*wobble,
                          y+math.sin(a)*radius*r*wobble,h*t+.016))
    faces=[tuple(reversed(range(sides))),tuple((len(profile)-1)*sides+k for k in range(sides))]
    for j in range(len(profile)-1):
        for k in range(sides):
            n=(k+1)%sides
            faces.append((j*sides+k,j*sides+n,(j+1)*sides+n,(j+1)*sides+k))
    ob=mesh(name,verts,faces,'bug-chitin-dark')
    # Separate black closed lining sits below the lip; it reads as a cavity, not a cone.
    bead(name+'_throat',(x+h*.15*.90,y,h*.89),radius*.48,'bug-chitin-black',scale=(1,1,.20),segments=12,rings=4)
    ring=[verts[5*sides+k] for k in range(sides)]
    rim(name+'_lip',ring,.020,'bug-chitin-tan')
    for k in range(5):
        a=k*math.tau/5
        pts=[]
        for t,r in profile[:6]:
            pts.append((x+h*.15*t*t+math.cos(a)*radius*r*1.10,
                        y+math.sin(a)*radius*r*1.10,h*t+.022))
        sweep(name+f'_flute_{k}',pts,[.035,.034,.031,.025,.022,.018],token='bug-chitin-mid',sides=5)


def vent():
    """One tall bent breathing vent and a short split shoot, joined by roots."""
    vent_at('tall_vent',-.19,.07,1.62,.18)
    vent_at('small_vent',.22,-.18,.64,.13)
    roots('vent_root',6)


def fan():
    """Overlapping lifted chitin fans with a low wet base, unlike ribbed sacs."""
    for i,(a,h) in enumerate(((.3,.95),(2.4,.63),(4.3,.77))):
        ob=blade('fan_'+str(i),0,h*.40,.63,h,.22,variant=i)
        matrix=ob.matrix_world.copy()
        for vertex in ob.data.vertices:
            x,z,r=matrix @ vertex.co
            radial=.12+r+(.65-z/h)*.14
            vertex.co=Vector((math.cos(a)*radial-math.sin(a)*x,math.sin(a)*radial+math.cos(a)*x,z))
        ob.matrix_world.identity()
    roots('fan_root')


def wall_nest(window=False):
    """Different-sized attached cocoons, keeping the window aperture unoccluded."""
    from infestation_parts import wall
    wall('window' if window else 'solid')
    for side in (-1,1):
        before=set(mesh_objects())
        if window:
            cocoon('pillar_sac',-.433,0,.91,.067,.13,base=.14)
            cocoon('sill_sac',.38,0,.33,.092,.11,base=.03)
        else:
            cocoon('wall_sac',-.10,0,1.39,.245,.22,base=.02)
            cocoon('satellite_sac',.32,0,.66,.11,.14,base=.03)
        for ob in set(mesh_objects())-before:
            # The sacs were authored upright. Move their rear into the wall plane.
            ob.location.y=side*(ob.location.y+.14)
            if side<0:
                for v in ob.data.vertices:
                    v.co.y=-v.co.y
                ob.data.flip_normals()


def pool():
    """Lobed wet seep with an irregular dark shore and tiny amber resin beads."""
    outline=[]
    for k in range(24):
        a=k*math.tau/24
        r=.30*(1+.18*math.sin(a*3)+.15*math.cos(a*5))
        outline.append((math.cos(a)*r*1.12,math.sin(a)*r,.013))
    verts=outline+[(x*.89,y*.89,.025) for x,y,z in outline]+[(0,0,.014)]
    n=len(outline)
    faces=[tuple(reversed(range(n)))]+[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]+[(2*n,n+k,n+(k+1)%n) for k in range(n)]
    mesh('wet_residue',verts,faces,'bug-bio-green-dim')
    rim('torn_shore',outline,.019,'bug-chitin-black')
    for k in (2,8,15,19):
        x,y,z=outline[k]
        bead('resin_bead',(x,y,.03),.037,'bug-chitin-tan',scale=(1,.7,.6),segments=8,rings=4)
    for k in (1,7,16):
        x,y,z=outline[k]
        strand('seep_thread'+str(k),[(x*.7,y*.7,.015),(x*1.12,y*1.12,.018),(x*1.24,y*1.24,.008)],[.024,.018,.002],'bug-flesh')


def scales():
    """A bed of overlapping broken shell scales with distinct large/small edges."""
    for i,(x,y,w,l,h,a) in enumerate(((-.13,.05,.44,.64,.12,-.35),(.12,.05,.31,.53,.09,.5),(.03,-.24,.26,.28,.065,.1),(-.21,.28,.19,.23,.046,-.8))):
        blade('shed_plate'+str(i),x,y,w,l,h,a,base=.002,variant=i)


def blisters():
    """Small exposed amber nodules held in a dark branching membrane."""
    for i,(x,y,r) in enumerate(((-.15,.04,.12),(.13,.13,.095),(.08,-.17,.08),(-.21,-.19,.054))):
        bead('blister_'+str(i),(x,y,r*.6),r,'bug-chitin-tan' if i%2==0 else 'bug-flesh-light',scale=(1,.8,.7),segments=10,rings=5)
        strand('blister_root_'+str(i),[(0,0,.012),(x*.65,y*.7,.017),(x,y,.023)],[.025,.032,.025],'bug-chitin-black')


def build_hive(kind):
    """Create a closed kit piece and normalize its base without changing its silhouette."""
    {'brood':brood,'vent':vent,'fan':fan,'wall-nest':wall_nest,
     'window-nest':lambda:wall_nest(True),'pool':pool,'scales':scales,'blisters':blisters}[kind]()
    lower_to_ground()
    finish_materials()
