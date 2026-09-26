import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { BROODMOTHER_ESCAPED } from "../../tactical/model/broodmother-escaped-event";
import { BROODMOTHER_FLEEING } from "../../tactical/model/broodmother-fleeing-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { unitAt } from "../../tactical/service/tactical-fixtures.test-helper";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import {
  broodmotherFlight,
  createBroodmotherFlightStep,
} from "./broodmother-flight-step";
import { broodmotherEscaped } from "./broodmother-service";
import { fieldMap, motherMission } from "./broodmother.test-helper";

// ===========================================
// Fixtures
// ===========================================

const SQUAD = unitAt("squad", "infantry", { x: 11, y: 0, z: 11 });

/** Her max hit points at difficulty 1 with no scars. */
const MAX_HP = 60;

/** A 12×12 field with the Broodmother anchored at `anchor` on `hp`. */
function motherAt(
  anchor: { x: number; z: number },
  hp: number,
): ReturnType<typeof motherMission> {
  return motherMission(
    fieldMap(12, 12).build(),
    [SQUAD],
    { x: anchor.x, y: 0, z: anchor.z },
    { hp },
  );
}

// ===========================================
// Tests
// ===========================================

describe("broodmotherFlight (#1179, campaign arc §6.8)", () => {
  it("marks her fleeing, once, when she is at half health", () => {
    const { mission, mother } = motherAt({ x: 4, z: 4 }, MAX_HP / 2);
    const first = broodmotherFlight(mission);
    const marked = first.state.units.find((u) => u.id === mother.id);
    expect(marked?.fleeing).toBe(true);
    expect(first.events).toEqual([
      {
        type: BROODMOTHER_FLEEING,
        payload: { unitId: mother.id, hp: MAX_HP / 2, maxHp: MAX_HP },
      },
    ]);
    // Announced once: the next phase finds her already running.
    const second = broodmotherFlight(first.state);
    expect(second.events).toEqual([]);
    expect(second.state.units.find((u) => u.id === mother.id)?.fleeing).toBe(
      true,
    );
  });

  it("does nothing a hit point above half", () => {
    const { mission } = motherAt({ x: 4, z: 4 }, MAX_HP / 2 + 1);
    const applied = broodmotherFlight(mission);
    expect(applied.state).toBe(mission);
    expect(applied.events).toEqual([]);
  });

  it("takes her off the map when she is fleeing and her block reaches the edge", () => {
    const { mission, mother } = motherAt({ x: 0, z: 4 }, 10);
    const applied = broodmotherFlight(mission);
    expect(applied.state.units.some((u) => u.id === mother.id)).toBe(false);
    expect(applied.state.escaped?.map((u) => u.id)).toEqual([mother.id]);
    expect(applied.events.map((e) => e.type)).toEqual([
      BROODMOTHER_FLEEING,
      BROODMOTHER_ESCAPED,
    ]);
    expect(applied.events[1]).toEqual({
      type: BROODMOTHER_ESCAPED,
      payload: { unitId: mother.id, pos: mother.pos, hp: 10 },
    });
    expect(broodmotherEscaped(applied.state)).toBe(true);
    expect(broodmotherEscaped(mission)).toBe(false);
  });

  it("reaches the far edges by her block's far tiles", () => {
    // Anchored at x = 9 her block covers x 9..11, and 11 is the edge.
    const { mission, mother } = motherAt({ x: 9, z: 4 }, 10);
    expect(broodmotherFlight(mission).state.escaped?.map((u) => u.id)).toEqual([
      mother.id,
    ]);
    const inside = motherAt({ x: 8, z: 4 }, 10).mission;
    expect(broodmotherFlight(inside).state.escaped).toBeUndefined();
  });

  it("leaves a healthy Broodmother on the edge where she stands", () => {
    const { mission } = motherAt({ x: 0, z: 4 }, MAX_HP);
    const applied = broodmotherFlight(mission);
    expect(applied.state).toBe(mission);
    expect(broodmotherEscaped(applied.state)).toBe(false);
  });

  it("keeps a marked Broodmother running even if her hit points climb back", () => {
    const { mission, mother } = motherAt({ x: 0, z: 4 }, MAX_HP);
    const marked: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === mother.id ? { ...u, fleeing: true } : u,
      ),
    };
    const applied = broodmotherFlight(marked);
    expect(applied.events.map((e) => e.type)).toEqual([BROODMOTHER_ESCAPED]);
  });

  it("reads the threshold from its tuning", () => {
    const { mission } = motherAt({ x: 4, z: 4 }, 40);
    const tuning = { ...BROODMOTHER_TUNING, fleeAtHpFraction: 0.75 };
    const step = createBroodmotherFlightStep(tuning);
    const applied = step(mission, {
      rng: new Mulberry32Rng(1),
      ids: new SequentialIdGenerator(),
    });
    expect(applied.events.map((e) => e.type)).toEqual([BROODMOTHER_FLEEING]);
    expect(broodmotherFlight(mission).events).toEqual([]);
  });

  it("changes nothing on a mission without a Broodmother, and ignores a dead one", () => {
    const { mission, mother } = motherAt({ x: 0, z: 4 }, 10);
    const dead: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === mother.id ? { ...u, hp: 0 } : u,
      ),
    };
    expect(broodmotherFlight(dead).state).toBe(dead);
    const none: TacticalState = { ...mission, units: [SQUAD] };
    expect(broodmotherFlight(none).state).toBe(none);
  });
});
