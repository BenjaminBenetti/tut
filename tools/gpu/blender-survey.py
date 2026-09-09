"""Non-evidence render benchmark; never replaces the existing Cycles art pipeline."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import time


def render(args):
    """Import an unchanged asset and render with the established light/camera rig."""
    import bpy
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "art"))
    import bpy_kit
    bpy_kit.reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(Path(args.glb).resolve()))
    bpy_kit.setup_render(640, 32)
    if args.engine == "eevee":
        bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
        bpy.context.scene.eevee.taa_render_samples = 32
    bpy_kit.render_yaws(str(Path(args.out).resolve()), "survey", (45,))
    devices = set()
    for fd in Path("/proc/self/fd").iterdir():
        try:
            target = str(fd.resolve(strict=True))
            if target.startswith("/dev/dri/"):
                devices.add(target)
        except FileNotFoundError:
            pass
    (Path(args.out) / "devices.json").write_text(json.dumps(sorted(devices)))


def benchmark(args):
    """Measure the full Blender child, preserving EGL diagnostics for hardware review."""
    env = dict(os.environ, EGL_LOG_LEVEL="debug")
    hardware = env.get("TUT_GPU") == "1" and not env.get("CI")
    node = Path("/dev/dri/renderD129")
    if hardware:
        pci = Path("/sys/class/drm/renderD129/device")
        if (not node.is_char_device() or Path("/dev/dri/renderD128").exists()
                or (pci / "vendor").read_text().strip() != "0x1002"
                or (pci / "device").read_text().strip() != "0x13c0"):
            raise RuntimeError("Requires only renderD129 (AMD 1002:13c0) in the approved rebuilt container")
        if args.engine != "eevee":
            raise RuntimeError("The iGPU experiment is Eevee; Cycles stays CPU")
        env.update(DRI_PRIME="1002:13c0", MESA_VK_DEVICE_SELECT="1002:13c0!")
    else:
        env["LIBGL_ALWAYS_SOFTWARE"] = "true"
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    command = ["blender", "--background", "--threads", "4", "--gpu-backend", "opengl",
               "--python-exit-code", "1", "--python", str(Path(__file__).resolve()),
               "--", "--worker", "--engine", args.engine, "--glb", args.glb, "--out", args.out]
    started = time.monotonic()
    with (out / "blender.log").open("w") as log:
        subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT,
                       check=True, timeout=300)
    wall = time.monotonic() - started
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    devices = json.loads((out / "devices.json").read_text())
    diagnostic = (out / "blender.log").read_text().lower()
    if hardware and (str(node) not in devices or any(word in diagnostic for word in
                    ("swrast", "llvmpipe", "softpipe", "cpu renderer"))):
        raise RuntimeError("Blender did not establish iGPU use; inspect blender.log and devices.json")
    report = dict(engine=args.engine, requestedBackend="igpu" if hardware else "cpu",
                  revision=subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
                  blender=subprocess.check_output(["blender", "--version"], text=True).splitlines()[0],
                  assetSha256=hashlib.sha256(Path(args.glb).read_bytes()).hexdigest(),
                  capturedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                  wallSeconds=wall, cpuSeconds=usage.ru_utime + usage.ru_stime,
                  devices=devices, glb=args.glb, size=640, samples=32, yaw=45, threads=4,
                  loadAverage=os.getloadavg(), purpose="non-evidence benchmark",
                  driverProof="Review EGL log and device probe; Python GPU platform API is unavailable in background mode")
    (out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=("cycles", "eevee"), default="eevee")
    parser.add_argument("--glb", default="public/assets/models/props/prop-bench.glb")
    parser.add_argument("--out", default="test-results/gpu-blender")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    render(args) if args.worker else benchmark(args)
