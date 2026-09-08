import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  ShaderLib,
  Texture,
} from "three";
import type { ModelLoader } from "../model/model-loader";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { naturalMaterialField } from "./natural-material-field";
import { NaturalMaterialTransitions } from "./natural-material-transitions";
import { withUnexploredMist } from "./unexplored-fog-material";

/** Adjacent snow/rock and deliberate pavement/water/building/wall boundaries. */
function map(): TacticalMap {
  const surfaces = ["snow", "rock", "sidewalk", "water", "floor", "grass"];
  return {
    version: 2,
    width: 6,
    depth: 1,
    levels: 3,
    recipe: {
      seed: "material-controls",
      params: {
        archetype: "settlement",
        biome: "snowy",
        settlement: "town",
        size: "small",
        hooks: [],
      },
    },
    tiles: surfaces.map((surface, x) => ({
      x,
      y: 0,
      z: 0,
      surface,
      pass: 3,
      walls: x === 5 ? { e: "half" } : {},
      coverProvided: 0 as const,
      blocksLos: false,
      ...(x === 4 ? { buildingId: "house", floorIndex: 0 } : {}),
    })),
    buildings: [],
    props: [],
    connectors: [],
    hooks: {
      deployZones: [],
      objectives: [],
      edgeSpawns: [],
      extraction: {
        id: "exit",
        kind: "extraction",
        tiles: [],
        requiredPass: 3,
      },
    },
  };
}

/** Real shader includes, with the uniform dictionary passed to material hooks. */
function shader(): {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
} {
  return {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
  };
}

describe("natural material contacts", () => {
  it("keeps categorical ground ownership, hard boundaries and the entire map unchanged", () => {
    const source = map();
    const before = JSON.stringify(source);
    const field = naturalMaterialField(source);
    expect([0, 1, 2, 3, 4, 5].map((x) => field[x * 4])).toEqual([
      4, 5, 0, 0, 0, 0,
    ]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("borrows the authored UV region, shares clones and releases only owned resources", async () => {
    const base = new MeshStandardMaterial({ map: new Texture() });
    const geometry = new BoxGeometry(1, 0.05, 1);
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, 0.1 + uv.getX(i) * 0.2, 0.5 + uv.getY(i) * 0.25);
    const prototype = new Group();
    prototype.add(new Mesh(geometry, base));
    const models: ModelLoader = {
      load: () => Promise.resolve(prototype),
      preload: () => Promise.resolve(),
    };
    const transitions = new NaturalMaterialTransitions(map());
    await transitions.prepare(models);
    const material = transitions.material(base, "snow");
    expect(material).not.toBe(base);
    expect(transitions.material(base, "snow")).toBe(material);
    expect(transitions.material(base, "sidewalk")).toBe(base);
    const compiled = shader();
    material.onBeforeCompile(compiled as never, {} as never);
    const regions = compiled.uniforms.uNaturalUv!.value as {
      x: number;
      y: number;
      z: number;
      w: number;
    }[];
    expect(regions[3]!.x).toBeCloseTo(0.1);
    expect(regions[3]!.w).toBeCloseTo(0.75);
    const owned = vi.spyOn(material, "dispose");
    const borrowed = vi.spyOn(base, "dispose");
    const texture = vi.spyOn(base.map!, "dispose");
    transitions.dispose();
    expect(owned).toHaveBeenCalledOnce();
    expect(borrowed).not.toHaveBeenCalled();
    expect(texture).not.toHaveBeenCalled();
    geometry.dispose();
    base.map!.dispose();
    base.dispose();
  });

  it("composes with existing hooks and unexplored mist while retaining instance vision tint", () => {
    const base = new MeshStandardMaterial({
      color: 0xe8ecf0,
      map: new Texture(),
    });
    const before = vi.fn();
    base.onBeforeCompile = before;
    base.customProgramCacheKey = () => "existing-hook";
    const transitions = new NaturalMaterialTransitions(map());
    const material = transitions.material(base, "snow");
    const mist = withUnexploredMist(material);
    const compiled = shader();
    mist.onBeforeCompile(compiled as never, {} as never);
    expect(before).toHaveBeenCalledOnce();
    expect(compiled.fragmentShader).toContain("#include <color_fragment>");
    expect(compiled.fragmentShader).toContain("naturalAlbedo()");
    expect(compiled.fragmentShader).toContain("uMistStrength");
    expect(compiled.fragmentShader).toContain("textureGrad(map");
    expect(compiled.vertexShader).toContain("instanceMatrix * naturalPosition");
    expect(mist.customProgramCacheKey()).toContain(
      "existing-hook:natural-material-contacts-v1:unexplored-mist",
    );
    expect(base).toHaveProperty("onBeforeCompile", before);
    mist.dispose();
    transitions.dispose();
    base.dispose();
  });
});
