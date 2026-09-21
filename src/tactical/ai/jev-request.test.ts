import { describe, expect, it } from "vitest";
import { captureJev, jevChoicePage } from "./jev-request";
import { jevPerception } from "./jev-observation";
import {
  missionWith,
  openField,
  unitAt,
  walledField,
  FIXTURE_TEMPLATES,
} from "../service/tactical-fixtures.test-helper";
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

const rules = {
  handlers: {
    "tactical:extract": createExtractHandler(OBJECTIVE_TUNING),
    "tactical:interact": createInteractHandler(OBJECTIVE_TUNING),
    "tactical:harvest-carcass": createHarvestHandler(OBJECTIVE_TUNING),
  },
  combat: COMBAT_TUNING,
  equipment: { catalogue: SHIPPED_EQUIPMENT, combat: COMBAT_TUNING },
};
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
              profile: { ...weapon.profile, demoForce: 1 },
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
  it("offers each usable weapon, firing mode and item at the top level and isolates their follow-ups", () => {
    const snapshot = captureJev(loadoutFixture(), "self", rules);
    const first = jevChoicePage(snapshot);
    const criteria = first.request.questions.action!.criteria;
    expect(Object.keys(criteria)).toEqual(
      expect.arrayContaining([
        "attack:carbine",
        "attack:cannon",
        "attack-ground:cannon",
        "equipment:grenade",
        "equipment:medkit",
        "equipment:radar-dish",
        "move",
        "overwatch",
      ]),
    );
    expect(criteria).not.toHaveProperty("attack");
    expect(criteria).not.toHaveProperty("attack-ground");
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
    /** Every descendant retains the exact selected weapon/mode or equipment, including paged tile lists. */
    const visit = (items: readonly JevCandidate[], actionId: string): void => {
      expect(
        items.every(
          (candidate) =>
            (candidate.actionType?.id ?? candidate.category) === actionId,
        ),
      ).toBe(true);
      const page = jevChoicePage(snapshot, items);
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
  it("offers every one-AP move and excludes every two-AP destination", () => {
    const state = withVision({
      state: missionWith(openField().build(), [
        unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
      ]),
      events: [],
    }).state;
    const actor = state.units[0]!;
    const view = jevPerception(state, actor);
    const graph = buildMoveGraph(view.map);
    const reachable = [...searchMoves(view, actor, graph).costs];
    const oneAp = reachable
      .filter(([, cost]) => apCostOf(view, actor, cost) === 1)
      .map(([key]) => key);
    expect(
      reachable.some(([, cost]) => apCostOf(view, actor, cost) === 2),
    ).toBe(true);
    const snapshot = captureJev(state, actor.id, rules);
    const moves = snapshot.candidates.filter(
      (candidate) => candidate.command?.type === "tactical:move",
    );
    expect(
      moves
        .map((candidate) => {
          const command = candidate.command!;
          if (command.type !== "tactical:move")
            throw new Error("Expected a move");
          expect(JSON.parse(candidate.description)).toMatchObject({
            ap_cost: 1,
          });
          return graph.index.keyOf(command.payload.path.at(-1)!);
        })
        .sort(),
    ).toEqual(oneAp.sort());
    const spent = { ...state, units: [{ ...actor, ap: 0 }] };
    expect(captureJev(spent, actor.id, rules).candidates).toEqual([]);
  });
  it("explains combined terrain masks and the actor's movement class", () => {
    const snapshot = captureJev(fixture(), "self", rules);
    expect(snapshot.state.actor).toMatchObject({ movement_class: "infantry" });
    const navigation = snapshot.state.navigation as Record<string, unknown>;
    expect(navigation.passMask).toEqual({
      0: "Blocked for all movement classes",
      1: "Infantry movement class only",
      2: "Mech movement class only",
      3: "Both infantry and mech movement classes",
    });
    expect(navigation.tiles).toContainEqual([1, 0, 5, 3, 0, {}, false, true]);
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
        category: index % 2 === 0 ? "move" : "attack-ground",
        description: `Destination ${String(index)}`,
      }),
    );
    const first = jevChoicePage({ ...snapshot, candidates });
    expect(first.stage).toBe("action-type");
    expect(Object.keys(first.request.questions.action!.criteria)).toEqual([
      "move",
      "attack-ground",
    ]);
    expect(JSON.stringify(first.request)).not.toContain("Destination");
    const leaves: string[] = [];
    /** Every route must shrink and preserve the chosen type until a bounded leaf is reached. */
    const visit = (items: readonly JevCandidate[], category: string): void => {
      expect(items.every((item) => item.category === category)).toBe(true);
      const page = jevChoicePage(snapshot, items);
      expect(
        Object.keys(page.request.questions.action!.criteria).length,
      ).toBeLessThanOrEqual(48);
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
        category: "attack-ground",
        description: JSON.stringify({
          action: "attack-ground",
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
      ).toBeLessThanOrEqual(12000);
    }
  });
});
