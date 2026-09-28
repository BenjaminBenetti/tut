import { describe, expect, it } from "vitest";

import type { PersonaId } from "../../content/model/persona-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { captureJev } from "../../tactical/ai/jev-request";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { MOVE } from "../../tactical/model/move-command";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { unitAt } from "../../tactical/service/tactical-fixtures.test-helper";
import { PERSONAS } from "../data/personas";
import { bugView } from "../ai/bug-mission.test-helper";
import { BroodmotherBehaviour } from "../ai/broodmother-behaviour";
import { fieldMap, motherMission } from "./broodmother.test-helper";
import { sovereignMission } from "./sovereign.test-helper";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { JevCandidate } from "../../tactical/model/jev-control";
import { createNamedEnemyMovementRules } from "./named-enemy-movement-rules";
import { createPersonaLookup } from "./persona-lookup";
import { broodmotherHp } from "./broodmother-service";

// ===========================================
// Fixtures
// ===========================================

const movement = createNamedEnemyMovementRules(createPersonaLookup(PERSONAS));

/** The Jev rules the app hands the controller, with this package's movement rules. */
const rules = {
  handlers: {},
  combat: COMBAT_TUNING,
  equipment: { catalogue: SHIPPED_EQUIPMENT, combat: COMBAT_TUNING },
  movement,
};

// ===========================================
// Tests
// ===========================================

describe("createNamedEnemyMovementRules (#1179)", () => {
  it("lets a persona that flees run for the edge once hurt enough, and nobody else", () => {
    const bug = {
      ...unitAt("bug", "infantry", { x: 1, y: 0, z: 1 }, { team: "bugs" }),
      hp: 34,
      maxHp: 68,
    };
    // At half HP, her flight rule's threshold, before the phase start marks her.
    expect(movement.canFlee({ ...bug, persona: "broodmother" })).toBe(true);
    // Healthy, she keeps her distance: no exit, even one HP above half.
    expect(movement.canFlee({ ...bug, persona: "broodmother", hp: 35 })).toBe(
      false,
    );
    expect(movement.canFlee({ ...bug, persona: "broodmother", hp: 68 })).toBe(
      false,
    );
    // Marked fleeing, she runs whatever her HP.
    expect(
      movement.canFlee({
        ...bug,
        persona: "broodmother",
        hp: 68,
        fleeing: true,
      }),
    ).toBe(true);
    expect(movement.canFlee({ ...bug, persona: "sovereign" })).toBe(false);
    expect(movement.canFlee({ ...bug, persona: "alpha" })).toBe(false);
    // A save can carry a persona this build does not know.
    expect(movement.canFlee({ ...bug, persona: "unknown" as PersonaId })).toBe(
      false,
    );
    expect(movement.canFlee(bug)).toBe(false);
  });

  it("offers a hurt Jev Broodmother the edge her fallback flight runs for, and a healthy one none", () => {
    // On a 30×30 field anchored at (12, 14): the west edge is 12 tiles
    // off, the nearest by far. Her fallback runs two actions west along
    // row 14 (broodmother-behaviour.test.ts).
    const squad = unitAt("squad", "infantry", { x: 29, y: 0, z: 29 });
    const hurt = motherMission(
      fieldMap(30, 30).build(),
      [squad],
      { x: 12, y: 0, z: 14 },
      { hp: Math.floor(broodmotherHp(1, 0) / 2) },
    );
    const fallback = new BroodmotherBehaviour().choose(
      bugView(hurt.mission),
      hurt.mother.id,
      { rng: new Mulberry32Rng(7), combat: COMBAT_TUNING },
    );
    const run = fallback.find((command) => command.type === MOVE);
    if (run?.type !== MOVE) throw new Error("Expected her to run");
    expect(run.payload.path.at(-1)).toEqual({ x: 2, y: 0, z: 14 });

    const jev = captureJev(hurt.mission, hurt.mother.id, rules);
    expect(jev.state.map_edge_exit).toEqual([{ x: 0, y: 0, z: 14 }]);
    const exit = jev.candidates.find(
      (candidate) => candidate.id === "move_to_map_edge",
    );
    if (exit?.command?.type !== MOVE) throw new Error("Expected the exit");
    // One AP of the same run: straight west along her row.
    const path = exit.command.payload.path;
    expect(path.every((tile) => tile.z === 14)).toBe(true);
    expect(path.map((tile) => tile.x)).toEqual(
      run.payload.path.slice(0, path.length).map((tile) => tile.x),
    );

    // Healthy, she is offered no way out: she keeps her distance first.
    const healthy = motherMission(fieldMap(30, 30).build(), [squad], {
      x: 12,
      y: 0,
      z: 14,
    });
    const calm = captureJev(healthy.mission, healthy.mother.id, rules);
    expect(calm.state).not.toHaveProperty("map_edge_exit");
    expect(calm.candidates.map((candidate) => candidate.id)).not.toContain(
      "move_to_map_edge",
    );
    // Without the bugs' rules, only the flag opens it.
    expect(
      captureJev(hurt.mission, hurt.mother.id, {
        ...rules,
        movement: undefined,
      }).state,
    ).not.toHaveProperty("map_edge_exit");
  });

  it("leashes a Sovereign to her core by her fallback's radii, and nobody else", () => {
    const bug = unitAt(
      "bug",
      "infantry",
      { x: 1, y: 0, z: 1 },
      {
        team: "bugs",
      },
    );
    const { sovereign } = sovereignMission(
      fieldMap(20, 20).build(),
      [],
      { x: 6, y: 0, z: 6 },
      { core: { x: 4, y: 0, z: 7 } },
    );
    expect(movement.leashOf(sovereign)).toEqual({
      core: { x: 4, y: 0, z: 7 },
      radius: SOVEREIGN_TUNING.leashRadius,
    });
    expect(
      movement.leashOf({
        ...sovereign,
        hp: sovereign.maxHp * SOVEREIGN_TUNING.retreatAtHpFraction,
      }),
    ).toEqual({
      core: { x: 4, y: 0, z: 7 },
      radius: SOVEREIGN_TUNING.holdRadius,
    });
    expect(movement.leashOf({ ...sovereign, retreating: true })?.radius).toBe(
      SOVEREIGN_TUNING.holdRadius,
    );
    const { core: _none, ...coreless } = sovereign;
    expect(movement.leashOf(coreless)).toBeUndefined();
    expect(
      movement.leashOf({ ...bug, persona: "broodmother", core: bug.pos }),
    ).toBeUndefined();
  });

  it("offers a Jev Sovereign no move that ends beyond her leash, however near the squad (#1179, bug 6c)", () => {
    // Her block's nearest tile is 6 tiles east of the core; a squad she
    // has spotted stands 16 further east. Unleashed, she would charge.
    const core: TileCoord = { x: 4, y: 0, z: 18 };
    const squad = unitAt("squad", "infantry", { x: 30, y: 0, z: 19 });
    const placed = sovereignMission(
      fieldMap(40, 40).build(),
      [squad],
      { x: 10, y: 0, z: 18 },
      { core },
    );
    const spotted = (mission: TacticalState): TacticalState => ({
      ...mission,
      vision: {
        ...mission.vision,
        bugs: { ...mission.vision.bugs, spotted: ["squad"] },
      },
    });
    const gap = (anchor: TileCoord): number =>
      Math.max(0, anchor.x - core.x, core.x - (anchor.x + 3)) +
      Math.max(0, anchor.z - core.z, core.z - (anchor.z + 3));
    const ends = (candidates: readonly JevCandidate[]) =>
      Object.fromEntries(
        candidates.flatMap((candidate) =>
          candidate.command?.type === MOVE
            ? [[candidate.id, candidate.command.payload.path.at(-1)!]]
            : [],
        ),
      );
    const mission = spotted(placed.mission);
    const leashed = ends(
      captureJev(mission, placed.sovereign.id, rules).candidates,
    );
    const free = ends(
      captureJev(mission, placed.sovereign.id, {
        ...rules,
        movement: undefined,
      }).candidates,
    );
    expect(gap(placed.sovereign.pos)).toBe(6);
    // Unleashed, the charge ends past her leash; leashed, at its edge.
    expect(gap(free["move_to_entity:squad"]!)).toBeGreaterThan(
      SOVEREIGN_TUNING.leashRadius,
    );
    expect(gap(leashed["move_to_entity:squad"]!)).toBe(
      SOVEREIGN_TUNING.leashRadius,
    );
    expect(Object.keys(leashed).length).toBeGreaterThan(1);
    for (const [id, end] of Object.entries(leashed))
      expect([id, gap(end) <= SOVEREIGN_TUNING.leashRadius]).toEqual([
        id,
        true,
      ]);

    // Hurt, she holds within 2 of the core: from 6 out she may only close.
    const hurt = spotted({
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === placed.sovereign.id ? { ...unit, retreating: true } : unit,
      ),
    });
    const holding = ends(
      captureJev(hurt, placed.sovereign.id, rules).candidates,
    );
    expect(holding).not.toHaveProperty("move_to_entity:squad");
    expect(holding).not.toHaveProperty("move_east");
    expect(holding).toHaveProperty("move_west");
    for (const end of Object.values(holding))
      expect(gap(end)).toBeLessThanOrEqual(6);
  });
});
