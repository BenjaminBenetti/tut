import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { PassMask } from "../../../mapgen/model/pass-mask";
import { TileIndex } from "../../../mapgen/service/tile-index";
import { HAZARD_TUNING } from "../../data/hazard-tuning";
import { SITREP_TUNING } from "../../data/sitrep-tuning";
import type { CityAblazeTuning } from "../../model/sitrep-tuning";
import type { TacticalState } from "../../model/tactical-state";
import type { TileEffect } from "../../model/tile-effect";
import { unitAt } from "../tactical-fixtures.test-helper";
import {
  cityAblazeSitrep,
  isRekindleTurn,
  rekindle,
  setAblaze,
} from "./city-ablaze-sitrep";
import {
  EXTRACTION,
  fieldMission,
  fromDeploy,
  keyOf,
  NEST,
  setupCtx,
  sitrepField,
} from "./sitrep-fixtures.test-helper";
import { groundDistance, nearestDistance } from "./sitrep-placement";

/** Three blazes on the 24×24 field, spaced so they fit. */
const BLAZE: CityAblazeTuning = {
  ...SITREP_TUNING.cityAblaze,
  tilesPerBlaze: 192,
  spacing: 6,
};

/** The mission after City Ablaze's setup for `seed`. */
function ablaze(seed = 1, tuning: CityAblazeTuning = BLAZE): TacticalState {
  const mission = fieldMission(["city-ablaze"]);
  return setAblaze(
    mission,
    mission.map,
    setupCtx("city-ablaze", seed),
    tuning,
    HAZARD_TUNING,
  );
}

/** A phase context for the rekindle step. */
function phaseCtx() {
  return { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };
}

describe("cityAblazeSitrep", () => {
  it("has a setup and a phase step, and no sight hook", () => {
    const rule = cityAblazeSitrep(BLAZE, HAZARD_TUNING);
    expect(rule.id).toBe("city-ablaze");
    expect(rule.setup).toBeDefined();
    expect(rule.phaseStep).toBeDefined();
    expect(rule.sight).toBeUndefined();
  });
});

describe("setAblaze", () => {
  it("lights up to five fire tiles per blaze, on the hazard tuning's clock, and records them", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const out = ablaze(seed);
      const fire = out.effects;
      // 576 tiles at 192 a blaze: three blazes of one to five tiles.
      expect(fire.length).toBeGreaterThanOrEqual(3);
      expect(fire.length).toBeLessThanOrEqual(15);
      expect(fire.every((effect) => effect.kind === "fire")).toBe(true);
      expect(
        fire.every(
          (effect) => effect.phasesLeft === HAZARD_TUNING.effects.fire.duration,
        ),
      ).toBe(true);
      expect(out.blazeSites?.map(keyOf)).toEqual(
        fire.map((effect) => keyOf(effect.tile)),
      );
    }
  });

  it("clamps the count: at least two on a small share, at most four on a large one", () => {
    // 576 tiles at 1728 a blaze rounds to 0, clamped to 2.
    const few = ablaze(1, { ...SITREP_TUNING.cityAblaze, spacing: 6 });
    expect(few.effects.length).toBeLessThanOrEqual(10);
    expect(few.effects.length).toBeGreaterThan(5);
    // 576 tiles at 48 a blaze rounds to 12, clamped to 4.
    const many = ablaze(1, { ...BLAZE, tilesPerBlaze: 48, spacing: 5 });
    expect(many.effects.length).toBeLessThanOrEqual(20);
  });

  it("keeps the deploy zone, the objectives, the extraction and every unit clear", () => {
    const map = sitrepField();
    const index = new TileIndex(map);
    const guard = unitAt("turret-1", "infantry", { x: 12, y: 0, z: 12 });
    for (let seed = 1; seed <= 40; seed++) {
      const mission = fieldMission(["city-ablaze"], {
        units: [...fieldMission().units, guard],
      });
      const out = setAblaze(
        mission,
        map,
        setupCtx("city-ablaze", seed),
        BLAZE,
        HAZARD_TUNING,
      );
      for (const effect of out.effects) {
        expect(fromDeploy(effect.tile)).toBeGreaterThanOrEqual(
          BLAZE.deployClearance,
        );
        expect(groundDistance(effect.tile, NEST)).toBeGreaterThanOrEqual(
          BLAZE.objectiveClearance,
        );
        expect(nearestDistance(effect.tile, EXTRACTION)).toBeGreaterThanOrEqual(
          BLAZE.objectiveClearance,
        );
        expect(keyOf(effect.tile)).not.toBe(keyOf(guard.pos));
        const tile = index.getAt(effect.tile);
        expect(tile?.buildingId).toBeUndefined();
        expect(tile?.pass).not.toBe(PassMask.NONE);
      }
    }
  });

  it("keeps off tiles another effect already holds", () => {
    const first = ablaze(2);
    const smoke: TileEffect[] = first.effects.map((effect) => ({
      ...effect,
      kind: "smoke",
    }));
    const mission = fieldMission(["city-ablaze"], { effects: smoke });
    const out = setAblaze(
      mission,
      mission.map,
      setupCtx("city-ablaze", 2),
      BLAZE,
      HAZARD_TUNING,
    );
    const smoked = new Set(smoke.map((effect) => keyOf(effect.tile)));
    const lit = out.effects.filter((effect) => effect.kind === "fire");
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.some((effect) => smoked.has(keyOf(effect.tile)))).toBe(false);
  });

  it("is a pure function of its stream", () => {
    expect(ablaze(3)).toEqual(ablaze(3));
    expect(ablaze(3).blazeSites).not.toEqual(ablaze(4).blazeSites);
  });
});

describe("isRekindleTurn", () => {
  it("is the player phase of turns 4, 7, 10 …", () => {
    const turns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((turn) =>
      isRekindleTurn({ turn, phase: "player" }, BLAZE),
    );
    expect(turns).toEqual([4, 7, 10]);
    expect(isRekindleTurn({ turn: 4, phase: "bugs" }, BLAZE)).toBe(false);
  });
});

describe("rekindle", () => {
  it("relights every burned-out site on a rekindle turn, with the full clock", () => {
    const lit = ablaze(5);
    const out = { ...lit, effects: [], turn: 4, phase: "player" as const };
    const relit = rekindle(out, phaseCtx(), BLAZE, HAZARD_TUNING);
    expect(relit.events).toEqual([]);
    expect(relit.state.effects.map((effect) => keyOf(effect.tile))).toEqual(
      lit.blazeSites?.map(keyOf),
    );
    expect(
      relit.state.effects.every(
        (effect) =>
          effect.kind === "fire" &&
          effect.phasesLeft === HAZARD_TUNING.effects.fire.duration,
      ),
    ).toBe(true);
  });

  it("resets a site still burning rather than stacking a second fire", () => {
    const lit = ablaze(5);
    const embers = lit.effects.map((effect) => ({ ...effect, phasesLeft: 1 }));
    const out = { ...lit, effects: embers, turn: 7, phase: "player" as const };
    const relit = rekindle(out, phaseCtx(), BLAZE, HAZARD_TUNING).state;
    expect(relit.effects.map((effect) => effect.id)).toEqual(
      embers.map((effect) => effect.id),
    );
    expect(relit.effects.every((effect) => effect.phasesLeft === 4)).toBe(true);
  });

  it("does nothing off a rekindle turn, or on a mission with no blazes", () => {
    const lit = ablaze(5);
    for (const [turn, phase] of [
      [1, "player"],
      [3, "player"],
      [4, "bugs"],
      [5, "player"],
    ] as const) {
      const out = { ...lit, effects: [], turn, phase };
      expect(rekindle(out, phaseCtx(), BLAZE, HAZARD_TUNING).state).toBe(out);
    }
    const plain = { ...fieldMission(), turn: 4 };
    expect(rekindle(plain, phaseCtx(), BLAZE, HAZARD_TUNING).state).toBe(plain);
  });

  it("leaves a site dark once nothing can stand on it", () => {
    const lit = ablaze(5);
    const [gone, ...rest] = lit.blazeSites ?? [];
    const map = {
      ...lit.map,
      tiles: lit.map.tiles.map((tile) =>
        keyOf(tile) === keyOf(gone!) ? { ...tile, pass: PassMask.NONE } : tile,
      ),
    };
    const out = { ...lit, map, effects: [], turn: 4, phase: "player" as const };
    const relit = rekindle(out, phaseCtx(), BLAZE, HAZARD_TUNING).state;
    expect(relit.effects.map((effect) => keyOf(effect.tile))).toEqual(
      rest.map(keyOf),
    );
  });
});
