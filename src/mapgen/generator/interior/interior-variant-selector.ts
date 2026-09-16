import type { Rng } from "../../../core/model/rng";
import type { BuildingInteriorVariant } from "../../model/building-room-program";

/**
 * Draws from the least-used business identities so neighbouring shops differ.
 * Counts belong to one generation run; the seeded draw only breaks ties.
 */
export function selectInteriorVariant(
  variants: readonly BuildingInteriorVariant[],
  used: Map<string, number>,
  rng: Rng,
): BuildingInteriorVariant | undefined {
  if (variants.length === 0) return undefined;
  const fewest = Math.min(...variants.map(({ id }) => used.get(id) ?? 0));
  const choice = rng.pick(
    variants.filter(({ id }) => (used.get(id) ?? 0) === fewest),
  );
  used.set(choice.id, fewest + 1);
  return choice;
}
