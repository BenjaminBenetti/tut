import type { MechLoadout } from "../model/mech-loadout";
import { LOADOUT_FIELD_FOR_SLOT } from "../model/mech-loadout";
import type { MechPart, PartId } from "../model/mech-part";
import { isChassisPart } from "../model/mech-part";
import type { PartCatalogue } from "../model/part-catalogue";

// ===========================================
// Public Functions
// ===========================================

/**
 * The loadout that results from dropping `part` onto a draft (#1145):
 * a single-part slot takes the part in place of whatever it held, a
 * utility goes into the slot asked for or the first free one. Pure:
 * returns a new loadout and never touches the input.
 *
 * ```
 *   chassis  ──► chassisId = part; utilities trimmed to the new frame's slots
 *   legs …   ──► that slot's id = part
 *   utility  ──► utilityIds[index]            when an index is given
 *                utilityIds + part            when a slot is free
 *                utilityIds[last] = part      when every slot is taken
 *                unchanged                    when the chassis has no slots
 * ```
 *
 * A chassis swap keeps as many utilities as the new frame carries, in
 * order, because a player moving from an Atlas to a Vanguard expects to
 * keep the two they fitted first rather than lose all five.
 *
 * @param loadout - The draft being edited.
 * @param part - The part dropped on it.
 * @param catalogue - Resolves the chassis, for its utility slot count.
 * @param utilityIndex - The utility slot the part was dropped on, if a
 *   specific one; ignored for non-utility parts and out-of-range values.
 * @returns The new draft.
 */
export function fitPart(
  loadout: MechLoadout,
  part: MechPart,
  catalogue: PartCatalogue,
  utilityIndex?: number,
): MechLoadout {
  if (isChassisPart(part)) {
    return {
      ...loadout,
      chassisId: part.id,
      utilityIds: loadout.utilityIds.slice(0, part.capacity.utilitySlots),
    };
  }
  if (part.slot === "utility") {
    return fitUtility(loadout, part.id, catalogue, utilityIndex);
  }
  return { ...loadout, [LOADOUT_FIELD_FOR_SLOT[part.slot]]: part.id };
}

/**
 * The loadout with the utility at `index` taken off; unchanged when
 * there is none there. Pure.
 *
 * @param loadout - The draft being edited.
 * @param index - Position in `utilityIds`.
 * @returns The new draft.
 */
export function removeUtility(
  loadout: MechLoadout,
  index: number,
): MechLoadout {
  if (index < 0 || index >= loadout.utilityIds.length) {
    return loadout;
  }
  return {
    ...loadout,
    utilityIds: loadout.utilityIds.filter((_, i) => i !== index),
  };
}

/**
 * How many utilities the draft's chassis carries; `0` when the id is
 * not a chassis the catalogue knows.
 *
 * @param loadout - The draft.
 * @param catalogue - Resolves the chassis.
 * @returns The slot count.
 */
export function utilitySlotsOf(
  loadout: MechLoadout,
  catalogue: PartCatalogue,
): number {
  const chassis = catalogue.getPart(loadout.chassisId);
  return chassis !== undefined && isChassisPart(chassis)
    ? chassis.capacity.utilitySlots
    : 0;
}

// ===========================================
// Private Functions
// ===========================================

/** Places a utility id by the rules in `fitPart`. */
function fitUtility(
  loadout: MechLoadout,
  id: PartId,
  catalogue: PartCatalogue,
  index: number | undefined,
): MechLoadout {
  const slots = utilitySlotsOf(loadout, catalogue);
  if (slots === 0) {
    return loadout;
  }
  const ids = [...loadout.utilityIds];
  const target =
    index !== undefined && index >= 0 && index < slots
      ? Math.min(index, ids.length)
      : ids.length < slots
        ? ids.length
        : slots - 1;
  ids[target] = id;
  return { ...loadout, utilityIds: ids };
}
