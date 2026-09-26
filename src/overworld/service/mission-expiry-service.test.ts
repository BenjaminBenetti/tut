import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../data/hive-tuning";
import { MISSION_TUNING } from "../data/mission-tuning";
import { MAX_INFESTATION } from "../model/city";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import type { Mission } from "../model/mission";
import type {
  MissionConsequenceRule,
  MissionConsequenceRules,
} from "../model/mission-consequence-rule";
import { MISSION_EXPIRED } from "../model/mission-expired-event";
import type { MissionExpiryDeps } from "./mission-expiry-service";
import { expireMissions } from "./mission-expiry-service";
import { MISSION_CONSEQUENCE_RULES } from "./missions/mission-consequence-rules";
import {
  fixtureState,
  missionAt,
} from "./missions/mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const DEPS: MissionExpiryDeps = {
  consequences: MISSION_CONSEQUENCE_RULES,
  context: { tuning: MISSION_TUNING, hive: HIVE_TUNING },
};

// ===========================================
// Expiry
// ===========================================

describe("expireMissions", () => {
  it("returns the same state when nothing has expired", () => {
    const state = fixtureState({ missions: [missionAt("mid", 6)] });
    const result = expireMissions(state, DEPS);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it("removes missions whose expiry day has arrived and penalises their cities", () => {
    const state = fixtureState({
      day: 5,
      missions: [missionAt("mid", 5, 10), missionAt("low", 8)],
    });
    const result = expireMissions(state, DEPS);
    expect(result.state.missions.map((m) => m.cityId)).toEqual(["low"]);
    const mid = result.state.map.cities.find((c) => c.id === "mid");
    expect(mid?.infestation).toBe(60);
    expect(result.events).toEqual([
      {
        type: MISSION_EXPIRED,
        payload: {
          missionId: "mission-mid",
          typeId: "infestation-clearance",
          cityId: "mid",
          ignorePenalty: 10,
        },
      },
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "mid", from: 50, to: 60 },
      },
    ]);
    expect(state.missions).toHaveLength(2);
    expect(state.map.cities.find((c) => c.id === "mid")?.infestation).toBe(50);
  });

  it("penalises a lapsed defence like today (#1175)", () => {
    const state = fixtureState({
      day: 5,
      missions: [missionAt("mid", 5, 15, "defend-installation")],
    });
    const result = expireMissions(state, DEPS);
    expect(result.state.missions).toEqual([]);
    expect(
      result.state.map.cities.find((c) => c.id === "mid")?.infestation,
    ).toBe(65);
  });

  it("clamps the penalty at maximum infestation and emits no change event then", () => {
    const state = fixtureState({
      day: 9,
      missions: [missionAt("full", 9, 25)],
    });
    const result = expireMissions(state, DEPS);
    const full = result.state.map.cities.find((c) => c.id === "full");
    expect(full?.infestation).toBe(MAX_INFESTATION);
    expect(result.events.map((e) => e.type)).toEqual([MISSION_EXPIRED]);
  });

  it("keeps a mission that expires tomorrow", () => {
    const state = fixtureState({ day: 4, missions: [missionAt("mid", 5)] });
    expect(expireMissions(state, DEPS).state.missions).toHaveLength(1);
  });

  it("never expires a pinned mission, however late (ADR 0013 §2.2)", () => {
    const pinned: Mission = { ...missionAt("mid", 5, 10), pinned: true };
    const state = fixtureState({
      day: 30,
      missions: [pinned, missionAt("low", 5)],
    });
    const result = expireMissions(state, DEPS);
    expect(result.state.missions).toEqual([pinned]);
    expect(result.state.missions[0]).toBe(pinned);
    expect(
      result.events.filter((e) => e.type === MISSION_EXPIRED),
    ).toHaveLength(1);
    expect(result.state.map.cities.find((c) => c.id === "mid")).toBe(
      state.map.cities.find((c) => c.id === "mid"),
    );
    expect(
      expireMissions(fixtureState({ day: 30, missions: [pinned] }), DEPS)
        .events,
    ).toEqual([]);
  });

  it("asks each lapsed offer's own type what it costs, in mission order", () => {
    const calls: string[] = [];
    const spy = (rule: MissionConsequenceRule): MissionConsequenceRule => ({
      ...rule,
      onExpired: (state, mission, ctx) => {
        calls.push(`${mission.typeId}@${mission.cityId}`);
        return rule.onExpired(state, mission, ctx);
      },
    });
    const consequences: MissionConsequenceRules = {
      "infestation-clearance": spy(
        MISSION_CONSEQUENCE_RULES["infestation-clearance"],
      ),
      "defend-installation": spy(
        MISSION_CONSEQUENCE_RULES["defend-installation"],
      ),
      "crash-site": spy(MISSION_CONSEQUENCE_RULES["crash-site"]),
      "wreck-recovery": spy(MISSION_CONSEQUENCE_RULES["wreck-recovery"]),
      evacuation: spy(MISSION_CONSEQUENCE_RULES.evacuation),
      "hive-assault": spy(MISSION_CONSEQUENCE_RULES["hive-assault"]),
    };
    const state = fixtureState({
      day: 5,
      missions: [
        missionAt("full", 5, 10, "defend-installation"),
        missionAt("low", 9),
        missionAt("mid", 5),
      ],
    });
    const result = expireMissions(state, { ...DEPS, consequences });
    expect(calls).toEqual([
      "defend-installation@full",
      "infestation-clearance@mid",
    ]);
    expect(result.events.map((e) => e.type)).toEqual([
      MISSION_EXPIRED,
      MISSION_EXPIRED,
      CITY_INFESTATION_CHANGED,
    ]);
  });
});
