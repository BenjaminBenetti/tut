import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import type { Mission } from "../../overworld/model/mission";
import type { MissionWithdrawnPayload } from "../../overworld/model/mission-withdrawn-event";
import { offerWithdrawnNotice } from "./offer-withdrawn-text";

// ===========================================
// Fixtures
// ===========================================

/** A pinned offer on `cityId`, telling `storyId`'s story when given. */
function pin(
  id: string,
  cityId: string,
  storyId?: Mission["storyId"],
): Mission {
  return {
    id,
    typeId: "infestation-clearance",
    cityId,
    difficulty: 3,
    mapParams: {
      biome: "tropical",
      settlement: "city",
      size: "small",
      seed: "1",
    },
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 4,
    expiresDay: 9,
    ignorePenalty: 0,
    pinned: true,
    ...(storyId === undefined ? {} : { storyId }),
  };
}

const DISPLACED: MissionWithdrawnPayload = {
  missionId: "mission-3",
  typeId: "evacuation",
  cityId: "lagos",
  replacedBy: "mission-9",
};

const LAPSED: MissionWithdrawnPayload = {
  missionId: "mission-4",
  typeId: "hive-assault",
  cityId: "cairo",
  reason: "target-gone",
};

// ===========================================
// Tests
// ===========================================

describe("offerWithdrawnNotice (#1179)", () => {
  it("names the offer, its city and the story mission that took it", () => {
    const overworld = {
      map: EARTH_MAP,
      missions: [pin("mission-9", "lagos", "live-specimen")],
    };

    expect(offerWithdrawnNotice([DISPLACED], overworld, MISSION_TYPES)).toBe(
      "Evacuation at Lagos withdrawn: Live Specimen took the city.",
    );
  });

  it("names a pin that tells no story by its mission type", () => {
    const overworld = { map: EARTH_MAP, missions: [pin("mission-9", "lagos")] };

    expect(offerWithdrawnNotice([DISPLACED], overworld, MISSION_TYPES)).toBe(
      "Evacuation at Lagos withdrawn: Infestation Clearance took the city.",
    );
  });

  it("says an offer whose target is gone lapsed for that reason", () => {
    const overworld = { map: EARTH_MAP, missions: [] };

    expect(offerWithdrawnNotice([LAPSED], overworld, MISSION_TYPES)).toBe(
      "Hive Assault at Cairo withdrawn: its target is gone.",
    );
  });

  it("gives every withdrawal of one command its own sentence, in order", () => {
    const overworld = {
      map: EARTH_MAP,
      missions: [pin("mission-9", "lagos", "great-hive")],
    };

    expect(
      offerWithdrawnNotice([LAPSED, DISPLACED], overworld, MISSION_TYPES),
    ).toBe(
      "Hive Assault at Cairo withdrawn: its target is gone. Evacuation at Lagos withdrawn: Great Hive took the city.",
    );
  });
});
