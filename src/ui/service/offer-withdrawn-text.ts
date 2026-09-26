import type { MissionTypeCatalogue } from "../../overworld/model/mission-type-catalogue";
import type {
  MissionWithdrawnPayload,
  MissionWithdrawnReason,
} from "../../overworld/model/mission-withdrawn-event";
import type { OverworldState } from "../../overworld/model/overworld-state";
import { findCity } from "../../overworld/service/earth-map-query-service";
import { STORY_MISSION_TITLES } from "../data/story-mission-titles";

// ===========================================
// Constants
// ===========================================

/** Why a lapsed offer went, as the notice finishes its sentence. */
const REASON_TEXT: Readonly<Record<MissionWithdrawnReason, string>> = {
  "target-gone": "its target is gone",
};

/** The replacement's name when the pin is no longer on the board to ask. */
const UNKNOWN_REPLACEMENT = "A priority mission";

// ===========================================
// Offer withdrawn notice text
// ===========================================

/**
 * The notice for offers the director took off the board (#1179): one
 * sentence per offer, naming its type, its city and why it went, so an
 * offer never just vanishes from the board. A displaced offer names the
 * pin that took its city by its story title ("Live Specimen"), or its
 * mission type when it has none.
 *
 * ```
 *   displaced ──► "Infestation Clearance at Lagos withdrawn: Live Specimen took the city."
 *   lapsed    ──► "Hive Assault at Cairo withdrawn: its target is gone."
 *   several   ──► the sentences above, in the order given, joined by a space
 * ```
 *
 * @param withdrawals - The withdrawals of one command, at least one.
 * @param overworld - The overworld the command left: its map names each
 *   city, its board holds each replacing pin.
 * @param missionTypes - Names each mission type.
 * @returns The notice's message.
 */
export function offerWithdrawnNotice(
  withdrawals: readonly MissionWithdrawnPayload[],
  overworld: Pick<OverworldState, "map" | "missions">,
  missionTypes: MissionTypeCatalogue,
): string {
  return withdrawals
    .map((withdrawal) => {
      const type = missionTypes[withdrawal.typeId].name;
      const city =
        findCity(overworld.map, withdrawal.cityId)?.name ?? withdrawal.cityId;
      return `${type} at ${city} withdrawn: ${why(withdrawal, overworld, missionTypes)}.`;
    })
    .join(" ");
}

// ===========================================
// Helpers
// ===========================================

/**
 * The clause after the colon: the pin that took the city, or the
 * reason the offer lapsed.
 *
 * @param withdrawal - One withdrawal.
 * @param overworld - Holds the replacing pin on its board.
 * @param missionTypes - Names the pin's type when it tells no story.
 */
function why(
  withdrawal: MissionWithdrawnPayload,
  overworld: Pick<OverworldState, "missions">,
  missionTypes: MissionTypeCatalogue,
): string {
  if (withdrawal.reason !== undefined) {
    return REASON_TEXT[withdrawal.reason];
  }
  const pin = overworld.missions.find(
    (mission) => mission.id === withdrawal.replacedBy,
  );
  const name =
    pin === undefined
      ? UNKNOWN_REPLACEMENT
      : pin.storyId === undefined
        ? missionTypes[pin.typeId].name
        : STORY_MISSION_TITLES[pin.storyId];
  return `${name} took the city`;
}
