"""Render any GLB from the three fixed isometric yaws for review.

    blender -b --python tools/art/render_glb.py -- --glb <file.glb> --out <dir> [--samples 32] [--size 640] [--yaws 45,135,225]

Works on Blender-made and three.js-made models alike (the placeholders under
``public/assets/models/`` included). Writes ``<dir>/<stem>_<yaw>.png``.
"""

from __future__ import annotations

import argparse
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy_kit  # noqa: E402


def parse_args() -> argparse.Namespace:
    """Arguments after ``--`` on the Blender command line."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Render a GLB from fixed isometric yaws")
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--size", type=int, default=640)
    parser.add_argument("--yaws", default="45,135,225")
    return parser.parse_args(argv)


def main() -> None:
    """Import, light, render."""
    args = parse_args()
    bpy_kit.reset_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    bpy_kit.setup_render(args.size, args.samples)
    stem = os.path.splitext(os.path.basename(args.glb))[0]
    yaws = tuple(int(v) for v in args.yaws.split(","))
    for path in bpy_kit.render_yaws(os.path.abspath(args.out), stem, yaws):
        print(f"- render: {path}")


main()
