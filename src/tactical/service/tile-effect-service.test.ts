import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { HAZARD_TUNING } from "../data/hazard-tuning";
import { EFFECT_DAMAGED } from "../model/effect-damaged-event";
import { EFFECT_ENDED } from "../model/effect-ended-event";
import { EFFECT_STARTED } from "../model/effect-started-event";
import { SPAWNER_DAMAGED } from "../model/spawner-damaged-event";
import type { TileEffect } from "../model/tile-effect";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { TURRET_TUNING } from "../data/turret-tuning";
import { TURRET_DESTROYED } from "../model/turret-destroyed-event";
import { UNIT_DIED } from "../model/unit-died-event";
import { turretUnit } from "./unit-factory";
import {
  blockUnitAt,
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";
import { createMoveHandler } from "./move-handler";
import { move } from "../model/move-command";
import { UNIT_MOVED } from "../model/unit-moved-event";
import {
  burn,
  ignite,
  perceivedEffects,
  createHazardReaction,
} from "./tile-effect-service";

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });
const FIRE = { kind: "fire", chance: 1, falloff: 0.5 } as const;

/** A fire on `tile` with `phasesLeft` on its clock. */
function fire(id: string, tile: TileCoord, phasesLeft: number): TileEffect {
  return { id, kind: "fire", tile, phasesLeft };
}

describe("ignite", () => {
  it("lights every reached tile that passes its faded chance, skipping tiles nothing can stand on", () => {
    const map = openField().prop(PropKindIds.CAR, at(3, 2)).build();
    const mission = missionWith(map, []);
    const footprint = [
      { tile: at(3, 3), distance: 0 },
      { tile: at(3, 2), distance: 1 },
      { tile: at(4, 3), distance: 1 },
      { tile: at(3, 5), distance: 2 },
    ];
    // Always-true dice: only the car tile (impassable) and the tile at
    // distance 2 (chance 1 − 0.5 × 2 = 0) are spared.
    const lit = ignite(
      mission,
      footprint,
      FIRE,
      "s1",
      ctxWith(riggedRng(true)),
      HAZARD_TUNING,
    );
    expect(
      lit.state.effects.map((e) => `${String(e.tile.x)},${String(e.tile.z)}`),
    ).toEqual(["3,3", "4,3"]);
    expect(
      lit.state.effects.every(
        (e) => e.phasesLeft === HAZARD_TUNING.effects.fire.duration,
      ),
    ).toBe(true);
    expect(lit.events.map((e) => e.type)).toEqual([
      EFFECT_STARTED,
      EFFECT_STARTED,
    ]);
    expect(lit.events[0]).toMatchObject({
      payload: { kind: "fire", unitId: "s1", rekindled: false },
    });
  });

  it("rekindles a burning tile rather than stacking a second fire", () => {
    const map = openField().build();
    const mission = missionWith(map, [], {
      effects: [fire("effect-1", at(3, 3), 1)],
    });
    const lit = ignite(
      mission,
      [{ tile: at(3, 3), distance: 0 }],
      FIRE,
      "s1",
      ctxWith(riggedRng(true)),
      HAZARD_TUNING,
    );
    expect(lit.state.effects).toEqual([
      fire("effect-1", at(3, 3), HAZARD_TUNING.effects.fire.duration),
    ]);
    expect(lit.events).toEqual([
      {
        type: EFFECT_STARTED,
        payload: {
          effectId: "effect-1",
          kind: "fire",
          tile: at(3, 3),
          unitId: "s1",
          rekindled: true,
        },
      },
    ]);
  });

  it("lights nothing when the dice say no", () => {
    const mission = missionWith(openField().build(), []);
    const lit = ignite(
      mission,
      [{ tile: at(3, 3), distance: 0 }],
      FIRE,
      "s1",
      ctxWith(riggedRng(false)),
      HAZARD_TUNING,
    );
    expect(lit.state.effects).toEqual([]);
    expect(lit.events).toEqual([]);
  });
});

describe("burn", () => {
  it("burns only the acting side's units standing in it, and ticks every fire's clock", () => {
    const mission = missionWith(
      openField().build(),
      [
        unitAt("tdf-in", "infantry", at(3, 3)),
        unitAt("bug-in", "infantry", at(3, 3), { team: "bugs" }),
        unitAt("tdf-out", "infantry", at(5, 5)),
      ],
      {
        phase: "player",
        effects: [fire("effect-1", at(3, 3), 2), fire("effect-2", at(6, 6), 1)],
      },
    );
    const burned = burn(
      mission,
      ctxWith(riggedRng(true, "high")),
      HAZARD_TUNING,
      COMBAT_TUNING,
    );
    const hp = (id: string): number | undefined =>
      burned.state.units.find((u) => u.id === id)?.hp;
    // Fire does 4 ± 25 %, high end 5, against no armor.
    expect(hp("tdf-in")).toBe(5);
    expect(hp("bug-in")).toBe(10);
    expect(hp("tdf-out")).toBe(10);
    expect(burned.state.effects).toEqual([fire("effect-1", at(3, 3), 1)]);
    expect(burned.events.map((e) => e.type)).toEqual([
      EFFECT_DAMAGED,
      EFFECT_ENDED,
    ]);
    expect(burned.events[0]).toMatchObject({
      payload: {
        effectId: "effect-1",
        targetId: "tdf-in",
        targetKind: "unit",
        damage: 5,
        hp: 5,
      },
    });
  });

  it("kills a unit it takes to zero and says so without a killer", () => {
    const mission = missionWith(
      openField().build(),
      [unitAt("b", "infantry", at(3, 3), { team: "bugs", hp: 2 })],
      { phase: "bugs", effects: [fire("effect-1", at(3, 3), 3)] },
    );
    const burned = burn(
      mission,
      ctxWith(riggedRng(true)),
      HAZARD_TUNING,
      COMBAT_TUNING,
    );
    expect(burned.state.units[0]?.hp).toBe(0);
    expect(burned.events.map((e) => e.type)).toEqual([
      EFFECT_DAMAGED,
      UNIT_DIED,
    ]);
    expect(burned.events[1]).toEqual({
      type: UNIT_DIED,
      payload: { unitId: "b" },
    });
  });

  it("takes a turret to zero with a TurretDestroyed rather than a UnitDied (#1155)", () => {
    const built = turretUnit(
      TURRET_TUNING,
      "tdf",
      { pos: at(3, 3), facing: "n" },
      new SequentialIdGenerator(),
    );
    const base = missionWith(openField().build(), [{ ...built.unit, hp: 2 }], {
      phase: "player",
      effects: [fire("effect-1", at(3, 3), 3)],
    });
    const mission = {
      ...base,
      templates: { ...base.templates, [built.template.id]: built.template },
    };
    const burned = burn(
      mission,
      ctxWith(riggedRng(true)),
      HAZARD_TUNING,
      COMBAT_TUNING,
    );
    expect(burned.state.units[0]?.hp).toBe(0);
    expect(burned.events.map((e) => e.type)).toEqual([
      EFFECT_DAMAGED,
      TURRET_DESTROYED,
    ]);
    expect(burned.events[1]).toEqual({
      type: TURRET_DESTROYED,
      payload: { turretId: built.unit.id, pos: at(3, 3) },
    });
  });

  it("burns an egg spawner on the bug phase only, through the one spawner rule", () => {
    const spawner = {
      id: "spawner-1",
      pos: at(3, 3),
      hatchRadius: 1,
      hp: 20,
      timer: 3,
      destroyed: false,
    };
    const base = missionWith(openField().build(), [], {
      spawners: [spawner],
      effects: [fire("effect-1", at(3, 3), 3)],
    });
    const player = burn(
      { ...base, phase: "player" },
      ctxWith(riggedRng(true)),
      HAZARD_TUNING,
      COMBAT_TUNING,
    );
    expect(player.state.spawners[0]?.hp).toBe(20);
    const bugs = burn(
      { ...base, phase: "bugs" },
      ctxWith(riggedRng(true)),
      HAZARD_TUNING,
      COMBAT_TUNING,
    );
    expect(bugs.state.spawners[0]?.hp).toBe(17);
    expect(bugs.events.map((e) => e.type)).toEqual([
      EFFECT_DAMAGED,
      SPAWNER_DAMAGED,
    ]);
  });

  it("is a no-op with nothing burning", () => {
    const mission = missionWith(openField().build(), [
      unitAt("s", "infantry", at(1, 1)),
    ]);
    const burned = burn(
      mission,
      ctxWith(riggedRng(true)),
      HAZARD_TUNING,
      COMBAT_TUNING,
    );
    expect(burned.state).toBe(mission);
    expect(burned.events).toEqual([]);
  });
});

describe("perceivedEffects", () => {
  it("returns the fires on ground the side has seen and none of the rest", () => {
    const map = openField().build();
    const mission = missionWith(map, [unitAt("s", "infantry", at(0, 0))], {
      effects: [fire("near", at(1, 0), 3), fire("far", at(7, 7), 3)],
    });
    // Nobody has looked yet: nothing is perceived.
    expect(perceivedEffects(mission, "tdf")).toEqual([]);
  });
});

describe("burn with a unit on a 2×2 block (#1130)", () => {
  it("burns the block when any tile of it is alight, once per fire", () => {
    // Fires on two of the block's four tiles: two fires, two burns; a
    // fire beside the block burns nobody.
    const mission = missionWith(
      openField().build(),
      [blockUnitAt("b", at(4, 3))],
      {
        phase: "bugs",
        effects: [
          fire("f1", at(5, 4), 2),
          fire("f2", at(4, 3), 2),
          fire("f3", at(6, 3), 2),
        ],
      },
    );
    const burnt = burn(
      mission,
      ctxWith(riggedRng(true, "low")),
      HAZARD_TUNING,
      COMBAT_TUNING,
    );
    const burns = burnt.events.flatMap((e) =>
      e.type === EFFECT_DAMAGED ? [e.payload] : [],
    );
    expect(burns.map((b) => b.effectId)).toEqual(["f1", "f2"]);
    expect(burns.every((b) => b.targetId === "b")).toBe(true);
  });
});

describe("fire during movement", () => {
  it.each(["tdf", "bugs"] as const)(
    "burns %s on every step through fire, even when it finishes outside",
    (team) => {
      const unit = unitAt("walker", "infantry", at(0, 0), { team, hp: 100 });
      const mission = missionWith(openField().build(), [unit], {
        phase: team === "tdf" ? "player" : "bugs",
        effects: [fire("one", at(1, 0), 4), fire("two", at(2, 0), 4)],
      });
      const seenHp: number[] = [];
      const handler = createMoveHandler(
        createHazardReaction(HAZARD_TUNING, COMBAT_TUNING, (state) => {
          seenHp.push(state.units[0]!.hp);
          return { state, events: [] };
        }),
      );
      const run = (): ReturnType<typeof handler> =>
        handler(
          mission,
          move(unit.id, [at(1, 0), at(2, 0), at(3, 0)]),
          ctxWith(riggedRng(true)),
        );
      const result = run();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.events.map((event) => event.type)).toEqual([
        UNIT_MOVED,
        EFFECT_DAMAGED,
        UNIT_MOVED,
        EFFECT_DAMAGED,
        UNIT_MOVED,
      ]);
      expect(seenHp[0]).toBeLessThan(100);
      expect(seenHp[1]).toBeLessThan(seenHp[0]!);
      expect(seenHp[2]).toBe(seenHp[1]);
      expect(result.value.state.units[0]?.pos).toEqual(at(3, 0));
      expect(result.value.state.effects).toEqual(mission.effects);
      expect(mission.units[0]?.hp).toBe(100);
      expect(run()).toEqual(result);
    },
  );

  it("stops on a lethal fire before the next reaction or path step", () => {
    const mission = missionWith(
      openField().build(),
      [unitAt("u", "infantry", at(0, 0), { hp: 1 })],
      {
        effects: [fire("fire", at(1, 0), 4)],
      },
    );
    const handler = createMoveHandler(
      createHazardReaction(HAZARD_TUNING, COMBAT_TUNING, () => {
        throw new Error("dead units cannot provoke overwatch");
      }),
    );
    const result = handler(
      mission,
      move("u", [at(1, 0), at(2, 0), at(3, 0)]),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events.map((event) => event.type)).toEqual([
      UNIT_MOVED,
      EFFECT_DAMAGED,
      UNIT_DIED,
    ]);
    expect(result.value.state.units[0]).toMatchObject({
      hp: 0,
      pos: at(1, 0),
      ap: 1,
    });
  });

  it("burns a large footprint once per overlapping fire and ignores smoke", () => {
    const block = blockUnitAt("brute", at(2, 2));
    const mission = missionWith(openField().build(), [block], {
      effects: [
        fire("under-edge", at(3, 3), 4),
        { id: "smoke", kind: "smoke", tile: at(2, 2), phasesLeft: 4 },
      ],
    });
    const result = createHazardReaction(HAZARD_TUNING, COMBAT_TUNING)(
      mission,
      block.id,
      ctxWith(riggedRng(true)),
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: EFFECT_DAMAGED,
      payload: { effectId: "under-edge" },
    });
    expect(result.state.effects).toEqual(mission.effects);
  });
});
