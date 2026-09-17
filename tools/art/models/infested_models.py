"""Three authored infection stages built into the original city model geometry.

The clean builder remains the source of architecture, sockets and proportions.
Growth profiles follow each host's seams rather than scaling a generic organism.
Run tools/art/build-infested-models.py to export the catalogue and review angles.
"""
import importlib.util
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from bpy_kit import PALETTE, material, mesh_objects, join
from crescent_geometry import mesh, sweep, bead


def wet_materials():
    """Small sharp highlights on smooth dark tissue, satin amber egg cuticle."""
    for name, source, roughness in [('resin-wet', 'bug-chitin-black', .17),
                                    ('resin-membrane', 'bug-flesh', .24),
                                    ('resin-cuticle', 'bug-chitin-tan', .3),
                                    ('resin-secretion', 'bug-bio-green-dim', .12),
                                    ('resin-fibre', 'bug-chitin-mid', .26)]:
        PALETTE[name] = PALETTE[source]
        bsdf = material(name).node_tree.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Coat Weight'].default_value = .85
        bsdf.inputs['Coat Roughness'].default_value = .09


def cord(name, points, radius, token='resin-wet', steps=2):
    """Tapered Catmull-Rom tendon, smooth even where the underlying host bends."""
    path, widths = [], []
    for i in range(len(points)-1):
        a, b, c, d = [Vector(points[j]) for j in
                      (max(0, i-1), i, i+1, min(len(points)-1, i+2))]
        for k in range(steps):
            t = k/steps
            path.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
            q = (i+t)/(len(points)-1)
            widths.append(radius*(.18+.82*math.sin(math.pi*q)**.45))
    path.append(Vector(points[-1])); widths.append(radius*.12)
    return sweep(name, path, widths, token=token, sides=5)[0]


def pore(name, x, y, rx, ry, lift, phase, place):
    """A paper-thin perforated film: irregular stretched aperture and rolled rim."""
    count = 12
    vertices = []
    for ring in range(4):
        for i in range(count):
            a = math.tau*i/count
            wobble = 1+.12*math.sin(a*3+phase)+.06*math.sin(a*5-phase)
            inner = .58+.17*math.sin(a*2+phase)
            r = inner if ring in (1, 2) else 1
            z = lift + (.014 if ring == 1 else .003 if ring == 0 else 0)
            vertices.append(place(x+math.cos(a)*rx*r*wobble,
                                  y+math.sin(a)*ry*r*wobble, z))
    faces = []
    for ring in range(4):
        for i in range(count):
            j = (i+1)%count
            faces.append((ring*count+i, ring*count+j,
                          ((ring+1)%4)*count+j, ((ring+1)%4)*count+i))
    mesh(name, vertices, faces, 'resin-membrane')
    pts = [place(x+math.cos(math.tau*i/count)*rx*.62,
                 y+math.sin(math.tau*i/count)*ry*.62, lift+.016) for i in range(count+1)]
    cord(name+'_lip', pts, .009, 'resin-wet', steps=1)


def clutch(name, x, y, width, height, place, count=3):
    """Unequal embedded larval sacs, half sheathed by darker longitudinal tendons."""
    for i in range(count):
        cx = x+(i-(count-1)/2)*width*.52
        cy = y+height*(.12*math.sin(i*2.7))
        r = width*(.46 if i%2 else .54)
        h = height*(.85 if i%2 else 1)
        # A tapered closed shell; the inward half sits inside its host tissue.
        vertices, faces = [], []
        for j in range(9):
            t = j/8
            rr = max(.07, math.sin(math.pi*t)**.65)
            for k in range(10):
                a = math.tau*k/10
                vertices.append(place(cx+math.cos(a)*r*rr, cy+(t-.5)*h,
                                      .022+math.sin(a)*r*.75*rr))
        for j in range(8):
            for k in range(10):
                faces.append((j*10+k,j*10+(k+1)%10,(j+1)*10+(k+1)%10,(j+1)*10+k))
        faces += [tuple(reversed(range(10))), tuple(range(80,90))]
        mesh(name+f'_sac_{i}', vertices, faces, 'resin-cuticle')
        for side in (-1, 1):
            pts = [place(cx+side*r*.55*math.sin(math.pi*j/8),cy+(j/8-.5)*h,
                         .027+r*.68*math.sin(math.pi*j/8)) for j in range(9)]
            cord(name+f'_sheath_{i}_{side}',pts,.017,'resin-wet',steps=1)
        for j in range(1, 4):
            cy2 = cy+(j/5-.5)*h*.8
            cord(name+f'_crease_{i}_{j}',[place(cx-r*.6,cy2,.06),
                 place(cx,cy2-h*.025,.026+r*.78),place(cx+r*.6,cy2,.06)],.006,'resin-fibre',steps=1)


def wall_growth(kind, stage):
    """Infection grows from masonry joints and nests below sills, preserving openings."""
    half = kind == 'half'
    height = .5 if half else 1.5
    for side in (-1, 1):
        def place(x, z, depth):
            """Map a facade coordinate to the two authored wall faces."""
            return (x, side*(.076+depth), z)
        # These endpoints coincide on adjacent modules without outlining every tile.
        paths = [[(-.5,.045),(-.26,.12),(-.33,.26),(-.46,.38)],
                 [(-.47,.08),(-.42,.41),(-.39,.81),(-.46,1.20),(-.50,1.44)],
                 [(-.5,1.44),(-.17,1.40),(.15,1.34),(.5,1.44)]]
        if kind == 'door': paths = paths[1:]
        if half: paths = paths[:1]
        for i, points in enumerate(paths[:1 if stage == 1 else len(paths)]):
            cord(f'joint_{side}_{i}', [place(x,z,.016) for x,z in points], .011+stage*.009)
        if stage >= 2:
            # Pores are on solid masonry, never across glass or the doorway.
            regions = [(-.37,.23,.105,.17),(-.40,.69,.065,.20),(-.36,1.27,.12,.12)]
            if kind == 'solid': regions += [(-.10,.63,.24,.28),(.19,1.08,.22,.23)]
            if kind == 'window': regions += [(-.06,.26,.25,.16),(.11,1.26,.28,.11)]
            if kind == 'door': regions = [(-.42,.29,.06,.19),(-.42,.72,.06,.22),(.05,1.35,.29,.08)]
            if half: regions = [(-.18,.21,.25,.15)]
            for i,(x,z,rx,ry) in enumerate(regions):
                if stage == 2 and i%2: continue
                pore(f'film_{side}_{i}',x,z,rx,ry,.006,i*.71,place)
        if stage == 3:
            if kind == 'solid':
                clutch(f'masonry_nursery_{side}',-.05,.72,.22,.65,place,3)
            elif kind == 'window':
                clutch(f'masonry_nursery_{side}',.08,.25,.16,.32,place,3)
            elif kind == 'door':
                clutch(f'jamb_nursery_{side}',-.414,.71,.09,.40,place,1)
            for i in range(0 if kind == 'door' else 5):
                x = -.46+i*.09
                z = .11+(i%3)*.07
                cord(f'capillary_{side}_{i}',[place(x,z,.02),place(x+.10,z+.05,.026),
                     place(min(.46,x+.25),z+.025,.014)],.006,'resin-fibre',steps=1)


def car_growth(profile, stage):
    """Body seams lead up wheel arches to the bonnet, glazing and a roof clutch."""
    compact = profile == 'compact'
    old_axis = profile in ('sedan','compact')
    length = .94 if compact else 1.8
    width = .52 if compact else .58 if old_axis else .76
    roof = .82 if profile == 'sedan' else .86 if profile == 'utility' else .76
    deck = .39 if profile == 'sedan' else .38 if compact else .365
    cabin = .58 if compact else .86 if profile == 'sedan' else .81
    def place(x, y, z):
        """Match the original sedan X axis or the newer vehicle forward axis."""
        return (x,y,z) if old_axis else (y,-x,z)
    for side in (-1,1):
        path = [(-length*.48,side*width*.44,.07),(-length*.36,side*width*.54,.19),
                (-length*.25,side*width*.51,deck),(-cabin*.36,side*width*.45,roof*.76),
                (-cabin*.31,side*width*.34,roof+.018),(cabin*.28,side*width*.22,roof+.02)]
        cord(f'body_tendon_{side}',[place(*p) for p in path[:3 if stage==1 else 6]],.009+stage*.01)
        for i in range(stage):
            x = length*(-.32+i*.27)
            cord(f'sill_branch_{side}_{i}',[place(x,side*width*.50,.20),
                 place(x+.11,side*width*.51,deck-.012),place(x+.21,side*width*.23,deck+.016)],.009)
    if stage >= 2:
        def top(x,y,d):
            """Small membranes cling to the actual flat cabin roof."""
            return place(x,y,roof+.013+d)
        pore('roof_membrane',-.08,0,cabin*.4,width*.36,.002,1.7,top)
        if stage == 3:
            clutch('roof_incubator',-.06,0,.20,.44,top,3)
            for side in (-1,1):
                def window(x,z,d):
                    """Tissue bonds to the cabin glazing and its frame."""
                    return place(x,side*(width*(.405 if old_axis else .46)+d),z)
                pore(f'window_film_{side}',-.055,(deck+roof)/2,
                     cabin*.38,(roof-deck)*.41,.002,side,window)
                if side == -1:
                    clutch('window_brood',-.06,(deck+roof)/2,.12,.28,window,2)
            def bonnet(x,y,d):
                """Web the bonnet without filling the empty space beside the car."""
                return place(x,y,deck+.013+d)
            pore('bonnet_film',length*.38,0,length*.095,width*.37,.001,.2,bonnet)


def tree_growth(profile, stage):
    """Split bark becomes tendons and hanging brood, rather than a cone over the tree."""
    pine = profile == 'pine'
    for i in range(3+stage):
        a = i*2.399
        path = []
        for j,(r,z) in enumerate([(.42,.014),(.21,.07),(.105,.27),(.075,.51),(.20,.78),(.29,1.05)]):
            angle = a+.22*j
            path.append((math.cos(angle)*r,math.sin(angle)*r,z))
        cord(f'vascular_root_{i}',path[:3 if stage==1 else 5 if stage==2 else 6],.01+stage*.009)
    if stage >= 2:
        def place(x,z,d):
            """A thin hanging film is anchored to the trunk and lower branches."""
            return (x,-.09-d,z)
        pore('branch_film',-.09,.43,.19,.27,.004,.4,place)
        clutch('bark_clutch',.06,.48 if stage==2 else .69,
               .11 if stage==2 else .18,.37 if stage==2 else .66,place,1 if stage==2 else 3)
    if stage == 3:
        # Remove one leaf mass so this is a changed model silhouette, not an overlay.
        leaf = bpy.data.objects.get('tier_0' if pine else 'canopy_1')
        if leaf is not None:
            bpy.data.objects.remove(leaf,do_unlink=True)
        for i in range(4):
            a = i*1.7
            cord(f'branch_sinew_{i}',[(0,0,.68),(.12*math.cos(a),.12*math.sin(a),.91),
                 (.33*math.cos(a),.33*math.sin(a),1.12)],.024)
        pore('stretched_branch_film',-.12,.83,.25,.32,.008,1.8,place)


def hvac_growth(stage):
    """An air handler turns into a breathing organ through its existing fan wells."""
    for side in (-1,1):
        cord(f'cabinet_seam_{side}',[(side*.38,-.38,.10),(side*.43,-.40,.38),
             (side*.40,-.40,.72),(side*.32,-.34,.815),(0,-.22,.85)],.008+stage*.009)
    if stage >= 2:
        def face(x,z,d):
            """Fit the grille's front plane."""
            return (x,-.424-d,z)
        pore('intake_film',-.05,.43,.27,.21,.003,2.1,face)
        def top(x,y,d):
            """A ring of wet tissue emerges directly from a fan housing."""
            return (x,y,.84+d)
        for i,y in enumerate((-.22,.22)):
            pore(f'fan_throat_{i}',0,y,.16,.16,.01,i,top)
        if stage == 3:
            clutch('intake_brood',.07,.42,.14,.31,face,3)
            for i,y in enumerate((-.22,.22)):
                # Closed double-sided throat grows through the original fan well.
                rings = [(.16,.845),(.155,.94),(.12,1.04),(.087,1.025),(.11,.89)]
                vertices = [(math.cos(a)*r*(1+.07*math.sin(a*5)),
                             y+math.sin(a)*r,z) for r,z in rings
                            for a in [k*math.tau/12 for k in range(12)]]
                faces = []
                for j in range(len(rings)):
                    for k in range(12):
                        faces.append((j*12+k,j*12+(k+1)%12,
                                      ((j+1)%len(rings))*12+(k+1)%12,((j+1)%len(rings))*12+k))
                mesh(f'breathing_throat_{i}',vertices,faces,'resin-wet')


def build_variant(base_script, profile, stage):
    """Rebuild the clean host, then add a named, independently authored growth stage."""
    spec = importlib.util.spec_from_file_location('clean_host',os.path.join(HERE,base_script+'.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.build()
    original = set(mesh_objects())
    wet_materials()
    if profile.startswith('wall-'): wall_growth(profile[5:],stage)
    elif profile.startswith('car-'): car_growth(profile[4:],stage)
    elif profile.startswith('tree-'): tree_growth(profile[5:],stage)
    elif profile == 'hvac': hvac_growth(stage)
    else: raise ValueError(profile)
    growth = [ob for ob in mesh_objects() if ob not in original]
    join(growth, 'host_growth')
    bpy.context.view_layer.update()
    # No common join: environment atlas UVs and smooth wet surfaces retain their
    # separate material properties. Each primitive is closed for validation.
