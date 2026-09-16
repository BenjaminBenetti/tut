#!/usr/bin/env python3
"""Build deterministic named-business fascia atlases from the canonical catalogue.

Run with ``art-python tools/art/build-business-name-atlases.py``. Each 1024-square
page contains ten 1024x96 strips at y = row * 102 + 3. Runtime UVs sample texel
centres, x = .5..1023.5 and y = top + .5..top + 95.5. Padding retains the type's
background colour. ``--check`` rebuilds in memory and verifies every output.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE / "models"))
from business_sign_texture import FONT, STYLES, draw_icon, palette  # noqa: E402

NAMES_PATH = ROOT / "src/graphics/data/business-names.json"
ATLAS_DIR = ROOT / "public/assets/textures/business-signs/names"
REVIEW_DIR = ROOT / "docs/design/diagnostics/business-names"
PAGE_SIZE = 1024
STRIP_HEIGHT = 96
ROW_STRIDE = 102
TOP_INSET = 3
NAMES_PER_PAGE = 10
NAMES_PER_TYPE = 50
SOURCE_WIDTH = 1536
SOURCE_HEIGHT = 144


def sha256(data: bytes) -> str:
    """Hash source order or asset content without machine-specific metadata."""
    return hashlib.sha256(data).hexdigest()


def read_catalogue(path: Path) -> tuple[dict[str, list[str]], str]:
    """Reject incomplete, duplicated or unreadable names before writing assets."""
    source = path.read_bytes()
    catalogue = json.loads(source)
    if not isinstance(catalogue, dict) or set(catalogue) != set(STYLES):
        raise ValueError("Catalogue must contain exactly the nine business types")
    seen: set[str] = set()
    for identity, names in catalogue.items():
        if not isinstance(names, list) or len(names) != NAMES_PER_TYPE:
            raise ValueError(f"{identity}: expected exactly {NAMES_PER_TYPE} names")
        for name in names:
            if (not isinstance(name, str) or not name.isascii() or
                    name != name.strip() or not 1 <= len(name) <= 22 or
                    any(ord(character) < 32 or ord(character) > 126 for character in name)):
                raise ValueError(f"{identity}: invalid fascia name {name!r}")
            if name.casefold() in seen:
                raise ValueError(f"Duplicate business name: {name}")
            seen.add(name.casefold())
    return catalogue, sha256(source)


def render_strip(identity: str, name: str, colours: dict[str, str]) -> Image.Image:
    """Supersample the established fascia design with the business name as its text."""
    _, background_token, foreground_token = STYLES[identity]
    background, foreground = colours[background_token], colours[foreground_token]
    strip = Image.new("RGB", (SOURCE_WIDTH, SOURCE_HEIGHT), background)
    draw = ImageDraw.Draw(strip)
    draw.line((8, 7, SOURCE_WIDTH - 9, 7), fill=foreground, width=3)
    draw.line((8, SOURCE_HEIGHT - 8, SOURCE_WIDTH - 9, SOURCE_HEIGHT - 8),
              fill=foreground, width=3)
    icon = Image.new("RGB", (128, 128), background)
    draw_icon(ImageDraw.Draw(icon), identity, foreground, background)
    strip.paste(icon, (20, 8))
    draw.line((171, 29, 171, 115), fill=foreground, width=3)
    label = name.upper()
    size = 112
    font = ImageFont.truetype(FONT, size)
    while True:
        bounds = draw.textbbox((0, 0), label, font=font)
        if bounds[2] - bounds[0] <= SOURCE_WIDTH - 230:
            break
        size -= 1
        font = ImageFont.truetype(FONT, size)
    text_width, text_height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    x = 205 + (SOURCE_WIDTH - 225 - text_width) / 2 - bounds[0]
    y = (SOURCE_HEIGHT - text_height) / 2 - bounds[1]
    draw.text((x, y), label, font=font, fill=foreground)
    return strip.resize((PAGE_SIZE, STRIP_HEIGHT), Image.Resampling.LANCZOS)


def png_bytes(image: Image.Image) -> bytes:
    """Encode an opaque PNG without timestamps or optional metadata."""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def write_or_check(path: Path, content: bytes, check: bool) -> None:
    """Write one generated artifact, or fail when the committed output is stale."""
    if check:
        if not path.exists() or path.read_bytes() != content:
            raise ValueError(f"Generated output is missing or stale: {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def review_sheet(identity: str, strips: list[Image.Image]) -> Image.Image:
    """Show all fifty rendered names in three columns at a legible review scale."""
    width, height = 1960, 1744
    sheet = Image.new("RGB", (width, height), "#171B22")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype(FONT, 32)
    number_font = ImageFont.truetype(FONT, 13)
    draw.text((24, 16), f"{identity.upper()}  |  50 NAMED BUSINESSES", font=title_font,
              fill="#E9E4D0")
    for index, strip in enumerate(strips):
        column, row = divmod(index, 17)
        x, y = 24 + column * 644, 76 + row * 96
        draw.text((x, y), f"{index + 1:02d}", font=number_font, fill="#A7ADA8")
        sheet.paste(strip.resize((624, 59), Image.Resampling.LANCZOS), (x, y + 20))
    return sheet


def build_atlases(check: bool) -> None:
    """Generate five pages and one contact sheet per type, then record exact layout and order."""
    catalogue, source_hash = read_catalogue(NAMES_PATH)
    colours = palette()
    manifest: dict = {
        "schemaVersion": 1,
        "source": NAMES_PATH.relative_to(ROOT).as_posix(),
        "sourceSha256": source_hash,
        "nameOrderHashEncoding": "SHA256 of UTF-8 JSON.stringify(names)",
        "layout": {
            "pageWidth": PAGE_SIZE,
            "pageHeight": PAGE_SIZE,
            "stripWidth": PAGE_SIZE,
            "stripHeight": STRIP_HEIGHT,
            "rowStride": ROW_STRIDE,
            "topInset": TOP_INSET,
            "namesPerPage": NAMES_PER_PAGE,
            "pagesPerType": NAMES_PER_TYPE // NAMES_PER_PAGE,
            "texelInset": 0.5,
        },
        "types": {},
    }
    for identity in STYLES:
        names = catalogue[identity]
        _, background_token, _ = STYLES[identity]
        strips = [render_strip(identity, name, colours) for name in names]
        pages = []
        for page_index in range(NAMES_PER_TYPE // NAMES_PER_PAGE):
            page = Image.new("RGB", (PAGE_SIZE, PAGE_SIZE), colours[background_token])
            for row in range(NAMES_PER_PAGE):
                page.paste(strips[page_index * NAMES_PER_PAGE + row],
                           (0, row * ROW_STRIDE + TOP_INSET))
            path = ATLAS_DIR / f"{identity}-{page_index}.png"
            encoded = png_bytes(page)
            write_or_check(path, encoded, check)
            pages.append({
                "page": page_index,
                "path": path.relative_to(ROOT / "public").as_posix(),
                "firstNameIndex": page_index * NAMES_PER_PAGE,
                "sha256": sha256(encoded),
            })
        name_order = json.dumps(names, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        manifest["types"][identity] = {
            "nameCount": len(names),
            "nameOrderSha256": sha256(name_order),
            "pages": pages,
        }
        write_or_check(REVIEW_DIR / f"{identity}.png", png_bytes(review_sheet(identity, strips)), check)
    metadata = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    write_or_check(ATLAS_DIR / "manifest.json", metadata, check)
    action = "Verified" if check else "Generated"
    print(f"{action} 45 opaque 1024x1024 atlases, 9 review sheets and layout/order manifest.")


def main() -> None:
    """Run the build or a deterministic freshness check without changing GLBs."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare generated bytes without writing files")
    args = parser.parse_args()
    build_atlases(args.check)


if __name__ == "__main__":
    main()
