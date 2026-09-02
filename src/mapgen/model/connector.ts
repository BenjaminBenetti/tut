import { PassMask } from "./pass-mask";
import type { TileCoord } from "./tile-coord";

// ===========================================
// Connector
// ===========================================

/**
 * Kinds of vertical link (ADR 0004 §4.3).
 *
 * ```
 *   ramp    ground ↔ ground   rise 1     both classes
 *   stairs  floor  ↔ floor    rise 1     infantry
 *   ladder  ground/roof ↔ roof rise ≥ 1  infantry
 * ```
 */
export type ConnectorKind = "ramp" | "stairs" | "ladder";

/**
 * The only way to change level. Always bidirectional. `from` is the lower
 * tile and `to` the upper; they are horizontal neighbours. No connector
 * between two tiles of different level means a cliff.
 */
export interface Connector {
  readonly id: string;
  readonly kind: ConnectorKind;
  /** Lower endpoint. For stairs this is the tile with surface `stairs`. */
  readonly from: TileCoord;
  /** Upper endpoint; `to.y > from.y`. */
  readonly to: TileCoord;
  /** Classes that may traverse it; matches `CONNECTOR_RULES[kind].pass`. */
  readonly pass: PassMask;
  /** Owning building for stairs and ladders that serve a building. */
  readonly buildingId?: string;
}

/** Structural rule a connector kind must satisfy (checked by invariant I4). */
export interface ConnectorRule {
  readonly pass: PassMask;
  readonly minRise: number;
  readonly maxRise: number;
}

/** Rules per connector kind, from ADR 0004 §4.3. */
export const CONNECTOR_RULES: Readonly<Record<ConnectorKind, ConnectorRule>> = {
  ramp: { pass: PassMask.ALL, minRise: 1, maxRise: 1 },
  stairs: { pass: PassMask.INFANTRY, minRise: 1, maxRise: 1 },
  ladder: {
    pass: PassMask.INFANTRY,
    minRise: 1,
    maxRise: Number.POSITIVE_INFINITY,
  },
};
