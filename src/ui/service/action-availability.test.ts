import { describe, expect, it } from "vitest";

import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { hudMission } from "../view/mission-hud.test-helper";
import {
  actionRefusal,
  canExtract,
  interactTarget,
  isDropshipTile,
} from "./action-availability";

const deps = { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING };

describe("actionRefusal", () => {
  it("opens every action to a fresh unit except the ones with nothing to act on", () => {
    const mission = hudMission();
    // s1 stands at (1,0,1) with two actions; the spawner is far and the
    // zone is elsewhere, and its magazine has no pool to refill.
    expect(actionRefusal(mission, "s1", "move", deps)).toBeUndefined();
    expect(actionRefusal(mission, "s1", "attack", deps)).toBeUndefined();
    expect(actionRefusal(mission, "s1", "overwatch", deps)).toBeUndefined();
    expect(actionRefusal(mission, "s1", "reload", deps)?.kind).toBe(
      "no-reload",
    );
    expect(actionRefusal(mission, "s1", "interact", deps)?.kind).toBe(
      "no-objective-in-reach",
    );
    expect(actionRefusal(mission, "s1", "extract", deps)?.kind).toBe(
      "not-in-extraction-zone",
    );
  });

  it("refuses a spent unit everything but boarding, which is free", () => {
    const mission = hudMission({ extraction: [{ x: 1, y: 0, z: 3 }] });
    // s2 has no action points and stands on the zone.
    expect(actionRefusal(mission, "s2", "move", deps)?.kind).toBe(
      "no-action-points",
    );
    expect(actionRefusal(mission, "s2", "attack", deps)?.kind).toBe(
      "no-action-points",
    );
    expect(actionRefusal(mission, "s2", "extract", deps)).toBeUndefined();
  });

  it("refuses the other side's unit on the player's turn", () => {
    const mission = hudMission();
    expect(actionRefusal(mission, "b1", "move", deps)?.kind).toBe(
      "wrong-phase",
    );
  });

  it("refuses Attack only when no weapon can fire", () => {
    const base = hudMission();
    const s1 = base.units.find((u) => u.id === "s1");
    const template = s1 && base.templates[s1.templateId];
    if (!s1 || !template) throw new Error("fixture needs s1");
    const dry = {
      ...template.weapons[0],
      id: "dry",
      charges: 3,
    } as (typeof template.weapons)[number];
    const loaded = {
      ...template.weapons[0],
      id: "loaded",
      charges: 3,
    } as (typeof template.weapons)[number];
    const withCharges = (charges: Record<string, number>) => ({
      ...base,
      templates: {
        ...base.templates,
        [s1.templateId]: { ...template, weapons: [dry, loaded] },
      },
      units: base.units.map((u) => (u.id === "s1" ? { ...u, charges } : u)),
    });
    expect(
      actionRefusal(withCharges({ dry: 0, loaded: 2 }), "s1", "attack", deps),
    ).toBeUndefined();
    expect(
      actionRefusal(withCharges({ dry: 0, loaded: 0 }), "s1", "attack", deps)
        ?.kind,
    ).toBe("no-charges");
  });
});

describe("canExtract and interactTarget", () => {
  it("boards only from the zone, and works only the nearest objective in reach", () => {
    const mission = hudMission({
      spawners: [
        {
          id: "spawner-far",
          pos: { x: 2, y: 0, z: 2 },
          hatchRadius: 3,
          timer: 3,
          hp: 20,
          destroyed: false,
        },
        {
          id: "spawner-near",
          pos: { x: 1, y: 0, z: 2 },
          hatchRadius: 3,
          timer: 3,
          hp: 20,
          destroyed: false,
        },
      ],
      objectives: [
        {
          id: "objective-far",
          kind: "destroy-spawner",
          targetId: "spawner-far",
          complete: false,
        },
        {
          id: "objective-near",
          kind: "destroy-spawner",
          targetId: "spawner-near",
          complete: false,
        },
      ],
    });
    const s1 = mission.units.find((u) => u.id === "s1");
    if (!s1) throw new Error("fixture needs s1");
    expect(canExtract(mission, s1)).toBe(false);
    expect(
      canExtract({ ...mission, extraction: [{ x: 1, y: 0, z: 1 }] }, s1),
    ).toBe(true);
    expect(interactTarget(mission, "s1", OBJECTIVE_TUNING)?.objective.id).toBe(
      "objective-near",
    );
  });
});

describe("isDropshipTile", () => {
  it("is the boarding zone and the tiles under the aircraft, nothing else", () => {
    const mission = hudMission({
      map: {
        ...hudMission().map,
        dropships: [
          {
            deployZoneId: "deploy-1",
            footprint: { x: 6, z: 3, w: 3, d: 2 },
            clearance: { x: 5, z: 2, w: 5, d: 4 },
            level: 0,
            facing: "n",
          },
        ],
      },
    });
    // The zone tile.
    expect(isDropshipTile(mission, { x: 0, y: 0, z: 0 })).toBe(true);
    // Inside the footprint, including its far corner, not past it.
    expect(isDropshipTile(mission, { x: 6, y: 0, z: 3 })).toBe(true);
    expect(isDropshipTile(mission, { x: 8, y: 0, z: 4 })).toBe(true);
    expect(isDropshipTile(mission, { x: 9, y: 0, z: 4 })).toBe(false);
    expect(isDropshipTile(mission, { x: 5, y: 0, z: 3 })).toBe(false);
    // Clearance is not the ship.
    expect(isDropshipTile(mission, { x: 5, y: 0, z: 2 })).toBe(false);
    expect(isDropshipTile(mission, { x: 3, y: 0, z: 3 })).toBe(false);
  });
});
