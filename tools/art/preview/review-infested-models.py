"""Assemble labelled review contact sheets from the three Blender projections.

Run with art-python tools/art/preview/review-infested-models.py.
Each row compares the original model with its three authored variants.
"""
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]


def main():
    """Keep every projection available without changing the source render pixels."""
    spec = importlib.util.spec_from_file_location('kit',ROOT/'tools/art/build-infested-models.py')
    kit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(kit)
    entries = kit.catalogue()
    out = ROOT/'docs/design/diagnostics/infestation/hosts'
    out.mkdir(parents=True,exist_ok=True)
    for yaw in ('045','135','225'):
        for start in range(0,len(entries),7):
            rows = entries[start:start+7]
            sheet = Image.new('RGB',(1120,len(rows)*246+30),'#20262f')
            draw = ImageDraw.Draw(sheet)
            for col,label in enumerate(('CLEAN','1 / TRACES','2 / ESTABLISHED','3 / CONSUMED')):
                draw.text((col*280+8,8),label,fill='white')
            for row,(base,*_) in enumerate(rows):
                for stage in range(4):
                    name = base if stage==0 else f'{base}-infested-{stage}'
                    source = ROOT/f'docs/design/renders/{name}_{yaw}.png'
                    picture = Image.open(source).convert('RGB')
                    picture.thumbnail((280,220))
                    x,y = stage*280,row*246+30
                    sheet.paste(picture,(x,y))
                    if stage==0: draw.text((x+5,y+222),base,fill='white')
            sheet.save(out/f'host-stages-{start//7+1}-{yaw}.png')


if __name__ == '__main__': main()
