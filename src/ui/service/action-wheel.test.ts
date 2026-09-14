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
  it("offers radar only to signals infantry, with the same placement/AP refusals as the command", () => {
    const base = hudMission();
    const mission: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        rifle: {
          ...hudTemplate("rifle", "Radio Squad"),
          equipment: ["radar-dish"],
        },
      },
    };
    const tile = { x: 2, y: 0, z: 1 };
    const entry = (state: TacticalState, target = tile, unitId = "s1") =>
      actionWheel(
        { kind: "tile", tile: target },
        contextFor(state, unitId),
      ).items.find((item) => item.id.startsWith("deploy-radar"));
    expect(entry(base)).toBeUndefined();
    expect(entry(mission)).toMatchObject({
      label: "Deploy radar",
      detail: "1 AP · scan 30",
    });
    expect(entry(mission)?.disabled).not.toBe(true);
    expect(entry(mission, { x: 5, y: 0, z: 1 })).toMatchObject({
      disabled: true,
      detail: "range 2",
    });
    expect(entry(mission, tile, "s2")).toMatchObject({
      disabled: true,
      detail: "no AP",
    });
    expect(parseWheelChoice(entry(mission)!.id)).toEqual({
      action: "deploy-radar",
      tile,
    });
  });
  it("keeps a grenade and a charge off the ring and puts them on the Attack page with their numbers and uses, closed when spent or out of reach (#1132, #1136)", () => {
    const base = hudMission();
    const kitted: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        rifle: {
          ...hudTemplate("rifle", "Rocket Squad"),
          equipment: ["grenade", "breaching-charge"],
        },
      },
    };
    const near = { x: 2, y: 0, z: 1 };
    const ring = actionWheel(
      { kind: "tile", tile: near },
      contextFor(kitted, "s1"),
    );
    // Nothing thrown or placed sits beside Attack any more (#1136): the
    // ring offers Attack, and Attack turns to the page that lists them.
    expect(ids(ring)).toEqual([
      "move:2,0,1",
      "attack-tile:2,0,1",
      "overwatch",
      "reload",
    ]);
    expect(ring.items[1]).toMatchObject({
      label: "Attack",
      detail: "3 options",
    });
    expect(ring.items[1]?.disabled).toBeUndefined();
    const page = weaponWheel(
      { kind: "tile", tile: near },
      contextFor(kitted, "s1"),
    );
    expect(ids(page)).toEqual([
      "attack-tile:2,0,1:primary",
      "equipment:grenade:2,0,1",
      "equipment:breaching-charge:2,0,1",
      "back:ground",
    ]);
    expect(page.hub).toEqual({ value: "Ground", caption: "pick an attack" });
    const grenade = page.items[1];
    const charge = page.items[2];
    expect(grenade).toMatchObject({ label: "Grenade", icon: "attack" });
    expect(grenade?.detail).toMatch(/^\d+% · [\d–]+ dmg .*2\/2$/);
    expect(grenade?.disabled).not.toBe(true);
    expect(charge).toMatchObject({
      label: "Breaching charge",
      icon: "warning",
    });
    expect(charge?.detail).toMatch(/dmg .* in 2 turns · 1\/1$/);
    expect(parseWheelChoice(grenade!.id)).toEqual({
      action: "use-equipment",
      equipmentId: "grenade",
      tile: near,
    });
    // Spent: closed with the reason; out of reach: the rules' reason.
    const spent: TacticalState = {
      ...kitted,
      units: kitted.units.map((u) =>
        u.id === "s1" ? { ...u, equipment: { grenade: 0 } } : u,
      ),
    };
    expect(
      weaponWheel(
        { kind: "tile", tile: near },
        contextFor(spent, "s1"),
      ).items.find((item) => item.id === "equipment:grenade:2,0,1"),
    ).toMatchObject({ disabled: true, detail: "none left" });
    const far = { x: 7, y: 0, z: 1 };
    expect(
      weaponWheel(
        { kind: "tile", tile: far },
        contextFor(kitted, "s1"),
      ).items.find((item) => item.id === "equipment:breaching-charge:7,0,1"),
    ).toMatchObject({ disabled: true, detail: "out of range" });
    // A squad with no kit gets no such entries on either page.
    expect(
      actionWheel(
        { kind: "tile", tile: near },
        contextFor(base, "s1"),
      ).items.some((item) => item.id.startsWith("equipment:")),
    ).toBe(false);
    expect(
      weaponWheel(
        { kind: "tile", tile: near },
        contextFor(base, "s1"),
      ).items.some((item) => item.id.startsWith("equipment:")),
    ).toBe(false);
  });

  it("puts a medkit on the ring as Heal with what it gives and to how many, never under Attack, closed with nobody to heal (#1138)", () => {
    const base = hudMission();
    // s1 is the medic, at full health; s2 two tiles south is at 12 of 20.
    const medics: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        rifle: {
          ...hudTemplate("rifle", "Medic Squad"),
          equipment: ["grenade", "medkit"],
        },
      },
    };
    const hurtTile = { x: 1, y: 0, z: 3 };
    const ring = actionWheel(
      { kind: "tile", tile: hurtTile },
      contextFor(medics, "s1"),
    );
    expect(ids(ring)).toEqual([
      "move:1,0,3",
      "attack-tile:1,0,3",
      "equipment:medkit:1,0,3",
      "overwatch",
      "reload",
    ]);
    const heal = ring.items[2];
    expect(heal).toMatchObject({
      label: "Heal",
      icon: "hp",
      detail: "+10 hp · 1 ally · 4/4",
    });
    expect(heal?.disabled).not.toBe(true);
    expect(parseWheelChoice(heal!.id)).toEqual({
      action: "use-equipment",
      equipmentId: "medkit",
      tile: hurtTile,
    });
    // Attack counts the rifle and the grenade only; the page lists no kit.
    expect(ring.items[1]?.detail).toBe("2 options");
    expect(
      ids(
        weaponWheel({ kind: "tile", tile: hurtTile }, contextFor(medics, "s1")),
      ),
    ).toEqual([
      "attack-tile:1,0,3:primary",
      "equipment:grenade:1,0,3",
      "back:ground",
    ]);
    // A tile in reach with only the whole medic near it: closed, with the reason.
    const empty = actionWheel(
      { kind: "tile", tile: { x: 3, y: 0, z: 0 } },
      contextFor(medics, "s1"),
    ).items.find((item) => item.id === "equipment:medkit:3,0,0");
    expect(empty).toMatchObject({ disabled: true, detail: "nobody to heal" });
    expect(empty?.reason).toBe("Medic Squad has nobody to heal there");
    // A repair kit reads Repair and says what is missing in its own words.
    const engineers: TacticalState = {
      ...medics,
      templates: {
        ...medics.templates,
        rifle: {
          ...hudTemplate("rifle", "Engineer Squad"),
          equipment: ["repair-kit"],
        },
      },
    };
    const repair = actionWheel(
      { kind: "tile", tile: hurtTile },
      contextFor(engineers, "s1"),
    ).items.find((item) => item.id === "equipment:repair-kit:1,0,3");
    expect(repair).toMatchObject({
      label: "Repair",
      icon: "hp",
      disabled: true,
      detail: "nothing to repair",
    });
  });

  it("keeps the radar dish on the ring while the grenade goes under Attack (#1136)", () => {
    const base = hudMission();
    const radio: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        rifle: {
          ...hudTemplate("rifle", "Radio Squad"),
          equipment: ["grenade", "radar-dish"],
        },
      },
    };
    const tile = { x: 2, y: 0, z: 1 };
    const ring = actionWheel({ kind: "tile", tile }, contextFor(radio, "s1"));
    // The dish is a scan, not an attack: it stays where it was.
    expect(ids(ring)).toEqual([
      "move:2,0,1",
      "attack-tile:2,0,1",
      "deploy-radar:2,0,1",
      "overwatch",
      "reload",
    ]);
    expect(ring.items[1]).toMatchObject({ detail: "2 options" });
    const page = weaponWheel({ kind: "tile", tile }, contextFor(radio, "s1"));
    expect(ids(page)).toEqual([
      "attack-tile:2,0,1:primary",
      "equipment:grenade:2,0,1",
      "back:ground",
    ]);
  });

  it("offers Move with the path length, then the unit's own actions", () => {
    const mission = hudMission();
    const page = actionWheel(
      { kind: "tile", tile: { x: 3, y: 0, z: 1 } },
      contextFor(mission, "s1"),
    );
    // Attack at the ground is on every tile's ring since #1121, closed
    // for a rifle with the reason, as an empty gun is.
    expect(ids(page)).toEqual([
      "move:3,0,1",
      "attack-tile:3,0,1",
      "overwatch",
      "reload",
    ]);
    expect(page.items[0]).toMatchObject({
      label: "Move",
      detail: "2 tiles",
      primary: true,
    });
    // Reload is closed with the rules' reason, not hidden.
    expect(page.items[3]).toMatchObject({
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
    expect(ids(own)).toEqual(["attack-tile:1,0,1", "overwatch", "reload"]);
  });

  it("offers Board on the drop ship's tiles, open only from the zone", () => {
    const mission = hudMission();
    const beside = actionWheel(
      { kind: "tile", tile: { x: 0, y: 0, z: 0 } },
      contextFor(mission, "s1"),
    );
    expect(ids(beside)).toEqual([
      "move:0,0,0",
      "attack-tile:0,0,0",
      "extract",
      "overwatch",
      "reload",
    ]);
    expect(beside.items[2]).toMatchObject({
      label: "Board",
      disabled: true,
      detail: "not on the ramp",
    });
    const standing = actionWheel(
      { kind: "tile", tile: { x: 0, y: 0, z: 0 } },
      contextFor({ ...mission, extraction: [{ x: 1, y: 0, z: 1 }] }, "s1"),
    );
    // The zone moved, so (0,0,0) is plain ground now.
    expect(ids(standing)).toEqual([
      "move:0,0,0",
      "attack-tile:0,0,0",
      "overwatch",
      "reload",
    ]);
    const onZone = actionWheel(
      { kind: "tile", tile: { x: 1, y: 0, z: 1 } },
      contextFor({ ...mission, extraction: [{ x: 1, y: 0, z: 1 }] }, "s1"),
    );
    expect(onZone.items[1]).toMatchObject({
      id: "extract",
      label: "Board",
      detail: "drop ship",
    });
    expect(onZone.items[1]?.disabled).toBeUndefined();
  });
});

describe("actionWheel on a tile with a weapon that marks the ground (#1121)", () => {
  /** `s1` with a rocket: blast 1, force 2. */
  function rocketMission(): TacticalState {
    const base = hudMission();
    const rocket = {
      ...hudTemplate("rocket", "Rocket Squad", 10),
      weapons: [
        {
          id: "primary",
          name: "Attack",
          profile: {
            range: 8,
            accuracy: 65,
            damage: 10,
            armorPen: 2,
            aoe: { radius: 1, falloff: 0.5 },
            demoForce: 2,
          },
        },
      ],
    };
    return withVision({
      state: {
        ...base,
        units: base.units.map((u) =>
          u.id === "s1" ? { ...u, templateId: "rocket" } : u,
        ),
        templates: { ...base.templates, rocket },
      },
      events: [],
    }).state;
  }

  /** `m1` with an autocannon that marks nothing and a pod that bursts. */
  function blastMechMission(): TacticalState {
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
          profile: {
            range: 12,
            accuracy: 55,
            damage: 22,
            armorPen: 1,
            aoe: { radius: 1, falloff: 0.5 },
          },
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

  it("offers Attack at the tile as the shot itself for one weapon, with the numbers and the allies in the blast", () => {
    const mission = rocketMission();
    // (2,0,3) is beside `s2` at (1,3): the blast reaches an ally.
    const page = actionWheel(
      { kind: "tile", tile: { x: 2, y: 0, z: 3 } },
      contextFor(mission, "s1"),
    );
    expect(ids(page)).toEqual([
      "move:2,0,3",
      "attack-tile:2,0,3",
      "overwatch",
      "reload",
    ]);
    const fire = page.items[1];
    expect(fire).toMatchObject({ label: "Attack", icon: "attack" });
    expect(fire?.disabled).toBeUndefined();
    expect(fire?.detail).toMatch(/^\d+% · \d+–\d+ dmg · 1 ally$/);
  });

  it("closes Attack at the ground for a rifle with the reason, and out of range with the rules' reason", () => {
    const plain = actionWheel(
      { kind: "tile", tile: { x: 3, y: 0, z: 1 } },
      contextFor(hudMission(), "s1"),
    );
    expect(ids(plain)).toEqual([
      "move:3,0,1",
      "attack-tile:3,0,1",
      "overwatch",
      "reload",
    ]);
    expect(plain.items[1]).toMatchObject({
      disabled: true,
      detail: "not at the ground",
      reason: "Rifle Squad has no weapon that can be fired at the ground",
    });
    const far = actionWheel(
      { kind: "tile", tile: { x: 9, y: 0, z: 5 } },
      contextFor(rocketMission(), "s1"),
    );
    expect(far.items[1]).toMatchObject({
      id: "attack-tile:9,0,5",
      disabled: true,
      detail: "out of range",
    });
  });

  it("with several weapons Attack turns the page, and the tile's weapon page reads like the enemy's", () => {
    const mission = blastMechMission();
    const tile = { x: 3, y: 0, z: 1 };
    const page = actionWheel({ kind: "tile", tile }, contextFor(mission, "m1"));
    expect(page.items[1]).toMatchObject({
      id: "attack-tile:3,0,1",
      label: "Attack",
      detail: "2 options",
    });
    const weapons = weaponWheel(
      { kind: "tile", tile },
      contextFor(mission, "m1"),
    );
    expect(ids(weapons)).toEqual([
      "attack-tile:3,0,1:arm-weapon",
      "attack-tile:3,0,1:back-weapon",
      "back:ground",
    ]);
    // The gun that marks nothing is on the ring, closed, with why.
    expect(weapons.items[0]).toMatchObject({
      label: "Autocannon",
      disabled: true,
      detail: "not at the ground",
    });
    expect(weapons.items[1]).toMatchObject({
      label: "Missile Pod",
      primary: true,
    });
    expect(weapons.items[1]?.detail).toMatch(/^\d+% · \d+–\d+ dmg$/);
    expect(weapons.hub).toEqual({ value: "Ground", caption: "pick an attack" });
  });

  it("a rocket squad's charge is off the ring and on the Attack page after the weapon, before Back (#1136)", () => {
    const base = rocketMission();
    const mission: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        rocket: { ...base.templates.rocket!, equipment: ["breaching-charge"] },
      },
    };
    // (2,0,1) is a step from `s1` at (1,1): inside the charge's reach.
    const tile = { x: 2, y: 0, z: 1 };
    const ring = actionWheel({ kind: "tile", tile }, contextFor(mission, "s1"));
    expect(ids(ring)).toEqual([
      "move:2,0,1",
      "attack-tile:2,0,1",
      "overwatch",
      "reload",
    ]);
    // One weapon and one charge: no longer the shot itself, but the
    // page, counted honestly.
    expect(ring.items[1]).toMatchObject({
      label: "Attack",
      icon: "attack",
      detail: "2 options",
    });
    expect(ring.items[1]?.disabled).toBeUndefined();
    const page = weaponWheel({ kind: "tile", tile }, contextFor(mission, "s1"));
    expect(ids(page)).toEqual([
      "attack-tile:2,0,1:primary",
      "equipment:breaching-charge:2,0,1",
      "back:ground",
    ]);
    expect(page.items[0]).toMatchObject({ label: "Attack", primary: true });
    expect(page.items[0]?.detail).toMatch(/^\d+% · \d+–\d+ dmg/);
    expect(page.items[1]).toMatchObject({
      label: "Breaching charge",
      icon: "warning",
    });
    expect(page.items[1]?.detail).toMatch(/dmg .* in 2 turns · 1\/1$/);
    expect(page.items[1]?.primary).toBeUndefined();
  });

  it("a rifle squad with a grenade gets Attack as an opener, and the page shows the rifle closed and the grenade open (#1136)", () => {
    const base = hudMission();
    const mission: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        rifle: {
          ...hudTemplate("rifle", "Rifle Squad"),
          equipment: ["grenade"],
        },
      },
    };
    const tile = { x: 3, y: 0, z: 1 };
    const ring = actionWheel({ kind: "tile", tile }, contextFor(mission, "s1"));
    // Without the grenade this entry is closed with "not at the ground"
    // (the test above); with it there is something to throw.
    expect(ring.items[1]).toMatchObject({
      id: "attack-tile:3,0,1",
      label: "Attack",
      detail: "2 options",
    });
    expect(ring.items[1]?.disabled).toBeUndefined();
    const page = weaponWheel({ kind: "tile", tile }, contextFor(mission, "s1"));
    expect(ids(page)).toEqual([
      "attack-tile:3,0,1:primary",
      "equipment:grenade:3,0,1",
      "back:ground",
    ]);
    expect(page.items[0]).toMatchObject({
      disabled: true,
      detail: "not at the ground",
    });
    expect(page.items[1]).toMatchObject({ label: "Grenade", icon: "attack" });
    expect(page.items[1]?.disabled).toBeUndefined();
  });

  it("a dry rifle does not close Attack while there is a grenade to throw; with no kit it does (#1136)", () => {
    const base = hudMission();
    const rifle = hudTemplate("rifle", "Rifle Squad");
    const dry = (equipment: readonly string[]): TacticalState => ({
      ...base,
      templates: {
        ...base.templates,
        rifle: {
          ...rifle,
          weapons: rifle.weapons.map((w) => ({ ...w, charges: 4 })),
          equipment,
        },
      },
      units: base.units.map((u) =>
        u.id === "s1" ? { ...u, charges: { primary: 0 } } : u,
      ),
    });
    const tile = { x: 3, y: 0, z: 1 };
    const kitted = actionWheel(
      { kind: "tile", tile },
      contextFor(dry(["grenade"]), "s1"),
    );
    expect(kitted.items[1]).toMatchObject({
      id: "attack-tile:3,0,1",
      detail: "2 options",
    });
    expect(kitted.items[1]?.disabled).toBeUndefined();
    const page = weaponWheel(
      { kind: "tile", tile },
      contextFor(dry(["grenade"]), "s1"),
    );
    expect(page.items[0]).toMatchObject({ disabled: true, detail: "empty" });
    expect(page.items[1]?.disabled).toBeUndefined();
    const bare = actionWheel({ kind: "tile", tile }, contextFor(dry([]), "s1"));
    expect(bare.items[1]).toMatchObject({
      id: "attack-tile:3,0,1",
      disabled: true,
      detail: "empty",
    });
    // Spent action points close it whatever is carried: the unit cannot
    // act, and a grenade costs an action too.
    const winded = actionWheel(
      { kind: "tile", tile },
      contextFor(dry(["grenade"]), "s2"),
    );
    expect(winded.items[1]).toMatchObject({ disabled: true, detail: "no AP" });
  });

  it("parses the tile entries back into the shots they stand for", () => {
    expect(parseWheelChoice("attack-tile:2,0,3")).toEqual({
      action: "attack-tile",
      tile: { x: 2, y: 0, z: 3 },
      weaponId: undefined,
    });
    expect(parseWheelChoice("attack-tile:2,0,3:primary")).toEqual({
      action: "attack-tile",
      tile: { x: 2, y: 0, z: 3 },
      weaponId: "primary",
    });
    expect(parseWheelChoice("attack-tile:x,0,3:primary")).toBeUndefined();
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
      detail: "2 options",
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
    const page = weaponWheel(
      { kind: "unit", unitId: "b2" },
      contextFor(mission, "m1"),
    );
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

describe("actionWheel with a turret (#1138)", () => {
  /** The rifle template re-kitted as an engineer's: a grenade and the turret. */
  function engineered(): TacticalState {
    const base = hudMission();
    return {
      ...base,
      templates: {
        ...base.templates,
        rifle: {
          ...hudTemplate("rifle", "Engineer Squad"),
          equipment: ["grenade", "turret"],
        },
      },
    };
  }

  it("offers Deploy turret on the ring beside Move, closed out of reach, and keeps it off the Attack page", () => {
    const mission = engineered();
    const tile = { x: 2, y: 0, z: 1 };
    const page = actionWheel({ kind: "tile", tile }, contextFor(mission, "s1"));
    const entry = page.items.find((item) => item.id === "deploy-turret:2,0,1");
    expect(entry).toMatchObject({
      label: "Deploy turret",
      icon: "overwatch",
      detail: "1 AP · 2 shots · 3 turns · 2/2",
    });
    expect(entry?.disabled).not.toBe(true);
    expect(parseWheelChoice(entry!.id)).toEqual({
      action: "deploy-turret",
      tile,
    });
    // The rifle and the grenade are the two ways to hit the ground; the
    // turret is not one of them, so Attack counts two, not three.
    expect(
      page.items.find((item) => item.id === "attack-tile:2,0,1"),
    ).toMatchObject({ detail: "2 options" });
    const far = actionWheel(
      { kind: "tile", tile: { x: 5, y: 0, z: 1 } },
      contextFor(mission, "s1"),
    ).items.find((item) => item.id.startsWith("deploy-turret"));
    expect(far).toMatchObject({ disabled: true, detail: "range 2" });
    const spent = actionWheel(
      { kind: "tile", tile },
      contextFor(mission, "s2"),
    ).items.find((item) => item.id.startsWith("deploy-turret"));
    expect(spent).toMatchObject({ disabled: true, detail: "no AP" });
  });

  it("closes every entry for a deployed turret, which takes no orders", () => {
    const base = hudMission();
    const mission: TacticalState = {
      ...base,
      units: [
        ...base.units,
        hudUnit("t1", "tdf", "turret", 2, 3, {
          kind: "turret",
          ap: 0,
          maxAp: 0,
          status: ["overwatch"],
          turnsLeft: 3,
        }),
      ],
      templates: {
        ...base.templates,
        turret: { ...hudTemplate("turret", "Turret"), maxAp: 0, move: 0 },
      },
    };
    const page = actionWheel(
      { kind: "unit", unitId: "t1" },
      contextFor(mission, "t1"),
    );
    expect(
      page.items.map((item) => [item.id, item.disabled, item.detail]),
    ).toEqual([
      ["overwatch", true, "no orders"],
      ["reload", true, "no orders"],
    ]);
  });
});
