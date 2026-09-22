import { describe, expect, it } from "vitest";
import { captureJev, jevChoicePage } from "./jev-request";
import { jevPerception } from "./jev-observation";
import {
  missionWith,
  openField,
  unitAt,
  walledField,
  FIXTURE_TEMPLATES,
  ctxWith,
  riggedRng,
} from "../service/tactical-fixtures.test-helper";
import { overwatchHandler } from "../service/overwatch-handler";
import { withVision } from "../service/vision-service";
import { rememberJevTerrain } from "../service/jev-knowledge-service";
import {
  createExtractHandler,
  createInteractHandler,
} from "../service/objective-service";
import { createHarvestHandler } from "../service/harvest-service";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { SHIPPED_EQUIPMENT } from "../repository/equipment-catalogue";
import type { JevCandidate } from "../model/jev-control";
import type { TacticalState } from "../model/tactical-state";
import { TileIndex } from "../../mapgen/service/tile-index";
import {
  apCostOf,
  buildMoveGraph,
  searchMoves,
} from "../service/movement-service";
import { SurfaceIds } from "../../mapgen/data/surfaces";

const rules = {
  handlers: {
    "tactical:extract": createExtractHandler(OBJECTIVE_TUNING),
    "tactical:interact": createInteractHandler(OBJECTIVE_TUNING),
    "tactical:harvest-carcass": createHarvestHandler(OBJECTIVE_TUNING),
  },
  combat: COMBAT_TUNING,
  equipment: { catalogue: SHIPPED_EQUIPMENT, combat: COMBAT_TUNING },
};
/** A wall hides an enemy so observations can be compared without leaking changes. */
function fixture(): TacticalState {
  const state = missionWith(walledField(), [
    unitAt("self", "infantry", { x: 1, y: 0, z: 5 }),
    unitAt("hidden", "infantry", { x: 6, y: 0, z: 5 }, { team: "bugs" }),
  ]);
  return withVision({ state, events: [] }).state;
}

/** An injured actor with two weapons, a grenade, healing and a deployable. */
function loadoutFixture(): TacticalState {
  const base = missionWith(openField().build(), [
    unitAt("self", "infantry", { x: 1, y: 0, z: 1 }, { hp: 7 }),
    unitAt("enemy", "infantry", { x: 3, y: 0, z: 1 }, { team: "bugs" }),
  ]);
  const template = base.templates[FIXTURE_TEMPLATES.infantry]!;
  const weapon = template.weapons[0]!;
  return withVision({
    state: {
      ...base,
      templates: {
        ...base.templates,
        [template.id]: {
          ...template,
          weapons: [
            { ...weapon, id: "carbine", name: "Carbine", charges: 3 },
            {
              ...weapon,
              id: "cannon",
              name: "Autocannon",
              charges: 3,
              profile: {
                ...weapon.profile,
                demoForce: 1,
                aoe: { radius: 2, falloff: 0.4 },
              },
            },
          ],
          equipment: ["grenade", "medkit", "radar-dish"],
        },
      },
    },
    events: [],
  }).state;
}

describe("Jev observation", () => {
  it("offers each usable weapon and item at the top level and isolates their follow-ups", () => {
    const snapshot = captureJev(loadoutFixture(), "self", rules);
    const first = jevChoicePage(snapshot);
    const criteria = first.request.questions.action!.criteria;
    expect(Object.keys(criteria)).toEqual(
      expect.arrayContaining([
        "attack:carbine",
        "attack:cannon",
        "equipment:grenade",
        "equipment:medkit",
        "equipment:radar-dish",
        "move",
        "overwatch",
      ]),
    );
    expect(criteria).not.toHaveProperty("attack");
    expect(criteria).not.toHaveProperty("attack-ground");
    expect(
      Object.keys(criteria).some((id) => id.startsWith("attack-ground")),
    ).toBe(false);
    expect(criteria).not.toHaveProperty("equipment");
    expect(criteria).not.toHaveProperty("finish");
    expect(criteria["attack:carbine"]).toMatchObject({
      name: "Attack with Carbine",
      capability: { weapon_id: "carbine" },
    });
    expect(criteria["equipment:grenade"]).toMatchObject({
      name: "Use Grenade",
      capability: { kind: "blast", uses_left: 2 },
    });
    expect(criteria["equipment:medkit"]).toMatchObject({
      capability: { kind: "heal" },
    });
    const reached: string[] = [];
    /** Every descendant retains the exact selected weapon or equipment, including paged tile lists. */
    const visit = (items: readonly JevCandidate[], actionId: string): void => {
      expect(
        items.every(
          (candidate) =>
            (candidate.actionType?.id ?? candidate.category) === actionId,
        ),
      ).toBe(true);
      const page = jevChoicePage(snapshot, items);
      expect(page.request.questions.action!.instructions).toContain(
        items[0]!.actionType?.name ?? items[0]!.category,
      );
      if (page.groups) {
        for (const group of Object.values(page.groups)) {
          expect(group.length).toBeLessThan(items.length);
          visit(group, actionId);
        }
      } else {
        for (const candidate of items) {
          reached.push(candidate.id);
          const option = page.request.questions.action!.criteria[candidate.id];
          if (actionId.startsWith("equipment:"))
            expect(option).toMatchObject({
              equipmentId: actionId.slice("equipment:".length),
            });
          if (actionId.startsWith("attack"))
            expect(option).toMatchObject({ weaponId: actionId.split(":")[1] });
        }
      }
    };
    for (const [actionId, items] of Object.entries(first.groups!))
      visit(items, actionId);
    expect(reached.sort()).toEqual(
      snapshot.candidates.map((candidate) => candidate.id).sort(),
    );
  });
  it("offers only hostile entities for AOE weapons and grenades, retaining blast victims", () => {
    const base = loadoutFixture();
    const state = withVision({
      state: {
        ...base,
        units: [
          ...base.units,
          unitAt("ally", "infantry", { x: 3, y: 0, z: 2 }),
          unitAt(
            "dead",
            "infantry",
            { x: 2, y: 0, z: 3 },
            { team: "bugs", hp: 0 },
          ),
        ],
        spawners: [
          {
            id: "nest",
            pos: { x: 4, y: 0, z: 1 },
            hp: 20,
            hatchRadius: 3,
            timer: 2,
            destroyed: false,
          },
          {
            id: "destroyed",
            pos: { x: 4, y: 0, z: 3 },
            hp: 0,
            hatchRadius: 3,
            timer: 2,
            destroyed: true,
          },
        ],
      },
      events: [],
    }).state;
    const snapshot = captureJev(state, "self", rules);
    const top = jevChoicePage(snapshot);
    for (const id of ["attack:carbine", "attack:cannon"]) {
      const shots = top.groups![id]!;
      expect(shots.map((candidate) => candidate.command!.payload)).toEqual([
        { attackerId: "self", targetId: "enemy", weaponId: id.split(":")[1] },
        { attackerId: "self", targetId: "nest", weaponId: id.split(":")[1] },
      ]);
    }
    expect(
      snapshot.candidates.some(
        (candidate) => candidate.category === "attack-ground",
      ),
    ).toBe(false);
    const cannon = jevChoicePage(snapshot, top.groups!["attack:cannon"]);
    expect(cannon.request.questions.action!.instructions).toContain(
      "Only entity targets are offered",
    );
    const shot = Object.values(
      cannon.request.questions.action!.criteria,
    )[0] as {
      details: { blast: { radius: number; victims: readonly unknown[] } };
    };
    expect(shot.details.blast.radius).toBe(2);
    expect(shot.details.blast.victims).toContainEqual(
      expect.objectContaining({ id: "ally", team: "tdf" }),
    );
    const grenades = top.groups!["equipment:grenade"]!;
    expect(
      grenades
        .map(
          (candidate) =>
            (
              JSON.parse(candidate.description) as {
                details: { targetId: string };
              }
            ).details.targetId,
        )
        .sort(),
    ).toEqual(["enemy", "nest"]);
    expect(grenades.map((candidate) => candidate.command!.payload)).toEqual([
      { unitId: "self", equipmentId: "grenade", tile: { x: 3, y: 0, z: 1 } },
      { unitId: "self", equipmentId: "grenade", tile: { x: 4, y: 0, z: 1 } },
    ]);
    expect(
      jevChoicePage(snapshot, grenades).request.questions.action!.instructions,
    ).toContain("visible enemy unit or nest");
  });
  it("does not offer weapons or grenades when no hostile entity is visible", () => {
    const base = loadoutFixture();
    const state = {
      ...base,
      vision: { ...base.vision, tdf: { ...base.vision.tdf, spotted: [] } },
    };
    const top = jevChoicePage(captureJev(state, "self", rules));
    expect(Object.keys(top.groups!).some((id) => id.startsWith("attack"))).toBe(
      false,
    );
    expect(top.groups).not.toHaveProperty("equipment:grenade");
    expect(top.groups).toHaveProperty("equipment:medkit");
    expect(top.groups).toHaveProperty("equipment:radar-dish");
  });
  it.each([1, 2, 3])(
    "describes overwatch as 1 AP and ends the activation with %i AP available",
    (ap) => {
      const state = withVision({
        state: missionWith(openField().build(), [
          unitAt("self", "infantry", { x: 1, y: 0, z: 1 }, { ap }),
        ]),
        events: [],
      }).state;
      const snapshot = captureJev(state, "self", rules);
      const top = jevChoicePage(snapshot);
      expect(top.request.questions.action!.criteria.overwatch).toMatchObject({
        ap_costs: [1],
        ends_activation: true,
      });
      const option = top.request.questions.action!.criteria.overwatch as {
        instructions: string;
      };
      expect(option.instructions).toContain(
        "Overwatch costs 1 AP and ends the actor's activation",
      );
      const candidate = top.groups!.overwatch![0]!;
      expect(candidate.apCost).toBe(1);
      const command = candidate.command!;
      if (command.type !== "tactical:overwatch")
        throw new Error("Expected overwatch");
      const result = overwatchHandler(state, command, ctxWith(riggedRng(true)));
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(result.value.state.units[0]).toMatchObject({
          ap: 0,
          status: ["overwatch"],
        });
    },
  );
  it("updates the action menu for exhausted items, empty guns and different entity loadouts", () => {
    const base = loadoutFixture();
    const changed = {
      ...base,
      units: base.units.map((unit) =>
        unit.id === "self"
          ? {
              ...unit,
              charges: { carbine: 0, cannon: 3 },
              equipment: { grenade: 0 },
            }
          : unit,
      ),
    };
    const menu = jevChoicePage(captureJev(changed, "self", rules)).request
      .questions.action!.criteria;
    expect(menu).not.toHaveProperty("attack:carbine");
    expect(menu).not.toHaveProperty("equipment:grenade");
    expect(menu).toHaveProperty("attack:cannon");
    expect(menu).toHaveProperty("equipment:medkit");
    const bug = jevChoicePage(
      captureJev({ ...base, phase: "bugs" }, "enemy", rules),
    ).request.questions.action!.criteria;
    expect(Object.keys(bug).some((id) => id.startsWith("attack:"))).toBe(true);
    expect(JSON.stringify(bug)).not.toContain("Carbine");
    expect(Object.keys(bug).some((id) => id.startsWith("equipment:"))).toBe(
      false,
    );
  });
  it("does not change when unseen enemies, terrain, schedules or logs change", () => {
    const state = fixture();
    expect(state.vision.tdf.spotted).not.toContain("hidden");
    const index = new TileIndex(state.map);
    const unseen = state.map.tiles.find(
      (tile) => !state.vision.tdf.visible.includes(index.keyOf(tile)),
    )!;
    const before = captureJev(state, "self", rules, undefined, {
      self: "Alpha",
      hidden: "Secret enemy name",
      undeployed: "Undeployed squad name",
    });
    const changed = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "hidden"
          ? { ...unit, hp: 1, pos: { x: 7, y: 0, z: 7 } }
          : unit,
      ),
      edgeSpawn: { nextTurn: 99, wave: 100 },
      charges: [
        {
          id: "unseen-charge",
          ownerId: "hidden",
          equipmentId: "breaching-charge",
          tile: unseen,
          detonatesOnTurn: 3,
        },
      ],
      carcasses: [
        {
          id: "unseen-carcass",
          pos: unseen,
          techPoints: 100,
          harvested: false,
        },
      ],
      map: {
        ...state.map,
        tiles: state.map.tiles.map((tile) =>
          tile === unseen ? { ...tile, coverProvided: 2 as const } : tile,
        ),
      },
    };
    expect(
      captureJev(changed, "self", rules, undefined, {
        self: "Alpha",
        hidden: "Changed secret enemy name",
      }),
    ).toEqual(before);
    expect(before.state.actor).toMatchObject({ name: "Alpha" });
    expect(JSON.stringify(before.state)).not.toContain("enemy name");
    expect(JSON.stringify(before.state)).not.toContain("Undeployed");
    expect(JSON.stringify(before.state)).not.toContain('"hidden"');
    expect(before.state).not.toHaveProperty("seed");
    expect(before.state).not.toHaveProperty("log");
  });
  it("uses shared faction spotting and exposes HP, hostility and capabilities of seen units", () => {
    const base = missionWith(openField().build(), [
      unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
      unitAt("ally", "infantry", { x: 5, y: 0, z: 5 }),
      unitAt("enemy", "infantry", { x: 7, y: 0, z: 7 }, { team: "bugs" }),
    ]);
    const state = withVision({ state: base, events: [] }).state;
    const snapshot = captureJev(state, "self", rules, {
      entity: "Guard ally",
      commander: "Hold",
    });
    expect(JSON.stringify(snapshot.state.entities)).toContain('"enemy"');
    expect(snapshot.state.entity_prompt).toBe("Guard ally");
    expect(snapshot.state.commander_prompt).toBe("Hold");
    const bug = captureJev(state, "enemy", rules);
    expect(bug.team).toBe("bugs");
    expect(bug.eligible).toBe(false);
    expect(bug.candidates).toEqual([]);
  });
  it("offers compact movement intents with only one-AP paths and no tile map", () => {
    const state = withVision({
      state: missionWith(openField().build(), [
        unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
      ]),
      events: [],
    }).state;
    const actor = state.units[0]!;
    const view = jevPerception(state, actor);
    const graph = buildMoveGraph(view.map);
    const reachable = searchMoves(view, actor, graph).costs;
    expect(
      [...reachable.values()].some((cost) => apCostOf(view, actor, cost) === 2),
    ).toBe(true);
    const snapshot = captureJev(state, actor.id, rules);
    const moves = snapshot.candidates.filter((candidate) => candidate.movement);
    expect(moves.map((candidate) => candidate.id)).toEqual([
      "move_east",
      "move_south",
    ]);
    for (const candidate of moves) {
      const command = candidate.command!;
      if (command.type !== "tactical:move") throw new Error("Expected a move");
      const cost = reachable.get(
        graph.index.keyOf(command.payload.path.at(-1)!),
      )!;
      expect(apCostOf(view, actor, cost)).toBe(1);
      expect(candidate.apCost).toBe(1);
    }
    expect(snapshot.state).not.toHaveProperty("navigation");
    expect(snapshot.state.actor).toMatchObject({ movement_class: "infantry" });
    expect(jevChoicePage(snapshot, moves).stage).toBe("movement-target");
    expect(
      captureJev({ ...state, units: [{ ...actor, ap: 0 }] }, actor.id, rules)
        .candidates,
    ).toEqual([]);
  });
  it("explains actual movement allowance and costs on every routing stage", () => {
    const base = missionWith(
      openField().tile({ x: 1, y: 0, z: 0 }, SurfaceIds.INFESTED).build(),
      [unitAt("self", "infantry", { x: 0, y: 0, z: 0 }, { ap: 3 })],
    );
    const template = base.templates[FIXTURE_TEMPLATES.infantry]!;
    const state = withVision({
      state: {
        ...base,
        templates: {
          ...base.templates,
          [template.id]: { ...template, move: 5 },
        },
      },
      events: [],
    }).state;
    const snapshot = captureJev(state, "self", rules);
    const first = jevChoicePage(snapshot);
    expect(first.request.questions.action!.criteria.move).toMatchObject({
      ap_costs: [1],
    });
    const moves = first.groups!.move!;
    expect(
      moves.every((candidate) => candidate.movement!.stops.at(-1)!.cost <= 5),
    ).toBe(true);
    const topInstructions = (
      first.request.questions.action!.criteria.move as { instructions: string }
    ).instructions;
    const leaf = jevChoicePage(snapshot, moves);
    // Force a routing stage using real movement candidates, keeping their original costs and rules.
    const grouped = jevChoicePage(
      snapshot,
      Array.from({ length: 300 }, (_, i) => ({
        ...moves[i % moves.length]!,
        id: `copy-${String(i)}`,
      })),
    );
    expect(grouped.stage).toBe("action-group");
    for (const instructions of [
      topInstructions,
      leaf.request.questions.action!.instructions,
      grouped.request.questions.action!.instructions,
    ]) {
      expect(instructions).toContain("3 AP remaining");
      expect(instructions).toContain("5 movement points");
      expect(instructions).toContain("short move does not save any AP");
      expect(instructions).toContain("updated position and vision");
    }
  });
  it("keeps weapon, healing and explosive rules with their own follow-up and quotes real AP costs", () => {
    const snapshot = captureJev(loadoutFixture(), "self", rules);
    const first = jevChoicePage(snapshot);
    const cases = [
      ["attack:carbine", "hit_chance_percent"],
      ["equipment:grenade", "harm allies"],
      ["equipment:medkit", "never attacks enemies"],
      ["equipment:radar-dish", "do not reveal terrain"],
      ["overwatch", "Overwatch costs 1 AP and ends the actor's activation"],
    ];
    for (const [id, rule] of cases) {
      const top = first.request.questions.action!.criteria[id!] as {
        instructions: string;
        ap_costs: number[];
      };
      expect(top.instructions).toContain(rule);
      expect(top.ap_costs).toEqual([1]);
      const follow = jevChoicePage(snapshot, first.groups![id!]);
      expect(follow.request.questions.action!.instructions).toContain(rule);
      if (id !== "overwatch")
        expect(follow.request.questions.action!.instructions).toContain(
          "Selected capability:",
        );
    }
    const base = missionWith(openField().build(), [
      unitAt("self", "mech", { x: 0, y: 0, z: 0 }, { ap: 3 }),
      unitAt("enemy", "infantry", { x: 1, y: 0, z: 0 }, { team: "bugs" }),
    ]);
    const mech = captureJev(
      withVision({ state: base, events: [] }).state,
      "self",
      rules,
    );
    const shot = mech.candidates.find(
      (candidate) => candidate.category === "attack",
    )!;
    expect(shot.apCost).toBe(1);
    expect(shot.endsActivation).toBe(true);
    expect(shot.actionType!.capability).toMatchObject({
      ap_cost: 1,
      ends_activation: true,
    });
    expect(
      jevChoicePage(mech, [shot]).request.questions.action!.instructions,
    ).toContain("costs 1 AP");
  });
  it("remembers observed terrain without refreshing it from unseen changes", () => {
    let state = fixture();
    state = rememberJevTerrain({
      ...state,
      jev: { entities: {}, commanders: { tdf: "", bugs: "" } },
    });
    const known = state.jev!.knowledge!.tdf!.tiles[0]!;
    const index = new TileIndex(state.map);
    const changed = {
      ...state,
      vision: {
        ...state.vision,
        tdf: {
          ...state.vision.tdf,
          visible: state.vision.tdf.visible.filter(
            (key) => key !== index.keyOf(known),
          ),
        },
      },
      map: {
        ...state.map,
        tiles: state.map.tiles.map((tile) =>
          index.keyOf(tile) === index.keyOf(known)
            ? { ...tile, coverProvided: 2 as const }
            : tile,
        ),
      },
    };
    expect(
      jevPerception(changed, changed.units[0]!).map.tiles.find(
        (tile) => index.keyOf(tile) === index.keyOf(known),
      ),
    ).toEqual(known);
  });
  it("preserves the actor's own concealment and resources without exposing enemy reserves", () => {
    const base = missionWith(openField().build(), [
      {
        ...unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
        status: ["hidden" as const],
        overwatchShots: 2,
      },
      unitAt("enemy", "infantry", { x: 1, y: 0, z: 0 }, { team: "bugs" }),
    ]);
    const state = withVision({ state: base, events: [] }).state;
    const before = captureJev(state, "self", rules);
    expect(before.state.actor).toMatchObject({
      status: ["hidden"],
      overwatch_shots: 2,
    });
    const changed = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "enemy"
          ? { ...unit, ap: 0, heat: 100, equipment: { grenade: 99 } }
          : unit,
      ),
    };
    expect(captureJev(changed, "self", rules)).toEqual(before);
  });
  it("keeps all actions reachable through bounded Choice pages", () => {
    const snapshot = captureJev(fixture(), "self", rules);
    const candidates: JevCandidate[] = Array.from(
      { length: 1800 },
      (_, index) => ({
        id: `test-${String(index)}`,
        category: index % 2 === 0 ? "move" : "attack",
        description: `Destination ${String(index)}`,
      }),
    );
    const first = jevChoicePage({ ...snapshot, candidates });
    expect(first.stage).toBe("action-type");
    expect(Object.keys(first.request.questions.action!.criteria)).toEqual([
      "move",
      "attack",
    ]);
    expect(JSON.stringify(first.request)).not.toContain("Destination");
    const leaves: string[] = [];
    /** Every route must shrink and preserve the chosen type until a bounded leaf is reached. */
    const visit = (items: readonly JevCandidate[], category: string): void => {
      expect(items.every((item) => item.category === category)).toBe(true);
      const page = jevChoicePage(snapshot, items);
      expect(
        Object.keys(page.request.questions.action!.criteria).length,
      ).toBeLessThanOrEqual(32);
      if (page.groups) {
        for (const group of Object.values(page.groups)) {
          expect(group.length).toBeLessThan(items.length);
          visit(group, category);
        }
      } else
        leaves.push(...Object.keys(page.request.questions.action!.criteria));
    };
    for (const [category, group] of Object.entries(first.groups!))
      visit(group, category);
    expect(leaves.sort()).toEqual(
      candidates.map((candidate) => candidate.id).sort(),
    );
  });
  it("splits verbose options even below the Choice count limit", () => {
    const snapshot = captureJev(fixture(), "self", rules);
    const candidates: JevCandidate[] = Array.from(
      { length: 40 },
      (_, index) => ({
        id: `attack-${String(index)}`,
        category: "attack",
        description: JSON.stringify({
          action: "attack",
          preview: "blast victim facts ".repeat(100),
        }),
      }),
    );
    const page = jevChoicePage(snapshot, candidates);
    expect(page.stage).toBe("action-group");
    expect(JSON.stringify(page.request.questions).length).toBeLessThan(12000);
    expect(Object.values(page.groups!).flat()).toEqual(candidates);
    for (const group of Object.values(page.groups!)) {
      const leaf = jevChoicePage(snapshot, group);
      expect(leaf.stage).toBe("action");
      expect(
        JSON.stringify(leaf.request.questions.action!.criteria).length,
      ).toBeLessThanOrEqual(8000);
    }
  });
});
