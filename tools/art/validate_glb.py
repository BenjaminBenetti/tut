#!/usr/bin/env python3
"""Validate a GLB with trimesh and print a JSON report.

    art-python tools/art/validate_glb.py public/assets/models/units/foo.glb [--max-triangles N] [--max-bytes N]

Checks: every mesh is watertight, the whole model sits on y = 0 with +Y up,
triangle count and file size are within the style guide budgets (§6). Exit
code 1 when a check fails so the art-blender loop can stop and fix.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import trimesh


# ===========================================
# Report
# ===========================================


def report_for(path: str, max_triangles: int, max_bytes: int, allow_below_ground: bool = False) -> dict:
    """Load a GLB and describe it.

    Args:
        path: GLB file to inspect.
        max_triangles: Style guide triangle budget for this asset class.
        max_bytes: Style guide file-size cap.
        allow_below_ground: Skip the base-on-y=0 check for sub-parts (arms,
            weapons) that pivot at their socket and legitimately hang below it.

    Returns:
        A JSON-serialisable report with an ``ok`` flag and ``problems`` list.
    """
    scene = trimesh.load(path, force="scene")
    meshes = {name: geom for name, geom in scene.geometry.items() if isinstance(geom, trimesh.Trimesh)}
    # Flat-shaded exports carry one vertex per face corner (split normals), which
    # reads as open edges. Merge by position so watertightness means what an
    # artist expects: no holes in the surface.
    for mesh in meshes.values():
        mesh.merge_vertices(merge_tex=True, merge_norm=True)
    triangles = sum(int(m.faces.shape[0]) for m in meshes.values())
    watertight = {name: bool(m.is_watertight) for name, m in meshes.items()}
    bounds = scene.bounds.tolist() if len(meshes) else [[0, 0, 0], [0, 0, 0]]
    extents = scene.extents.tolist() if len(meshes) else [0, 0, 0]
    size = os.path.getsize(path)
    problems: list[str] = []
    if not meshes:
        problems.append("no meshes")
    for name, ok in watertight.items():
        if not ok:
            problems.append(f"{name} is not watertight")
    if triangles > max_triangles:
        problems.append(f"{triangles} triangles exceeds budget {max_triangles}")
    if size > max_bytes:
        problems.append(f"{size} bytes exceeds cap {max_bytes}")
    if meshes and not allow_below_ground and abs(bounds[0][1]) > 0.05:
        problems.append(f"model base is at y={bounds[0][1]:.3f}, expected 0 (pivot at base centre)")
    return {
        "path": path,
        "bytes": size,
        "meshes": len(meshes),
        "triangles": triangles,
        "watertight": watertight,
        "bounds": bounds,
        "extents": extents,
        "height": extents[1] if meshes else 0,
        "ok": not problems,
        "problems": problems,
    }


# ===========================================
# CLI
# ===========================================


def main() -> int:
    """Parse arguments, print the report, return the exit status."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path")
    parser.add_argument("--max-triangles", type=int, default=4000)
    parser.add_argument("--max-bytes", type=int, default=500 * 1024)
    parser.add_argument("--allow-below-ground", action="store_true", help="sub-part pivoting at its socket")
    args = parser.parse_args()
    report = report_for(args.path, args.max_triangles, args.max_bytes, args.allow_below_ground)
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
