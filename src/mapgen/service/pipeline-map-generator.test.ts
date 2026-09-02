import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapGenParams } from "../model/map-recipe";
import { createDefaultRegistries } from "./default-registries";
import {
  PipelineMapGenerator,
  validatePipeline,
} from "./pipeline-map-generator";

const registries = createDefaultRegistries();

const PARAMS: MapGenParams = {
  archetype: "settlement",
  biome: "desert",
  settlement: "town",
  size: "small",
  hooks: [],
};

function pass(
  id: string,
  requires: DraftCapability[],
  provides: DraftCapability[],
  run: (context: GenerationContext) => void = () => undefined,
): GenerationPass {
  return { id, requires, provides, run };
}

function rng(seed = "pipeline"): Mulberry32Rng {
  return new Mulberry32Rng(hashSeed(seed));
}

describe("validatePipeline", () => {
  it("accepts an ordered pipeline", () => {
    expect(() =>
      validatePipeline([
        pass("terrain", [], ["heightmap"]),
        pass("roads", ["heightmap"], ["roads"]),
        pass("lots", ["heightmap", "roads"], ["lots"]),
      ]),
    ).not.toThrow();
  });

  it("names the pass and the missing capability", () => {
    expect(() =>
      validatePipeline([
        pass("roads", ["heightmap"], ["roads"]),
        pass("terrain", [], ["heightmap"]),
      ]),
    ).toThrow(
      'Pass "roads" requires "heightmap" but no earlier pass provides it',
    );
  });

  it("rejects duplicate pass ids since they would share an RNG stream", () => {
    expect(() =>
      validatePipeline([
        pass("a", [], ["heightmap"]),
        pass("a", [], ["roads"]),
      ]),
    ).toThrow('two passes with id "a"');
  });
});

describe("PipelineMapGenerator", () => {
  it("validates at construction, before any pass runs", () => {
    let ran = false;
    expect(
      () =>
        new PipelineMapGenerator(
          [
            pass("late", ["roads"], [], () => {
              ran = true;
            }),
          ],
          registries,
        ),
    ).toThrow(/requires "roads"/);
    expect(ran).toBe(false);
  });

  it("runs passes in order on one shared draft with resolved params", () => {
    const order: string[] = [];
    const generator = new PipelineMapGenerator(
      [
        pass("terrain", [], ["heightmap"], (ctx) => {
          order.push("terrain");
          ctx.draft.setGroundLevel(0, 0, 2);
          expect(ctx.params.biome.id).toBe("desert");
          expect(ctx.params.width).toBe(32);
        }),
        pass("roads", ["heightmap"], ["roads"], (ctx) => {
          order.push("roads");
          expect(ctx.draft.groundLevelAt(0, 0)).toBe(2);
          ctx.draft.setRoad(0, 0);
        }),
      ],
      registries,
    );
    const result = generator.run(PARAMS, rng());
    expect(order).toEqual(["terrain", "roads"]);
    expect(result.draft.isRoad(0, 0)).toBe(true);
    expect(result.params.settlement.id).toBe("town");
    expect(generator.passIds).toEqual(["terrain", "roads"]);
  });

  it("gives each pass a labelled fork so other passes do not disturb it", () => {
    const draws = new Map<string, number[]>();
    const recorder = (id: string): GenerationPass =>
      pass(id, [], [], (ctx) => {
        draws.set(id, [ctx.rng.next(), ctx.rng.next(), ctx.rng.next()]);
      });
    const noisy = pass("noisy", [], [], (ctx) => {
      for (let i = 0; i < 17; i++) {
        ctx.rng.next();
      }
    });

    new PipelineMapGenerator([recorder("a"), recorder("b")], registries).run(
      PARAMS,
      rng(),
    );
    const before = { a: draws.get("a"), b: draws.get("b") };
    draws.clear();

    new PipelineMapGenerator(
      [recorder("b"), noisy, recorder("a")],
      registries,
    ).run(PARAMS, rng());
    expect(draws.get("a")).toEqual(before.a);
    expect(draws.get("b")).toEqual(before.b);
    expect(before.a).not.toEqual(before.b);
  });

  it("is deterministic for a seed and differs across seeds", () => {
    const generator = new PipelineMapGenerator(
      [
        pass("terrain", [], ["heightmap"], (ctx) => {
          for (let z = 0; z < ctx.draft.depth; z++) {
            for (let x = 0; x < ctx.draft.width; x++) {
              ctx.draft.setGroundLevel(x, z, ctx.rng.nextInt(0, 3));
            }
          }
        }),
      ],
      registries,
    );
    const heights = (seed: string): number[] => {
      const { draft } = generator.run(PARAMS, rng(seed));
      const out: number[] = [];
      for (let z = 0; z < draft.depth; z++) {
        for (let x = 0; x < draft.width; x++) {
          out.push(draft.groundLevelAt(x, z));
        }
      }
      return out;
    };
    expect(heights("one")).toEqual(heights("one"));
    expect(heights("one")).not.toEqual(heights("two"));
  });

  it("collects notes and timings per pass", () => {
    let now = 100;
    const generator = new PipelineMapGenerator(
      [
        pass("terrain", [], ["heightmap"], (ctx) => {
          ctx.diagnostics.note("flattened", { x: 1, y: 0, z: 2 });
          now += 5;
        }),
        pass("roads", ["heightmap"], ["roads"], (ctx) => {
          ctx.diagnostics.note("one trail");
          now += 2;
        }),
      ],
      registries,
      { clock: () => now },
    );
    const { diagnostics } = generator.run(PARAMS, rng());
    expect(diagnostics.notes).toEqual([
      { pass: "terrain", message: "flattened", at: { x: 1, y: 0, z: 2 } },
      { pass: "roads", message: "one trail" },
    ]);
    expect(diagnostics.timings).toEqual([
      { pass: "terrain", durationMs: 5 },
      { pass: "roads", durationMs: 2 },
    ]);
  });

  it("fails loudly on a bad recipe before running", () => {
    let ran = false;
    const generator = new PipelineMapGenerator(
      [
        pass("terrain", [], ["heightmap"], () => {
          ran = true;
        }),
      ],
      registries,
    );
    expect(() =>
      generator.run({ ...PARAMS, size: { width: 4, depth: 4 } }, rng()),
    ).toThrow(/Map width/);
    expect(ran).toBe(false);
  });

  it("uses a fresh id generator per run", () => {
    const generator = new PipelineMapGenerator(
      [
        pass("props", [], ["props"], (ctx) => {
          ctx.draft.addProp("crate", { x: 0, y: 0, z: 0 });
        }),
      ],
      registries,
    );
    const first = generator.run(PARAMS, rng()).draft.props[0]?.id;
    const second = generator.run(PARAMS, rng()).draft.props[0]?.id;
    expect(first).toBe("prop-1");
    expect(second).toBe("prop-1");
  });
});
