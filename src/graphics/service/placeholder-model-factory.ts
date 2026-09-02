import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelAssetEntry, ModelCategory } from "../model/asset-manifest";
import type { FallbackModelFactory } from "../model/model-loader";

// ===========================================
// Types
// ===========================================

/** A style-guide palette token and its hex value. */
interface PaletteToken {
  readonly name: string;
  readonly hex: number;
}

/** Where a socket sits on the box, as fractions of width, height and depth. */
type SocketAnchor = readonly [x: number, y: number, z: number];

// ===========================================
// Constants
// ===========================================

/** Smallest box side in world units, so 0×0 sub-parts and flat tiles still show. */
export const PLACEHOLDER_MIN_SIZE = 0.1;

/** One flat-shaded colour per category (style guide §4). */
const CATEGORY_TOKENS: Readonly<Record<ModelCategory, PaletteToken>> = {
  units: { name: "tdf-grey-mid", hex: 0x5b6573 },
  bugs: { name: "bug-chitin-mid", hex: 0x4a3b5a },
  props: { name: "env-concrete", hex: 0x8e8a82 },
  tiles: { name: "env-asphalt", hex: 0x3a3d42 },
  buildings: { name: "env-brick", hex: 0x8a4b3a },
};

/**
 * Socket positions on the box. Models face +z, so their left is +x.
 *
 * ```
 *        socket_chassis / roof / hatch (top centre)
 *              ┌───────┐
 *   arm_l (+x) ┤       ├ arm_r (−x)     back (−z), weapon and muzzle (+z)
 *              │       │
 *              └───────┘ legs / door (base centre)
 * ```
 */
const SOCKET_ANCHORS: Readonly<Record<string, SocketAnchor>> = {
  socket_arm_l: [0.5, 0.75, 0],
  socket_arm_r: [-0.5, 0.75, 0],
  socket_back: [0, 0.9, -0.5],
  socket_legs: [0, 0, 0],
  socket_chassis: [0, 1, 0],
  socket_weapon: [0, 0.5, 0.5],
  socket_muzzle: [0, 0.5, 0.5],
  socket_door: [0, 0, 0],
  socket_roof: [0, 1, 0],
  socket_hatch: [0, 1, 0],
};

/** Sockets with no known placement go on top, where they are at least visible. */
const DEFAULT_ANCHOR: SocketAnchor = [0, 1, 0];

// ===========================================
// PlaceholderModelFactory
// ===========================================

/**
 * Builds a flat-shaded box of the entry's footprint and height in the
 * category's palette colour, standing on y = 0, with one empty child node
 * per declared socket so code that attaches to sockets keeps working
 * while art is missing (architecture §7: gameplay never blocks on art).
 */
export class PlaceholderModelFactory implements FallbackModelFactory {
  /** Creates a new placeholder; nothing is shared between calls. */
  create(id: ModelAssetId, entry: ModelAssetEntry): Object3D {
    const width = Math.max(entry.footprint.w, PLACEHOLDER_MIN_SIZE);
    const depth = Math.max(entry.footprint.d, PLACEHOLDER_MIN_SIZE);
    const height = Math.max(entry.height, PLACEHOLDER_MIN_SIZE);

    const root = new Group();
    root.name = `placeholder:${id}`;

    const box = new Mesh(
      new BoxGeometry(width, height, depth),
      this.createMaterial(CATEGORY_TOKENS[entry.category]),
    );
    box.name = "placeholder-box";
    box.position.y = height / 2;
    root.add(box);

    for (const socket of entry.sockets) {
      const [ax, ay, az] = SOCKET_ANCHORS[socket] ?? DEFAULT_ANCHOR;
      const node = new Object3D();
      node.name = socket;
      node.position.set(ax * width, ay * height, az * depth);
      root.add(node);
    }
    return root;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Flat-shaded material named after its palette token (style guide §6). */
  private createMaterial(token: PaletteToken): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      color: token.hex,
      flatShading: true,
      metalness: 0,
      roughness: 0.9,
    });
    material.name = token.name;
    return material;
  }
}
