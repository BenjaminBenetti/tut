"""Deterministic opaque business fascia artwork using the shipped environment palette."""

from __future__ import annotations

import argparse
import ast
from pathlib import Path

STYLES = {
    "grocery": ("GROCERY", "env-foliage", "env-awning-cream"),
    "bakery-cafe": ("BAKERY CAFE", "env-rust", "env-awning-cream"),
    "pharmacy": ("PHARMACY", "env-snow", "env-foliage"),
    "bookshop": ("BOOKSHOP", "env-bark", "env-awning-cream"),
    "clothing": ("CLOTHING", "env-brick", "env-awning-cream"),
    "electronics": ("ELECTRONICS", "env-water-deep", "env-awning-cream"),
    "hardware": ("HARDWARE", "env-sand", "env-bark"),
    "offices": ("OFFICES", "env-metal", "env-awning-cream"),
    "depot": ("DEPOT", "env-roof-green", "env-awning-cream"),
}

HERE = Path(__file__).resolve().parent
TEXTURES = HERE.parents[2] / "public/assets/textures/business-signs"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def palette() -> dict[str, str]:
    """Read bpy_kit's palette without importing Blender into the texture process."""
    module = ast.parse((HERE.parent / "bpy_kit.py").read_text())
    for node in module.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "PALETTE"
            for target in node.targets
        ):
            colours = ast.literal_eval(node.value)
            # Existing frontage cloth tokens from frontage_parts.py / style guide §4.3.
            colours.update({"env-awning-green": "#56735F", "env-awning-cream": "#D8D0B8"})
            return colours
    raise RuntimeError("bpy_kit has no PALETTE assignment")


def draw_icon(draw, identity: str, foreground: str, background: str) -> None:
    """Use bold closed pictograms on a 128-pixel square, readable at tactical scale."""
    fg, bg = foreground, background
    if identity == "grocery":
        draw.ellipse((18, 35, 76, 111), fill=fg)
        draw.ellipse((52, 35, 110, 111), fill=fg)
        draw.line((62, 40, 68, 15), fill=fg, width=9)
        draw.polygon(((72, 25), (91, 12), (106, 14), (95, 30)), fill=fg)
    elif identity == "bakery-cafe":
        draw.rounded_rectangle((23, 42, 88, 99), radius=12, fill=fg)
        draw.ellipse((73, 45, 113, 84), outline=fg, width=10)
        draw.rectangle((13, 106, 104, 114), fill=fg)
        for x in (40, 65):
            draw.line(((x, 31), (x - 5, 23), (x + 3, 12)), fill=fg, width=7)
    elif identity == "pharmacy":
        draw.rectangle((48, 12, 80, 116), fill=fg)
        draw.rectangle((12, 48, 116, 80), fill=fg)
    elif identity == "bookshop":
        draw.polygon(((12, 22), (52, 26), (64, 34), (76, 26), (116, 22),
                      (116, 98), (77, 102), (64, 111), (51, 102), (12, 98)), fill=fg)
        draw.line((64, 37, 64, 98), fill=bg, width=6)
        for y in (45, 62, 79):
            draw.line((25, y, 49, y + 3), fill=bg, width=4)
            draw.line((79, y + 3, 103, y), fill=bg, width=4)
    elif identity == "clothing":
        draw.polygon(((40, 17), (50, 24), (78, 24), (88, 17), (117, 42),
                      (98, 62), (86, 50), (86, 112), (42, 112), (42, 50),
                      (30, 62), (11, 42)), fill=fg)
        draw.arc((49, 8, 79, 36), 0, 180, fill=bg, width=7)
    elif identity == "electronics":
        draw.rounded_rectangle((10, 16, 118, 93), radius=7, fill=fg)
        draw.rectangle((20, 26, 108, 80), fill=bg)
        draw.rectangle((56, 92, 72, 109), fill=fg)
        draw.rectangle((36, 108, 92, 117), fill=fg)
        draw.polygon(((67, 32), (48, 58), (61, 58), (55, 75), (82, 48),
                      (68, 48)), fill=fg)
    elif identity == "hardware":
        draw.line((28, 106, 93, 30), fill=fg, width=15)
        draw.polygon(((77, 13), (120, 47), (108, 62), (65, 29)), fill=fg)
        draw.line((102, 107, 37, 35), fill=fg, width=14)
        draw.ellipse((9, 9, 54, 54), fill=fg)
        draw.polygon(((8, 8), (38, 14), (40, 34), (19, 40)), fill=bg)
        draw.ellipse((94, 99, 108, 113), fill=fg)
    elif identity == "offices":
        draw.rectangle((26, 12, 100, 117), fill=fg)
        for y in (24, 48, 72):
            for x in (38, 66):
                draw.rectangle((x, y, x + 14, y + 13), fill=bg)
        draw.rectangle((55, 99, 72, 117), fill=bg)
    elif identity == "depot":
        for x, y in ((39, 13), (10, 68), (69, 68)):
            draw.rectangle((x, y, x + 49, y + 44), fill=fg)
            draw.rectangle((x + 20, y, x + 29, y + 17), fill=bg)
            draw.line((x + 7, y + 35, x + 42, y + 35), fill=bg, width=4)
    else:
        raise ValueError(identity)


def write_texture(identity: str, compact: bool = False) -> Path:
    """Render high-contrast print without gradients, transparency or baked lighting."""
    from PIL import Image, ImageDraw, ImageFont

    label, background_token, foreground_token = STYLES[identity]
    colours = palette()
    background, foreground = colours[background_token], colours[foreground_token]
    width, height = (512 if compact else 1536), 144
    image = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(image)
    draw.line((8, 7, width - 9, 7), fill=foreground, width=3)
    draw.line((8, height - 8, width - 9, height - 8), fill=foreground, width=3)
    icon = Image.new("RGB", (128, 128), background)
    draw_icon(ImageDraw.Draw(icon), identity, foreground, background)
    image.paste(icon, ((width - 128) // 2 if compact else 20, 8))
    if not compact:
        draw.line((171, 29, 171, 115), fill=foreground, width=3)
        size = 112
        font = ImageFont.truetype(FONT, size)
        while draw.textbbox((0, 0), label, font=font)[2] > width - 230:
            size -= 1
            font = ImageFont.truetype(FONT, size)
        bounds = draw.textbbox((0, 0), label, font=font)
        text_width, text_height = bounds[2] - bounds[0], bounds[3] - bounds[1]
        draw.text((205 + (width - 225 - text_width) / 2,
                   (height - text_height) / 2 - bounds[1]), label, font=font, fill=foreground)
        # Supersampled lettering stays crisp within the style guide's 1024-pixel ceiling.
        image = image.resize((1024, 96), Image.Resampling.LANCZOS)
    TEXTURES.mkdir(parents=True, exist_ok=True)
    path = TEXTURES / f"{identity}{'-compact' if compact else ''}.png"
    image.save(path, optimize=True)
    return path


def main() -> None:
    """Command-line regeneration used by the Blender source helper."""
    parser = argparse.ArgumentParser()
    parser.add_argument("identity", choices=STYLES)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()
    print(write_texture(args.identity, args.compact))


if __name__ == "__main__":
    main()
