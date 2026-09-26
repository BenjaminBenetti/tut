import { describe, expect, it } from "vitest";

import { MISSION_TYPE_IDS } from "../../../content/model/mission-type-id";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import type { Mission } from "../../../overworld/model/mission";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import {
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { DEFEND_INSTALLATION_SETUP } from "./defend-installation-setup";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";

// ===========================================
// Fixtures
// ===========================================

/** A defence offer that lost its `defence` block: nothing to defend. */
const BARE_DEFENCE: Mission = {
  id: "mission-1",
  typeId: "defend-installation",
  cityId: "city-1",
  difficulty: 1,
  mapParams: {
    biome: "temperate",
    settlement: "town",
    size: "small",
    seed: "setup-rules",
  },
  rewards: { credits: 300, techPoints: 0 },
  createdDay: 1,
  expiresDay: 6,
  ignorePenalty: 10,
};

// ===========================================
// Tests
// ===========================================

describe("MISSION_SETUP_RULES (ADR 0013 §2.3)", () => {
  it("has one rule per mission type, filed under that type", () => {
    expect(Object.keys(MISSION_SETUP_RULES).sort()).toEqual(
      [...MISSION_TYPE_IDS].sort(),
    );
    for (const [key, rule] of Object.entries(MISSION_SETUP_RULES)) {
      expect([key, rule.typeId]).toEqual([key, key]);
    }
  });

  it("leaves the start as it was for a defence with nothing to defend", () => {
    const map = openField().build();
    const state = missionWith(map, [
      unitAt("u", "infantry", { x: 0, y: 0, z: 0 }),
    ]);
    const setUp = DEFEND_INSTALLATION_SETUP.setup(state, map, BARE_DEFENCE, {
      ids: new SequentialIdGenerator(),
      spawnTuning: SPAWN_TUNING,
      generator: GENERATOR_TUNING,
      civilian: CIVILIAN_TUNING,
    });
    expect(setUp).toEqual({ ok: true, value: state });
    expect(setUp.ok && setUp.value).toBe(state);
  });
});
