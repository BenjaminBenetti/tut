import type { LineSegments, Material } from "three";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import { describe, expect, it } from "vitest";

import { SETTLEMENT_DISPLAY_TUNING } from "../data/settlement-display-tuning";
import {
  SETTLEMENT_EDGES_NAME,
  SettlementDisplayLook,
} from "./settlement-display-look";

// ===========================================
// Fixtures
// ===========================================

/** A mesh with one authored material named after a palette token, as the GLB loader yields. */
function primitive(token: string): Mesh {
  const material = new MeshStandardMaterial({ name: token });
  const mesh = new Mesh(new BoxGeometry(0.1, 0.2, 0.1), material);
  mesh.name = `prim-${token}`;
  return mesh;
}

/** A settlement as parsed: one group, one mesh per authored material. */
function settlement(tokens: readonly string[]): Group {
  const group = new Group();
  group.name = "settlement";
  for (const token of tokens) {
    group.add(primitive(token));
  }
  return group;
}

/** The material a dressed mesh wears, for name and colour checks. */
function materialOf(group: Group, token: string): Material {
  const mesh = group.getObjectByName(`prim-${token}`) as Mesh;
  return mesh.material as Material;
}

/** The edge overlay under a dressed mesh, if any. */
function edgesOf(group: Group, token: string): LineSegments | undefined {
  const mesh = group.getObjectByName(`prim-${token}`) as Mesh;
  return mesh.getObjectByName(SETTLEMENT_EDGES_NAME) as
    | LineSegments
    | undefined;
}

// ===========================================
// Tests
// ===========================================

describe("SettlementDisplayLook (#1155)", () => {
  it("maps every authored token to its display class: bodies dark with edges, windows and beacon unlit, foliage dark without edges", () => {
    const look = new SettlementDisplayLook();
    const model = settlement([
      "env-sand",
      "env-rust",
      "env-window-lit",
      "tdf-orange",
      "tdf-visor",
      "env-foliage",
    ]);
    look.dress("overworld.settlement.middle-eastern.city", model);

    for (const body of ["env-sand", "env-rust"]) {
      const material = materialOf(model, body) as MeshStandardMaterial;
      expect(material.name).toBe("settlement-body");
      expect(material.color.getHex()).toBe(
        SETTLEMENT_DISPLAY_TUNING.bodyColour,
      );
      expect(material.polygonOffset).toBe(true);
      expect(edgesOf(model, body)).toBeDefined();
    }
    // Both bodies share one material, and both edge overlays one material.
    expect(materialOf(model, "env-sand")).toBe(materialOf(model, "env-rust"));
    expect(edgesOf(model, "env-sand")?.material).toBe(
      edgesOf(model, "env-rust")?.material,
    );

    const window = materialOf(model, "env-window-lit") as MeshBasicMaterial;
    expect(window).toBeInstanceOf(MeshBasicMaterial);
    expect(window.color.getHex()).toBe(SETTLEMENT_DISPLAY_TUNING.windowColour);
    expect(edgesOf(model, "env-window-lit")).toBeUndefined();

    const beacon = materialOf(model, "tdf-orange") as MeshBasicMaterial;
    expect(beacon.color.getHex()).toBe(SETTLEMENT_DISPLAY_TUNING.beaconColour);
    expect(edgesOf(model, "tdf-orange")).toBeUndefined();

    const accent = materialOf(model, "tdf-visor") as MeshBasicMaterial;
    expect(accent.color.getHex()).toBe(SETTLEMENT_DISPLAY_TUNING.accentColour);

    const foliage = materialOf(model, "env-foliage") as MeshStandardMaterial;
    expect(foliage.color.getHex()).toBe(
      SETTLEMENT_DISPLAY_TUNING.foliageColour,
    );
    expect(edgesOf(model, "env-foliage")).toBeUndefined();
  });

  it("leaves the egg overlays and every other model as authored", () => {
    const look = new SettlementDisplayLook();
    for (const id of [
      "overworld.settlement-eggs.european.rural",
      "overworld.deployable.sensor-array",
      "bug.swarmer",
    ] as const) {
      const model = settlement(["bug-flesh", "env-metal"]);
      look.dress(id, model);
      expect(materialOf(model, "bug-flesh").name).toBe("bug-flesh");
      expect(materialOf(model, "env-metal").name).toBe("env-metal");
      expect(edgesOf(model, "env-metal")).toBeUndefined();
    }
  });

  it("fades the edges with the zoom: faint at the world zoom, full close in, linear between", () => {
    const look = new SettlementDisplayLook({
      ...SETTLEMENT_DISPLAY_TUNING,
      edgeOpacityFar: 0.1,
      edgeOpacityNear: 0.5,
      edgeFadeFarZoom: 40,
      edgeFadeNearZoom: 140,
    });
    expect(look.edgeOpacity()).toBeCloseTo(0.1);
    look.setZoom(20);
    expect(look.edgeOpacity()).toBeCloseTo(0.1);
    look.setZoom(90);
    expect(look.edgeOpacity()).toBeCloseTo(0.3);
    look.setZoom(500);
    expect(look.edgeOpacity()).toBeCloseTo(0.5);
    // The updatable reads the zoom source each tick.
    let zoom = 40;
    const follower = look.followZoom(() => zoom);
    zoom = 140;
    follower.update(0.016);
    expect(look.edgeOpacity()).toBeCloseTo(0.5);
  });

  it("dresses only the settlements, keyed by id prefix, not the eggs", () => {
    const look = new SettlementDisplayLook();
    const dressed = settlement(["env-concrete"]);
    look.dress("overworld.settlement.north-american.town", dressed);
    expect(materialOf(dressed, "env-concrete").name).toBe("settlement-body");
    const eggs = settlement(["bug-flesh"]);
    look.dress("overworld.settlement-eggs.north-american.town", eggs);
    expect(materialOf(eggs, "bug-flesh").name).toBe("bug-flesh");
  });
});
