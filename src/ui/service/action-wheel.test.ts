import { describe, expect, it } from "vitest";

import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { previewAttack } from "../../tactical/service/combat-service";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import { withVision } from "../../tactical/service/vision-service";
import {
  hudMission,
  hudTemplate,
  hudUnit,
} from "../view/mission-hud.test-helper";
import type { WheelContext } from "./action-wheel";
import { actionWheel, parseWheelChoice, weaponWheel } from "./action-wheel";
import { namesFor } from "./tactical-error-text";

/** A wheel context for `unitId` in `mission`. */
function contextFor(mission: TacticalState, unitId: string): WheelContext {
  return {
    mission,
    unitId,
    graph: buildMoveGraph(mission.map),
    names: namesFor(mission, undefined),
    deps: { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
  };
}

/** A mission whose `m1` carries two weapons of different reach. */
function twoWeaponMission(): TacticalState {
  const base = hudMission();
  const template = {
    ...hudTemplate("mech", "Hammerhead"),
    weapons: [
      {
        id: "arm-weapon",
        name: "Autocannon",
        profile: { range: 8, accuracy: 65, damage: 10, armorPen: 0 },
      },
      {
        id: "back-weapon",
        name: "Missile Pod",
        profile: { range: 12, accuracy: 55, damage: 22, armorPen: 1 },
      },
    ],
  };
  return withVision({
    state: {
      ...base,
      units: [...base.units, hudUnit("m1", "tdf", "mech", 1, 1)],
      templates: { ...base.templates, mech: template },
    },
    events: [],
  }).state;
}

const ids = (page: { items: readonly { id: string }[] }): string[] =>
  page.items.map((item) => item.id);

describe("actionWheel on a tile", () => {
  it("offers Move with the path length, then the unit's own actions", () => {
    const mission = hudMission();
    const page = actionWheel(
      { kind: "tile", tile: { x: 3, y: 0, z: 1 } },
      contextFor(mission, "s1"),
    );
    expect(ids(page)).toEqual(["move:3,0,1", "overwatch", "reload"]);
    expect(page.items[0]).toMatchObject({
      label: "Move",
      detail: "2 tiles",
      primary: true,
    });
    // Reload is closed with the rules' reason, not hidden.
    expect(page.items[2]).toMatchObject({
      disabled: true,
      detail: "nothing to reload",
    });
    expect(page.hub).toBeUndefined();
  });

  it("closes Move out of reach and on a spent unit, and omits it on the unit's own tile", () => {
    const mission = hudMission();
    const far = actionWheel(
      { kind: "tile", tile: { x: 9, y: 0, z: 5 } },
      contextFor(
        {
          ...mission,
          units: mission.units.map((u) =>
            u.id === "s1" ? { ...u, ap: 1 } : u,
          ),
        },
        "s1",
      ),
    );
    expect(far.items[0]).toMatchObject({
      id: "move:9,0,5",
      disabled: true,
      detail: "out of reach",
    });
    const spent = actionWheel(
      { kind: "tile", tile: { x: 2, y: 0, z: 3 } },
      contextFor(mission, "s2"),
    );
    expect(spent.items[0]).toMatchObject({
      id: "move:2,0,3",
      disabled: true,
      detail: "no AP",
    });
    expect(spent.items[0]?.reason).toContain("no action points");
    const own = actionWheel(
      { kind: "tile", tile: { x: 1, y: 0, z: 1 } },
      contextFor(mission, "s1"),
    );
    expect(ids(own)).toEqual(["overwatch", "reload"]);
  });

  it("offers Board on the drop ship's tiles, open only from the zone", () => {
    const mission = hudMission();
    const beside = actionWheel(
      { kind: "tile", tile: { x: 0, y: 0, z: 0 } },
      contextFor(mission, "s1"),
    );
    expect(ids(beside)).toEqual([
      "move:0,0,0",
      "extract",
      "overwatch",
      "reload",
    ]);
    expect(beside.items[1]).toMatchObject({
      label: "Board",
      disabled: true,
      detail: "not on the ramp",
    });
    const standing = actionWheel(
      { kind: "tile", tile: { x: 0, y: 0, z: 0 } },
      contextFor({ ...mission, extraction: [{ x: 1, y: 0, z: 1 }] }, "s1"),
    );
    // The zone moved, so (0,0,0) is plain ground now.
    expect(ids(standing)).toEqual(["move:0,0,0", "overwatch", "reload"]);
    const onZone = actionWheel(
      { kind: "tile", tile: { x: 1, y: 0, z: 1 } },
      contextFor({ ...mission, extraction: [{ x: 1, y: 0, z: 1 }] }, "s1"),
    );
    expect(onZone.items[0]).toMatchObject({
      id: "extract",
      label: "Board",
      detail: "drop ship",
    });
    expect(onZone.items[0]?.disabled).toBeUndefined();
  });
});

describe("actionWheel on an enemy", () => {
  it("puts Attack first with the rules' hit chance at the centre, and fires with one weapon", () => {
    const mission = hudMission();
    const page = actionWheel(
      { kind: "unit", unitId: "b1" },
      contextFor(mission, "s1"),
    );
    const expected = previewAttack(mission, "s1", "b1", COMBAT_TUNING);
    if (!expected.ok) throw new Error("fixture shot must be legal");
    expect(ids(page)).toEqual(["attack:b1", "overwatch", "reload"]);
    expect(page.items[0]).toMatchObject({
      label: "Attack",
      primary: true,
      detail: `${String(expected.value.damage[0])}–${String(expected.value.damage[1])} dmg`,
    });
    // A whole percent, printed as it is: the first cut multiplied it by
    // a hundred again and the hub read 3100%.
    expect(expected.value.hitChance).toBeLessThanOrEqual(100);
    expect(page.hub).toEqual({
      value: `${String(expected.value.hitChance)}%`,
      caption: "hit chance",
      tone: expected.value.hitChance >= 50 ? "ok" : "warn",
    });
  });

  it("closes Attack with the preview's reason when the shot is illegal", () => {
    const mission = hudMission();
    // b2 is out of the rifle's reach.
    const page = actionWheel(
      { kind: "unit", unitId: "b2" },
      contextFor(mission, "s1"),
    );
    expect(page.items[0]).toMatchObject({
      id: "attack:b2",
      disabled: true,
      detail: "out of range",
    });
    expect(page.hub).toBeUndefined();
  });

  it("with several weapons, Attack turns the page and the hub shows the best chance", () => {
    const mission = twoWeaponMission();
    const page = actionWheel(
      { kind: "unit", unitId: "b1" },
      contextFor(mission, "m1"),
    );
    expect(page.items[0]).toMatchObject({
      id: "attack:b1",
      detail: "2 weapons",
      primary: true,
    });
    const best = Math.max(
      ...["arm-weapon", "back-weapon"].map((weapon) => {
        const preview = previewAttack(
          mission,
          "m1",
          "b1",
          COMBAT_TUNING,
          weapon,
        );
        return preview.ok ? preview.value.hitChance : 0;
      }),
    );
    expect(page.hub?.value).toBe(`${String(best)}%`);
  });

  it("offers Interact on a spawner only when that spawner's objective is in reach", () => {
    const base = hudMission();
    const mission = {
      ...base,
      spawners: [
        { ...base.spawners[0]!, id: "spawner-far", pos: { x: 2, y: 0, z: 2 } },
        {
          ...base.spawners[0]!,
          id: "spawner-near",
          pos: { x: 1, y: 0, z: 2 },
        },
      ],
      objectives: [
        {
          id: "objective-far",
          kind: "destroy-spawner" as const,
          targetId: "spawner-far",
          complete: false,
        },
        {
          id: "objective-near",
          kind: "destroy-spawner" as const,
          targetId: "spawner-near",
          complete: false,
        },
      ],
    };
    const near = actionWheel(
      { kind: "spawner", spawnerId: "spawner-near" },
      contextFor(mission, "s1"),
    );
    expect(ids(near)).toContain("interact:objective-near");
    const far = actionWheel(
      { kind: "spawner", spawnerId: "spawner-far" },
      contextFor(mission, "s1"),
    );
    expect(ids(far).some((id) => id.startsWith("interact:"))).toBe(false);
  });
});

describe("actionWheel on the unit itself", () => {
  it("offers what it can do where it stands", () => {
    const mission = hudMission({ extraction: [{ x: 1, y: 0, z: 1 }] });
    const page = actionWheel(
      { kind: "unit", unitId: "s1" },
      contextFor(mission, "s1"),
    );
    expect(ids(page)).toEqual(["overwatch", "reload", "extract"]);
  });
});

describe("weaponWheel", () => {
  it("lists one entry per weapon with its own numbers, the first legal one primary, and a way back", () => {
    const mission = twoWeaponMission();
    // b2 is past the autocannon and inside the pod.
    const page = weaponWheel("b2", contextFor(mission, "m1"));
    expect(ids(page)).toEqual([
      "attack:b2:arm-weapon",
      "attack:b2:back-weapon",
      "back:b2",
    ]);
    expect(page.items[0]).toMatchObject({
      label: "Autocannon",
      disabled: true,
      detail: "out of range",
    });
    const pod = previewAttack(
      mission,
      "m1",
      "b2",
      COMBAT_TUNING,
      "back-weapon",
    );
    if (!pod.ok) throw new Error("the pod must reach b2");
    expect(page.items[1]).toMatchObject({
      label: "Missile Pod",
      primary: true,
      detail: `${String(pod.value.hitChance)}% · ${String(pod.value.damage[0])}–${String(pod.value.damage[1])} dmg`,
    });
    expect(page.items[2]).toMatchObject({ label: "Back", icon: "back" });
    expect(page.hub).toEqual({ value: "Swarmer", caption: "pick a weapon" });
  });
});

describe("parseWheelChoice", () => {
  it("reads back every id the wheel builds", () => {
    expect(parseWheelChoice("move:3,0,1")).toEqual({
      action: "move",
      tile: { x: 3, y: 0, z: 1 },
    });
    expect(parseWheelChoice("attack:b1")).toEqual({
      action: "attack",
      targetId: "b1",
      weaponId: undefined,
    });
    expect(parseWheelChoice("attack:spawner-1:back-weapon")).toEqual({
      action: "attack",
      targetId: "spawner-1",
      weaponId: "back-weapon",
    });
    expect(parseWheelChoice("interact:objective-1")).toEqual({
      action: "interact",
      objectiveId: "objective-1",
    });
    expect(parseWheelChoice("back:b1")).toEqual({
      action: "back",
      targetId: "b1",
    });
    expect(parseWheelChoice("overwatch")).toEqual({ action: "overwatch" });
    expect(parseWheelChoice("reload")).toEqual({ action: "reload" });
    expect(parseWheelChoice("extract")).toEqual({ action: "extract" });
  });

  it("refuses what it did not build", () => {
    expect(parseWheelChoice("move:x,y")).toBeUndefined();
    expect(parseWheelChoice("dance")).toBeUndefined();
  });
});
