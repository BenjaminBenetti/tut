import { describe, expect, it } from "vitest";
import { captureJev, jevChoicePage } from "./jev-request";
import { jevPerception } from "./jev-observation";
import {
  missionWith,
  openField,
  unitAt,
  walledField,
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

describe("Jev observation", () => {
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
    expect(bug.candidates.map((candidate) => candidate.id)).toEqual(["finish"]);
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
        category: "move",
        description: `Destination ${String(index)}`,
      }),
    );
    const first = jevChoicePage(snapshot, candidates);
    expect(
      Object.keys(first.request.questions.action!.criteria).length,
    ).toBeLessThanOrEqual(255);
    const all = Object.values(first.groups!).flat();
    expect(all).toEqual(candidates);
    for (const group of Object.values(first.groups!))
      expect(
        Object.keys(
          jevChoicePage(snapshot, group).request.questions.action!.criteria,
        ).length,
      ).toBeLessThanOrEqual(255);
  });
});
