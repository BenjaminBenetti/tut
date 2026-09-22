import { describe, expect, it } from "vitest";
import {
  buildEntityCase,
  entityCaseDefinitions,
} from "./navigation-entities.mjs";
import {
  entityChoicePage,
  moveTowardEntity,
  sharedCapabilities,
} from "./navigation-entity-choice.mjs";
import { applyMove, remaining, RULES } from "./navigation-cases.mjs";
import { captureJev } from "../../src/tactical/ai/jev-request.ts";
import { unitFootprintTiles } from "../../src/tactical/service/footprint-service.ts";

/** Use the same faction-filtered metadata projection as the live game inspector. */
function snapshotOf(world) {
  return captureJev(
    world.mission,
    world.mission.units[0].id,
    RULES,
    world.prompts,
    world.names,
  );
}

describe("100-entity navigation evaluation", () => {
  it.each(["small", "large"])(
    "preserves all occupied footprints and reaches the target in optimal one-AP moves on %s",
    (size) => {
      const definition = entityCaseDefinitions("pilot").find(
        (item) => item.size === size && item.orderKind === "named-hostile",
      );
      const world = buildEntityCase(definition, "full");
      expect(world.mission.units).toHaveLength(101);
      const positions = world.mission.units.flatMap((unit) =>
        unitFootprintTiles(world.mission, unit).map((pos) =>
          world.graph.index.keyOf(pos),
        ),
      );
      expect(new Set(positions).size).toBe(positions.length);
      expect(
        world.metadata.roster.some((entity) => entity.footprint === 2),
      ).toBe(true);
      let mission = world.mission;
      let moves = 0;
      while (
        remaining(world, mission.units[0].pos) &&
        moves <= world.optimalAp
      ) {
        const routed = moveTowardEntity(mission, world.goal.id, world.movement);
        mission = applyMove(world, mission, routed.candidate);
        expect(mission.units.slice(1)).toEqual(world.mission.units.slice(1));
        moves++;
      }
      expect(remaining(world, mission.units[0].pos)).toBe(0);
      expect(moves).toBe(world.optimalAp);
      expect(moveTowardEntity(mission, world.goal.id, world.movement)).toEqual({
        arrived: true,
      });
    },
  );

  it.each(["named-ally", "named-hostile", "equipment", "commander"])(
    "offers all 100 entities and an unambiguous %s order without leaking scoring distances",
    (orderKind) => {
      const world = buildEntityCase(
        entityCaseDefinitions("pilot").find(
          (item) => item.size === "small" && item.orderKind === orderKind,
        ),
        "full",
      );
      const snapshot = snapshotOf(world);
      expect(snapshot.state.entities).toHaveLength(100);
      const byId = new Map(
        snapshot.state.entities.map((entity) => [entity.id, entity]),
      );
      const target = byId.get(world.goal.id);
      if (orderKind === "equipment") {
        expect(
          snapshot.state.entities.filter(
            (entity) =>
              entity.type === "Radio Squad" &&
              entity.equipment_remaining?.["radar-dish"] === 1,
          ),
        ).toEqual([target]);
      } else if (orderKind === "commander") {
        const medics = snapshot.state.entities.filter(
          (entity) => entity.type === "Medic Squad",
        );
        expect(
          medics.filter(
            (entity) =>
              entity.hp === Math.min(...medics.map((medic) => medic.hp)),
          ),
        ).toEqual([target]);
        expect(world.prompts.entity).not.toContain(target.name);
        expect(world.prompts.commander).not.toBe("");
      } else {
        expect(world.prompts.entity).toContain(target.name);
        expect(target.relationship).toBe(
          orderKind === "named-ally" ? "friendly" : "hostile",
        );
      }
      for (const variant of ["entities-inline", "entities-shared"]) {
        const page = entityChoicePage(variant, snapshot, world);
        expect(Object.keys(page.request.questions.action.criteria)).toEqual(
          world.choiceOrder,
        );
        expect(page.request.state.entities.map((entity) => entity.id)).toEqual(
          world.entityOrder,
        );
        expect(page.request.state.actor).toEqual(snapshot.state.actor);
        expect(page.request.state).not.toHaveProperty("goal");
        expect(page.request.state).not.toHaveProperty("navigation");
        expect(JSON.stringify(page.request)).not.toContain("optimalAp");
        expect(JSON.stringify(page.request)).not.toContain("distance");
      }
      expect(
        snapshot.state.entities.filter((entity) => entity.faction === "bugs"),
      ).toHaveLength(40);
      for (const enemy of snapshot.state.entities.filter(
        (entity) => entity.faction === "bugs",
      )) {
        expect(enemy).not.toHaveProperty("ap");
        expect(enemy).not.toHaveProperty("charges");
      }
    },
  );

  it("shared capability references preserve every production field, including per-entity condition", () => {
    const world = buildEntityCase(entityCaseDefinitions("pilot")[0], "full");
    const entities = snapshotOf(world).state.entities;
    const factored = sharedCapabilities(entities);
    expect(Object.keys(factored.capabilities).length).toBeLessThan(
      entities.length,
    );
    const expanded = factored.entities.map(({ capability_ref, ...record }) => ({
      ...record,
      ...factored.capabilities[capability_ref],
    }));
    expect(expanded).toEqual(entities);
    expect(JSON.stringify(factored).length).toBeLessThan(
      JSON.stringify(entities).length,
    );
  });

  it("rejects a fog setup that would falsely expose 100 enemy-inclusive targets", () => {
    expect(() =>
      buildEntityCase(entityCaseDefinitions("pilot")[0], "fog"),
    ).toThrow("fully visible");
  });
});
