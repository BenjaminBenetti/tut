import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import { COMBAT_TUNING } from "../data/combat-tuning";
import {
  BREACHING_CHARGE,
  EQUIPMENT,
  GRENADE,
  RADAR_DISH,
} from "../data/equipment";
import { RADAR_TUNING } from "../data/radar-tuning";
import { BLAST_RESOLVED } from "../model/blast-resolved-event";
import { CHARGE_DETONATED } from "../model/charge-detonated-event";
import { CHARGE_PLACED } from "../model/charge-placed-event";
import { endTurn } from "../model/end-turn-command";
import { usesLeftOf } from "../model/equipment";
import { EQUIPMENT_USED } from "../model/equipment-used-event";
import { RADAR_DEPLOYED } from "../model/radar-deployed-event";
import { STRUCTURE_DESTROYED } from "../model/structure-destroyed-event";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_DIED } from "../model/unit-died-event";
import { useEquipment } from "../model/use-equipment-command";
import { createEquipmentCatalogue } from "../repository/equipment-catalogue";
import type { EquipmentDeps } from "./equipment-service";
import {
  carriesEquipment,
  createDetonateStep,
  createUseEquipmentHandler,
  equipmentOf,
  previewEquipmentUse,
  validateEquipmentUse,
} from "./equipment-service";
import {
  ctxWith,
  FIXTURE_TEMPLATES,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";
import { createEndTurnHandler, refreshSides } from "./turn-service";

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });
const SQUAD = at(1, 1);

/** The shipped catalogue and tunings, over the fixture's content. */
const DEPS: EquipmentDeps = {
  catalogue: createEquipmentCatalogue(EQUIPMENT),
  combat: COMBAT_TUNING,
  attack: fixtureAttackDeps(),
  radar: RADAR_TUNING,
};

const handler = createUseEquipmentHandler(DEPS);

/**
 * A squad on the open field carrying every item, and whatever else the
 * caller puts down. The fixture infantry template is given the kit, so
 * every infantry unit in the mission carries it.
 */
function kitted(
  units: readonly Unit[] = [],
  map = openField().build(),
): TacticalState {
  const base = missionWith(map, [unitAt("squad", "infantry", SQUAD), ...units]);
  return {
    ...base,
    templates: {
      ...base.templates,
      [FIXTURE_TEMPLATES.infantry]: {
        ...base.templates[FIXTURE_TEMPLATES.infantry]!,
        equipment: [GRENADE.id, RADAR_DISH.id, BREACHING_CHARGE.id],
      },
    },
  };
}

/** The squad as the mission now has it. */
function squad(mission: TacticalState): Unit {
  return mission.units.find((u) => u.id === "squad")!;
}

describe("equipment carried", () => {
  it("lists what the template gave the unit with full uses until it draws on them", () => {
    const mission = kitted();
    const unit = squad(mission);
    expect(carriesEquipment(mission, unit, GRENADE.id)).toBe(true);
    expect(carriesEquipment(mission, unit, "jetpack")).toBe(false);
    expect(
      equipmentOf(mission.templates[unit.templateId], unit, DEPS.catalogue).map(
        (c) => [c.definition.id, c.usesLeft],
      ),
    ).toEqual([
      [GRENADE.id, 2],
      [RADAR_DISH.id, 3],
      [BREACHING_CHARGE.id, 1],
    ]);
    expect(usesLeftOf({ ...unit, equipment: { grenade: 1 } }, GRENADE)).toBe(1);
    // An id the catalogue does not know is skipped, not a crash.
    expect(
      equipmentOf({ equipment: ["jetpack", GRENADE.id] }, unit, DEPS.catalogue)
        .length,
    ).toBe(1);
  });
});

describe("UseEquipment: radar dish", () => {
  it("places a scanner with a full battery, bills the action and the use, and announces both", () => {
    const before = kitted();
    const tile = at(2, 2);
    const result = handler(
      before,
      useEquipment("squad", RADAR_DISH.id, tile),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.value.state;
    expect(after.radars).toMatchObject([
      { team: "tdf", pos: tile, range: 30, turnsLeft: 3 },
    ]);
    expect(squad(after)).toMatchObject({
      ap: 1,
      equipment: { [RADAR_DISH.id]: 2 },
    });
    expect(result.value.events.map((e) => e.type)).toEqual([
      EQUIPMENT_USED,
      RADAR_DEPLOYED,
    ]);
    expect(result.value.events[0]).toMatchObject({
      payload: {
        unitId: "squad",
        equipmentId: RADAR_DISH.id,
        name: "Radar dish",
        tile,
        usesLeft: 2,
      },
    });
    expect(before.radars).toEqual([]);
    expect(squad(before).ap).toBe(2);
    expect(JSON.parse(JSON.stringify(after))).toEqual(after);
  });

  it("refuses a squad that carries nothing, an unknown item, a spent one, and the usual acting refusals", () => {
    const base = kitted();
    const tile = at(2, 2);
    const cases: [string, TacticalState, string, string][] = [
      [
        "bare template",
        { ...base, templates: {} },
        RADAR_DISH.id,
        "no-equipment",
      ],
      ["unknown item", base, "jetpack", "no-equipment"],
      [
        "spent",
        {
          ...base,
          units: base.units.map((u) => ({
            ...u,
            equipment: { [RADAR_DISH.id]: 0 },
          })),
        },
        RADAR_DISH.id,
        "equipment-spent",
      ],
      [
        "no AP",
        { ...base, units: base.units.map((u) => ({ ...u, ap: 0 })) },
        RADAR_DISH.id,
        "no-action-points",
      ],
      [
        "dead",
        { ...base, units: base.units.map((u) => ({ ...u, hp: 0 })) },
        RADAR_DISH.id,
        "unit-dead",
      ],
      ["bug phase", { ...base, phase: "bugs" }, RADAR_DISH.id, "wrong-phase"],
      ["over", { ...base, outcome: "won" }, RADAR_DISH.id, "mission-over"],
    ];
    for (const [label, mission, id, kind] of cases) {
      const ctx = ctxWith(riggedRng(true));
      const ids = ctx.ids.getState();
      const result = handler(mission, useEquipment("squad", id, tile), ctx);
      expect(result, label).toMatchObject({ ok: false, error: { kind } });
      expect(ctx.ids.getState(), label).toEqual(ids);
    }
    // The site rules are the radar's own: three tiles out is out of reach.
    expect(
      validateEquipmentUse(base, "squad", RADAR_DISH.id, at(4, 1), DEPS),
    ).toMatchObject({
      ok: false,
      error: { kind: "radar-out-of-reach", range: 2 },
    });
    expect(
      previewEquipmentUse(base, "squad", RADAR_DISH.id, tile, DEPS),
    ).toMatchObject({
      ok: false,
      error: { kind: "no-area-weapon" },
    });
  });
});

describe("UseEquipment: grenade", () => {
  /** Two bugs beside the impact at (4,1) and a third out of the blast. */
  function withBugs(map = openField().build()): TacticalState {
    return kitted(
      [
        unitAt("near", "infantry", at(4, 2), { team: "bugs" }),
        unitAt("also", "infantry", at(5, 1), { team: "bugs" }),
        unitAt("far", "infantry", at(7, 7), { team: "bugs" }),
      ],
      map,
    );
  }
  const impact = at(4, 1);

  it("bursts over the tile like a shot at the ground, named as a grenade and thrown, and counts the use", () => {
    const before = withBugs();
    const result = handler(
      before,
      useEquipment("squad", GRENADE.id, impact),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.value.state;
    const hp = (id: string) => after.units.find((u) => u.id === id)!.hp;
    expect(hp("near")).toBeLessThan(10);
    expect(hp("also")).toBeLessThan(10);
    expect(hp("far")).toBe(10);
    expect(hp("squad")).toBe(10);
    expect(squad(after)).toMatchObject({
      ap: 1,
      equipment: { [GRENADE.id]: 1 },
    });
    const types = result.value.events.map((e) => e.type);
    expect(types[0]).toBe(EQUIPMENT_USED);
    const blast = result.value.events.find((e) => e.type === BLAST_RESOLVED);
    expect(blast).toMatchObject({
      payload: {
        attackerId: "squad",
        impact,
        hit: true,
        aimedAtTile: true,
        radius: 2,
        source: "grenade",
        delivery: "thrown",
      },
    });
    expect(
      (blast?.type === BLAST_RESOLVED ? blast.payload.victims : [])
        .map((v) => v.targetId)
        .sort(),
    ).toEqual(["also", "near"]);
  });

  it("runs out after two, and is refused beyond its range or through a wall", () => {
    let mission = withBugs();
    for (const left of [1, 0]) {
      const result = handler(
        mission,
        useEquipment("squad", GRENADE.id, impact),
        ctxWith(riggedRng(false)),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      mission = {
        ...result.value.state,
        units: result.value.state.units.map((u) => ({ ...u, ap: 2 })),
      };
      expect(squad(mission).equipment?.[GRENADE.id]).toBe(left);
    }
    expect(
      handler(
        mission,
        useEquipment("squad", GRENADE.id, impact),
        ctxWith(riggedRng(true)),
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "equipment-spent", equipmentId: GRENADE.id },
    });
    const fresh = withBugs();
    expect(
      validateEquipmentUse(fresh, "squad", GRENADE.id, at(7, 1), DEPS),
    ).toMatchObject({
      ok: false,
      error: { kind: "out-of-range", distance: 6, range: 5 },
    });
    const walled = withBugs(
      openField()
        .wall(at(2, 1), "e", "solid")
        .wall(at(2, 2), "e", "solid")
        .wall(at(2, 0), "e", "solid")
        .build(),
    );
    expect(
      validateEquipmentUse(walled, "squad", GRENADE.id, at(3, 1), DEPS),
    ).toMatchObject({
      ok: false,
      error: { kind: "tile-out-of-sight" },
    });
  });

  it("breaks a fence in the burst at force 1 but not a door", () => {
    const map = openField()
      .prop(PropKindIds.FENCE, at(4, 2))
      .wall(at(4, 1), "e", "door")
      .build();
    const result = handler(
      kitted([], map),
      useEquipment("squad", GRENADE.id, impact),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fallen = result.value.events.filter(
      (e) => e.type === STRUCTURE_DESTROYED,
    );
    expect(fallen).toHaveLength(1);
    expect(fallen[0]).toMatchObject({
      payload: { structure: { kind: "prop", propKind: PropKindIds.FENCE } },
    });
    expect(new TileIndex(result.value.state.map).getAt(at(4, 1))?.walls.e).toBe(
      "door",
    );
  });

  it("previews the same numbers the roll uses", () => {
    const preview = previewEquipmentUse(
      withBugs(),
      "squad",
      GRENADE.id,
      impact,
      DEPS,
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    // Accuracy 75 less one per tile beyond point blank: three tiles out
    // costs two (#1121's penalty).
    expect(preview.value.hitChance).toBe(73);
    expect(preview.value.blast?.radius).toBe(2);
    expect(preview.value.blast?.victims.map((v) => v.id).sort()).toEqual([
      "also",
      "near",
    ]);
  });
});

describe("UseEquipment: breaching charge", () => {
  const site = at(3, 1);

  it("is set on a tile within two and waits for the next turn", () => {
    const before = kitted();
    const result = handler(
      before,
      useEquipment("squad", BREACHING_CHARGE.id, site),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.charges).toEqual([
      {
        id: "charge-1",
        ownerId: "squad",
        equipmentId: BREACHING_CHARGE.id,
        tile: site,
        detonatesOnTurn: 2,
      },
    ]);
    expect(result.value.events.map((e) => e.type)).toEqual([
      EQUIPMENT_USED,
      CHARGE_PLACED,
    ]);
    expect(squad(result.value.state)).toMatchObject({
      ap: 1,
      equipment: { [BREACHING_CHARGE.id]: 0 },
    });
    expect(
      validateEquipmentUse(
        before,
        "squad",
        BREACHING_CHARGE.id,
        at(4, 1),
        DEPS,
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "out-of-range", distance: 3, range: 2 },
    });
    // A charge cannot miss and spares nobody: the squad next to it is in the preview.
    const preview = previewEquipmentUse(
      before,
      "squad",
      BREACHING_CHARGE.id,
      at(2, 1),
      DEPS,
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.value.hitChance).toBe(COMBAT_TUNING.maxHitChance);
    expect(preview.value.blast?.victims.map((v) => v.id)).toEqual(["squad"]);
  });

  it("goes off as the next player turn opens: the bug standing on it dies, the wall beside it falls, and the squad that stayed close is hurt", () => {
    const map = openField().wall(at(3, 1), "e", "solid").build();
    const placed = handler(
      kitted([], map),
      useEquipment("squad", BREACHING_CHARGE.id, site),
      ctxWith(riggedRng(true)),
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    // A bug walks onto the charge during its phase; the squad stays put, one tile off.
    let mission: TacticalState = {
      ...placed.value.state,
      units: [
        ...placed.value.state.units,
        unitAt("bug", "infantry", site, { team: "bugs" }),
      ],
    };
    const turn = createEndTurnHandler([refreshSides, createDetonateStep(DEPS)]);
    const ctx = ctxWith(riggedRng(true, "high"));
    const toBugs = turn(mission, endTurn(), ctx);
    expect(toBugs.ok).toBe(true);
    if (!toBugs.ok) return;
    mission = toBugs.value.state;
    // The bug phase opening sets nothing off.
    expect(mission.phase).toBe("bugs");
    expect(mission.charges).toHaveLength(1);
    expect(toBugs.value.events.some((e) => e.type === CHARGE_DETONATED)).toBe(
      false,
    );
    const toPlayer = turn(mission, endTurn(), ctx);
    expect(toPlayer.ok).toBe(true);
    if (!toPlayer.ok) return;
    mission = toPlayer.value.state;
    expect(mission.turn).toBe(2);
    expect(mission.charges).toEqual([]);
    const types = toPlayer.value.events.map((e) => e.type);
    expect(types).toContain(CHARGE_DETONATED);
    expect(types).toContain(UNIT_DIED);
    expect(types).toContain(STRUCTURE_DESTROYED);
    const blast = toPlayer.value.events.find((e) => e.type === BLAST_RESOLVED);
    expect(blast).toMatchObject({
      payload: {
        attackerId: "squad",
        impact: site,
        hit: true,
        radius: 3,
        source: "breaching charge",
        delivery: "placed",
      },
    });
    expect(mission.units.find((u) => u.id === "bug")?.hp).toBe(0);
    expect(new TileIndex(mission.map).getAt(site)?.walls.e).toBeUndefined();
    // Friendly fire is real: two tiles off, the squad took a share.
    expect(squad(mission).hp).toBeLessThan(10);
    // The kill is the owner's.
    expect(
      toPlayer.value.events.find((e) => e.type === UNIT_DIED),
    ).toMatchObject({
      payload: { unitId: "bug", killerId: "squad" },
    });
  });
});
