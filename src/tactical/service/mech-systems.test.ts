import { describe, expect, it } from "vitest";
import { TileIndex } from "../../mapgen/service/tile-index";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { HAZARD_TUNING } from "../data/hazard-tuning";
import { attack, attackTile } from "../model/attack-command";
import { mechAction } from "../model/mech-action-command";
import { move } from "../model/move-command";
import { reload } from "../model/reload-command";
import type { MechSystems } from "../model/mech-systems";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import type { WeaponProfile } from "../model/weapon-profile";
import {
  createAttackHandler,
  previewAttack,
  previewTileAttack,
  validateTargeting,
} from "./combat-service";
import {
  createMechActionHandler,
  validateMechAction,
} from "./mech-action-service";
import { createMoveHandler } from "./move-handler";
import { movementPathCost, pathTo } from "./movement-service";
import { reloadHandler } from "./reload-handler";
import { burn, createHazardReaction } from "./tile-effect-service";
import { overwatchReaction, refreshSides } from "./turn-service";
import { unitCanSee, withVision } from "./vision-service";
import {
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";

const SYSTEMS: MechSystems = {
  heatCapacity: 20,
  cooling: 4,
  idleHeat: 1,
  movementHeat: 0,
};
const GUN: WeaponProfile = {
  range: 12,
  accuracy: 50,
  damage: 10,
  armorPen: 0,
  heat: 6,
};
const ATTACK = createAttackHandler(COMBAT_TUNING, fixtureAttackDeps());
const SYSTEM = createMechActionHandler();

/** A mech facing a bug on an open field, with configurable fitted capabilities. */
function battle(
  systems: Partial<MechSystems> = {},
  profile: Partial<WeaponProfile> = {},
  unit: Partial<Unit> = {},
): TacticalState {
  const shooter = { ...unitAt("mech", "mech", { x: 1, y: 0, z: 3 }), ...unit };
  const enemy = unitAt(
    "bug",
    "infantry",
    { x: 6, y: 0, z: 3 },
    { team: "bugs", hp: 100 },
  );
  const mission = missionWith(openField().build(), [shooter, enemy]);
  const original = mission.templates[shooter.templateId]!;
  return {
    ...mission,
    templates: {
      ...mission.templates,
      [shooter.templateId]: {
        ...original,
        systems: { ...SYSTEMS, ...systems },
        weapons: [
          { id: "primary", name: "Test gun", profile: { ...GUN, ...profile } },
        ],
      },
    },
  };
}

/** Restores only actions for repeated-shot tests, preserving thermal and limited-use state. */
function ready(mission: TacticalState): TacticalState {
  return {
    ...mission,
    units: mission.units.map((unit) =>
      unit.id === "mech" ? { ...unit, ap: 2 } : unit,
    ),
  };
}

describe("mech thermal systems", () => {
  it("spends shared heat even on a miss and refuses an overheated preview and command", () => {
    const initial = battle({ heatCapacity: 10 });
    const fired = ATTACK(
      initial,
      attack("mech", "bug"),
      ctxWith(riggedRng(false)),
    );
    expect(fired.ok).toBe(true);
    if (!fired.ok) return;
    expect(fired.value.state.units[0]?.heat).toBe(6);
    expect(initial.units[0]?.heat).toBeUndefined();
    const hot = ready(fired.value.state);
    expect(previewAttack(hot, "mech", "bug", COMBAT_TUNING).ok).toBe(false);
    expect(
      ATTACK(hot, attack("mech", "bug"), ctxWith(riggedRng(true))).ok,
    ).toBe(false);
    const vented = reloadHandler(hot, reload("mech"), ctxWith(riggedRng(true)));
    expect(vented.ok).toBe(true);
    if (vented.ok)
      expect(vented.value.state.units[0]).toMatchObject({ heat: 0, ap: 1 });
  });

  it("cools only when the mech's own phase opens, accounting for idle heat", () => {
    const initial = battle({}, {}, { heat: 12, movedThisTurn: true });
    expect(
      refreshSides({ ...initial, phase: "bugs" }, ctxWith(riggedRng(true)))
        .state.units[0]?.heat,
    ).toBe(12);
    expect(
      refreshSides(initial, ctxWith(riggedRng(true))).state.units[0],
    ).toMatchObject({ heat: 9, movedThisTurn: false });
  });

  it("allows exactly two emergency doses without AP and never spends a dose on a cold reactor", () => {
    let state = battle(
      { equipment: ["mech-coolant"], coolantUses: 2 },
      {},
      { heat: 15, ap: 0 },
    );
    for (let dose = 0; dose < 2; dose++) {
      const result = SYSTEM(
        state,
        mechAction({ unitId: "mech", action: "coolant" }),
        ctxWith(riggedRng(true)),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.state.units[0]).toMatchObject({ heat: 0, ap: 0 });
      expect(
        validateMechAction(result.value.state, {
          unitId: "mech",
          action: "coolant",
        }).ok,
      ).toBe(false);
      state = {
        ...result.value.state,
        units: result.value.state.units.map((unit) =>
          unit.id === "mech" ? { ...unit, heat: 15 } : unit,
        ),
      };
    }
    expect(
      validateMechAction(state, { unitId: "mech", action: "coolant" }).ok,
    ).toBe(false);
  });

  it("enforces recovery turns independently of venting", () => {
    const shot = ATTACK(
      battle({}, { cooldown: 1 }),
      attack("mech", "bug"),
      ctxWith(riggedRng(false)),
    );
    if (!shot.ok) throw new Error("expected a legal shot");
    const waiting = { ...ready(shot.value.state), turn: 2 };
    expect(previewAttack(waiting, "mech", "bug", COMBAT_TUNING).ok).toBe(false);
    expect(
      previewAttack({ ...waiting, turn: 3 }, "mech", "bug", COMBAT_TUNING).ok,
    ).toBe(true);
  });
});

describe("mobility and stabilisation", () => {
  it("jumps to a seen outdoor tile, spending heat and AP and releasing the brace", () => {
    const mission = battle(
      { jumpRange: 5, jumpHeight: 2, jumpHeat: 5 },
      {},
      { braced: true },
    );
    const result = SYSTEM(
      mission,
      mechAction({
        unitId: "mech",
        action: "jump",
        tile: { x: 4, y: 0, z: 3 },
      }),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state.units[0]).toMatchObject({
        pos: { x: 4, y: 0, z: 3 },
        heat: 5,
        ap: 1,
        braced: false,
        movedThisTurn: true,
      });
      expect(
        result.value.events.some(
          (event) => event.type === "tactical:unit-moved" && event.payload.jump,
        ),
      ).toBe(true);
    }
  });

  it("rejects occupied, distant, indoor, unseen and thermally impossible landings", () => {
    const mission = battle({ jumpRange: 5, jumpHeight: 2, jumpHeat: 5 });
    for (const tile of [
      { x: 6, y: 0, z: 3 },
      { x: 7, y: 0, z: 3 },
    ])
      expect(
        validateMechAction(mission, { unitId: "mech", action: "jump", tile })
          .ok,
      ).toBe(false);
    const landing = { x: 3, y: 0, z: 3 };
    const indoor = {
      ...mission,
      map: {
        ...mission.map,
        tiles: mission.map.tiles.map((tile) =>
          tile.x === 3 && tile.z === 3
            ? { ...tile, buildingId: "house" }
            : tile,
        ),
      },
    };
    expect(
      validateMechAction(indoor, {
        unitId: "mech",
        action: "jump",
        tile: landing,
      }).ok,
    ).toBe(false);
    expect(
      validateMechAction(
        { ...mission, map: walledField() },
        { unitId: "mech", action: "jump", tile: { x: 5, y: 0, z: 3 } },
      ).ok,
    ).toBe(false);
    expect(
      validateMechAction(
        battle({ jumpRange: 5, jumpHeight: 2, jumpHeat: 5 }, {}, { heat: 19 }),
        { unitId: "mech", action: "jump", tile: landing },
      ).ok,
    ).toBe(false);
  });

  it("uses the same terrain cost for pathfinding and movement billing; all-terrain avoids it", () => {
    const base = battle();
    const rough = {
      ...base,
      map: {
        ...base.map,
        tiles: base.map.tiles.map((tile) => ({ ...tile, mechMoveCost: 2 })),
      },
    };
    const destination = { x: 3, y: 0, z: 3 };
    const path = pathTo(rough, "mech", destination)!;
    expect(movementPathCost(rough, rough.units[0]!, path)).toBe(4);
    const moved = createMoveHandler()(
      rough,
      move("mech", path),
      ctxWith(riggedRng(true)),
    );
    if (!moved.ok) throw new Error("expected move");
    expect(moved.value.state.units[0]?.ap).toBe(0);
    const agile = battle({ allTerrain: true });
    const adapted = { ...agile, map: rough.map };
    const easier = createMoveHandler()(
      adapted,
      move("mech", path),
      ctxWith(riggedRng(true)),
    );
    if (!easier.ok) throw new Error("expected all-terrain move");
    expect(easier.value.state.units[0]?.ap).toBe(1);
  });

  it("prevents movement beyond thermal headroom and releases stationary bonuses on a walk", () => {
    const hot = battle({ movementHeat: 3 }, {}, { heat: 19, braced: true });
    expect(pathTo(hot, "mech", { x: 2, y: 0, z: 3 })).toBeUndefined();
    const initial = battle({ braceAccuracy: 12, stationaryAccuracy: 18 });
    const braced = SYSTEM(
      initial,
      mechAction({ unitId: "mech", action: "brace" }),
      ctxWith(riggedRng(true)),
    );
    if (!braced.ok) throw new Error("expected brace");
    const aim = validateTargeting(
      braced.value.state,
      "mech",
      "bug",
      COMBAT_TUNING,
    );
    if (!aim.ok) throw new Error("expected aim");
    expect(aim.value.weapon.profile.accuracy).toBe(80);
    const moved = createMoveHandler()(
      braced.value.state,
      move("mech", [{ x: 2, y: 0, z: 3 }]),
      ctxWith(riggedRng(true)),
    );
    if (!moved.ok) throw new Error("expected move");
    expect(moved.value.state.units[0]).toMatchObject({
      braced: false,
      movedThisTurn: true,
    });
    const movingAim = validateTargeting(
      moved.value.state,
      "mech",
      "bug",
      COMBAT_TUNING,
    );
    if (movingAim.ok) expect(movingAim.value.weapon.profile.accuracy).toBe(50);
  });
});

describe("specialist weapon targeting", () => {
  it("reacts with a spotted indirect weapon and bills its heat, but holds overheated fire", () => {
    const base = battle(
      {},
      { indirect: true, minRange: 3 },
      { ap: 0, status: ["overwatch"] },
    );
    const spotter = unitAt("spotter", "infantry", { x: 5, y: 0, z: 4 });
    const seen = {
      ...base,
      map: walledField(),
      units: [...base.units, spotter],
    };
    const fired = overwatchReaction(
      seen,
      "bug",
      ctxWith(riggedRng(true)),
      COMBAT_TUNING,
      fixtureAttackDeps(),
    );
    expect(fired.state.units[0]).toMatchObject({ heat: 6, ap: 0 });
    expect(fired.state.units[0]?.status).not.toContain("overwatch");
    const hot = {
      ...seen,
      units: seen.units.map((unit) =>
        unit.id === "mech" ? { ...unit, heat: 19 } : unit,
      ),
    };
    expect(
      overwatchReaction(
        hot,
        "bug",
        ctxWith(riggedRng(true)),
        COMBAT_TUNING,
        fixtureAttackDeps(),
      ).events,
    ).toEqual([]);
    expect(
      overwatchReaction(
        { ...seen, units: base.units },
        "bug",
        ctxWith(riggedRng(true)),
        COMBAT_TUNING,
        fixtureAttackDeps(),
      ).events,
    ).toEqual([]);
  });

  it("requires a live visual spotter for indirect fire; radar alone is insufficient", () => {
    const base = battle(
      {},
      { indirect: true, minRange: 3, aoe: { radius: 1, falloff: 0.5 } },
    );
    const unseen = {
      ...base,
      map: walledField(),
      radars: [
        {
          id: "radar",
          team: "tdf" as const,
          pos: base.units[0]!.pos,
          range: 30,
          turnsLeft: 3,
        },
      ],
    };
    expect(previewAttack(unseen, "mech", "bug", COMBAT_TUNING).ok).toBe(false);
    const spotter = unitAt("spotter", "infantry", { x: 5, y: 0, z: 4 });
    const seen = { ...unseen, units: [...unseen.units, spotter] };
    expect(previewAttack(seen, "mech", "bug", COMBAT_TUNING).ok).toBe(true);
    expect(
      previewTileAttack(seen, "mech", { x: 6, y: 0, z: 3 }, COMBAT_TUNING).ok,
    ).toBe(true);
    expect(
      previewAttack(
        {
          ...seen,
          units: seen.units.map((unit) =>
            unit.id === "spotter" ? { ...unit, hp: 0 } : unit,
          ),
        },
        "mech",
        "bug",
        COMBAT_TUNING,
      ).ok,
    ).toBe(false);
  });

  it("enforces minimum range and a siege weapon's brace requirement", () => {
    expect(
      previewAttack(battle({}, { minRange: 6 }), "mech", "bug", COMBAT_TUNING)
        .ok,
    ).toBe(false);
    const initial = battle({}, { requiresBrace: true });
    expect(previewAttack(initial, "mech", "bug", COMBAT_TUNING).ok).toBe(false);
    const braced = SYSTEM(
      initial,
      mechAction({ unitId: "mech", action: "brace" }),
      ctxWith(riggedRng(true)),
    );
    if (!braced.ok) throw new Error("expected brace");
    expect(
      previewAttack(braced.value.state, "mech", "bug", COMBAT_TUNING).ok,
    ).toBe(true);
  });

  it("designation helps allied guided fire for one turn and cannot mark through a wall", () => {
    const initial = battle(
      { equipment: ["mech-designator"], designationAccuracy: 20 },
      { guided: true },
    );
    expect(
      validateMechAction(
        { ...initial, map: walledField() },
        { unitId: "mech", action: "designate", targetId: "bug" },
      ).ok,
    ).toBe(false);
    const marked = SYSTEM(
      initial,
      mechAction({ unitId: "mech", action: "designate", targetId: "bug" }),
      ctxWith(riggedRng(true)),
    );
    if (!marked.ok) throw new Error("expected designation");
    const aim = validateTargeting(
      marked.value.state,
      "mech",
      "bug",
      COMBAT_TUNING,
    );
    if (!aim.ok) throw new Error("expected aim");
    expect(aim.value.weapon.profile.accuracy).toBe(70);
    const later = validateTargeting(
      { ...marked.value.state, turn: 2 },
      "mech",
      "bug",
      COMBAT_TUNING,
    );
    if (later.ok) expect(later.value.weapon.profile.accuracy).toBe(50);
  });

  it("beam preview and resolution include friendly units on the segment exactly once", () => {
    const base = battle({}, { beam: true, damage: 4 });
    const ally = unitAt("ally", "infantry", { x: 3, y: 0, z: 3 });
    const safe = unitAt("safe", "infantry", { x: 3, y: 0, z: 4 });
    const initial = { ...base, units: [...base.units, ally, safe] };
    const preview = previewAttack(initial, "mech", "bug", COMBAT_TUNING);
    if (!preview.ok) throw new Error("expected beam preview");
    expect(preview.value.blast?.victims.map((victim) => victim.id)).toEqual([
      "ally",
    ]);
    const result = ATTACK(
      initial,
      attack("mech", "bug"),
      ctxWith(riggedRng(true)),
    );
    if (!result.ok) throw new Error("expected beam");
    expect(
      result.value.state.units.find((unit) => unit.id === "ally")?.hp,
    ).toBe(7);
    expect(
      result.value.state.units.find((unit) => unit.id === "safe")?.hp,
    ).toBe(10);
    expect(result.value.state.units.find((unit) => unit.id === "bug")?.hp).toBe(
      97,
    );
  });

  it("smoke deals zero damage, blocks both sides' sight, and expires without burning units", () => {
    const initial = battle(
      {},
      {
        damage: 0,
        aoe: { radius: 1, falloff: 0 },
        aoeEffect: { kind: "smoke", chance: 1, falloff: 0 },
      },
    );
    const shot = ATTACK(
      initial,
      attackTile("mech", { x: 3, y: 0, z: 3 }),
      ctxWith(riggedRng(true)),
    );
    if (!shot.ok) throw new Error("expected smoke");
    let state = withVision(shot.value, initial).state;
    expect(state.effects.every((effect) => effect.kind === "smoke")).toBe(true);
    expect(state.vision.tdf.spotted).not.toContain("bug");
    expect(
      unitCanSee(
        state,
        state.units[1]!,
        state.units[0]!.pos,
        new TileIndex(state.map),
      ),
    ).toBe(false);
    for (let phase = 0; phase < 4; phase++) {
      const tick = burn(
        { ...state, phase: phase % 2 ? "player" : "bugs" },
        ctxWith(riggedRng(true)),
        HAZARD_TUNING,
        COMBAT_TUNING,
      );
      expect(
        tick.events.some((event) => event.type === "tactical:effect-damaged"),
      ).toBe(false);
      state = tick.state;
    }
    expect(state.effects).toEqual([]);
    expect(state.units.map((unit) => unit.hp)).toEqual(
      initial.units.map((unit) => unit.hp),
    );
  });

  it("ablative armour's preview, reported damage and consumed protection agree even on a fully absorbed hit", () => {
    const base = battle({}, { damage: 4 });
    const target = base.units[1]!;
    const initial = {
      ...base,
      templates: {
        ...base.templates,
        [target.templateId]: {
          ...base.templates[target.templateId]!,
          systems: { ...SYSTEMS, ablativeHits: 3, ablativeAbsorption: 8 },
        },
      },
    };
    const preview = previewAttack(initial, "mech", "bug", COMBAT_TUNING);
    if (!preview.ok) throw new Error("expected preview");
    expect(preview.value.damage).toEqual([0, 0]);
    const result = ATTACK(
      initial,
      attack("mech", "bug"),
      ctxWith(riggedRng(true)),
    );
    if (!result.ok) throw new Error("expected hit");
    expect(result.value.state.units[1]).toMatchObject({
      hp: 100,
      ablativeSpent: 1,
    });
    expect(
      result.value.events.find(
        (event) => event.type === "tactical:attack-resolved",
      )?.payload,
    ).toMatchObject({ damage: 0, targetHp: 100 });
  });

  it("round-trips systems and their transient state through JSON without changing a preview", () => {
    const initial = battle(
      { stationaryAccuracy: 8 },
      { guided: true },
      { heat: 4, braced: true, ablativeSpent: 1 },
    );
    const restored = JSON.parse(JSON.stringify(initial)) as TacticalState;
    expect(previewAttack(restored, "mech", "bug", COMBAT_TUNING)).toEqual(
      previewAttack(initial, "mech", "bug", COMBAT_TUNING),
    );
  });
});

it("jumping clears crossed flames but burns immediately on a burning landing", () => {
  const base = battle(
    { jumpRange: 5, jumpHeight: 2, jumpHeat: 5 },
    {},
    { hp: 100 },
  );
  const handler = createMechActionHandler(
    createHazardReaction(HAZARD_TUNING, COMBAT_TUNING),
  );
  const crossed = {
    id: "crossed",
    kind: "fire" as const,
    tile: { x: 2, y: 0, z: 3 },
    phasesLeft: 4,
  };
  const landed = { ...crossed, id: "landed", tile: { x: 4, y: 0, z: 3 } };
  for (const effects of [[crossed], [crossed, landed]]) {
    const result = handler(
      { ...base, effects },
      mechAction({ unitId: "mech", action: "jump", tile: landed.tile }),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) continue;
    const burns = result.value.events.filter(
      (event) => event.type === "tactical:effect-damaged",
    );
    expect(burns).toHaveLength(effects.length - 1);
    if (effects.length === 2)
      expect(burns[0]).toMatchObject({ payload: { effectId: "landed" } });
  }
});
