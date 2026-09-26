import { describe, expect, it } from "vitest";

import { MISSION_TUNING } from "../../data/mission-tuning";
import { CITY_INFESTATION_CHANGED } from "../../model/city-infestation-changed-event";
import type { OverworldState } from "../../model/overworld-state";
import { DEFEND_INSTALLATION_CONSEQUENCE } from "./defend-installation-consequence";
import {
  boardMap,
  fixtureState,
  missionAt,
  resultFor,
} from "./mission-fixtures.test-helper";

const CTX = { tuning: MISSION_TUNING };
const DEFEND = missionAt("c0", 9, 15, "defend-installation");

/** c0's infestation in `state`. */
function c0(state: OverworldState): number | undefined {
  return state.map.cities.find((city) => city.id === "c0")?.infestation;
}

describe("DEFEND_INSTALLATION_CONSEQUENCE", () => {
  it("applies the resolver's delta to the host city, with no mop-up", () => {
    const { state, events } = DEFEND_INSTALLATION_CONSEQUENCE.onResolved(
      fixtureState({ map: boardMap([30]) }),
      DEFEND,
      resultFor(DEFEND, "won", -16),
      CTX,
    );
    expect(c0(state)).toBe(14);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "c0", from: 30, to: 14 },
      },
    ]);
  });

  it("adds the frozen ignore penalty when the offer lapses", () => {
    const { state } = DEFEND_INSTALLATION_CONSEQUENCE.onExpired(
      fixtureState({ map: boardMap([50]) }),
      DEFEND,
      CTX,
    );
    expect(c0(state)).toBe(65);
  });
});
