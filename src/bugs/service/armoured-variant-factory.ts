import type {
  ArmourDelta,
  ArmouredVariantIdentity,
} from "../model/armoured-variant";
import type { BugSpecies } from "../model/bug-species";

// ===========================================
// Armoured variant factory
// ===========================================

/**
 * An Act III armoured variant of a base species (campaign arc §8, #1179):
 * the base's stat block with the delta's armour and hit points added,
 * under the variant's own id, name, description and model. Everything
 * else — move, action points, weapon, sight, behaviour (the same AI),
 * footprint and kill value — is the base's, so a later retune of the
 * base species carries straight through to its variant.
 *
 * ```
 *   base ──┬── id, name, description, modelId ◄── identity
 *          ├── armor + delta.armor, hp + delta.hp
 *          ├── hatchWeight 0: rolled only by the bestiary's mix
 *          └── everything else, unchanged
 * ```
 *
 * `hatchWeight` is 0 whatever the base's: a variant never hatches from
 * the default roll (a mission with no species mix, or a sweep), only
 * through an Act III or finale mix (ADR 0013 §2.6), exactly as the
 * spitter waits for the bestiary. Pure: the base is not touched.
 *
 * @param base - The species the variant is derived from.
 * @param identity - The variant's id, name, description and model.
 * @param delta - What its armour adds (`ARMOURED_VARIANT_TUNING[base]`).
 * @returns The variant's stat block.
 */
export function armouredVariant(
  base: BugSpecies,
  identity: ArmouredVariantIdentity,
  delta: ArmourDelta,
): BugSpecies {
  return {
    ...base,
    id: identity.id,
    name: identity.name,
    description: identity.description,
    modelId: identity.modelId,
    armor: base.armor + delta.armor,
    hp: base.hp + delta.hp,
    hatchWeight: 0,
  };
}
