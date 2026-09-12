import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { CoverLevel } from "../../mapgen/model/cover";
import { MapDraft } from "../../mapgen/model/map-draft";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { freezeDraft } from "../../mapgen/service/draft-freezer";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { pathTo } from "./movement-service";
import { coverAgainst, hasLineOfSight } from "./sight-service";
import { missionWith, unitAt } from "./tactical-fixtures.test-helper";

// ===========================================
// Map generation → saved data → tactical rules
// ===========================================

describe("two-tile vehicle gameplay", () => {
  for (const rotation of [0, 1] as const) {
    it(`blocks movement and sight through both halves at rotation ${rotation}, retaining a bypass`, () => {
      const anchor = { x: 3, y: 0, z: 3 };
      const tail = {
        x: rotation === 0 ? 4 : 3,
        y: 0,
        z: rotation === 0 ? 3 : 4,
      };
      const draft = new MapDraft(8, 8, new SequentialIdGenerator(), "road");
      draft.addProp("car", anchor, rotation, [anchor, tail]);
      const recipe = new FixtureMapBuilder(8, 8, 1).fillGround().build().recipe;
      const generated = freezeDraft(draft, recipe, createDefaultRegistries());
      const map = JSON.parse(JSON.stringify(generated)) as TacticalMap;
      for (const kind of ["infantry", "mech"] as const) {
        const mission = missionWith(map, [
          unitAt("unit", kind, { x: 2, y: 0, z: 2 }),
        ]);
        expect(pathTo(mission, "unit", anchor)).toBeUndefined();
        expect(pathTo(mission, "unit", tail)).toBeUndefined();
        const destination = { x: 5, y: 0, z: 5 };
        const bypass = pathTo(mission, "unit", destination);
        expect(bypass?.at(-1)).toEqual(destination);
        expect(bypass).not.toContainEqual(anchor);
        expect(bypass).not.toContainEqual(tail);
      }
      for (const half of [anchor, tail]) {
        const acrossX = rotation === 1;
        const observer = {
          x: half.x - (acrossX ? 2 : 0),
          y: 0,
          z: half.z - (acrossX ? 0 : 2),
        };
        const target = {
          x: half.x + (acrossX ? 2 : 0),
          y: 0,
          z: half.z + (acrossX ? 0 : 2),
        };
        expect(hasLineOfSight(map, observer, target)).toBe(false);
        expect(hasLineOfSight(map, target, observer)).toBe(false);
        const defender = {
          x: half.x - (acrossX ? 1 : 0),
          y: 0,
          z: half.z - (acrossX ? 0 : 1),
        };
        expect(coverAgainst(map, defender, target)).toBe(CoverLevel.HIGH);
      }
      expect(
        hasLineOfSight(map, { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 6 }),
      ).toBe(true);
    });
  }
});
