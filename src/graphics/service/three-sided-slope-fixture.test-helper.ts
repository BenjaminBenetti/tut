import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";

/** A padded J3 neighbourhood: north-facing pocket (3,0,3), mouth (3,0,2). */
export function threeSidedTerrace(
  turns: Rotation = 0,
  surface = "grass",
): TacticalMap {
  const size = 7;
  const builder = new FixtureMapBuilder(size, size, 2);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      let y = z >= 2 ? 1 : 0;
      let slope:
        { kind: "straight" | "inner" | "outer"; turns: Rotation } | undefined;
      if (z === 1 && x !== 3)
        slope =
          x === 2 || x === 4
            ? { kind: "outer", turns: x === 2 ? 0 : 3 }
            : { kind: "straight", turns: 0 };
      if (z === 2 && (x === 2 || x === 4)) {
        y = 0;
        slope = { kind: "inner", turns: x === 2 ? 0 : 3 };
      }
      if (x === 3 && z <= 3) y = 0;
      let rx = x,
        rz = z;
      for (let i = 0; i < turns; i++) [rx, rz] = [size - 1 - rz, rx];
      builder.tile({ x: rx, y, z: rz }, surface, {
        slope: slope
          ? { ...slope, turns: ((slope.turns + turns) % 4) as Rotation }
          : undefined,
      });
    }
  return builder.build();
}
