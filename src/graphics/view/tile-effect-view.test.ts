import { Sprite } from "three";
import { describe, expect, it } from "vitest";

import type { TileEffect } from "../../tactical/model/tile-effect";
import { FIRE_SMOKE_NAME, TileEffectView } from "./tile-effect-view";

const FIRE: TileEffect = {
  id: "effect-1",
  kind: "fire",
  tile: { x: 3, y: 0, z: 4 },
  phasesLeft: 4,
};

describe("TileEffectView smoke (#1132)", () => {
  it("draws a smoke plume over every fire, and only while the fire burns", () => {
    const view = new TileEffectView();
    view.updateEffects([
      FIRE,
      { ...FIRE, id: "effect-2", tile: { x: 5, y: 0, z: 4 } },
    ]);
    const plumes = view
      .objects()
      .map((fire) => fire.getObjectByName(FIRE_SMOKE_NAME));
    expect(plumes).toHaveLength(2);
    for (const plume of plumes) {
      expect(plume).toBeDefined();
      const puffs = plume!.children.filter((c) => c instanceof Sprite);
      expect(puffs.length).toBeGreaterThan(0);
    }
    view.updateEffects([FIRE]);
    expect(view.effectIds()).toEqual(["effect-1"]);
    expect(
      view.objects().map((fire) => fire.getObjectByName(FIRE_SMOKE_NAME)),
    ).toHaveLength(1);
    view.dispose();
    expect(view.objects()).toHaveLength(0);
  });

  it("lifts the plume on the frame clock, above the flames", () => {
    const view = new TileEffectView();
    view.updateEffects([FIRE]);
    const plume = view.objects()[0]!.getObjectByName(FIRE_SMOKE_NAME)!;
    const puffs = plume.children.filter(
      (c): c is Sprite => c instanceof Sprite,
    );
    const before = puffs.map((p) => p.position.y);
    view.update(0.3);
    const after = puffs.map((p) => p.position.y);
    // Every puff that did not wrap rose; none sits below the flames' top.
    expect(after.some((y, i) => y > before[i]!)).toBe(true);
    for (const y of after) {
      expect(y).toBeGreaterThanOrEqual(0.6);
    }
    view.dispose();
  });

  it("shows a fire from a resumed save smoking from its first update", () => {
    const view = new TileEffectView();
    view.updateEffects([{ ...FIRE, phasesLeft: 1 }]);
    const plume = view.objects()[0]!.getObjectByName(FIRE_SMOKE_NAME)!;
    const puffs = plume.children.filter(
      (c): c is Sprite => c instanceof Sprite,
    );
    expect(puffs.some((p) => p.material.opacity > 0)).toBe(true);
    view.dispose();
  });
});
