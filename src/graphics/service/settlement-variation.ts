import { hashSeed } from "../../core/service/seed-hash";
import type { CityId } from "../../overworld/model/city";
import { SETTLEMENT_VARIATION_TUNING } from "../data/settlement-variation-tuning";
import type {
  SettlementVariation,
  SettlementVariationTuning,
} from "../model/settlement-variation";

// ===========================================
// Per-city variation
// ===========================================

/**
 * Derives a city's settlement variation from its id (#1155). Three
 * independent bit fields of one 32-bit hash feed the mirror, the yaw
 * and the height, so the three do not correlate:
 *
 * ```
 *   hash(cityId) ─┬─ bit 0        ─▶ mirrored
 *                 ├─ bits 1..12   ─▶ yaw     ∈ [-maxYaw, +maxYaw]
 *                 └─ bits 13..24  ─▶ height  ∈ [min, max]
 * ```
 *
 * Pure and deterministic: no `Math.random`, no clock.
 */
export function settlementVariation(
  cityId: CityId,
  tuning: SettlementVariationTuning = SETTLEMENT_VARIATION_TUNING,
): SettlementVariation {
  const hash = hashSeed(`settlement:${cityId}`);
  const mirrored = (hash & 1) === 1;
  const yawUnit = ((hash >>> 1) & 0xfff) / 0xfff;
  const heightUnit = ((hash >>> 13) & 0xfff) / 0xfff;
  return {
    mirrored,
    yaw: (yawUnit * 2 - 1) * tuning.maxYaw,
    heightScale:
      tuning.minHeightScale +
      heightUnit * (tuning.maxHeightScale - tuning.minHeightScale),
  };
}
