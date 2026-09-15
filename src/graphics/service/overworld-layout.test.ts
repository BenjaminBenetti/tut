import { describe, expect, it } from "vitest";

import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import { layoutToWorld, mapCentre } from "./overworld-layout";

const CONFIG: OverworldSceneConfig = {
  ...OVERWORLD_SCENE_CONFIG,
  mapWidth: 20,
  mapDepth: 10,
};

describe("overworld-layout", () => {
  describe("layoutToWorld", () => {
    it("maps the north-west corner to the origin and the south-east corner to the far edge", () => {
      expect(layoutToWorld({ x: 0, y: 0 }, CONFIG)).toEqual({
        x: 0,
        y: 0,
        z: 0,
      });
      expect(layoutToWorld({ x: 1, y: 1 }, CONFIG)).toEqual({
        x: 20,
        y: 0,
        z: 10,
      });
    });

    it("scales linearly and stays on the ground plane", () => {
      expect(layoutToWorld({ x: 0.25, y: 0.5 }, CONFIG)).toEqual({
        x: 5,
        y: 0,
        z: 5,
      });
    });
  });

  it("mapCentre is the middle of the plane", () => {
    expect(mapCentre(CONFIG)).toEqual({ x: 10, y: 0, z: 5 });
  });
});
