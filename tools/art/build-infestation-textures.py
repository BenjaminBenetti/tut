"""Build seamless colony resin PBR maps: warped chitin cells, fibrous ribs and wet seams.

Run with art-python tools/art/build-infestation-textures.py. Maps cover four
world tiles; shader projection is shared across every tile and geometry variant.
No light or shadow is baked into the albedo.
"""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = 1024
OUT = Path(__file__).resolve().parents[2] / 'public/assets/textures/infestation'


def noise(x, y, seed, octaves=5):
    """Periodic directional harmonics, deterministic and smooth at both image seams."""
    rng = np.random.default_rng(seed)
    result = np.zeros_like(x)
    for octave in range(octaves):
        frequency = 2 ** octave
        for _ in range(5):
            a, b = rng.integers(-frequency * 2, frequency * 2 + 1, 2)
            result += np.sin((x * a + y * b) * np.pi * 2 + rng.uniform(0, np.pi * 2)) / (frequency * 5)
    return result


def build():
    """Write aligned colour, OpenGL normal and roughness maps for a layered organic floor."""
    OUT.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[:SIZE, :SIZE].astype(np.float64) / SIZE
    wx = (x + noise(x, y, 67, 4) * .065) % 1
    wy = (y + noise(x, y, 19, 4) * .065) % 1
    rng = np.random.default_rng(4319)
    first = np.full_like(x, 10.)
    second = np.full_like(x, 10.)
    cell = np.zeros_like(x)
    for i in range(65):
        px, py = rng.random(2)
        dx = np.abs(wx - px); dx = np.minimum(dx, 1 - dx)
        dy = np.abs(wy - py); dy = np.minimum(dy, 1 - dy)
        distance = np.sqrt(dx * dx + dy * dy)
        nearer = distance < first
        second = np.where(nearer, first, np.minimum(second, distance))
        cell = np.where(nearer, rng.uniform(-1, 1), cell)
        first = np.minimum(first, distance)
    seam = second - first
    wet = np.exp(-seam * 250)
    rim = np.exp(-((seam - .009) * 190) ** 2)
    broad = noise(x, y, 218, 5)
    grain = noise(x * 16, y * 16, 86, 4)
    fibre = (np.sin((wx * 31 + wy * 11 + broad * .3) * np.pi * 2) * .5 + .5) ** 10
    height = .45 + np.minimum(seam * 6, .28) + rim * .075 - wet * .13 + broad * .035 + grain * .016 + fibre * .012
    colour = np.zeros((SIZE, SIZE, 3)) + np.array([92., 57., 37.])
    colour += cell[..., None] * np.array([9., 6., 4.])
    colour += broad[..., None] * np.array([15., 11., 7.])
    colour += grain[..., None] * np.array([5., 4., 3.])
    colour += rim[..., None] * np.array([29., 20., 12.])
    colour += fibre[..., None] * np.array([6., 4., 2.])
    colour *= 1 - wet[..., None] * .48
    rough = np.clip(.74 - wet * .37 + cell * .055 + grain * .025, .28, .87)
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 7
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 7
    normal = np.stack([-dx, dy, np.ones_like(dx)], axis=2)
    normal /= np.linalg.norm(normal, axis=2)[..., None]
    Image.fromarray(np.clip(colour, 0, 255).astype('uint8')).save(OUT / 'colony-resin-albedo.png')
    Image.fromarray(((normal * .5 + .5) * 255).astype('uint8')).save(OUT / 'colony-resin-normal.png')
    Image.fromarray(np.repeat((rough * 255).astype('uint8')[..., None], 3, 2)).save(OUT / 'colony-resin-roughness.png')


if __name__ == '__main__':
    build()
