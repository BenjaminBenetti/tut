import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { CAPTURE_NET, EQUIPMENT, GRENADE } from "../data/equipment";
import { RADAR_TUNING } from "../data/radar-tuning";
import { TURRET_TUNING } from "../data/turret-tuning";
import { canBeNetted } from "../model/carried-specimen";
import { usesLeftOf } from "../model/equipment";
import { EQUIPMENT_USED } from "../model/equipment-used-event";
import { SPECIMEN_CAPTURED } from "../model/specimen-captured-event";
import type { CaptureSpecimenObjective } from "../model/tactical-state";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { useEquipment } from "../model/use-equipment-command";
import { createEquipmentCatalogue } from "../repository/equipment-catalogue";
import {
  captureThreshold,
  netDistance,
  specimenWanted,
} from "./capture-service";
import type { EquipmentDeps } from "./equipment-service";
import { createUseEquipmentHandler } from "./equipment-service";
import { moveBudget, movePerAction } from "./movement-service";
import {
  ctxWith,
  FIXTURE_TEMPLATES,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  withCivilian,
} from "./tactical-fixtures.test-helper";
import { withVision } from "./vision-service";

/** The mission with both sides' sight taken from where everyone stands. */
function sighted(mission: TacticalState): TacticalState {
  return withVision({ state: mission, events: [] }).state;
}

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });
const SQUAD = at(3, 3);

const DEPS: EquipmentDeps = {
  catalogue: createEquipmentCatalogue(EQUIPMENT),
  combat: COMBAT_TUNING,
  attack: fixtureAttackDeps(),
  radar: RADAR_TUNING,
  turret: TURRET_TUNING,
};
const handler = createUseEquipmentHandler(DEPS);
const ctx = () => ctxWith(riggedRng(true));

/** The capture Live Specimen asks for, open. */
const WANT_LURKER: CaptureSpecimenObjective = {
  id: "objective-1",
  kind: "capture-specimen",
  species: "lurker",
  complete: false,
  failed: false,
};

/** A lurker (the fixture bug stats: 10 hp, so the net holds at 5). */
function lurker(id: string, pos: TileCoord, hp: number): Unit {
  return {
    ...unitAt(id, "infantry", pos, { team: "bugs", hp }),
    sourceId: "lurker",
  };
}

/**
 * The open field with a squad carrying a net and a grenade at (3,3),
 * the given bugs, and the capture objectives given (Live Specimen's by
 * default), with both sides' sight taken so the squad sees what it
 * throws at.
 */
function netted(
  bugs: readonly Unit[],
  objectives: readonly CaptureSpecimenObjective[] = [WANT_LURKER],
): TacticalState {
  const base = missionWith(
    openField().build(),
    [unitAt("squad", "infantry", SQUAD), ...bugs],
    { objectives },
  );
  return sighted({
    ...base,
    templates: {
      ...base.templates,
      [FIXTURE_TEMPLATES.infantry]: {
        ...base.templates[FIXTURE_TEMPLATES.infantry]!,
        equipment: [GRENADE.id, CAPTURE_NET.id],
      },
    },
  });
}

/** Throws the squad's net at `tile`. */
function throwNet(mission: TacticalState, tile: TileCoord, unitId = "squad") {
  return handler(mission, useEquipment(unitId, CAPTURE_NET.id, tile), ctx());
}

/** The unit as the mission now has it. */
function unitOf(mission: TacticalState, id: string): Unit | undefined {
  return mission.units.find((u) => u.id === id);
}

// ===========================================
// Rules
// ===========================================

describe("capture rules (#1179)", () => {
  it("holds at half the bug's hit points or less, and never below one", () => {
    const net = CAPTURE_NET.net!;
    expect(net.captureAtHpFraction).toBe(0.5);
    expect(captureThreshold({ maxHp: 10 }, net)).toBe(5);
    expect(captureThreshold({ maxHp: 9 }, net)).toBe(4);
    expect(captureThreshold({ maxHp: 1 }, net)).toBe(1);
  });

  it("reaches the eight tiles round the thrower and half a storey up or down", () => {
    expect(netDistance(at(3, 3), at(4, 4))).toBe(1);
    expect(netDistance(at(3, 3), at(3, 5))).toBe(2);
    expect(netDistance(at(3, 3), at(3, 4, 1))).toBe(1);
    expect(netDistance(at(3, 3), at(3, 4, 4))).toBe(3);
  });

  it("is wanted only while an open capture objective names the species", () => {
    const open = netted([]);
    expect(specimenWanted(open, "lurker")).toBe(true);
    expect(specimenWanted(open, "swarmer")).toBe(false);
    const done = netted([], [{ ...WANT_LURKER, complete: true }]);
    expect(specimenWanted(done, "lurker")).toBe(false);
    const lost = netted([], [{ ...WANT_LURKER, failed: true }]);
    expect(specimenWanted(lost, "lurker")).toBe(false);
  });
});

// ===========================================
// Throwing the net
// ===========================================

describe("UseEquipment with the capture net (#1179)", () => {
  it("takes an adjacent lurker at the threshold alive: it leaves the map and the squad carries it", () => {
    const mission = netted([lurker("lurker-1", at(4, 4), 5)]);
    const result = throwNet(mission, at(4, 4));
    if (!result.ok) throw new Error(result.error.kind);
    const after = result.value.state;
    // Gone from the map: not a unit, not an enemy, not a bug to count.
    expect(unitOf(after, "lurker-1")).toBeUndefined();
    expect(after.units.filter((u) => u.team === "bugs")).toEqual([]);
    const squad = unitOf(after, "squad")!;
    expect(squad.carrying).toEqual({
      unitId: "lurker-1",
      species: "lurker",
      templateId: FIXTURE_TEMPLATES.bug,
      movePenalty: 1,
    });
    // One action and the net's only use.
    expect(squad.ap).toBe(1);
    expect(usesLeftOf(squad, CAPTURE_NET)).toBe(0);
    expect(result.value.events.map((e) => e.type)).toEqual([
      EQUIPMENT_USED,
      SPECIMEN_CAPTURED,
    ]);
    expect(result.value.events[1]?.payload).toMatchObject({
      unitId: "squad",
      pos: at(4, 4),
    });
  });

  it("refuses a lurker above the threshold, and changes nothing", () => {
    const mission = netted([lurker("lurker-1", at(4, 3), 6)]);
    const result = throwNet(mission, at(4, 3));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      kind: "target-too-healthy",
      targetId: "lurker-1",
      hp: 6,
      threshold: 5,
    });
  });

  it("refuses a weakened lurker two tiles off, and takes it once adjacent", () => {
    const far = netted([lurker("lurker-1", at(5, 3), 2)]);
    const refused = throwNet(far, at(5, 3));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toEqual({
      kind: "out-of-range",
      distance: 2,
      range: 1,
    });
    const near = netted([lurker("lurker-1", at(4, 2), 2)]);
    expect(throwNet(near, at(4, 2)).ok).toBe(true);
  });

  it("refuses a species no open objective wants, so the net is no execution tool", () => {
    const swarmer = {
      ...lurker("swarmer-1", at(4, 3), 1),
      sourceId: "swarmer",
    };
    const result = throwNet(netted([swarmer]), at(4, 3));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("specimen-not-wanted");
  });

  it("refuses an empty tile, and a squad whose hands are already full", () => {
    const empty = throwNet(netted([]), at(4, 3));
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error.kind).toBe("no-capture-target");

    const mission = netted([lurker("lurker-2", at(4, 3), 1)]);
    const full: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === "squad"
          ? {
              ...u,
              carrying: {
                unitId: "lurker-1",
                species: "lurker",
                templateId: FIXTURE_TEMPLATES.bug,
                movePenalty: 1,
              },
            }
          : u,
      ),
    };
    const refused = throwNet(full, at(4, 3));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.kind).toBe("already-carrying");
  });

  it("is one net per squad per mission: the second throw has nothing left to throw", () => {
    const mission = netted([
      lurker("lurker-1", at(4, 3), 1),
      lurker("lurker-2", at(2, 3), 1),
    ]);
    const first = throwNet(mission, at(4, 3));
    if (!first.ok) throw new Error(first.error.kind);
    // Free the squad's hands so only the spent net stands in the way.
    const handsFree: TacticalState = {
      ...first.value.state,
      units: first.value.state.units.map((u) => {
        if (u.id !== "squad") return u;
        const { carrying: _carried, ...rest } = u;
        return { ...rest, ap: 2 };
      }),
    };
    const second = throwNet(handsFree, at(2, 3));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe("equipment-spent");
  });

  it("is a squad's kit only: a mech holding a net cannot carry", () => {
    const base = netted([lurker("lurker-1", at(4, 3), 1)]);
    const mission: TacticalState = {
      ...base,
      units: [
        ...base.units.filter((u) => u.id !== "squad"),
        unitAt("mech", "mech", SQUAD),
      ],
      templates: {
        ...base.templates,
        [FIXTURE_TEMPLATES.mech]: {
          ...base.templates[FIXTURE_TEMPLATES.mech]!,
          equipment: [CAPTURE_NET.id],
        },
      },
    };
    const result = throwNet(sighted(mission), at(4, 3), "mech");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("cannot-carry");
  });
});

// ===========================================
// Civilian groups (campaign arc §6.4)
// ===========================================

describe("the capture net and civilian groups (#1179, campaign arc §6.4)", () => {
  it("nets bugs only: never a civilian group, trapped or freed, however worn down", () => {
    expect(canBeNetted({ kind: "bug" })).toBe(true);
    expect(canBeNetted({ kind: "civilian" })).toBe(false);
    for (const trapped of [true, false]) {
      // A group of one hit point beside the squad, where a lurker would
      // be taken; the capture still wants a lurker.
      const mission = sighted(
        withCivilian(netted([]), "civ", at(4, 3), { trapped, hp: 1 }),
      );
      const result = throwNet(mission, at(4, 3));
      expect(result.ok, `trapped: ${String(trapped)}`).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("no-capture-target");
    }
  });
});

// ===========================================
// Carrying
// ===========================================

describe("carrying a specimen (#1179)", () => {
  it("costs the carrier one movement point per action", () => {
    const mission = netted([lurker("lurker-1", at(4, 3), 1)]);
    const before = unitOf(mission, "squad")!;
    expect(movePerAction(mission, before)).toBe(3);
    expect(moveBudget(mission, before)).toBe(6);
    const result = throwNet(mission, at(4, 3));
    if (!result.ok) throw new Error(result.error.kind);
    const after = result.value.state;
    const carrier = unitOf(after, "squad")!;
    expect(movePerAction(after, carrier)).toBe(2);
    // One action left after the throw: two tiles, not three.
    expect(moveBudget(after, carrier)).toBe(2);
    expect(moveBudget(after, { ...carrier, ap: 2 })).toBe(4);
  });
});
