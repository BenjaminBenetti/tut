import { describe, expect, it } from "vitest";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { YARD_ARRANGEMENTS } from "../data/yard-arrangements";
import type { KnownBuildingKindId } from "../data/building-kind-ids";
import type { MapRecipe } from "../model/map-recipe";
import type { Prop } from "../model/prop";
import { createDefaultRegistries } from "../service/default-registries";
import { freezeDraft } from "../service/draft-freezer";
import { validateTacticalMap } from "../service/map-validator";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { createSettlementPasses } from "../service/settlement-pipeline";
import { TileIndex } from "../service/tile-index";
import { allows, PassMask } from "../model/pass-mask";

/** Full pipeline pair, with only the new arrangement omitted in the control. */
function pair(seed: string, settlement: "city" | "rural") {
  const recipe: MapRecipe = {
    seed,
    params: {
      archetype: "settlement",
      biome: "temperate",
      settlement,
      size: "medium",
      hooks: DEFAULT_MISSION_HOOKS,
      slopeShare: 1,
    },
  };
  const registries = createDefaultRegistries();
  const run = (arranged: boolean) => {
    const passes = createSettlementPasses().filter(
      (p) => arranged || p.id !== "yard-arrangements",
    );
    const result = new PipelineMapGenerator(passes, registries).run(
      recipe.params,
      new Mulberry32Rng(hashSeed(seed)),
    );
    const map = freezeDraft(result.draft, recipe, registries);
    expect(validateTacticalMap(map, registries)).toEqual([]);
    return { ...result, map };
  };
  return { before: run(false), after: run(true) };
}

/** Only the attributed generic yard allocation can fund a new group. */
function funded(p: Prop, yardIds: ReadonlySet<string>): boolean {
  return yardIds.has(p.id) && ["crate", "sandbags", "barrier"].includes(p.kind);
}

describe("building-use yards", () => {
  for (const seed of ["mc-resume-01", "mc-opening-02"]) {
    it(`${seed}: supplies domestic seating without moving terrain, fences or other prop placements`, () => {
      const { before, after } = pair(seed, "city");
      expect(before.map.props.some((p) => p.kind === "bench")).toBe(false);
      expect(
        after.map.props.filter((p) => p.kind === "bench").length,
      ).toBeGreaterThan(0);
      const mutable = before.map.props.filter((p) =>
        funded(p, before.draft.yardPropIds),
      );
      const other = before.map.props.filter(
        (p) => !funded(p, before.draft.yardPropIds),
      );
      const oldIds = new Set(before.map.props.map((p) => p.id));
      const replacements = after.map.props.filter((p) => !oldIds.has(p.id));
      expect(replacements.length).toBeLessThanOrEqual(mutable.length);
      expect(
        replacements.every((p) => p.kind === "bench" || p.kind === "crate"),
      ).toBe(true);
      const otherIds = new Set(other.map((p) => p.id));
      expect(after.map.props.filter((p) => otherIds.has(p.id))).toEqual(other);
      expect(after.map.buildings).toEqual(before.map.buildings);
      expect(after.map.connectors).toEqual(before.map.connectors);
      expect(after.draft.roads).toEqual(before.draft.roads);
      expect(
        after.map.tiles.map(
          ({
            pass: _pass,
            propId: _prop,
            coverProvided: _cover,
            blocksLos: _los,
            ...tile
          }) => tile,
        ),
      ).toEqual(
        before.map.tiles.map(
          ({
            pass: _pass,
            propId: _prop,
            coverProvided: _cover,
            blocksLos: _los,
            ...tile
          }) => tile,
        ),
      );
      const index = new TileIndex(after.map);
      // Renderer quarter-turns are negative Y: authored +Z faces W after one turn.
      const offsets = [
        { x: 0, z: 1 },
        { x: -1, z: 0 },
        { x: 0, z: -1 },
        { x: 1, z: 0 },
      ];
      for (const prop of replacements) {
        const d = offsets[prop.rotation]!;
        const front = index.get(
          prop.tile.x + d.x,
          prop.tile.y,
          prop.tile.z + d.z,
        );
        expect(front?.buildingId).toBeUndefined();
        expect(allows(front?.pass ?? 0, PassMask.INFANTRY)).toBe(true);
        expect(front?.naturalEdge).toBeUndefined();
        const rear = index.get(
          prop.tile.x - d.x,
          prop.tile.y,
          prop.tile.z - d.z,
        );
        const building = after.map.buildings.find(
          (b) => b.id === rear?.buildingId,
        );
        expect(building).toBeDefined();
        expect(
          YARD_ARRANGEMENTS[building!.kind as KnownBuildingKindId].prop,
        ).toBe(prop.kind);
      }
    });
  }
  it("keeps the complete already-contextual rural map unchanged", () => {
    const { before, after } = pair("mc-opening-01", "rural");
    expect(after.map).toEqual(before.map);
  });
});
