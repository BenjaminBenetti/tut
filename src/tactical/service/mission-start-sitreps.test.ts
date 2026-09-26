import { describe, expect, it } from "vitest";

import { TileIndex } from "../../mapgen/service/tile-index";
import { SITREP_TUNING } from "../data/sitrep-tuning";
import type { TacticalState } from "../model/tactical-state";
import {
  fromDeploy,
  keyOf,
  playerPhaseOf,
  started,
} from "./mission-start-sitreps.test-helper";
import { nightSight } from "./sitreps/nightfall-sitrep";
import { sightRangeOf } from "./vision-service";

// ===========================================
// Tests
// ===========================================

describe("startTacticalMission with sitreps (campaign arc §11)", () => {
  const plain = started();

  it("copies the offer's sitreps, and leaves a mission without any unchanged", () => {
    expect(plain.sitreps).toBeUndefined();
    expect(plain.effects).toEqual([]);
    expect(started(["nightfall", "local-guides"]).sitreps).toEqual([
      "nightfall",
      "local-guides",
    ]);
  });

  it("Nightfall: every unit sees four less, and the squad sees less ground", () => {
    const night = started(["nightfall"]);
    expect(night.units.map((u) => u.id)).toEqual(plain.units.map((u) => u.id));
    for (const unit of night.units) {
      const day = night.templates[unit.templateId]!.sightRange;
      expect(sightRangeOf(night, unit)).toBe(
        nightSight(day, SITREP_TUNING.nightfall),
      );
      expect(sightRangeOf(night, unit)).toBeLessThan(day);
    }
    expect(night.vision.tdf.visible.length).toBeLessThan(
      plain.vision.tdf.visible.length,
    );
  });

  it("Spore Fog: long-lived smoke on open ground, the deploy zone clear, nothing else moved", () => {
    const fog = started(["spore-fog"]);
    const smoke = fog.effects;
    // Small map: 2304 tiles at 576 a cloud, four clouds of up to 13.
    expect(smoke.length).toBeGreaterThanOrEqual(4);
    expect(smoke.length).toBeLessThanOrEqual(4 * 13);
    for (const effect of smoke) {
      expect(effect.kind).toBe("smoke");
      expect(effect.phasesLeft).toBe(SITREP_TUNING.sporeFog.phases);
      expect(fromDeploy(fog, effect.tile)).toBeGreaterThanOrEqual(
        SITREP_TUNING.sporeFog.deployClearance,
      );
    }
    expect(fog.units).toEqual(plain.units);
    expect(fog.spawners).toEqual(plain.spawners);
    expect(fog.carcasses).toEqual(plain.carcasses);
  });

  it("City Ablaze: fire at the start, out by turn 3, and burning again on turn 4", () => {
    const ablaze = started(["city-ablaze"]);
    const sites = (ablaze.blazeSites ?? []).map(keyOf);
    // Small map: clamped to two blazes of up to five tiles.
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(sites.length).toBeLessThanOrEqual(10);
    expect(ablaze.effects.map((e) => keyOf(e.tile))).toEqual(sites);
    expect(ablaze.effects.every((e) => e.kind === "fire")).toBe(true);
    const objectives = [
      ...ablaze.map.hooks.objectives.flatMap((hook) => hook.tiles),
      ...ablaze.spawners.map((spawner) => spawner.pos),
    ];
    for (const effect of ablaze.effects) {
      expect(fromDeploy(ablaze, effect.tile)).toBeGreaterThanOrEqual(
        SITREP_TUNING.cityAblaze.deployClearance,
      );
      for (const point of objectives) {
        expect(
          Math.abs(point.x - effect.tile.x) + Math.abs(point.z - effect.tile.z),
        ).toBeGreaterThanOrEqual(SITREP_TUNING.cityAblaze.objectiveClearance);
      }
    }
    const burning = (m: TacticalState) =>
      m.effects.filter((e) => e.kind === "fire").map((e) => keyOf(e.tile));
    expect(burning(playerPhaseOf(ablaze, 2))).toEqual(sites);
    expect(burning(playerPhaseOf(ablaze, 3))).toEqual([]);
    expect(burning(playerPhaseOf(ablaze, 4))).toEqual(sites);
    expect(burning(playerPhaseOf(ablaze, 6))).toEqual([]);
    expect(burning(playerPhaseOf(ablaze, 7))).toEqual(sites);
    // A mission without the sitrep never relights anything.
    expect(playerPhaseOf(plain, 4).effects).toEqual([]);
  });

  it("Salvage Rich: two more carcasses than the offer placed, priced by difficulty", () => {
    const salvage = started(["salvage-rich"]);
    expect(salvage.carcasses).toHaveLength(plain.carcasses.length + 2);
    for (const carcass of salvage.carcasses.slice(plain.carcasses.length)) {
      expect(carcass.techPoints).toBe(10 + 2 * 2);
      expect(fromDeploy(salvage, carcass.pos)).toBeGreaterThanOrEqual(
        SITREP_TUNING.salvageRich.minFromDeploy,
      );
    }
  });

  it("Local Guides: every tile explored, while sight and spotting stay as they were", () => {
    const guided = started(["local-guides"]);
    const index = new TileIndex(guided.map);
    expect(guided.vision.tdf.explored).toHaveLength(guided.map.tiles.length);
    expect(new Set(guided.vision.tdf.explored)).toEqual(
      new Set(guided.map.tiles.map((t) => index.keyOf(t))),
    );
    expect(plain.vision.tdf.explored.length).toBeLessThan(
      guided.map.tiles.length,
    );
    expect(guided.vision.tdf.visible).toEqual(plain.vision.tdf.visible);
    expect(guided.vision.tdf.spotted).toEqual(plain.vision.tdf.spotted);
    expect(guided.vision.bugs).toEqual(plain.vision.bugs);
  });

  it("is deterministic, and one sitrep never moves another's draws", () => {
    expect(started(["spore-fog", "salvage-rich"])).toEqual(
      started(["spore-fog", "salvage-rich"]),
    );
    const fogOnly = started(["spore-fog"]);
    const both = started(["spore-fog", "city-ablaze"]);
    expect(both.effects.filter((e) => e.kind === "smoke")).toEqual(
      fogOnly.effects,
    );
    const salvageOnly = started(["salvage-rich"]);
    const withNight = started(["nightfall", "salvage-rich"]);
    expect(withNight.carcasses).toEqual(salvageOnly.carcasses);
  });

  it("stands the garrison before the sitreps, so no sitrep moves a turret", () => {
    const turrets = (m: TacticalState) =>
      m.units.filter((u) => u.kind === "turret").map((u) => keyOf(u.pos));
    expect(turrets(plain)).toHaveLength(2);
    for (const id of ["spore-fog", "city-ablaze", "salvage-rich"] as const) {
      const mission = started([id]);
      expect(turrets(mission)).toEqual(turrets(plain));
      const onTurret = mission.effects.some((e) =>
        turrets(plain).includes(keyOf(e.tile)),
      );
      expect(onTurret).toBe(false);
    }
  });
});
