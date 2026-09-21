import { DIRECTIONS } from "../../../core/model/direction";
import { CARAPACE_SITE_TUNING } from "../../data/carapace-site-tuning";
import type { CarapaceGateway } from "../../model/infestation-plan";
import type { GenerationContext } from "../../model/generation-pass";
import { PassMask } from "../../model/pass-mask";
import type { ColumnCoord } from "../../model/road";
import type { TileCoord } from "../../model/tile-coord";
import { infestationPressure } from "../../service/infestation-layout";
import { columnKey, stepColumn } from "./carapace-outline";

/** Finds a narrow, level 2×2 route between exterior gateway anchors, grading at most one layer. */
export function gradeableCarapacePassage(
  context: GenerationContext,
  gateways: readonly CarapaceGateway[],
  courtyard: readonly ColumnCoord[],
): readonly TileCoord[] | undefined {
  const { draft } = context;
  const approaches = gateways.flatMap((gate) => gate.approach);
  if (approaches.some((tile) => !draft.inBounds(tile.x, tile.z)))
    return undefined;
  const levels = approaches.map((tile) => draft.groundLevelAt(tile.x, tile.z));
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  const grading = CARAPACE_SITE_TUNING.maximumGateGrading;
  if (high - low > grading * 2) return undefined;
  const minimum = Math.max(0, high - grading);
  const maximum = low + grading;
  const candidates = Array.from(
    { length: maximum - minimum + 1 },
    (_, index) => minimum + index,
  ).sort(
    (a, b) =>
      levels.reduce((sum, y) => sum + Math.abs(y - a), 0) -
      levels.reduce((sum, y) => sum + Math.abs(y - b), 0),
  );
  const open = new Set([...courtyard, ...approaches].map(columnKey));
  for (const level of candidates) {
    if (!approaches.every((tile) => gradeableCell(context, tile, level)))
      continue;
    const safe = new Set(
      [...courtyard, ...approaches]
        .filter((tile) => gradeableCell(context, tile, level))
        .map(columnKey),
    );
    const from = exteriorAnchor(gateways[0]!);
    const to = exteriorAnchor(gateways[1]!);
    const visited = new Map<string, ColumnCoord | undefined>([
      [columnKey(from), undefined],
    ]);
    const pending = [from];
    for (const at of pending) {
      if (columnKey(at) === columnKey(to)) break;
      for (const direction of DIRECTIONS) {
        const next = stepColumn(at, direction);
        const key = columnKey(next);
        if (
          visited.has(key) ||
          !footprint(next).every(
            (tile) => open.has(columnKey(tile)) && safe.has(columnKey(tile)),
          )
        )
          continue;
        visited.set(key, at);
        pending.push(next);
      }
    }
    if (!visited.has(columnKey(to))) continue;
    const passage = new Map(
      approaches.map((tile) => [columnKey(tile), { ...tile, y: level }]),
    );
    for (
      let at: ColumnCoord | undefined = to;
      at !== undefined;
      at = visited.get(columnKey(at))
    )
      for (const tile of footprint(at))
        passage.set(columnKey(tile), { ...tile, y: level });
    return [...passage.values()];
  }
  return undefined;
}

/** Keeps existing road connectors at their exact heights and never creates a new cliff. */
function gradeableCell(
  { draft, registries }: GenerationContext,
  tile: ColumnCoord,
  level: number,
): boolean {
  if (
    !draft.inBounds(tile.x, tile.z) ||
    draft.isLandingReserved(tile.x, tile.z) ||
    draft.isSiteReserved(tile.x, tile.z) ||
    registries.surfaces.get(draft.groundSurfaceAt(tile.x, tile.z))
      .defaultPass !== PassMask.ALL ||
    infestationPressure(draft, tile.x, tile.z) <
      CARAPACE_SITE_TUNING.minimumApproachPressure ||
    Math.abs(draft.groundLevelAt(tile.x, tile.z) - level) >
      CARAPACE_SITE_TUNING.maximumGateGrading
  )
    return false;
  if (
    draft.connectors.some((connector) =>
      [connector.from, connector.to].some(
        (endpoint) =>
          endpoint.x === tile.x &&
          endpoint.z === tile.z &&
          endpoint.y !== level,
      ),
    )
  )
    return false;
  return DIRECTIONS.every((direction) => {
    const next = stepColumn(tile, direction);
    return (
      !draft.inBounds(next.x, next.z) ||
      Math.abs(draft.groundLevelAt(next.x, next.z) - level) <= 1
    );
  });
}

/** The four cells of a 2×2 unit at its north-west anchor. */
function footprint(anchor: ColumnCoord): readonly ColumnCoord[] {
  return [
    anchor,
    { x: anchor.x + 1, z: anchor.z },
    { x: anchor.x, z: anchor.z + 1 },
    { x: anchor.x + 1, z: anchor.z + 1 },
  ];
}

/** An anchor whose complete footprint stands outside the perimeter, facing the gateway. */
function exteriorAnchor(gate: CarapaceGateway): ColumnCoord {
  const x = Math.min(...gate.tiles.map((tile) => tile.x));
  const z = Math.min(...gate.tiles.map((tile) => tile.z));
  return {
    x: x + (gate.outward === "w" ? -2 : gate.outward === "e" ? 1 : 0),
    z: z + (gate.outward === "n" ? -2 : gate.outward === "s" ? 1 : 0),
  };
}
