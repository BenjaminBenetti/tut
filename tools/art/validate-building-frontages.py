"""Validate #960's exported modules and their clearance above the actual doorway.

Run with `art-python tools/art/validate-building-frontages.py` from the repo root.
This is a conservative triangle-bounds check, not a claim about unit animation.
"""

import hashlib
import json
from pathlib import Path

import trimesh

from validate_glb import report_for


# Mounts match building-frontage-styles.ts and the published kit contract.
MOUNTS = {
    "shop-awning": 1.21,
    "shop-awning-narrow": 1.21,
    "residential-entry": 1.10,
    "residential-window": 0.40,
    "workplace-entry": 1.12,
    "mailbox-bank": 0.42,
}
ENTRANCES = {"shop-awning", "shop-awning-narrow", "residential-entry", "workplace-entry"}


def doorway_intrusions(path: Path, mount: float) -> int:
    """Count triangle bounds entering the 0.60 u clear width below the 1.20 u head."""
    scene = trimesh.load(path, force="scene")
    intrusions = 0
    for node in scene.graph.nodes_geometry:
        transform, geometry = scene.graph[node]
        mesh = scene.geometry[geometry]
        points = trimesh.transform_points(mesh.vertices, transform)
        points[:, 1] += mount
        triangles = points[mesh.faces]
        low = triangles.min(axis=1)
        high = triangles.max(axis=1)
        hit = (
            (low[:, 0] < 0.30 - 1e-5)
            & (high[:, 0] > -0.30 + 1e-5)
            & (low[:, 1] < 1.20 - 1e-5)
            & (high[:, 1] > 0)
        )
        intrusions += int(hit.sum())
    return intrusions


def main() -> None:
    """Check all six exports and write the committed review sidecar on success."""
    records = []
    for kind, mount in MOUNTS.items():
        path = Path(f"public/assets/models/buildings/building-{kind}.glb")
        report = report_for(str(path), 800, 100 * 1024)
        assert report["ok"], report
        report["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        report["mountHeight"] = mount
        if kind in ENTRANCES:
            intrusions = doorway_intrusions(path, mount)
            assert intrusions == 0, (kind, intrusions)
            report["trianglesBelowDoorHeadWithinClearWidth"] = intrusions
        records.append(report)
    output = Path("docs/design/diagnostics/960/model-validation.json")
    output.write_text(json.dumps(records, indent=2) + "\n")
    print(f"{len(records)} frontage modules valid; all entrance apertures clear")


if __name__ == "__main__":
    main()
