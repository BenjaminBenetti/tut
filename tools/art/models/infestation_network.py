"""Periodic six-tile resin web: shared Voronoi seams, torn membranes and roots.

Both growth endpoints have identical topology, allowing the renderer to mature
this authored network before slicing it along ownership boundaries. The slice
boundaries are not part of the design: every strand continues into its neighbour.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crescent_geometry import mesh, sweep

PERIOD = 6


def noise(i, j, salt=0):
    """Repeatable coordinate variation without global random state."""
    v = (i * 1597334677 ^ j * 3812015801 ^ salt * 95868923) & 0xffffffff
    v = ((v ^ (v >> 16)) * 2246822507) & 0xffffffff
    v = ((v ^ (v >> 13)) * 3266489909) & 0xffffffff
    return (v ^ (v >> 16)) / 4294967295


def warp(x, y):
    """Periodic curved flow, shared by roots and both sides of every membrane."""
    return (x + .33*math.sin(y*math.tau/3 + .5) + .12*math.sin((x+y)*math.tau/6),
            y + .31*math.sin(x*math.tau/3 + .8) - .13*math.cos((y-x)*math.tau/6))


def triangulate(faces):
    """Fix triangle diagonals before export so maturity endpoints share topology."""
    return [(face[0],face[i],face[i+1]) for face in faces for i in range(1,len(face)-1)]


def clip(poly, nx, ny, limit):
    """Intersect a convex polygon with a Voronoi bisector."""
    out = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        da, db = a[0] * nx + a[1] * ny - limit, b[0] * nx + b[1] * ny - limit
        if da <= 1e-9:
            out.append(a)
        if (da < 0) != (db < 0):
            t = da / (da - db)
            out.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
    return out


def cells():
    """Nine irregular cells whose translated copies exactly tessellate the plane."""
    seeds = [(x * 2 - 2 + (noise(x, y, 1) - .5) * 1.3,
              y * 2 - 2 + (noise(x, y, 2) - .5) * 1.3) for y in range(3) for x in range(3)]
    neighbours = [(x + dx * PERIOD, y + dy * PERIOD) for x, y in seeds
                  for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
    for centre in seeds:
        cx, cy = centre
        poly = [(-9, -9), (9, -9), (9, 9), (-9, 9)]
        for x, y in neighbours:
            if abs(x - cx) + abs(y - cy) < .001:
                continue
            poly = clip(poly, x - cx, y - cy, (x*x + y*y - cx*cx - cy*cy) / 2)
        contour = []
        for a, b in zip(poly, poly[1:] + poly[:1]):
            for k in range(6):
                t = k / 6
                contour.append(warp(a[0]*(1-t)+b[0]*t, a[1]*(1-t)+b[1]*t))
        yield warp(cx, cy), contour


def membrane(name, centre, contour, mature):
    """Closed stretched tissue, with an angular pore that shrinks as resin matures."""
    cx, cy = centre
    inner = .88 - .36 * mature
    n = len(contour)
    rings = [(.998, .018), (.90, .030 + mature * .015), (inner, .006)]
    verts = []
    for ring, (r, h) in enumerate(rings):
        for x,y in contour:
            a = math.atan2(y-cy,x-cx)
            # The tear has long lobes and pinches, not a regular polygon pore.
            shape = 1 + (.08 + mature*.22) * math.sin(a*3 + cx) + mature*.12*math.sin(a*5 + cy)
            scale = r * shape if ring == 2 else r
            verts.append((cx+(x-cx)*scale,cy+(y-cy)*scale,h))
    verts += [(x, y, .001) for x, y, _z in verts]
    faces = []
    for start in (0, n):
        for k in range(n):
            j = (k+1) % n
            faces.append((start+k, start+j, start+n+j, start+n+k))
            faces.append((3*n+start+j, 3*n+start+k, 4*n+start+k, 4*n+start+j))
    for k in range(n):
        j = (k+1) % n
        faces += [(k, 3*n+k, 3*n+j, j), (2*n+j, 5*n+j, 5*n+k, 2*n+k)]
    mesh(name, verts, triangulate(faces), 'bug-flesh', smooth=True)


def strand(name, points, radii, token='bug-chitin-dark', height=.55):
    """Flattened closed resin cord with stable horizontal cross-sections."""
    verts = []
    sides = 6
    for i, ((x, y, z), r) in enumerate(zip(points, radii)):
        a, b = points[max(0, i-1)], points[min(len(points)-1, i+1)]
        dx, dy = b[0]-a[0], b[1]-a[1]
        length = max(.0001, math.hypot(dx, dy))
        for k in range(sides):
            angle = k * math.tau / sides
            verts.append((x - dy/length * math.cos(angle)*r,
                          y + dx/length * math.cos(angle)*r,
                          z + math.sin(angle)*r*height))
    faces = [tuple(reversed(range(sides))), tuple((len(points)-1)*sides+k for k in range(sides))]
    for i in range(len(points)-1):
        for k in range(sides):
            j = (k+1) % sides
            faces.append((i*sides+k, i*sides+j, (i+1)*sides+j, (i+1)*sides+k))
    return mesh(name, verts, triangulate(faces), token, smooth=True)


def build_network(mature):
    """Build thin and thick endpoints with matching objects, vertices and indices."""
    from infestation_parts import blade
    seen = set()
    for i, (centre, contour) in enumerate(cells()):
        cx, cy = centre
        membrane(f'membrane_{i}', centre, contour, mature)
        for j in range(0, len(contour), 6):
            edge = [contour[(j+k) % len(contour)] for k in range(7)]
            a, b = edge[0], edge[-1]
            key = tuple(sorted((tuple(round(v % PERIOD, 4) for v in a), tuple(round(v % PERIOD, 4) for v in b))))
            if key in seen:
                continue
            seen.add(key)
            width = (.035 + .075*mature) * (1 + .20*math.sin(a[0]*2 + a[1]))
            radii = [width*(1.25 - .40*math.sin(k*math.pi/6)) for k in range(7)]
            points = [(x,y,.012+r*.5) for (x,y),r in zip(edge,radii)]
            strand(f'root_{i}_{j}', points, radii, height=.46)
        # Fine branches leave the heavy root, taper, and fork into the pore.
        for j in (1, len(contour)//2):
            x, y = contour[j]
            pts = [(x, y, .035), (cx+(x-cx)*.72+.08, cy+(y-cy)*.75, .03),
                   (cx+(x-cx)*.46, cy+(y-cy)*.40, .021),
                   (cx+(x-cx)*.15-.06, cy+(y-cy)*.22, .008)]
            strand(f'branch_{i}_{j}', pts, [.038+.025*mature, .026+.02*mature, .018, .002], 'bug-chitin-mid', .55)
        # Broad asymmetric shell splinters occur at a larger scale than a tile.
        if i % 3 == 0:
            x, y = contour[2]
            blade(f'shard_{i}', x*.65+cx*.35, y*.65+cy*.35,
                  .36+.25*mature, .90+.35*mature, .055+.085*mature,
                  angle=.6+i*1.7, base=.009, variant=i)
        if i == 3:
            # Irregular green residue stays inside the tear, not a luminous outline.
            x, y = cx+.08, cy-.04
            poly = [(-.23,-.06),(-.11,-.18),(.20,-.11),(.27,.04),(.04,.14),(-.18,.12)]
            verts = [(x+px, y+py, .001+z) for z in (0,.004) for px,py in poly]
            n = len(poly)
            faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
            faces += [(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
            mesh(f'residue_{i}', verts, faces, 'bug-bio-green-dim', smooth=False)

    # A sinuous main artery crosses several cells, establishing a hierarchy
    # above the finer web. Its endpoint and tangent match the periodic copy.
    points, radii = [], []
    for k in range(49):
        x = -3 + k/8
        y = .62*math.sin(x*math.tau/6) + .18*math.sin(x*math.tau/3)
        r = (.048 + .105*mature)*(1+.15*math.cos(x*math.tau/3))
        points.append((x,y,.014+r*.52))
        radii.append(r)
    strand('main_artery',points,radii,'bug-chitin-mid',.47)
