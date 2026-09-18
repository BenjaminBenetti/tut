"""Rebuild the colony environment kit with isolated Blender workers and serialized registration.

python3 tools/art/build-infestation-kit.py --jobs 3 [--only prop.infested-nest]
All models export, validate and render three angles. Central TypeScript entries
remain explicit; the shared JSON records update only after every worker exits.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def build(entry):
    """Export one kit member without allowing parallel Blender processes to race the manifest."""
    command = ['blender', '-b', '-t', '2', '--python', 'tools/art/make_model.py', '--',
               '--script', 'tools/art/models/' + entry['script'], '--build-arg', 'kind=' + entry['kind'],
               '--id', entry['id'], '--category', entry['category'], '--file', entry['file'],
               '--footprint', entry['footprint'], '--max-triangles', '16000', '--quality', 'final',
               '--size', '480', '--samples', '32', '--no-register']
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(entry['id'] + '\n' + result.stdout + result.stderr)
    match = re.search(r'\((\d+) bytes, (\d+) triangles, height ([\d.]+) u,', result.stdout)
    sockets = re.search(r'sockets: (\[[^\n]*\]),', result.stdout)
    if not match or not sockets:
        raise RuntimeError('No export record found for ' + entry['id'] + '\n' + result.stdout)
    width, depth = map(float, entry['footprint'].split('x'))
    record = dict(id=entry['id'], category=entry['category'],
                  path='assets/models/' + entry['category'] + '/' + entry['file'],
                  footprint=dict(w=width, d=depth), height=float(match[3]),
                  sockets=json.loads(sockets[1]), quality='final',
                  triangles=int(match[2]), bytes=int(match[1]))
    print(entry['id'] + ': exported and validated', flush=True)
    return record


def main():
    """Run the selected authored models and merge their completed validation records once."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jobs', type=int, default=2)
    parser.add_argument('--only', help='Exact registered model id to rebuild')
    args = parser.parse_args()
    entries = json.loads((ROOT / 'tools/art/infestation-kit.json').read_text())
    if args.only:
        entries = [entry for entry in entries if entry['id'] == args.only]
        if not entries:
            parser.error('Unknown infestation model id')
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as workers:
        records = list(workers.map(build, entries))
    path = ROOT / 'tools/art/placeholders.manifest.json'
    previous = json.loads(path.read_text())
    fresh = {record['id']: record for record in records}
    merged = [fresh.pop(record['id'], record) for record in previous] + list(fresh.values())
    path.write_text(json.dumps(merged, indent=2) + '\n')


if __name__ == '__main__':
    main()
