import { describe, expect, it } from "vitest";

import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import { BLAST_RESOLVED } from "../model/blast-resolved-event";
import { EFFECT_DAMAGED } from "../model/effect-damaged-event";
import type { TacticalEvent } from "../model/tactical-event";
import type { Unit } from "../model/unit";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";
import { lastWoundOf } from "./wound-service";

// ===========================================
// Fixtures
// ===========================================

/** The quarry, a mech, a squad and a turret, on an open field. */
function cast(): Unit[] {
  return [
    unitAt("quarry", "infantry", { x: 6, y: 0, z: 6 }, { team: "bugs" }),
    unitAt("mech-1", "mech", { x: 0, y: 0, z: 0 }),
    unitAt("squad-1", "infantry", { x: 1, y: 0, z: 0 }),
    { ...unitAt("turret-1", "infantry", { x: 2, y: 0, z: 0 }), kind: "turret" },
  ];
}

/** A shot from `attackerId` at `targetId`. */
function shot(
  attackerId: string,
  targetId = "quarry",
  hit = true,
  damage = 4,
): TacticalEvent {
  return {
    type: ATTACK_RESOLVED,
    payload: {
      attackerId,
      targetId,
      hit,
      damage,
      targetHp: 10,
      weaponRange: 5,
    },
  };
}

/** A blast from the squad that caught `targetId` for `damage`. */
function blast(targetId = "quarry", damage = 3): TacticalEvent {
  return {
    type: BLAST_RESOLVED,
    payload: {
      attackerId: "squad-1",
      impact: { x: 6, y: 0, z: 6 },
      hit: true,
      radius: 1,
      aimedAtTile: true,
      weaponRange: 6,
      victims: [{ targetId, kind: "unit", damage, hp: 5 }],
    },
  };
}

/** A fire (or another effect) that burned `targetId` for `damage`. */
function burn(
  kind: "fire" | "smoke" = "fire",
  targetId = "quarry",
  damage = 2,
): TacticalEvent {
  return {
    type: EFFECT_DAMAGED,
    payload: {
      effectId: "effect-1",
      kind,
      targetId,
      targetKind: "unit",
      damage,
      hp: 5,
    },
  };
}

/** The last wound of the quarry on a mission with `log`. */
function woundAfter(...log: TacticalEvent[]): string | undefined {
  return lastWoundOf(
    missionWith(openField().build(), cast(), { log }),
    "quarry",
  );
}

// ===========================================
// Tests
// ===========================================

describe("lastWoundOf", () => {
  it("names a direct hit by what fired it", () => {
    expect(woundAfter(shot("mech-1"))).toBe("mech");
    expect(woundAfter(shot("turret-1"))).toBe("turret");
    expect(woundAfter(shot("squad-1"))).toBe("gunfire");
  });

  it("names a blast and a fire", () => {
    expect(woundAfter(blast())).toBe("blast");
    expect(woundAfter(burn())).toBe("fire");
  });

  it("reads the last hit that drew blood, not the first", () => {
    expect(woundAfter(shot("mech-1"), blast(), shot("turret-1"))).toBe(
      "turret",
    );
    expect(woundAfter(shot("turret-1"), shot("mech-1"))).toBe("mech");
  });

  it("skips misses, scratches, other targets and other effects", () => {
    expect(
      woundAfter(
        shot("mech-1"),
        shot("turret-1", "quarry", false),
        shot("turret-1", "quarry", true, 0),
        shot("turret-1", "squad-1"),
        blast("squad-1"),
        blast("quarry", 0),
        burn("smoke"),
        burn("fire", "quarry", 0),
      ),
    ).toBe("mech");
  });

  it("is undefined when nothing drew blood", () => {
    expect(woundAfter()).toBeUndefined();
    expect(woundAfter(shot("mech-1", "quarry", false))).toBeUndefined();
  });

  it("still knows a mech that has since boarded the drop ship", () => {
    const [quarry, mech] = cast();
    const mission = missionWith(openField().build(), [quarry!], {
      log: [shot("mech-1")],
      extracted: [mech!],
    });
    expect(lastWoundOf(mission, "quarry")).toBe("mech");
  });
});
