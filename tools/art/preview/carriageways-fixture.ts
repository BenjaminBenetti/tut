import { FixtureMapBuilder } from "../../../src/mapgen/service/fixture-map-builder";
import type { TacticalMap } from "../../../src/mapgen/model/tactical-map";
import type { RoadStyle } from "../../../src/mapgen/model/settlement-definition";
import type { SettlementScale } from "../../../src/content/model/settlement-scale";

/** Acceptance layouts use the real resolver and factory, with a common tile pitch. */
export interface CarriagewayControl {
  readonly id: string;
  readonly title: string;
  readonly style: RoadStyle;
  readonly width: number;
  readonly shape: "corner" | "t" | "cross";
}

export const CARRIAGEWAY_CONTROLS: readonly CarriagewayControl[] = [
  {
    id: "trail",
    title: "Two-lane trail",
    style: "trail",
    width: 2,
    shape: "corner",
  },
  {
    id: "street-corner",
    title: "Two-lane street corner",
    style: "streets",
    width: 2,
    shape: "corner",
  },
  {
    id: "street-t",
    title: "Three-lane street",
    style: "streets",
    width: 3,
    shape: "t",
  },
  {
    id: "avenue",
    title: "Four-lane avenue",
    style: "grid",
    width: 4,
    shape: "cross",
  },
];

/** A hand-built road neighbourhood, with the material style supplied through the map recipe. */
export function carriagewayMap(control: CarriagewayControl): TacticalMap {
  const size = 18;
  const low = Math.floor((size - control.width) / 2);
  const high = low + control.width;
  const road = (x: number, z: number): boolean => {
    const horizontal = z >= low && z < high;
    const vertical = x >= low && x < high;
    if (control.shape === "cross") return horizontal || vertical;
    if (control.shape === "t") return horizontal || (vertical && z < high);
    return (horizontal && x < high) || (vertical && z >= low);
  };
  const builder = new FixtureMapBuilder(size, size, 1).fillGround(0, "grass");
  const pavement =
    control.style === "trail" ? 0 : control.style === "grid" ? 2 : 1;
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      if (road(x, z)) {
        builder.tile({ x, y: 0, z }, "road");
        continue;
      }
      let near = false;
      for (let dz = -pavement; dz <= pavement; dz++)
        for (let dx = -pavement; dx <= pavement; dx++)
          near ||= road(x + dx, z + dz);
      if (near) builder.tile({ x, y: 0, z }, "sidewalk");
    }
  const map = builder.build();
  const settlement: SettlementScale =
    control.style === "trail"
      ? "rural"
      : control.style === "grid"
        ? "city"
        : "town";
  return {
    ...map,
    recipe: { ...map.recipe, params: { ...map.recipe.params, settlement } },
  };
}
