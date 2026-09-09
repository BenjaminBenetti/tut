import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { BIOME_DEFINITIONS } from "../data/biomes";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import { SurfaceIds } from "../data/surfaces";
import type { GenerationContext } from "../model/generation-pass";
import { MapDraft } from "../model/map-draft";
import type { Prop } from "../model/prop";
import { createDefaultRegistries } from "../service/default-registries";
import { DiagnosticsCollector } from "../service/diagnostics-collector";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { BoundaryFencePass } from "./boundary-fence-pass";

/** A flat yard beside a two-lane trail, with a scattered allocation of panels. */
function fixture(): GenerationContext {
  const draft = new MapDraft(
    32,
    24,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
  for (let x = 0; x < draft.width; x++) {
    for (const z of [10, 11]) {
      draft.setRoad(x, z);
      draft.setGroundSurface(x, z, SurfaceIds.DIRT);
    }
  }
  draft.lots.push({
    id: "yard",
    rect: { x: 7, z: 3, w: 13, d: 6 },
    level: 0,
    frontage: "s",
  });
  for (let i = 0; i < 13; i++)
    draft.addProp("fence", { x: 2 + i * 2, y: 0, z: 21 }, i % 2 === 0 ? 0 : 1);
  draft.addProp("boulder", { x: 12, y: 0, z: 7 });
  return {
    draft,
    registries: createDefaultRegistries(),
    rng: new Mulberry32Rng(917),
    diagnostics: new DiagnosticsCollector().forPass("rural-fences"),
    params: {
      archetype: "settlement",
      width: draft.width,
      depth: draft.depth,
      biome: BIOME_DEFINITIONS.coastal,
      settlement: SETTLEMENT_DEFINITIONS.rural,
      hooks: [],
      slopeShare: 1,
    },
  };
}

/** Sizes of actual collinear, same-height connected components. */
function runSizes(fences: readonly Prop[]): number[] {
  const key = (p: { x: number; y: number; z: number }) =>
    `${p.x},${p.y},${p.z}`;
  const lookup = new Map(fences.map((p) => [key(p.tile), p]));
  const sizes = [];
  for (const p of fences) {
    const dx = p.rotation % 2 === 0 ? 1 : 0,
      dz = 1 - dx;
    const at = (n: number) =>
      lookup.get(
        key({ ...p.tile, x: p.tile.x + n * dx, z: p.tile.z + n * dz }),
      );
    if (at(-1)?.rotation === p.rotation) continue;
    let size = 1;
    while (at(size)?.rotation === p.rotation) size++;
    sizes.push(size);
  }
  return sizes;
}

describe("BoundaryFencePass", () => {
  it("uses the existing allocation for supported, aligned boundaries while preserving other props and the trail", () => {
    const context = fixture();
    const { draft } = context;
    const other = draft.props.filter((p) => p.kind !== "fence");
    new BoundaryFencePass().run(context);
    const fences = draft.props.filter((p) => p.kind === "fence");
    expect(fences).toHaveLength(13);
    expect(runSizes(fences).every((n) => n >= 3 && n <= 10)).toBe(true);
    expect(draft.props.filter((p) => p.kind !== "fence")).toEqual(other);
    for (const p of fences) {
      const { x, z } = p.tile;
      const onYard =
        ([1, 2, 3, 8, 9].includes(z) && x >= 7 && x < 20) ||
        ([5, 6, 7, 19, 20, 21].includes(x) && z >= 3 && z < 9);
      const alongTrail = p.rotation === 0 && [7, 8, 13, 14].includes(z);
      expect(onYard || alongTrail).toBe(true);
    }
    for (let x = 0; x < draft.width; x++)
      for (const z of [10, 11]) {
        expect(draft.propAt({ x, y: 0, z })).toBeUndefined();
        expect(draft.groundSurfaceAt(x, z)).toBe(SurfaceIds.DIRT);
      }
  });

  it("keeps door approaches, connectors and potential slope corners free", () => {
    const context = fixture();
    const { draft } = context;
    draft.buildings.push({
      id: "house",
      kind: "house",
      footprint: [],
      groundLevel: 0,
      floors: [],
      roof: { kind: "pitched", walkable: false },
      entrances: [{ tile: { x: 14, y: 0, z: 7 }, side: "s" }],
      connectorIds: [],
    });
    draft.addConnector("ramp", { x: 7, y: 0, z: 5 }, { x: 6, y: 2, z: 5 });
    // Outer corners can slope even without a higher orthogonal neighbour.
    draft.markNaturalEdge(19, 5);
    new BoundaryFencePass().run(context);
    for (let x = 13; x <= 15; x++)
      for (let z = 7; z <= 9; z++)
        expect(draft.propAt({ x, y: 0, z })?.kind).not.toBe("fence");
    for (const tile of [
      { x: 7, y: 0, z: 5 },
      { x: 19, y: 0, z: 5 },
    ])
      expect(draft.propAt(tile)).toBeUndefined();
    const fences = draft.props.filter((p) => p.kind === "fence");
    expect(fences.length).toBeGreaterThan(0);
    expect(runSizes(fences).every((n) => n >= 3)).toBe(true);
  });

  it("does not place an isolated remainder or manufacture a boundary without a trail or plot", () => {
    const context = fixture();
    context.draft.lots.length = 0;
    for (let x = 0; x < context.draft.width; x++)
      for (const z of [10, 11]) context.draft.setRoad(x, z, false);
    new BoundaryFencePass().run(context);
    expect(context.draft.props.filter((p) => p.kind === "fence")).toEqual([]);
    expect(context.draft.props.map((p) => p.kind)).toEqual(["boulder"]);
  });

  it.each(["town", "city"] as const)(
    "arranges %s panels along existing boundaries while preserving other props",
    (settlement) => {
      const context = fixture();
      const original = context.draft.props.filter((p) => p.kind !== "fence");
      new BoundaryFencePass().run({
        ...context,
        params: {
          ...context.params,
          settlement: SETTLEMENT_DEFINITIONS[settlement],
        },
      });
      const fences = context.draft.props.filter((p) => p.kind === "fence");
      expect(fences).toHaveLength(13);
      expect(runSizes(fences).every((n) => n >= 3 && n <= 10)).toBe(true);
      expect(context.draft.props.filter((p) => p.kind !== "fence")).toEqual(
        original,
      );
    },
  );

  it.each([
    { settlement: "city", seed: "mc-opening-03" },
    { settlement: "town", seed: "mc-resume-02" },
  ] as const)(
    "removes single-panel fragments from the reported $settlement map",
    ({ settlement, seed }) => {
      const map = generateTacticalMap({
        seed,
        params: {
          archetype: "settlement",
          biome: "coastal",
          settlement,
          size: "medium",
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare: 1,
        },
      });
      const fences = map.props.filter((p) => p.kind === "fence");
      expect(fences.length).toBeGreaterThan(0);
      expect(runSizes(fences).every((n) => n >= 3 && n <= 10)).toBe(true);
    },
  );

  it("keeps the reported map's fence layout independent of the visual slope knob", () => {
    const maps = [0, 1].map((slopeShare) =>
      generateTacticalMap({
        seed: "mc-opening-01",
        params: {
          archetype: "settlement",
          biome: "coastal",
          settlement: "rural",
          size: "small",
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare,
        },
      }),
    );
    const fences = maps.map((m) => m.props.filter((p) => p.kind === "fence"));
    expect(fences[0]).toEqual(fences[1]);
    // The #911 landing reservation changes this seed's available fence allocation.
    expect(fences[0]).toHaveLength(15);
    expect(runSizes(fences[0]!).every((n) => n >= 3)).toBe(true);
    for (const p of fences[1]!)
      expect(
        maps[1]!.tiles.find(
          (t) => t.x === p.tile.x && t.y === p.tile.y && t.z === p.tile.z,
        )?.slope,
      ).toBeUndefined();
  });
});
