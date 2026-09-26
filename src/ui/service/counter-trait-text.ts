import type { MechTraits } from "../../tactical/model/mech-systems";
import { damageResistanceText } from "./damage-resistance-text";
import { formatWhole } from "./format";

// ===========================================
// Counter trait text
// ===========================================

/** The traits an autopsy counter gives (campaign arc §10.2): a part's or a whole mech's. */
export type CounterTraits = Pick<
  MechTraits,
  "resist" | "pierce" | "seismicRange"
>;

/**
 * What an autopsy counter does, in the player's words (campaign arc
 * §10.2), shared by the mech bay's Systems line and the tech tree's
 * "Unlocks" list so the two describe a counter the same way: the
 * resistances first (`damageResistanceText`), then the armour-piercing
 * rounds, then the seismic sensor. A trait of zero or less says
 * nothing.
 *
 * ```
 *   { resist: { acid: 3 } }     ──► ["acid resist 3"]
 *   { pierce: 2 }               ──► ["pierces 2 armour"]
 *   { seismicRange: 10 }        ──► ["reveals burrowed bugs within 10"]
 *   undefined                   ──► []
 * ```
 *
 * @param traits - A part's traits or a mech's systems; absent counters nothing.
 * @returns One item per counter, without separators.
 */
export function counterTraitText(
  traits: CounterTraits | undefined,
): readonly string[] {
  const pierce = traits?.pierce ?? 0;
  const seismicRange = traits?.seismicRange ?? 0;
  return [
    ...damageResistanceText(traits?.resist),
    ...(pierce > 0 ? [`pierces ${formatWhole(pierce)} armour`] : []),
    ...(seismicRange > 0
      ? [`reveals burrowed bugs within ${formatWhole(seismicRange)}`]
      : []),
  ];
}
