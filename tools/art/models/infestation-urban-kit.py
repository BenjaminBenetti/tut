"""A ruined municipal kit overtaken by layered, load-bearing chitin.

Authored meshes retain continuous UVs across curved roots and shell plates.
Every variant changes the silhouette and construction, rather than recolouring
an existing object. The city's original materials remain visible between the
invasive structures. Export through make_model.py --build-arg kind=<variant>.
"""

import math
import os
import random
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
from bpy_kit import PALETTE, bevel, box, cylinder, material, socket  # noqa: E402


PALETTE["infested-car-red"] = "#7A3931"


# ===========================================
# Closed sculpted geometry and continuous UVs
# ===========================================


def mesh(name, vertices, faces, token, smooth=False, uv=None):
    """Create one closed material mesh, with an optional authored UV coordinate per vertex."""
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.materials.append(material(token))
    data.update()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    for face in data.polygons:
        face.use_smooth = smooth
    if uv is not None:
        layer = data.uv_layers.new(name="UVMap")
        for face in data.polygons:
            for li in face.loop_indices:
                layer.data[li].uv = uv[data.loops[li].vertex_index]
        ob["atlas_preserve_uv"] = True
    return ob


def sweep(name, points, radii, token="bug-flesh", sides=10, flatten=1.0):
    """Sweep a tapered, closed organic tube with a parallel transported cross section."""
    vectors = [Vector(p) for p in points]
    vertices, uvs = [], []
    last_normal = None
    for i, centre in enumerate(vectors):
        tangent = (vectors[min(i + 1, len(vectors) - 1)] - vectors[max(0, i - 1)]).normalized()
        guide = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((0, 1, 0))
        normal = tangent.cross(guide).normalized()
        if last_normal is not None and normal.dot(last_normal) < 0:
            normal = -normal
        last_normal = normal
        binormal = tangent.cross(normal).normalized()
        for j in range(sides):
            angle = math.tau * j / sides
            point = centre + radii[i] * (normal * math.cos(angle) + binormal * math.sin(angle) * flatten)
            vertices.append(tuple(point))
            uvs.append((i / (len(vectors) - 1), j / sides))
    faces = [tuple(reversed(range(sides)))]
    for i in range(len(vectors) - 1):
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides,
                          (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j))
    faces.append(tuple((len(vectors) - 1) * sides + j for j in range(sides)))
    return mesh(name, vertices, faces, token, smooth=True, uv=uvs)


def plate(name, at, length, width, height, yaw=0, tilt=0, token="bug-chitin-mid", ridge=True):
    """A swept pointed shell with a keeled crown and asymmetric trailing edge."""
    vertices, uv = [], []
    rings, sides = 9, 10
    for i in range(rings):
        t = i / (rings - 1)
        profile = (0.10 + math.sin(math.pi * t) ** 0.7) * (1 - t * 0.18)
        x = length * (t - 0.48)
        z = height * (math.sin(t * math.pi * 0.82) * 0.65 + t * 0.1)
        for j in range(sides):
            a = math.tau * j / sides
            y = width * 0.5 * profile * math.cos(a)
            dz = height * 0.25 * profile * math.sin(a)
            vertices.append((x, y, z + dz))
            uv.append((t, j / sides))
    faces = [tuple(reversed(range(sides)))]
    for i in range(rings - 1):
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides,
                          (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j))
    faces.append(tuple((rings - 1) * sides + j for j in range(sides)))
    ob = mesh(name, vertices, faces, token, smooth=True, uv=uv)
    ob.location, ob.rotation_euler = at, (0, tilt, yaw)
    if ridge:
        path = []
        for i in range(7):
            t = 0.08 + i * 0.135
            path.append((length * (t - 0.48), -width * 0.1,
                         height * (math.sin(t * math.pi * .82) * .65 + t * .1) + height * .255 * math.sin(math.pi * t) ** .7))
        rib = sweep(name + "_worn_keel", path, [height * .05] * 6 + [height * .015], "bug-chitin-tan", sides=7)
        rib.location, rib.rotation_euler = at, (0, tilt, yaw)
    return ob


def blister(name, at, size, token="bug-chitin-dark"):
    """A heavy ribbed carapace mass that anchors fine plates to the consumed object."""
    vertices, uvs, faces = [], [], []
    rings, sides = 10, 16
    for i in range(rings):
        a=.04+(math.pi-.08)*i/(rings-1)
        for j in range(sides):
            b=math.tau*j/sides
            rib=1+.08*math.cos(i*math.pi*1.5)
            vertices.append((size[0]*math.cos(a),size[1]*math.sin(a)*math.cos(b)*rib,
                             size[2]*math.sin(a)*math.sin(b)*rib))
            uvs.append((i/(rings-1),j/sides))
    faces.append(tuple(reversed(range(sides))))
    for i in range(rings-1):
        for j in range(sides):
            faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.append(tuple((rings-1)*sides+j for j in range(sides)))
    ob=mesh(name,vertices,faces,token,smooth=True,uv=uvs)
    ob.location=at
    return ob


def beam(name, start, end, radius=.024, token="env-rust", sides=8):
    """Place a solid structural bar between two points."""
    a, b = Vector(start), Vector(end)
    ob = cylinder(name, radius, radius, (b - a).length, sides, tuple((a + b) / 2), token)
    ob.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return ob


def shard(name, at, size, token="env-concrete", angle=0):
    """A closed angular fracture with an exposed sloping break instead of a perfect cube."""
    w, d, h = size
    vertices = [(-w/2,-d/2,0),(w/2,-d/2,0),(w/2,d/2,0),(-w/2,d/2,0),
                (-w*.48,-d*.43,h*.64),(w*.42,-d*.4,h),(w*.38,d*.45,h*.73),(-w*.4,d*.4,h*.86)]
    ob = mesh(name, vertices, [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)], token)
    ob.location, ob.rotation_euler.z = at, angle
    bevel(ob, min(.013, h * .08))
    return ob


def ground_roots(name, centre=(0, 0, .06), radius=.4, count=7):
    """Splayed muscular attachment roots taper into the terrain around a colony structure."""
    x, y, z = centre
    for i in range(count):
        a = i * math.tau / count + .3
        r = radius * (.82 + .15 * math.sin(i * 4.3))
        points = [(x + math.cos(a)*r, y + math.sin(a)*r, .025),
                  (x + math.cos(a-.12)*r*.66, y + math.sin(a-.12)*r*.66, .065),
                  (x + math.cos(a+.16)*r*.32, y + math.sin(a+.16)*r*.32, z+.04),
                  (x, y, z+.11)]
        sweep(f"{name}_{i}", points, [.012,.035,.045,.06], "bug-chitin-dark", sides=8, flatten=.7)


def growth_fan(name, at, span=.65, height=.55, yaw=0, count=5):
    """Overlapping carapace blades grow in one direction with a readable pale edge rhythm."""
    blister(name + "_rooted_carapace", (at[0],at[1],at[2]+height*.08), (span*.39,span*.27,height*.22))
    for i in range(count):
        t = i / max(count-1,1)
        angle = yaw + (t-.5)*1.15
        plate(f"{name}_{i}", (at[0] + math.cos(yaw+math.pi/2)*(t-.5)*span*.6,
                             at[1] + math.sin(yaw+math.pi/2)*(t-.5)*span*.6,
                             at[2] + .025*i),
              span*(.78+.12*math.sin(i*2.7)), span*.32, height*(.8+.2*math.cos(i*2)),
              angle, -.12-.1*t, "bug-chitin-dark" if i%3==0 else "bug-chitin-mid")


# ===========================================
# Abandoned vehicles
# ===========================================


def car(kind):
    """An abandoned vehicle with intact wheel detail, exposed engine, and shell growth through the cabin."""
    compact = kind == "compact"
    utility = kind == "utility"
    length = .92 if compact else 1.82
    width = .64 if compact else .74
    wr = .13 if compact else .155
    roof = .64 if compact else .83 if utility else .74
    paint = "env-metal" if kind in ("car","compact") else "env-plaster-warm" if utility else "infested-car-red"
    body = box("corroded_lower_body", (length,width,.23), (0,0,.285), paint)
    bevel(body,.035,segments=2)
    box("underbody", (length*.88,width*.86,.12), (0,0,.19), "env-rust")
    rear, front = -length*.36, length*.19
    top_rear, top_front = -length*.25, length*.02
    # Hollow passenger cell: thin remaining glazing and bent framing reveal
    # dark seats and interior, avoiding the solid blue toy-car greenhouse.
    box("cabin_void",((front-rear)*.92,width*.71,.14),((front+rear)/2,0,.46),"bug-chitin-black")
    for y in (-width*.22,width*.22):
        bevel(box("abandoned_seat",(length*.18,width*.25,.18),(-length*.10,y,.51),"env-asphalt"),.026)
        box("seat_back",(.062,width*.24,.21),(-length*.21,y,.61),"env-asphalt",rot=(0,-.14,0))
    for side in (-1,1):
        beam("front_window_pillar",(front,side*width*.43,.4),(top_front,side*width*.36,roof),.021,paint)
        beam("rear_window_pillar",(rear,side*width*.43,.4),(top_rear,side*width*.36,roof),.022,paint)
        beam("roof_rail",(top_rear,side*width*.36,roof),(top_front,side*width*.36,roof),.024,paint)
        # Surviving side panes are separate chipped triangular panels; the
        # open driver window exposes the passenger space from isometric view.
        if side==1:
            mesh("surviving_side_glass",[(rear+.035,width*.422,.415),(front-.04,width*.422,.415),
                 (top_front-.025,width*.352,roof-.035),(rear+.035,width*.405,.415),
                 (front-.04,width*.405,.415),(top_front-.025,width*.335,roof-.035)],
                 [(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],"env-glass")
    # One front pane remains. The opposite half was shattered by the roots.
    mesh("broken_windscreen",[(front,-width*.03,.412),(front,width*.35,.412),
         (top_front,width*.31,roof-.033),(top_front,-width*.02,roof-.033),
         (front-.013,-width*.03,.412),(front-.013,width*.35,.412),
         (top_front-.013,width*.31,roof-.033),(top_front-.013,-width*.02,roof-.033)],
         [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],"env-glass")
    roofpanel=box("peeled_roof_sheet",((top_front-top_rear)*.72,width*.35,.032),
        ((top_front+top_rear)/2,width*.23,roof+.012),paint,rot=(.09,.045,-.04))
    bevel(roofpanel,.009)
    shard("fractured_roof_edge",(top_rear+.03,-width*.25,roof-.024),
          ((top_front-top_rear)*.48,width*.18,.032),"env-rust",angle=.12)
    if utility:
        for side in (-1,1):
            box("cargo_side_panel",(length*.43,.033,.52),(-length*.25,side*width*.45,.64),paint)
        box("rear_cargo_panel",(.035,width*.95,.52),(-length*.456,0,.64),paint)
        box("cargo_roof_remainder",(length*.16,width*.95,.033),(-length*.365,0,.905),paint)
        box("cargo_roof_peeled_edge",(length*.15,width*.31,.028),(-length*.19,width*.33,.93),paint,rot=(.15,.04,0))
        for i in range(3):
            plate("cargo_breach_plate",(-length*.28+i*.075,-.03,.79+i*.031),.44,.24,.20,yaw=.5+i*.25,tilt=-.12)
        for y in (-width*.48,width*.48):
            for x in (-.57,-.39,-.21):
                box("cargo_rib",(.022,.023,.37),(x,y,.66),"env-metal")
        box("rear_door_split",(.012,width*.75,.39),(-length*.474,0,.62),"env-rust")
    for y in (-1,1):
        for x in (-length*.3,length*.3):
            cylinder("rubber_tyre",wr,wr,.10,14,(x,y*(width/2-.013),wr),"env-asphalt",rot=(math.pi/2,0,0))
            cylinder("steel_hub",wr*.57,wr*.57,.105,10,(x,y*(width/2-.013),wr),"env-metal",rot=(math.pi/2,0,0))
            cylinder("rust_hub_cap",wr*.25,wr*.25,.112,8,(x,y*(width/2-.013),wr),"env-rust",rot=(math.pi/2,0,0))
        box("door_pillar",(.035,.023,roof-.4),(-length*.12,y*width*.39,(roof+.4)/2),paint)
        box("missing_paint_patch",(length*.22,.016,.16),(-length*.20,y*(width/2+.008),.305),"env-rust")
        box("door_seam",(.012,.021,.19),(-length*.06,y*(width/2+.005),.30),"env-rust")
        box("door_handle",(.07,.034,.02),(-length*.13,y*(width/2+.008),.35),"env-metal")
        box("sill_trim",(length*.58,.025,.029),(-length*.035,y*width*.49,.225),"env-asphalt")
    for x in (-length*.49,length*.49):
        box("bumper",(.044,width*.88,.10),(x,0,.23),"env-asphalt")
        for y in (-width*.30,width*.30):
            box("broken_headlight",(.048,.11,.066),(x,y,.335),"env-snow" if x>0 else "env-brick")
    for i in range(5):
        box("grille_bar",(.024,.017,.067),(length*.506,(i-2)*.035,.3),"env-metal")
    # Bonnet split open around a growth that has displaced the engine cover.
    hood=box("peeled_bonnet",(length*.24,width*.41,.034),(length*.355,width*.22,.442),paint,rot=(.17,-.13,.05))
    bevel(hood,.014)
    box("engine_recess",(length*.24,width*.30,.022),(length*.34,-width*.17,.408),"bug-chitin-black")
    for i in range(4):
        cylinder("engine_header",.024,.024,.16,8,(length*.26+i*.038,-width*.17,.438),"env-rust",rot=(math.pi/2,0,0))
    # The invasion begins inside the wreck. Broad, flat roots grip its
    # original skin; overlapping plates emerge through two actual openings.
    for i in range(4):
        t=i/3
        plate(f"roof_emergent_plate_{i}",(-length*.21+t*length*.20,-width*.14,roof-.075+t*.019),
              length*.34,width*.40,.17,yaw=-.32+t*.43,tilt=-.1,
              token="bug-chitin-dark" if i%2 else "bug-chitin-mid")
    for i in range(3):
        plate(f"engine_emergent_plate_{i}",(length*.29+i*.025,-width*.18,.414+i*.028),
              length*.23,width*.3,.18,yaw=-.3+i*.22,tilt=-.16)
    paths=[[(length*.25,-width*.47,.10),(length*.14,-width*.49,.28),
            (length*.04,-width*.445,.42),(-length*.025,-width*.26,.55),(-length*.10,-width*.14,roof-.025)],
           [(-length*.37,-width*.37,.035),(-length*.33,-width*.48,.26),
            (-length*.24,-width*.43,.44),(-length*.27,-width*.34,.59),(-length*.24,-width*.12,roof-.015)],
           [(-length*.21,width*.41,.25),(-length*.15,width*.42,.38),
            (-length*.11,width*.36,.60),(-length*.04,width*.15,roof-.045)]]
    for i,points in enumerate(paths):
        radii=[.018,.052,.076,.062,.039] if len(points)==5 else [.023,.037,.045,.030]
        sweep(f"panel_hugging_root_{i}",points,radii,"bug-chitin-dark",sides=12,flatten=.48)
        scar=[(x+.007,y-.008,z+.008) for x,y,z in points]
        sweep(f"root_fissure_{i}",scar,[r*.12 for r in radii],"bug-chitin-tan",sides=6,flatten=.6)
    # Resin-filled panel seams branch from the primary grip without adding
    # a second silhouette of finger-like appendages outside the vehicle.
    for i in range(3):
        x=-length*.29+i*length*.20
        sweep(f"door_infection_{i}",[(x,-width*.51,.22),(x+.038,-width*.51,.31),
              (x-.024,-width*.48,.39),(x+.028,-width*.44,.47)],
              [.007,.015,.019,.007],"bug-flesh",sides=8,flatten=.42)
    sweep("windshield_suture",[(length*.22,-.08,.416),(length*.12,-.035,.56),(length*.02,-.075,roof-.036)],
          [.005,.009,.005],"bug-bio-green-dim",sides=7)
    if kind in ("hatchback","utility"):
        for ob in bpy.context.scene.objects:
            if ob.type == "MESH":
                x,y,z = ob.location
                ob.location=(y,-x,z)
                ob.rotation_euler.z -= math.pi/2


# ===========================================
# Overtaken street furniture
# ===========================================


def lamp():
    """A bent, dead street lamp with a helical colony sheath and irregular growing fins."""
    bevel(box("plinth",(.23,.23,.10),(0,0,.05),"env-concrete"),.018)
    sweep("bent_municipal_column",[(0,0,.1),(.015,0,1),(.10,.02,1.94),(.20,.04,2.43)], [.075,.057,.042,.038],"env-metal",sides=10)
    beam("broken_cantilever",(.19,.04,2.42),(.43,.01,2.35),.04,"env-metal")
    bevel(box("dead_lamp_head",(.27,.19,.1),(.37,.01,2.3),"env-metal",rot=(0,.18,0)),.025)
    box("fractured_lens",(.2,.13,.025),(.37,.01,2.248),"env-glass",rot=(0,.18,0))
    ground_roots("lamp_anchor",radius=.34,count=6)
    points=[]
    for i in range(20):
        t=i/19
        points.append((.07*math.cos(t*math.tau*1.6)+t*.16,.07*math.sin(t*math.tau*1.6),.13+t*2.2))
    sweep("helical_sheath",points,[.045*(1-i/26) for i in range(20)],"bug-flesh",sides=9)
    for i in range(7):
        t=i/7
        plate(f"climbing_carapace_{i}",(.02+t*.14,-.025,.17+t*1.95),.37,.19,.18,
              yaw=-.9+t*2.1,tilt=-.65,token="bug-chitin-dark" if i%2 else "bug-chitin-mid")


def dumpster():
    """A torn-open ribbed dumpster, its lid forced backward by shell blades."""
    bevel(box("bin_body",(.79,.59,.58),(0,0,.35),"env-metal"),.026)
    for x in (-.29,-.1,.1,.29):
        box("steel_rib",(.029,.625,.48),(x,0,.35),"env-rust")
    box("open_black_mouth",(.71,.50,.035),(0,0,.665),"bug-chitin-black")
    box("upended_lid",(.83,.4,.045),(0,.24,.83),"env-rust",rot=(.83,.04,0))
    for x in (-.3,.3):
        for y in (-.22,.22):
            cylinder("caster",.062,.062,.065,10,(x,y,.062),"env-asphalt",rot=(0,math.pi/2,0))
    growth_fan("bursting_shell",(-.02,-.03,.65),.71,.40,yaw=1.35,count=6)
    for i in range(5):
        x=-.29+i*.13
        sweep(f"root_over_bin_{i}",[(x,-.30,.04),(x+.04,-.36,.24),(x-.03,-.32,.58),(x,.01,.72)], [.012,.034,.045,.062],sides=8)


def barrier():
    """A cracked concrete traffic barrier held together by a chitin saddle."""
    vertices=[(-.45,-.19,0),(.45,-.19,0),(.45,.19,0),(-.45,.19,0),(-.43,-.09,.48),(.43,-.09,.48),(.43,.09,.48),(-.43,.09,.48)]
    mesh("concrete_jersey_barrier",vertices,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],"env-concrete")
    for i in range(4):
        plate(f"saddle_plate_{i}",(-.24+i*.15,-.01,.42),.42,.25,.18,yaw=1.4,tilt=-.15)
    for side in (-1,1):
        sweep(f"fracture_root_{side}",[(-.2,side*.2,.022),(-.16,side*.15,.24),(.02,side*.12,.47),(.22,side*.14,.20)], [.011,.045,.054,.008],sides=9)
        box("worn_reflector",(.10,.021,.06),(.31,side*.145,.29),"env-snow")
    for i in range(3):
        shard(f"broken_foot_{i}",(-.3+i*.3,-.28,.01),(.13,.14,.12),angle=i*.8)


def planter():
    """A split stone planter where the colony has consumed the original tree."""
    cylinder("stone_planter",.34,.28,.32,10,(0,0,.16),"env-concrete")
    cylinder("soil",.30,.30,.014,12,(0,0,.328),"bug-chitin-black")
    sweep("dead_tree",[(.08,.03,.3),(.05,.05,.69),(.14,.08,1.13),(.11,.10,1.39)], [.062,.048,.032,.008],"env-bark",sides=8)
    beam("broken_limb",(.08,.055,.84),(-.13,.04,1.09),.026,"env-bark")
    growth_fan("planter_bloom",(-.025,-.035,.31),.7,.58,yaw=.9,count=6)
    ground_roots("planter_roots",centre=(0,0,.29),radius=.44,count=6)


def bench():
    """A park bench twisted into a ribbed colony shelf, with surviving slatted timber."""
    for x in (-.32,.32):
        beam("front_leg",(x,-.16,.015),(x,-.16,.36),.028,"env-metal")
        beam("rear_leg",(x,.13,.015),(x,.20,.75),.029,"env-metal")
    for i in range(4):
        box("seat_slat",(.86,.055,.046),(0,-.13+i*.07,.35),"env-bark")
    for i in range(3):
        box("back_slat",(.80,.043,.065),(0,.18+i*.015,.49+i*.095),"env-bark",rot=(-.12,0,.02*i))
    growth_fan("bench_growth",(-.15,-.02,.37),.58,.37,yaw=.5,count=4)
    sweep("bench_root",[(-.39,-.29,.025),(-.26,-.21,.24),(-.14,-.02,.47),(.10,.17,.69)], [.015,.06,.09,.022],sides=10)
    for x in (.13,.26):
        beam("exposed_seat_screw",(x,-.13,.368),(x,-.13,.383),.009,"env-metal",sides=6)


def fence():
    """A bowed steel fence with an asymmetric shell buttress, still closed to movement."""
    for x in (-.43,.43):
        box("steel_post",(.06,.06,1.1),(x,0,.55),"env-metal")
    for z in (.17,.9):
        box("horizontal_rail",(.9,.044,.045),(0,0,z),"env-metal")
    for i in range(9):
        x=-.36+i*.09
        sweep(f"bent_picket_{i}",[(x,0,.12),(x+.015,.025*math.sin(i),.54),(x-.014,.01,1.0)], [.013]*3,"env-rust",sides=7)
    ground_roots("fence_anchor",centre=(-.24,0,.05),radius=.23,count=5)
    for i in range(5):
        plate(f"fence_carapace_{i}",(-.30+i*.06,-.06,.18+i*.12),.43,.18,.2,yaw=.6,tilt=-.43)
    sweep("rail_root",[(-.39,-.03,.06),(-.33,-.08,.44),(-.14,-.055,.77),(.33,-.015,.88)], [.07,.08,.044,.008],sides=10)


def crate():
    """Splintered shipping crate with alien material pushing through its broken corner."""
    box("dark_crate_interior",(.57,.56,.53),(0,0,.29),"bug-chitin-black")
    for side in (-1,1):
        for i in range(5):
            x=-.29+i*.145
            height=.59 if i!=3 else .42
            box("front_plank",(.128,.052,height),(x,side*.3,height/2+.025),"env-bark")
        for z in (.1,.50):
            box("crate_strap",(.75,.025,.07),(0,side*.34,z),"env-rust")
        box("side_panel",(.045,.62,.58),(side*.34,0,.315),"env-bark")
    for i in range(3):
        box("split_lid_board",(.72,.13,.048),(.01,-.21+i*.17,.635+i*.035),"env-bark",rot=(.04*i,-.07*i,.035*i))
    growth_fan("crate_emergence",(.15,.08,.6),.57,.39,yaw=-.4,count=5)
    sweep("crate_root",[(.38,-.25,.02),(.40,-.24,.23),(.30,-.32,.48),(.18,-.05,.69)], [.012,.042,.07,.036],sides=10)


def bus_stop():
    """An abandoned shelter, glass missing and canopy lifted by a growth crown."""
    for x in (-.77,.77):
        for y in (-.22,.26):
            bevel(box("shelter_foot",(.16,.16,.065),(x,y,.0325),"env-concrete"),.01)
            box("shelter_column",(.046,.05,1.41),(x,y,.76),"env-metal")
    bevel(box("canopy",(1.72,.73,.065),(0,.01,1.51),"env-metal",rot=(0,.025,0)),.02)
    for x in (-.56,-.18,.2,.58):
        box("rear_mullion",(.027,.03,1.24),(x,.26,.77),"env-metal")
    for x in (-.59,.52):
        box("remaining_glass_panel",(.32,.014,.87),(x,.266,.69),"env-glass")
    for z in (.15,1.37):
        box("rear_rail",(1.55,.045,.04),(0,.26,z),"env-metal")
    for x in (-.44,.40):
        box("seat_leg",(.055,.07,.38),(x,.09,.19),"env-metal")
    for i in range(3):
        box("shelter_seat_slat",(1.05,.07,.048),(-.02,-.03+i*.085,.42),"env-bark")
    growth_fan("canopy_colony",(-.48,.025,1.49),.8,.42,yaw=.6,count=6)
    for i in range(3):
        x=-.75+i*.10
        sweep("climbing_shelter_root",[(x,-.29,.025),(x+.03,-.28,.45),(x-.025,-.23,1),(x+.14,-.04,1.56)], [.02,.043,.08,.07],sides=10)
    box("route_sign",(.21,.055,.42),(.73,-.24,1.09),"env-concrete")
    for z in (.96,1.05,1.15):
        box("faded_route_line",(.13,.012,.018),(.73,-.274,z),"env-metal")


# ===========================================
# Damaged structural modules
# ===========================================


def wall(kind):
    """A structural wall retaining its cover/aperture, invaded from one lower corner."""
    families={"brick":"env-brick","concrete":"env-concrete","plaster":"env-plaster-warm","panel":"env-metal"}
    breached=kind.endswith("-breached")
    family=kind.split("-")[0] if breached else "brick"
    token=families[family]
    height=.54 if kind=="half" else 1.5
    opening=kind.split("-")[0] if kind.split("-")[0] in ("window","door") else None
    if opening and "-" in kind:
        family=kind.split("-")[1]
        token=families[family]
    if opening:
        from city_kit_parts import BRICK, CONCRETE, PANEL, Material, window_opening, door_opening, wall_bands
        construction={"brick":BRICK,"concrete":CONCRETE,"panel":PANEL,"plaster":Material("env-plaster-warm","env-concrete","env-sidewalk",uv_rot=0)}[family]
        if opening=="window":
            wall_bands(construction)
            window_opening(material=construction)
            bpy.data.objects.remove(bpy.data.objects.get("glass"),do_unlink=True)
            box("surviving_window_pane",(.22,.026,.38),(-.14,.008,.79),"env-glass")
        else:
            door_opening(material=construction)
            socket("door",(0,0,0))
        if family=="panel":
            for side in (-1,1):
                for x in (-.45,-.35,.35,.45):
                    box("jamb_corrugation",(.026,.028,1.23),(x,side*.064,.76),"env-rust")
        elif family=="plaster":
            for side in (-1,1):
                shard("flaked_render",(-.38,side*.068,.16),(.15,.02,.43),"env-brick")
        elif family=="concrete":
            for side in (-1,1):
                box("concrete_joint",(.018,.014,.35),(.38,side*.068,.85),"env-rust")
    else:
        # Deep fractures are represented by closed staggered panels, keeping
        # the blocker silhouette solid below the damaged upper fringe.
        box("surviving_wall_core",(1,.11,height*.82),(0,0,height*.41),token,uv_rot=90 if family=="brick" else 0)
        box("foundation_course",(1,.15,.13),(0,0,.065),"env-concrete")
        for i in range(7):
            h=height*(.10+.08*(.5+.5*math.sin(i*2.61))) if breached or height<1 else height*.18
            shard(f"fractured_coping_{i}",(-.43+i*.143,0,height*.81),(.151,.12,h),token) if breached or height<1 else box(f"surviving_cornice_{i}",(.145,.14,h),(-.43+i*.143,0,height*.81+h/2),"env-concrete")
        if family=="brick":
            for row in range(3 if height>1 else 2):
                for i in range(4):
                    x=-.39+i*.25+(row%2)*.045
                    box("exposed_brick",(.22,.016,.065),(min(x,.4),-.065,.18+row*height*.16),"env-brick")
        elif family=="panel":
            for i in range(10):
                x=-.45+i*.1
                box("torn_corrugation",(.022,.045,height*(.8+.08*math.sin(i))),(x,-.075,height*.42),"env-rust" if i%4==0 else "env-metal")
        elif family=="plaster":
            for i in range(5):
                shard("exposed_brickwork",(-.32+i*.15,-.067,.13+i*.16),(.15,.018,.13),"env-brick",angle=.04*i)
        else:
            for i in range(3):
                beam("exposed_rebar",(-.32+i*.29,0,height*.75),(-.28+i*.29,.018,height*.99),.012,"env-rust",sides=6)
    # Growth follows a rooted diagonal; openings retain their centre clearance.
    sides=(-1,1)
    for side in sides:
        for i in range(4 if height>1 else 3):
            t=i/(3 if height>1 else 2)
            x=-.4+(.12 if opening else .39)*t
            z=.08+t*height*.60
            plate(f"wall_shell_{side}_{i}",(x,side*.077,z),.42 if height>1 else .28,.18,height*.19,
                  yaw=side*1.12,tilt=-.64,token="bug-chitin-dark" if i%2==0 else "bug-chitin-mid")
        sweep(f"wall_root_{side}",[(-.48,side*.1,.022),(-.39,side*.13,height*.24),(-.36,side*.1,height*.56),(-.34 if opening else .05,side*.08,height*.9)],
              [.014,.069,.075,.014],"bug-flesh",sides=10)
        if not opening:
            sweep(f"fine_wall_branch_{side}",[(.4,side*.068,.16),(.21,side*.084,.29),(-.2,side*.13,height*.37)], [.006,.024,.037],"bug-flesh",sides=8)
    if height>1 and not opening:
        growth_fan("top_exposure",(-.22,.0,1.32),.50,.18,yaw=.2,count=3)


def rubble(kind):
    """A broad two-tile collapse pile, with distinct masonry, slab or timber construction."""
    rng=random.Random(773+sum(ord(c) for c in kind))
    if kind=="timber":
        for i in range(14):
            x,y=rng.uniform(-.46,.46),rng.uniform(-.13,.13)
            z=.07+(1-abs(x))*.035*(i%4)
            plank=box(f"splintered_joist_{i}",(rng.uniform(.4,.95),.068,.085),(x,y,z),"env-bark",rot=(rng.uniform(-.08,.08),rng.uniform(-.1,.1),rng.uniform(-.8,.8)))
            bevel(plank,.007)
        for i in range(5):
            box("broken_roof_sheet",(.38,.17,.034),(-.56+i*.25,.12*math.sin(i),.22+i%2*.045),"env-roof",rot=(.1,.12,i*.52))
    else:
        token="env-brick" if kind=="brick" else "env-concrete"
        for i in range(5):
            shard(f"buried_collapse_mass_{i}",(-.56+i*.28,.06*math.sin(i),0),(.4,.39,.18),token,angle=.18*i)
        for i in range(32 if kind=="brick" else 24):
            x,y=rng.uniform(-.69,.69),rng.uniform(-.22,.22)
            width=rng.uniform(.13,.28) if kind=="brick" else rng.uniform(.25,.48)
            z=max(0,.12*(1-abs(x))*(1-abs(y)*2)) if i>8 else 0
            shard(f"collapse_{i}",(x,y,z),(width,rng.uniform(.12,.20),rng.uniform(.11,.25)),token,angle=rng.uniform(-1.5,1.5))
        if kind=="concrete":
            for i in range(4):
                beam("bent_reinforcement",(-.53+i*.31,-.26,.08),(-.40+i*.3,.14,.42),.013,"env-rust",sides=7)
    growth_fan("rubble_colony",(-.24,-.02,.20),.72,.22,yaw=.4,count=5)
    for i in range(4):
        sweep("rubble_binding_root",[(-.8+i*.42,-.36,.025),(-.68+i*.4,-.08,.19),(-.50+i*.34,.1,.30),(-.32+i*.29,.31,.04)], [.012,.036,.046,.010],sides=8)


def ruin(kind):
    """Readable surviving building structure with colony growth rooted into its fractures."""
    if kind=="column":
        bevel(box("column_base",(.43,.44,.15),(0,0,.075),"env-concrete"),.02)
        shard("broken_column",(-.025,0,.15),(.25,.28,1.36),"env-concrete")
        for i in range(4):
            x=-.10+(i%2)*.16
            y=-.08+(i//2)*.16
            beam("column_rebar",(x,y,.91),(x+.025,y-.03,1.56),.014,"env-rust",sides=7)
        growth_fan("column_shell",(-.02,-.1,.40),.6,.45,yaw=.6,count=6)
        ground_roots("column_anchor",radius=.40,count=6)
    elif kind=="frame":
        for x in (-.35,.35):
            box("steel_upright",(.09,.11,1.45),(x,0,.725),"env-metal")
            box("upright_flange",(.15,.024,1.45),(x,-.068,.725),"env-rust")
            box("frame_foot",(.25,.29,.07),(x,0,.035),"env-concrete")
        box("broken_header",(.87,.13,.11),(0,0,1.45),"env-metal",rot=(0,.08,0))
        growth_fan("frame_crown",(-.23,0,1.37),.6,.36,yaw=1,count=4)
        sweep("frame_root",[(-.43,-.23,.025),(-.38,-.07,.47),(-.31,-.08,.94),(-.17,.03,1.49)],[.022,.088,.07,.03],sides=10)
        for i in range(3):
            shard("frame_debris",(-.28+i*.25,-.15,.0),(.18,.18,.23),"env-concrete",angle=i)
    elif kind=="corner":
        for i in range(4):
            shard("broken_corner_wall",(-.31+i*.18,.30,0),(.19,.13,1.38-i*.26),"env-brick")
            shard("broken_return_wall",(-.34,.10-i*.18,0),(.13,.19,1.12-i*.18),"env-brick")
        box("corner_foundation",(.89,.16,.12),(0,.30,.06),"env-concrete")
        box("return_foundation",(.16,.84,.12),(-.34,0,.06),"env-concrete")
        growth_fan("corner_outgrowth",(-.27,.20,.65),.67,.42,yaw=-.4,count=5)
        ground_roots("corner_anchor",centre=(-.1,.0,.11),radius=.34,count=6)
    elif kind=="roof":
        for i in range(4):
            box("collapsed_roof_batten",(.83,.047,.063),(0,-.27+i*.18,.10+i*.04),"env-bark",rot=(0,.09,.04))
        for i in range(5):
            box("torn_roof_panel",(.15,.77,.03),(-.33+i*.16,0,.18+i*.025),"env-roof",rot=(.04,-.11,.025*i))
        growth_fan("roof_growth",(-.1,-.06,.22),.60,.23,yaw=.4,count=5)
        shard("fallen_chimney_brick",(.32,-.3,0),(.21,.21,.24),"env-brick",angle=.2)
    else:
        sweep("rusted_drain_pipe",[(-.33,-.13,.13),(-.28,-.12,.47),(-.04,-.1,.67),(.31,-.1,.67)], [.12]*4,"env-rust",sides=14)
        cylinder("pipe_foot",.18,.18,.06,12,(-.33,-.13,.03),"env-metal")
        cylinder("pipe_mouth_flange",.16,.16,.04,16,(.31,-.1,.67),"env-metal",rot=(0,math.pi/2,0))
        cylinder("pipe_dark_throat",.115,.115,.014,16,(.338,-.1,.67),"bug-chitin-black",rot=(0,math.pi/2,0))
        for i in range(6):
            a=math.tau*i/6
            cylinder("flange_bolt",.014,.014,.015,6,(.339,-.1+math.cos(a)*.138,.67+math.sin(a)*.138),"env-rust",rot=(0,math.pi/2,0))
        for i in range(4):
            plate("pipe_shell",(-.29+i*.15,-.08,.43+i*.05),.37,.23,.24,yaw=.7,tilt=-.28)
        ground_roots("pipe_roots",centre=(-.12,0,.07),radius=.32,count=6)


# ===========================================
# Export entry point
# ===========================================


def build(kind="car"):
    """Build one independently exportable member of the urban infestation kit."""
    if kind in ("car","compact","hatchback","utility"):
        car(kind)
    elif kind in ("solid","window","door","half") or kind.endswith("-breached") or kind.startswith(("window-","door-")):
        wall(kind)
    elif kind.startswith("rubble-"):
        rubble(kind.replace("rubble-",""))
    elif kind in ("column","frame","corner","roof","pipe"):
        ruin(kind)
    else:
        {"lamp":lamp,"dumpster":dumpster,"barrier":barrier,"planter":planter,"bench":bench,
         "fence":fence,"crate":crate,"bus-stop":bus_stop}[kind]()
