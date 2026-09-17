"""Rebuild the three-stage host variants, including validation and three review angles.

Usage: python3 tools/art/build-infested-models.py [--only building.wall-window] [--stage 3]
The generated wrappers are disposable; this catalogue and infested_models.py are source.
"""
import argparse
import json
import struct
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def catalogue():
    """Original builder, exact shape profile, category and original footprint."""
    records = {r['id']: r for r in json.loads((ROOT/'tools/art/placeholders.manifest.json').read_text())}
    entries = []
    for family in ('', '-concrete', '-panel', '-plaster'):
        for shape, profile in (('', 'solid'), ('-window','window'), ('-door','door')):
            entries.append(('building.wall'+shape+family, 'building-wall'+shape+family,'wall-'+profile))
    for family in ('','-concrete'):
        entries.append(('building.wall-half'+family,'building-wall-half'+family,'wall-half'))
    for kind in ('sedan','compact','hatchback','utility'):
        entries.append(('prop.car-'+kind,'prop-car-'+kind,'car-'+kind))
    for kind in ('oak','pine'):
        entries.append(('prop.tree-'+kind,'prop-tree-'+kind,'tree-'+kind))
    entries.append(('prop.rooftop-hvac','prop-rooftop-hvac','hvac'))
    return [(base,script,profile,records[base]) for base,script,profile in entries]


def main():
    """Run the standard asset pipeline for the requested subset."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only')
    parser.add_argument('--stage',type=int,choices=[1,2,3])
    args = parser.parse_args()
    scratch = ROOT/'.producer/resin-variants'
    scratch.mkdir(parents=True,exist_ok=True)
    for base,script,profile,record in catalogue():
        if args.only and base != args.only: continue
        for stage in ([args.stage] if args.stage else [1,2,3]):
            model_id = f'{base}-infested-{stage}'
            wrapper = scratch/'build_variant.py'
            wrapper.write_text(f'''import sys
sys.path.insert(0, {str(ROOT/'tools/art/models')!r})
from infested_models import build_variant
FOOTPRINT = ({record['footprint']['w']}, {record['footprint']['d']})
def build():
    """Rebuild the catalogue entry."""
    build_variant({script!r}, {profile!r}, {stage})
''')
            command = ['blender','-b','--python','tools/art/make_model.py','--',
                       '--script',str(wrapper),'--id',model_id,'--category',record['category'],
                       '--file',f'{script}-infested-{stage}.glb','--quality','final',
                       '--max-triangles','6500','--size','480','--samples','24']
            original = (ROOT/'public'/record['path']).read_bytes()
            length = struct.unpack('<I',original[12:16])[0]
            if not json.loads(original[20:20+length]).get('textures'):
                command.append('--no-textured')
            with (scratch/f'{model_id}.log').open('w') as log:
                subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
            print(model_id,flush=True)


if __name__ == '__main__': main()
