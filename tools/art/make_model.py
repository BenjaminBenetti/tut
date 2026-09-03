"""One-command model loop: bpy script → GLB → trimesh validation → review renders → manifest record.

    blender -b --python tools/art/make_model.py -- \
        --script tools/art/models/<name>.py --id <faction.subject.variant> \
        --category units --file <kebab-name>.glb [--quality final|placeholder] \
        [--footprint 1x1] [--render docs/design/renders] [--samples 32] [--size 640] \
        [--max-triangles 4000] [--no-register] [--out-root public/assets/models]

The model script must define ``build()`` that adds objects with ``bpy_kit``
helpers (feet on z = 0, front facing -Y). Optional module constants
``FOOTPRINT = (w, d)`` and ``SOCKETS`` are read if present; sockets are also
discovered from ``socket_*`` empties.

After a successful run, register the id in ``src/content/data/model-ids.ts``
and the printed entry in ``src/graphics/data/model-manifest.ts``, then run
``pnpm test`` (the manifest sync test reads ``tools/art/placeholders.manifest.json``,
which this script updates unless ``--no-register``).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import struct
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy_kit  # noqa: E402
from validate_glb import report_for  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ART_MANIFEST = os.path.join(HERE, "placeholders.manifest.json")


# ===========================================
# Arguments
# ===========================================


def parse_args() -> argparse.Namespace:
    """Arguments after ``--`` on the Blender command line."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build, export, validate, render and record one model")
    parser.add_argument("--script", required=True, help="model script defining build()")
    parser.add_argument("--id", required=True, help="model id, e.g. tdf.mech.chassis-b")
    parser.add_argument("--category", required=True, choices=["units", "bugs", "props", "tiles", "buildings"])
    parser.add_argument("--file", required=True, help="GLB file name inside the category folder")
    parser.add_argument("--quality", default="final", choices=["placeholder", "final"])
    parser.add_argument("--footprint", default=None, help="WxD in tiles, e.g. 1x1 (default: from script or 1x1)")
    parser.add_argument("--render", default=os.path.join("docs", "design", "renders"))
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--size", type=int, default=640)
    parser.add_argument("--max-triangles", type=int, default=4000)
    parser.add_argument("--no-register", action="store_true")
    parser.add_argument(
        "--no-textured",
        action="store_true",
        help="skip the unit atlases (tokens with a cell are otherwise UV-mapped and referenced)",
    )
    parser.add_argument("--out-root", default=os.path.join("public", "assets", "models"))
    return parser.parse_args(argv)


def load_model_module(path: str):
    """Import the model script as a module so its build() can be called."""
    spec = importlib.util.spec_from_file_location("tut_model", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    if not hasattr(module, "build"):
        raise SystemExit(f"{path} must define build()")
    return module


# ===========================================
# Atlas reference (mirrors attachAtlases in build-placeholders.mjs)
# ===========================================

SAMPLER = {"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}


def attach_atlases(glb_path: str, atlases: list[str], category: str, layout: dict) -> None:
    """Rewrite the GLB so textured materials sample their atlas from the shared PNG.

    Adds ``images`` (relative URIs from the model folder), one sampler,
    ``textures``, and ``baseColorTexture`` with a white ``baseColorFactor`` on
    every material whose name is an atlas token. Embedding would copy the
    atlas into every file; a relative URI loads it once.
    """
    if not atlases:
        return
    with open(glb_path, "rb") as fh:
        data = fh.read()
    json_len = struct.unpack("<I", data[12:16])[0]
    doc = json.loads(data[20 : 20 + json_len])
    rest = data[20 + json_len :]
    depth = category.count("/") + 2
    doc["images"] = [{"uri": "../" * depth + layout["paths"][a].replace("assets/", "", 1)} for a in atlases]
    doc["samplers"] = [SAMPLER]
    doc["textures"] = [{"sampler": 0, "source": i} for i in range(len(atlases))]
    for mat in doc.get("materials", []):
        cell = layout["cells"].get(mat.get("name", ""))
        if not cell or cell["atlas"] not in atlases:
            continue
        pbr = mat.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
        pbr["baseColorTexture"] = {"index": atlases.index(cell["atlas"]), "texCoord": 0}
    text = json.dumps(doc, separators=(",", ":"))
    text += " " * (-len(text) % 4)
    chunk = text.encode("utf-8")
    header = b"glTF" + struct.pack("<II", 2, 20 + len(chunk) + len(rest)) + struct.pack("<II", len(chunk), 0x4E4F534A)
    with open(glb_path, "wb") as fh:
        fh.write(header + chunk + rest)


# ===========================================
# Sockets
# ===========================================


def sanitise_socket_names() -> None:
    """Rename duplicate sockets (Blender's ``socket_x.001``) to ``socket_x_2`` and so on.

    Assembled references contain every part's sockets; a duplicate name is
    fine as long as it still matches the manifest rule ``socket_[a-z0-9_]+``.
    """
    for ob in bpy.context.scene.objects:
        match = re.fullmatch(r"(socket_[a-z0-9_]+)\.(\d+)", ob.name)
        if match:
            ob.name = f"{match.group(1)}_{int(match.group(2)) + 1}"


# ===========================================
# Manifest record
# ===========================================


def update_art_manifest(record: dict) -> None:
    """Insert or replace this model's record in placeholders.manifest.json (sorted by id after the build script's own)."""
    records = json.load(open(ART_MANIFEST, encoding="utf-8")) if os.path.exists(ART_MANIFEST) else []
    records = [r for r in records if r["id"] != record["id"]]
    records.append(record)
    with open(ART_MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2)
        fh.write("\n")


def manifest_entry_ts(record: dict) -> str:
    """The TypeScript entry to paste into MODEL_MANIFEST."""
    sockets = ", ".join(f'"{s}"' for s in record["sockets"])
    return (
        f'  "{record["id"]}": {{\n'
        f'    category: "{record["category"]}",\n'
        f'    path: "{record["path"]}",\n'
        f'    footprint: {{ w: {record["footprint"]["w"]}, d: {record["footprint"]["d"]} }},\n'
        f'    height: {record["height"]},\n'
        f"    sockets: [{sockets}],\n"
        f'    quality: "{record["quality"]}",\n'
        f"  }},"
    )


# ===========================================
# Entry point
# ===========================================


def main() -> None:
    """Run the loop once and print what to do next."""
    args = parse_args()
    started = time.time()
    bpy_kit.reset_scene()
    module = load_model_module(os.path.abspath(args.script))
    module.build()
    footprint = args.footprint or "x".join(str(v) for v in getattr(module, "FOOTPRINT", (1, 1)))
    w, d = (float(v) for v in footprint.lower().split("x"))
    lo, hi = bpy_kit.bounds()
    sanitise_socket_names()
    sockets = sorted(ob.name for ob in bpy.context.scene.objects if ob.name.startswith("socket_"))
    rel_path = f"assets/models/{args.category}/{args.file}"
    glb_path = os.path.join(REPO_ROOT, args.out_root, args.category, args.file)
    layout = None if args.no_textured else bpy_kit.load_atlas_layout()
    atlases = bpy_kit.apply_atlas_uvs(layout) if layout else []
    size = bpy_kit.export_glb(glb_path)
    if atlases:
        attach_atlases(glb_path, atlases, args.category, layout)
        size = os.path.getsize(glb_path)
        bpy_kit.apply_atlas_preview_materials(layout, REPO_ROOT)
    sub_part = w == 0 and d == 0  # footprint 0×0: pivots at its socket, may hang below y = 0
    validation = report_for(glb_path, max_triangles=args.max_triangles, max_bytes=500 * 1024, allow_below_ground=sub_part)
    bpy_kit.setup_render(args.size, args.samples)
    renders = bpy_kit.render_yaws(os.path.join(REPO_ROOT, args.render), args.id) if args.render else []
    record = {
        "id": args.id,
        "category": args.category,
        "path": rel_path,
        "footprint": {"w": int(w) if w.is_integer() else w, "d": int(d) if d.is_integer() else d},
        "height": round(float(hi.z - lo.z), 2),
        "sockets": sockets,
        "quality": args.quality,
        "triangles": validation["triangles"],
        "bytes": size,
    }
    if not args.no_register:
        update_art_manifest(record)
    print("\n## make_model report")
    print(f"- {args.id} → {rel_path} ({size} bytes, {validation['triangles']} triangles, height {record['height']} u, {round(time.time() - started, 1)} s)")
    print(f"- sockets: {sockets or 'none'}")
    print(f"- atlases: {atlases or 'none (flat colours)'}")
    print(f"- validation ok: {validation['ok']} {validation['problems']}")
    for path in renders:
        print(f"- render: {os.path.relpath(path, REPO_ROOT)}")
    print("- next: add the id to src/content/data/model-ids.ts and this entry to src/graphics/data/model-manifest.ts, then pnpm test:")
    print(manifest_entry_ts(record))
    if not validation["ok"]:
        sys.exit(1)


main()
