import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";

/** A padded min(x,z) terrace, with one aligned chain and its existing straight flanks. */
export function diagonalTerrace(
  length: number,
  turns: Rotation = 0,
  surface = "grass",
): TacticalMap {
  const size = length + 4;
  const builder = new FixtureMapBuilder(size, size, length + 2);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const y = Math.max(0, Math.min(length, x - 1, z - 1));
      let slope: { kind: "straight" | "outer"; turns: Rotation } | undefined;
      if (x === z && x >= 1 && x <= length) slope = { kind: "outer", turns: 3 };
      else if (x < z && x >= 1 && x <= length)
        slope = { kind: "straight", turns: 3 };
      else if (z < x && z >= 1 && z <= length)
        slope = { kind: "straight", turns: 0 };
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
