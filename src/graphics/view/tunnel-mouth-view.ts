import type { Object3D } from "three";
import { Group } from "three";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type {
  TunnelMouth,
  TunnelMouthId,
} from "../../tactical/model/tunnel-mouth";
import { isSealed } from "../../tactical/model/tunnel-mouth";
import type { Disposable } from "../model/disposable";
import type { ModelLoader } from "../model/model-loader";
import { unitFeetAt } from "../service/unit-placement";

// ===========================================
// Constants
// ===========================================

/** The open burrow: a heaved ring of slabs round a ribbed throat, lit green at the bottom. */
export const TUNNEL_MOUTH_MODEL_ID: ModelAssetId = "prop.tunnel-mouth";

/** The blown burrow: slabs fallen across a mound of spoil, no glow. */
export const TUNNEL_MOUTH_SEALED_MODEL_ID: ModelAssetId =
  "prop.tunnel-mouth-sealed";

/** Tiles per side of a mouth's footprint, the model's 2 × 2. */
export const TUNNEL_MOUTH_SIZE = 2;

/** Prefix of each mouth's group name, for tests and scene inspection. */
export const TUNNEL_MOUTH_NAME_PREFIX = "tunnel-mouth:";

// ===========================================
// Types
// ===========================================

/** One placed mouth: its group and the model it was drawn with. */
interface DrawnMouth {
  readonly root: Object3D;
  readonly modelId: ModelAssetId;
}

// ===========================================
// Tunnel mouth view
// ===========================================

/**
 * The tunnel mouths on a Tunnel Sabotage map (arc §6.7). Each is drawn
 * as the open model until its charge blows, then as the sealed one: the
 * view keys a mouth by its id and the model its state asks for, so a
 * seal swaps the model in place. A mouth never moves and ticks nothing,
 * and it is outside every picking list: the wheel finds it from the
 * squad, not the model.
 *
 * ```
 *   updateTunnelMouths(mouths)
 *     ├─ gone from the list        ──► removed
 *     ├─ drawn with the right model ──► kept
 *     ├─ sealed since it was drawn ──► removed, then loaded again sealed
 *     └─ new                       ──► models.load(open or sealed)
 *
 *   root
 *   └── tunnel-mouth:<id>   centred on the 2 × 2, at the ground's top
 *       └── model           turned so socket_charge sits on the mouth's charge tile
 * ```
 *
 * The model's `socket_charge` is at the footprint's (−½, −½) corner
 * tile, and a charge is set on the mouth's `pos`, which is one of its
 * four tiles; the model is turned so the two meet, and the charge view
 * draws the charge right on the socket.
 */
export class TunnelMouthView implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. */
  readonly root = new Group();
  private readonly drawn = new Map<TunnelMouthId, DrawnMouth>();
  /** The model the latest update asked for, per mouth; a load that no longer matches is dropped. */
  private readonly wanted = new Map<TunnelMouthId, ModelAssetId>();

  // ===========================================
  // Constructor
  // ===========================================

  /** @param models - Resolves the open and sealed models. */
  constructor(private readonly models: ModelLoader) {
    this.root.name = "tunnel-mouths";
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Brings the drawn mouths in step with `mouths`: one gone from the list
   * is removed, one whose state changed its model is drawn again, and a
   * new one is loaded. Resolves when every load has finished.
   *
   * @param mouths - The mouths the player may see.
   */
  async updateTunnelMouths(mouths: readonly TunnelMouth[]): Promise<void> {
    const keep = new Set(mouths.map((mouth) => mouth.id));
    for (const id of [...this.wanted.keys()]) {
      if (!keep.has(id)) {
        this.remove(id);
      }
    }
    const loads: Promise<void>[] = [];
    for (const mouth of mouths) {
      const modelId = tunnelMouthModelId(mouth);
      if (this.wanted.get(mouth.id) === modelId) {
        continue;
      }
      this.remove(mouth.id);
      this.wanted.set(mouth.id, modelId);
      loads.push(this.place(mouth, modelId));
    }
    await Promise.all(loads);
  }

  /** Ids of the mouths drawn or loading, in the order they were first asked for. */
  ids(): readonly TunnelMouthId[] {
    return [...this.wanted.keys()];
  }

  /** The placed group for a mouth, or undefined while it loads or once it is gone. */
  mouthObject(mouthId: TunnelMouthId): Object3D | undefined {
    return this.drawn.get(mouthId)?.root;
  }

  /** The model a mouth is drawn with, or undefined while it loads or once it is gone. */
  drawnModel(mouthId: TunnelMouthId): ModelAssetId | undefined {
    return this.drawn.get(mouthId)?.modelId;
  }

  /** Removes every mouth, drops late loads and detaches the root. */
  dispose(): void {
    for (const id of [...this.wanted.keys()]) {
      this.remove(id);
    }
    this.root.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Loads the mouth's model and sets it on its footprint, unless the ask changed while it loaded. */
  private async place(
    mouth: TunnelMouth,
    modelId: ModelAssetId,
  ): Promise<void> {
    const model = await this.models.load(modelId);
    if (this.wanted.get(mouth.id) !== modelId || this.drawn.has(mouth.id)) {
      return;
    }
    const corner = minCorner(mouth);
    const root = new Group();
    root.name = `${TUNNEL_MOUTH_NAME_PREFIX}${mouth.id}`;
    const feet = unitFeetAt(corner, TUNNEL_MOUTH_SIZE);
    root.position.set(feet.x, feet.y, feet.z);
    model.rotation.y = socketYaw(mouth.pos, corner);
    root.add(model);
    this.drawn.set(mouth.id, { root, modelId });
    this.root.add(root);
  }

  /** Forgets a mouth: its group and any pending load. */
  private remove(mouthId: TunnelMouthId): void {
    this.wanted.delete(mouthId);
    const drawn = this.drawn.get(mouthId);
    if (drawn === undefined) {
      return;
    }
    drawn.root.removeFromParent();
    this.drawn.delete(mouthId);
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The model a mouth is drawn with: sealed once its charge has blown,
 * open until then (a burning charge still leaves it open).
 *
 * @param mouth - The mouth.
 */
export function tunnelMouthModelId(mouth: TunnelMouth): ModelAssetId {
  return isSealed(mouth) ? TUNNEL_MOUTH_SEALED_MODEL_ID : TUNNEL_MOUTH_MODEL_ID;
}

/**
 * The yaw that brings the model's charge socket, at its (−½, −½) corner
 * tile, onto the mouth's `pos` tile, read from which corner of the 2 × 2
 * `pos` is:
 *
 * ```
 *   pos at corner (dx, dz) from the minimum corner
 *     (0, 0) ──► 0      (0, 1) ──► π/2
 *     (1, 1) ──► π      (1, 0) ──► −π/2
 * ```
 *
 * three turns about +Y as x' = x cos θ + z sin θ, z' = −x sin θ + z cos θ,
 * so a turn of π/2 takes (−½, −½) to (−½, +½).
 *
 * @param pos - The mouth's charge tile.
 * @param corner - The footprint's minimum corner.
 */
export function socketYaw(pos: TileCoord, corner: TileCoord): number {
  const east = pos.x > corner.x;
  const south = pos.z > corner.z;
  if (east && south) {
    return Math.PI;
  }
  if (east) {
    return -Math.PI / 2;
  }
  return south ? Math.PI / 2 : 0;
}

/** The footprint's minimum corner, at the height of the mouth's `pos`. */
function minCorner(mouth: TunnelMouth): TileCoord {
  const tiles = mouth.tiles.length > 0 ? mouth.tiles : [mouth.pos];
  return {
    x: Math.min(...tiles.map((tile) => tile.x)),
    y: mouth.pos.y,
    z: Math.min(...tiles.map((tile) => tile.z)),
  };
}
