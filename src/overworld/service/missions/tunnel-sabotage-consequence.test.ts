import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { INFESTATION_TUNING } from "../../data/infestation-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { OverworldState } from "../../model/overworld-state";
import { SPREAD_HELD } from "../../model/spread-held-event";
import { INFESTATION_SPREAD } from "../../model/infestation-spread-event";
import { applySpread } from "../infestation-spread-service";
import {
  boardMap,
  fixtureState,
  missionAt,
  resultFor,
} from "./mission-fixtures.test-helper";
import { MISSION_CONSEQUENCE_RULES } from "./mission-consequence-rules";
import {
  TUNNEL_SABOTAGE_CONSEQUENCE,
  tunnelsSealed,
} from "./tunnel-sabotage-consequence";

// ===========================================
// Fixtures
// ===========================================

const CTX = { tuning: MISSION_TUNING, hive: HIVE_TUNING };

/** A tunnel sabotage at c1 (80), whose spread is due on day 22. */
const SABOTAGE: Mission = {
  ...missionAt("c1", 22, 0, "tunnel-sabotage"),
  tunnelSabotage: { cityId: "c1", spreadDueDay: 22 },
};

/** Day 20: c1 at 80 between c0 and c2 at 30, two days from spreading. */
function beforeSpread(): OverworldState {
  return fixtureState({
    day: 20,
    map: boardMap([30, 80, 30]),
    spreadCooldowns: { c1: 2 },
  });
}

/** A played result with `sealed` of three mouths reported. */
function played(
  outcome: MissionResult["outcome"],
  sealed: number,
): MissionResult {
  return {
    ...resultFor(SABOTAGE, outcome, -14),
    tunnelsSealed: sealed,
    tunnelsTotal: 3,
  };
}

/** The days on which c1 spreads over the next `days` ticks after `state`. */
function spreadDays(state: OverworldState, days: number): number[] {
  const out: number[] = [];
  let map = state.map;
  let cooldowns = state.spreadCooldowns;
  for (let day = state.day + 1; day <= state.day + days; day += 1) {
    const spread = applySpread(
      map,
      0,
      {},
      cooldowns,
      new Mulberry32Rng(day),
      INFESTATION_TUNING,
    );
    if (
      spread.events.some(
        (event) =>
          event.type === INFESTATION_SPREAD &&
          event.payload.fromCityId === "c1",
      )
    ) {
      out.push(day);
    }
    map = spread.state.map;
    cooldowns = spread.state.cooldowns;
  }
  return out;
}

// ===========================================
// Tests
// ===========================================

describe("TUNNEL_SABOTAGE_CONSEQUENCE", () => {
  it("is the shipped table's rule", () => {
    expect(MISSION_CONSEQUENCE_RULES["tunnel-sabotage"]).toBe(
      TUNNEL_SABOTAGE_CONSEQUENCE,
    );
  });

  it("holds the city's spread for 10 days on a win", () => {
    const state = beforeSpread();
    const resolved = TUNNEL_SABOTAGE_CONSEQUENCE.onResolved(
      state,
      SABOTAGE,
      played("won", 3),
      CTX,
    );
    expect(resolved.state.spreadCooldowns).toEqual({ c1: 10 });
    expect(resolved.events).toEqual([
      { type: SPREAD_HELD, payload: { cityId: "c1", days: 10 } },
    ]);
    // Infestation is not the pay-off: the resolver's delta is not applied.
    expect(resolved.state.map).toBe(state.map);
  });

  it("cancels the spread that was due: the city next spreads 10 days on", () => {
    expect(spreadDays(beforeSpread(), 12)).toEqual([22, 27, 32]);
    const won = TUNNEL_SABOTAGE_CONSEQUENCE.onResolved(
      beforeSpread(),
      SABOTAGE,
      played("won", 3),
      CTX,
    ).state;
    expect(spreadDays(won, 12)).toEqual([30]);
  });

  it("changes nothing when lost, or extracted (abandoned) with a mouth open", () => {
    const state = beforeSpread();
    for (const result of [
      played("lost", 3),
      played("lost", 1),
      played("extracted", 2),
      played("extracted", 0),
    ]) {
      const resolved = TUNNEL_SABOTAGE_CONSEQUENCE.onResolved(
        state,
        SABOTAGE,
        result,
        CTX,
      );
      expect(resolved.state).toBe(state);
      expect(resolved.events).toEqual([]);
    }
  });

  it("changes nothing when the offer lapses: the city spreads as it was going to", () => {
    const state = beforeSpread();
    const expired = TUNNEL_SABOTAGE_CONSEQUENCE.onExpired(state, SABOTAGE, CTX);
    expect(expired.state).toBe(state);
    expect(expired.events).toEqual([]);
    expect(spreadDays(expired.state, 3)).toEqual([22]);
  });

  it("holds the offer's city when a won result reports no tunnels (auto-resolved)", () => {
    const resolved = TUNNEL_SABOTAGE_CONSEQUENCE.onResolved(
      beforeSpread(),
      { ...SABOTAGE, tunnelSabotage: undefined },
      resultFor(SABOTAGE, "won", -14),
      CTX,
    );
    expect(resolved.state.spreadCooldowns).toEqual({ c1: 10 });
  });
});

describe("tunnelsSealed", () => {
  it("reads the count, else the objectives, else leaves it to the outcome", () => {
    expect(tunnelsSealed(played("won", 3))).toBe(true);
    expect(tunnelsSealed(played("won", 2))).toBe(false);
    const base = resultFor(SABOTAGE, "won", 0);
    expect(
      tunnelsSealed({
        ...base,
        objectives: [{ kind: "seal-tunnels", complete: false, failed: false }],
      }),
    ).toBe(false);
    expect(tunnelsSealed(base)).toBe(true);
  });
});
