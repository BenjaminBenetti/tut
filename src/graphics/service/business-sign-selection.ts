import { hashSeed } from "../../core/service/seed-hash";
import type { Building } from "../../mapgen/model/building";
import { BUILDING_FRONTAGE_STYLES } from "../data/building-frontage-styles";
import { BUSINESS_NAMES } from "../data/business-names";
import type { BusinessFrontageKind } from "../model/building-frontage-style";
import type {
  BusinessNameCatalogue,
  BusinessSignAppearance,
} from "../model/business-sign-appearance";

/**
 * Deals each trade's names without repeats until its catalogue is exhausted.
 * Canonical building order keeps the assignment independent of map array order;
 * per-building seed hashes pick from each remaining bag without changing saves.
 */
export function resolveBusinessSigns(
  buildings: readonly Building[],
  seed: string,
  names: BusinessNameCatalogue = BUSINESS_NAMES,
): ReadonlyMap<string, BusinessSignAppearance> {
  const result = new Map<string, BusinessSignAppearance>();
  const remaining = new Map<BusinessFrontageKind, number[]>();
  const ordered = [...buildings].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  for (const building of ordered) {
    const kind = businessKind(building);
    if (kind === undefined || names[kind].length === 0) continue;
    let choices = remaining.get(kind);
    if (choices === undefined || choices.length === 0) {
      choices = Array.from({ length: names[kind].length }, (_, i) => i);
      remaining.set(kind, choices);
    }
    const selected =
      hashSeed(`${seed}:${building.id}:${kind}:business-name`) % choices.length;
    const nameIndex = choices.splice(selected, 1)[0]!;
    result.set(building.id, { kind, nameIndex });
  }
  return result;
}

/** Reads the same authored frontage used to mount a sign; unknown identities stay generic. */
function businessKind(building: Building): BusinessFrontageKind | undefined {
  if (!Object.hasOwn(BUILDING_FRONTAGE_STYLES, building.kind)) return undefined;
  const style = BUILDING_FRONTAGE_STYLES[building.kind]!;
  const identity = building.interiorStyle;
  const entrances =
    identity !== undefined &&
    style.entrancesByInteriorStyle !== undefined &&
    Object.hasOwn(style.entrancesByInteriorStyle, identity)
      ? style.entrancesByInteriorStyle[identity]
      : style.entrances;
  return entrances?.[0]?.businessKind;
}
