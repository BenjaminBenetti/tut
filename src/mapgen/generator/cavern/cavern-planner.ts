import type { Rng } from "../../../core/model/rng";
import type {
  CavernChamberRole,
  CavernTunnelKind,
} from "../../model/cavern-layout";
import type { HiveCavernTuning } from "../../model/hive-cavern-tuning";
import type { ColumnCoord } from "../../model/road";
import type { IntRange } from "../../model/settlement-definition";

// ===========================================
// Types
// ===========================================

/** The board a cavern is planned on, in tiles. */
export interface Board {
  readonly width: number;
  readonly depth: number;
}

/** A point on the ground plane in tile units; not snapped to a column. */
export interface PlanePoint {
  readonly x: number;
  readonly z: number;
}

/** One ellipse a chamber is the union of. */
export interface ChamberLobe {
  readonly x: number;
  readonly z: number;
  /** Radius across the board (x). */
  readonly rx: number;
  /** Radius along the board (z). */
  readonly rz: number;
}

/** A chamber before it is carved. */
export interface ChamberPlan {
  readonly role: CavernChamberRole;
  readonly centre: ColumnCoord;
  /** Radius along the board. */
  readonly radius: number;
  /** Radius across the board; wider chambers stretch sideways. */
  readonly rx: number;
  readonly lobes: readonly ChamberLobe[];
  /** Tunnels between this chamber and the mouth. */
  readonly depth: number;
  /** Levels the chamber's floor sits above (or below) the spine. */
  readonly floorOffset: number;
}

/** A tunnel before it is carved: a sampled centre line and a brush. */
export interface TunnelPlan {
  readonly kind: CavernTunnelKind;
  readonly from: number;
  readonly to?: number;
  /** Brush radius; the carve never goes narrower. */
  readonly radius: number;
  /** Centre line sampled at most a quarter tile apart. */
  readonly samples: readonly PlanePoint[];
}

/** Where every chamber and tunnel goes, before anything is carved. */
export interface CavernPlan {
  /** Mouth, route chambers in order, core, then side chambers. */
  readonly chambers: readonly ChamberPlan[];
  readonly tunnels: readonly TunnelPlan[];
}

// ===========================================
// Constants
// ===========================================

/** Longest gap between two centre-line samples, in tiles. */
const SAMPLE_STEP = 0.25;

/** Attempts per side chamber and radius before the radius shrinks by one. */
const SIDE_ATTEMPTS_PER_RADIUS = 24;

/** Plans after the first before the planner settles for too few side chambers. */
const REPLAN_ATTEMPTS = 8;

/** Attempts in all before the planner settles for fewer burrows. */
const BURROW_ATTEMPTS = 40;

/** Share of the board's depth before which no burrow starts or opens. */
const BURROW_BACK_SHARE = 0.4;

/** Farthest a loop tunnel reaches between two chamber rims. */
const LOOP_REACH = 24;

/** Smallest radius the core shrinks to on a crowded route. */
const MIN_CORE_RADIUS = 10;

// ===========================================
// Planner
// ===========================================

/**
 * Plans a hive cavern (#1179): a main route of chambers from the mouth
 * (low `z`) to the core (high `z`) zig-zagging across the board, side
 * chambers in the room the zig-zag leaves, and burrows from the back
 * half of the cavern out to the map edge.
 *
 * ```
 *   z ─►  mouth ══ route ══ route ══ … ══ core ══ burrow ─► edge
 *                    ╲                    ╱
 *                     side (loop or dead end)
 * ```
 *
 * Pure: every draw comes from `rng`, so a seed always plans the same
 * cavern. `carveCavern` turns the plan into columns.
 */
export function planCavern(
  board: Board,
  tuning: HiveCavernTuning,
  rng: Rng,
): CavernPlan {
  const total = drawInt(rng, tuning.chamberCount);
  const maxSides = Math.max(
    tuning.sideChamberCount.min,
    Math.min(tuning.sideChamberCount.max, total - tuning.minRouteChambers),
  );
  let sides = rng.nextInt(tuning.sideChamberCount.min, maxSides);
  let plan = planWith(board, total - sides, sides, tuning, rng);
  for (
    let attempt = 0;
    attempt < REPLAN_ATTEMPTS && sideCount(plan) < tuning.sideChamberCount.min;
    attempt++
  ) {
    // A crowded route leaves no room beside it: give a route slot to the
    // side chambers, while the side count allows, and plan again.
    sides = Math.min(sides + 1, maxSides);
    plan = planWith(board, total - sides, sides, tuning, rng);
  }
  return plan;
}

/**
 * One planning attempt: `route` chambers from mouth to core joined by
 * main tunnels, up to `sides` side chambers, then the burrows.
 */
function planWith(
  board: Board,
  route: number,
  sides: number,
  tuning: HiveCavernTuning,
  rng: Rng,
): CavernPlan {
  const chambers: ChamberPlan[] = planRoute(board, route, tuning, rng);
  const tunnels: TunnelPlan[] = [];
  for (let i = 0; i + 1 < chambers.length; i++) {
    tunnels.push(tunnelBetween("main", i, i + 1, chambers, board, tuning, rng));
  }
  placeSideChambers(board, sides, chambers, tunnels, tuning, rng);
  placeBurrows(board, chambers, tunnels, tuning, rng);
  return { chambers, tunnels };
}

/** How many side chambers a plan holds. */
function sideCount(plan: CavernPlan): number {
  return plan.chambers.filter((chamber) => chamber.role === "side").length;
}

// ===========================================
// Main route
// ===========================================

/**
 * The mouth, the route chambers and the core, spaced along `z` so every
 * neighbouring pair keeps a tunnel of at least `minTunnelLength` between
 * their rims, and zig-zagging across `x`.
 */
function planRoute(
  board: Board,
  count: number,
  tuning: HiveCavernTuning,
  rng: Rng,
): ChamberPlan[] {
  const radii = [
    drawInt(rng, tuning.mouthRadius),
    ...Array.from({ length: count - 2 }, () =>
      drawInt(rng, tuning.routeRadius),
    ),
    drawInt(rng, tuning.coreRadius),
  ];
  const first = tuning.mouthLip + at(radii, 0);
  const last = (): number =>
    board.depth - 1 - tuning.rimMargin - at(radii, radii.length - 1);
  const needed = (): number => {
    let sum = 0;
    for (let i = 0; i + 1 < radii.length; i++) {
      sum += at(radii, i) + at(radii, i + 1) + tuning.minTunnelLength;
    }
    return sum;
  };
  shrinkToFit(radii, () => needed() - (last() - first), tuning);
  const slack = Math.max(0, last() - first - needed());
  const weights = radii.slice(1).map(() => 0.5 + rng.next());
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const startSign = rng.chance(0.5) ? 1 : -1;
  const chambers: ChamberPlan[] = [];
  let z = first;
  for (let i = 0; i < radii.length; i++) {
    const radius = at(radii, i);
    if (i > 0) {
      z +=
        at(radii, i - 1) +
        radius +
        tuning.minTunnelLength +
        Math.floor((slack * at(weights, i - 1)) / weightSum);
    }
    const role: CavernChamberRole =
      i === 0 ? "mouth" : i === radii.length - 1 ? "core" : "route";
    const sign = i % 2 === 0 ? startSign : -startSign;
    const across = placeAcross(board, radius, role, sign, tuning, rng);
    chambers.push(shapeChamber(role, across, z, radius, i, 0, tuning, rng));
  }
  return chambers;
}

/**
 * Shrinks route chambers (widest first), then the core, until the route
 * fits the board; `overflow` says how many tiles too long it still is.
 */
function shrinkToFit(
  radii: number[],
  overflow: () => number,
  tuning: HiveCavernTuning,
): void {
  while (overflow() > 0) {
    let widest = -1;
    for (let i = 1; i < radii.length - 1; i++) {
      if (
        at(radii, i) > tuning.minChamberRadius &&
        (widest === -1 || at(radii, i) > at(radii, widest))
      ) {
        widest = i;
      }
    }
    if (widest !== -1) {
      radii[widest] = at(radii, widest) - 1;
      continue;
    }
    const core = radii.length - 1;
    if (at(radii, core) <= MIN_CORE_RADIUS) return;
    radii[core] = at(radii, core) - 1;
  }
}

/**
 * A chamber's centre `x` and radius across the board. The mouth and the
 * core sit near the middle; route chambers alternate sides by `sign`.
 */
function placeAcross(
  board: Board,
  radius: number,
  role: CavernChamberRole,
  sign: number,
  tuning: HiveCavernTuning,
  rng: Rng,
): { x: number; rx: number } {
  const aspect = role === "mouth" ? 1 : 1 + rng.next() * (tuning.maxAspect - 1);
  const widest = Math.floor((board.width - 2 * tuning.rimMargin - 3) / 2);
  const rx = Math.max(1, Math.min(Math.round(radius * aspect), widest));
  const middle = Math.floor(board.width / 2);
  const reach = Math.max(0, middle - tuning.rimMargin - rx - 1);
  if (role !== "route") {
    const jitter = Math.min(3, reach);
    return { x: middle + rng.nextInt(-jitter, jitter), rx };
  }
  return { x: middle + sign * rng.nextInt(Math.min(4, reach), reach), rx };
}

/**
 * A chamber of `role` centred at (`across.x`, `z`): one main lobe and a
 * few smaller ones inside the planned radius, so the outline is lumpy
 * rather than round.
 */
function shapeChamber(
  role: CavernChamberRole,
  across: { x: number; rx: number },
  z: number,
  radius: number,
  depth: number,
  floorOffset: number,
  tuning: HiveCavernTuning,
  rng: Rng,
): ChamberPlan {
  const lobes: ChamberLobe[] = [
    { x: across.x, z, rx: across.rx * 0.85, rz: radius * 0.85 },
  ];
  const extra = drawInt(rng, tuning.lobes);
  for (let i = 0; i < extra; i++) {
    const angle = rng.next() * 2 * Math.PI;
    const distance = 0.25 + 0.2 * rng.next();
    const size = 0.4 + 0.15 * rng.next();
    lobes.push({
      x: across.x + Math.cos(angle) * distance * across.rx,
      z: z + Math.sin(angle) * distance * radius,
      rx: across.rx * size,
      rz: radius * size,
    });
  }
  return {
    role,
    centre: { x: across.x, z },
    radius,
    rx: across.rx,
    lobes,
    depth,
    floorOffset,
  };
}

// ===========================================
// Side chambers
// ===========================================

/**
 * Adds up to `count` side chambers in the rock the route leaves free —
 * mostly the room the zig-zag leaves on its far side — each joined to
 * the nearest route chamber or the core by a side tunnel, and sometimes
 * to a second one, which closes a loop. A chamber that finds no room
 * shrinks and tries again, down to `minChamberRadius`.
 */
function placeSideChambers(
  board: Board,
  count: number,
  chambers: ChamberPlan[],
  tunnels: TunnelPlan[],
  tuning: HiveCavernTuning,
  rng: Rng,
): void {
  const mouth = chambers[0];
  if (mouth === undefined) return;
  for (let s = 0; s < count; s++) {
    let placed = false;
    for (
      let radius = drawInt(rng, tuning.sideRadius);
      radius >= tuning.minChamberRadius && !placed;
      radius--
    ) {
      const inset = tuning.rimMargin + radius + 1;
      const zLow =
        mouth.centre.z + mouth.radius + tuning.chamberSeparation + radius;
      const zHigh = board.depth - 1 - inset;
      if (zLow > zHigh || 2 * inset > board.width - 1) continue;
      for (
        let attempt = 0;
        attempt < SIDE_ATTEMPTS_PER_RADIUS && !placed;
        attempt++
      ) {
        const x = rng.nextInt(inset, board.width - 1 - inset);
        const z = rng.nextInt(zLow, zHigh);
        const reach = extent(radius, radius, tuning);
        if (!clearOf({ x, z, reach }, chambers, tuning)) continue;
        const host = nearestHost({ x, z }, chambers, -1);
        if (host === -1) return;
        const index = chambers.length;
        chambers.push(
          shapeChamber(
            "side",
            { x, rx: radius },
            z,
            radius,
            (chambers[host]?.depth ?? 0) + 1,
            rng.pick(tuning.sideFloorOffsets),
            tuning,
            rng,
          ),
        );
        tunnels.push(
          tunnelBetween("side", host, index, chambers, board, tuning, rng),
        );
        closeLoop(index, host, chambers, tunnels, board, tuning, rng);
        placed = true;
      }
    }
  }
}

/**
 * The route chamber or core, other than `except`, whose rim is nearest
 * `point`; -1 when there is none.
 */
function nearestHost(
  point: PlanePoint,
  chambers: readonly ChamberPlan[],
  except: number,
): number {
  let best = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  chambers.forEach((other, index) => {
    if (index === except) return;
    if (other.role !== "route" && other.role !== "core") return;
    const gap =
      Math.hypot(other.centre.x - point.x, other.centre.z - point.z) -
      Math.max(other.rx, other.radius);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });
  return best;
}

/**
 * Joins the side chamber at `side` to the nearest other route chamber or
 * the core as well, when one is close enough and the draw says so: a
 * loop bugs can flank the squad round.
 */
function closeLoop(
  side: number,
  host: number,
  chambers: readonly ChamberPlan[],
  tunnels: TunnelPlan[],
  board: Board,
  tuning: HiveCavernTuning,
  rng: Rng,
): void {
  const chamber = chambers[side];
  if (chamber === undefined || !rng.chance(tuning.loopChance)) return;
  const other = nearestHost(chamber.centre, chambers, host);
  const target = chambers[other];
  if (target === undefined) return;
  const gap =
    Math.hypot(
      target.centre.x - chamber.centre.x,
      target.centre.z - chamber.centre.z,
    ) -
    Math.max(target.rx, target.radius) -
    Math.max(chamber.rx, chamber.radius);
  if (gap > LOOP_REACH) return;
  tunnels.push(
    tunnelBetween("side", other, side, chambers, board, tuning, rng),
  );
}

/** How far a chamber's rim can stray from its centre, rim noise included. */
function extent(rx: number, radius: number, tuning: HiveCavernTuning): number {
  return Math.max(rx, radius) * (1 + tuning.rimNoise);
}

/** True when a new chamber keeps `chamberSeparation` of rock from every other. */
function clearOf(
  candidate: { x: number; z: number; reach: number },
  chambers: readonly ChamberPlan[],
  tuning: HiveCavernTuning,
): boolean {
  return chambers.every(
    (other) =>
      Math.hypot(other.centre.x - candidate.x, other.centre.z - candidate.z) >=
      candidate.reach +
        extent(other.rx, other.radius, tuning) +
        tuning.chamberSeparation,
  );
}

// ===========================================
// Burrows
// ===========================================

/**
 * Adds burrows from route chambers and the core in the back of the
 * cavern to a map edge (west, east or the far end), their openings kept `burrowSpacing`
 * apart, so edge spawns arrive deep in the hive and never beside the
 * drop ship.
 */
function placeBurrows(
  board: Board,
  chambers: readonly ChamberPlan[],
  tunnels: TunnelPlan[],
  tuning: HiveCavernTuning,
  rng: Rng,
): void {
  const back = board.depth * BURROW_BACK_SHARE;
  const sources = chambers
    .map((chamber, index) => ({ chamber, index }))
    // Only chambers on the level spine: a brute that arrives by burrow
    // must walk it to the main route, and a side chamber's floor may sit
    // a step off the spine.
    .filter(
      ({ chamber }) =>
        (chamber.role === "route" || chamber.role === "core") &&
        chamber.centre.z >= back,
    );
  if (sources.length === 0) return;
  const count = drawInt(rng, tuning.burrowCount);
  const openings: ColumnCoord[] = [];
  for (
    let attempt = 0;
    attempt < BURROW_ATTEMPTS && openings.length < count;
    attempt++
  ) {
    const { chamber, index } = rng.pick(sources);
    const opening = burrowOpening(board, chamber, back, tuning, rng);
    const spaced = openings.every(
      (o) =>
        Math.abs(o.x - opening.x) + Math.abs(o.z - opening.z) >=
        tuning.burrowSpacing,
    );
    if (!spaced) continue;
    openings.push(opening);
    // A burrow is how bugs arrive, brutes included, so it is dug to the
    // main route's width and not a side tunnel's.
    tunnels.push({
      kind: "burrow",
      from: index,
      radius: tuning.mainTunnelRadius,
      samples: bowedLine(
        chamber.centre,
        opening,
        tuning.tunnelBow / 2,
        board,
        tuning.rimMargin,
        rng,
      ),
    });
  }
}

/**
 * Where a burrow from `chamber` meets the edge: usually the nearest of
 * the west, east and far edges, now and then another, jittered along it
 * and kept clear of the corners and the front of the cavern.
 */
function burrowOpening(
  board: Board,
  chamber: ChamberPlan,
  back: number,
  tuning: HiveCavernTuning,
  rng: Rng,
): ColumnCoord {
  const inset = tuning.rimMargin + 3;
  const edges = [
    { edge: "w", distance: chamber.centre.x },
    { edge: "e", distance: board.width - 1 - chamber.centre.x },
    { edge: "s", distance: board.depth - 1 - chamber.centre.z },
  ].sort((a, b) => a.distance - b.distance);
  const edge = rng.chance(0.7) ? edges[0]?.edge : rng.pick(edges).edge;
  if (edge === "s") {
    return {
      x: clamp(
        chamber.centre.x + rng.nextInt(-10, 10),
        inset,
        board.width - 1 - inset,
      ),
      z: board.depth - 1,
    };
  }
  return {
    x: edge === "w" ? 0 : board.width - 1,
    z: clamp(
      chamber.centre.z + rng.nextInt(-12, 12),
      Math.ceil(back),
      board.depth - 1 - inset,
    ),
  };
}

// ===========================================
// Tunnels
// ===========================================

/**
 * A tunnel of `kind` between two chambers' centres, bowed sideways by up
 * to `tunnelBow`. Running centre to centre means the main route's level
 * spine crosses every chamber it joins, not just its rim.
 */
function tunnelBetween(
  kind: CavernTunnelKind,
  from: number,
  to: number,
  chambers: readonly ChamberPlan[],
  board: Board,
  tuning: HiveCavernTuning,
  rng: Rng,
): TunnelPlan {
  const a = chambers[from]?.centre ?? { x: 0, z: 0 };
  const b = chambers[to]?.centre ?? { x: 0, z: 0 };
  return {
    kind,
    from,
    to,
    radius: kind === "main" ? tuning.mainTunnelRadius : tuning.sideTunnelRadius,
    samples: bowedLine(a, b, tuning.tunnelBow, board, tuning.rimMargin, rng),
  };
}

/**
 * A quadratic curve from `a` to `b` whose control point sits up to `bow`
 * off the midpoint, clamped inside the rock margin, sampled at most
 * `SAMPLE_STEP` apart.
 */
function bowedLine(
  a: ColumnCoord,
  b: ColumnCoord,
  bow: number,
  board: Board,
  margin: number,
  rng: Rng,
): PlanePoint[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.max(1, Math.hypot(dx, dz));
  const offset = (rng.next() * 2 - 1) * bow;
  const inner = margin + 3;
  const control = {
    x: clamp(
      (a.x + b.x) / 2 + (-dz / length) * offset,
      inner,
      board.width - 1 - inner,
    ),
    z: clamp(
      (a.z + b.z) / 2 + (dx / length) * offset,
      inner,
      board.depth - 1 - inner,
    ),
  };
  // The curve moves at most twice its longer control leg per unit of t,
  // so this many even steps never leave a gap wider than SAMPLE_STEP.
  const fastest =
    2 *
    Math.max(
      Math.hypot(control.x - a.x, control.z - a.z),
      Math.hypot(b.x - control.x, b.z - control.z),
    );
  const steps = Math.max(1, Math.ceil(fastest / SAMPLE_STEP));
  const samples: PlanePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    samples.push({
      x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      z: u * u * a.z + 2 * u * t * control.z + t * t * b.z,
    });
  }
  return samples;
}

// ===========================================
// Helpers
// ===========================================

/** A uniform integer draw from an inclusive range. */
function drawInt(rng: Rng, range: IntRange): number {
  return rng.nextInt(range.min, range.max);
}

/** The element at `index`, or zero past the end. */
function at(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}

/** Clamps `value` into `[low, high]`. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
