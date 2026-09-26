import { describe, expect, it } from "vitest";

import { PassMask } from "../../../mapgen/model/pass-mask";
import { TileIndex } from "../../../mapgen/service/tile-index";
import { SITREP_TUNING } from "../../data/sitrep-tuning";
import type { SporeFogTuning } from "../../model/sitrep-tuning";
import type { TileEffect } from "../../model/tile-effect";
import { unitAt } from "../tactical-fixtures.test-helper";
import { computeVision } from "../vision-service";
import {
  fieldMission,
  fromDeploy,
  keyOf,
  setupCtx,
  sitrepField,
} from "./sitrep-fixtures.test-helper";
import { groundDistance } from "./sitrep-placement";
import { layFog, sporeFogSitrep } from "./spore-fog-sitrep";

/** Four clouds on the 24×24 field (576 / 144). */
const FOG: SporeFogTuning = { ...SITREP_TUNING.sporeFog, tilesPerCloud: 144 };

/** The smoke Spore Fog lays on the field for `seed`. */
function fog(seed = 1, tuning: SporeFogTuning = FOG): readonly TileEffect[] {
  const mission = fieldMission(["spore-fog"]);
  return layFog(mission, mission.map, setupCtx("spore-fog", seed), tuning)
    .effects;
}

/**
 * Groups smoke tiles into clouds: chains of tiles at most `radius` apart.
 * Centres are `spacing` (8) apart and a cloud reaches `radius` (2) from
 * its own, so two clouds' tiles are always more than `radius` apart.
 */
function clouds(smoke: readonly TileEffect[], radius: number): TileEffect[][] {
  const groups: TileEffect[][] = [];
  const left = [...smoke];
  while (left.length > 0) {
    const group = [left.shift()!];
    // Iterating the group while it grows reaches every tile added.
    for (const member of group) {
      for (let j = left.length - 1; j >= 0; j--) {
        if (groundDistance(member.tile, left[j]!.tile) <= radius) {
          group.push(...left.splice(j, 1));
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

describe("sporeFogSitrep", () => {
  it("is a setup hook only", () => {
    const rule = sporeFogSitrep(FOG);
    expect(rule.id).toBe("spore-fog");
    expect(rule.setup).toBeDefined();
    expect(rule.sight).toBeUndefined();
    expect(rule.phaseStep).toBeUndefined();
  });
});

describe("layFog", () => {
  it("lays one radius-2 cloud per 144 tiles here: four clouds of up to 13 smoke tiles", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const smoke = fog(seed);
      const groups = clouds(smoke, FOG.radius);
      expect(groups.length).toBe(4);
      for (const group of groups) {
        expect(group.length).toBeGreaterThanOrEqual(5);
        expect(group.length).toBeLessThanOrEqual(13);
      }
    }
  });

  it("lays ordinary smoke that lasts the sitrep's 16 phases, one effect per tile", () => {
    const smoke = fog();
    expect(smoke.length).toBeGreaterThan(0);
    expect(smoke.every((effect) => effect.kind === "smoke")).toBe(true);
    expect(smoke.every((effect) => effect.phasesLeft === 16)).toBe(true);
    expect(smoke.every((effect) => effect.id.startsWith("effect-"))).toBe(true);
    expect(new Set(smoke.map((effect) => keyOf(effect.tile))).size).toBe(
      smoke.length,
    );
  });

  it("keeps the deploy zone clear, and stays off buildings, water and units", () => {
    const map = sitrepField();
    const index = new TileIndex(map);
    for (let seed = 1; seed <= 40; seed++) {
      for (const effect of fog(seed)) {
        expect(fromDeploy(effect.tile)).toBeGreaterThanOrEqual(
          FOG.deployClearance,
        );
        const tile = index.getAt(effect.tile);
        expect(tile?.buildingId).toBeUndefined();
        expect(tile?.pass).not.toBe(PassMask.NONE);
      }
    }
    const guarded = fieldMission(["spore-fog"], {
      units: [
        ...fieldMission().units,
        unitAt("turret-1", "infantry", { x: 12, y: 0, z: 12 }),
      ],
    });
    for (let seed = 1; seed <= 40; seed++) {
      const smoke = layFog(
        guarded,
        guarded.map,
        setupCtx("spore-fog", seed),
        FOG,
      ).effects;
      expect(smoke.some((effect) => keyOf(effect.tile) === "12,0,12")).toBe(
        false,
      );
    }
  });

  it("is a pure function of its stream", () => {
    expect(fog(3)).toEqual(fog(3));
    expect(fog(3)).not.toEqual(fog(4));
    const mission = fieldMission(["spore-fog"]);
    const before = structuredClone(mission);
    layFog(mission, mission.map, setupCtx("spore-fog", 3), FOG);
    expect(mission).toEqual(before);
  });

  it("keeps any effect already burning and adds after it", () => {
    const lit: TileEffect = {
      id: "effect-99",
      kind: "fire",
      tile: { x: 12, y: 0, z: 12 },
      phasesLeft: 2,
    };
    const mission = fieldMission(["spore-fog"], { effects: [lit] });
    const out = layFog(mission, mission.map, setupCtx("spore-fog"), FOG);
    expect(out.effects[0]).toBe(lit);
    expect(out.effects.length).toBeGreaterThan(1);
  });

  it("gets at least one cloud on a map smaller than a cloud's share, with the shipped tuning", () => {
    const smoke = fog(1, SITREP_TUNING.sporeFog);
    expect(clouds(smoke, SITREP_TUNING.sporeFog.radius).length).toBe(1);
  });

  it("blocks sight through the clouds, as a grenade's smoke does", () => {
    const clear = fieldMission();
    const fogged = { ...clear, effects: fog(5) };
    expect(computeVision(fogged, "tdf").visible.length).toBeLessThanOrEqual(
      computeVision(clear, "tdf").visible.length,
    );
  });
});
