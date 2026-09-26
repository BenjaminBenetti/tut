import type { Rng } from "../../../core/model/rng";
import { PropKindIds } from "../../data/props";
import type { CavernChamber, CavernLayout } from "../../model/cavern-layout";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { HiveCavernTuning } from "../../model/hive-cavern-tuning";
import type { MapDraft } from "../../model/map-draft";
import type { PropKindId, Rotation } from "../../model/prop";
import type { MapGenRegistries } from "../../model/registries";
import type { ColumnCoord } from "../../model/road";
import { nearCorePad } from "../../service/cavern-queries";
import { isPassableGround } from "../../service/draft-queries";
import { propPlacementTiles } from "../../service/prop-footprint";
import { joinCarapaceCells } from "../infestation/carapace-outline";

// ===========================================
// Constants
// ===========================================

/** Organic clutter scattered through the deeper chambers, by weight. */
const CHAMBER_CLUTTER: readonly { kind: PropKindId; weight: number }[] = [
  { kind: PropKindIds.INFESTED_SPINES, weight: 3 },
  { kind: PropKindIds.INFESTED_VENT, weight: 2 },
  { kind: PropKindIds.INFESTED_RIBS, weight: 2 },
  { kind: PropKindIds.INFESTED_RUBBLE, weight: 2 },
  { kind: PropKindIds.BOULDER, weight: 2 },
  { kind: PropKindIds.INFESTED_NEST, weight: 1 },
  { kind: PropKindIds.INFESTED_DEBRIS, weight: 1 },
];

/** The mouth is still the surface's rock: boulders, at half the density. */
const MOUTH_CLUTTER: readonly { kind: PropKindId; weight: number }[] = [
  { kind: PropKindIds.BOULDER, weight: 1 },
];

/** Attempts per prop before it is given up. */
const ATTEMPTS = 8;

/** Attempts per core hive: each swings further round the ring. */
const HIVE_ATTEMPTS = 16;

/** Radians a core hive swings round the ring between attempts. */
const HIVE_SWING = 0.12;

/** Rounds of prop removal allowed to reopen cut-off pockets. */
const REOPEN_ROUNDS = 12;

/** Four neighbours. */
const NEIGHBOURS_4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// ===========================================
// CavernDressingPass
// ===========================================

/**
 * Dresses a hive cavern with the infestation kit (#1179): hives ringed
 * round the core pad, brood mounds and egg clutches in every chamber,
 * runs of carapace wall hugging chamber rims, and spines, vents, ribs,
 * rubble, nests and boulders scattered through the floors. The mouth gets
 * boulders only.
 *
 * Nothing stands on the route — the main tunnels and burrows, the core
 * pad and its ring, a band round every tunnel mouth — so a 2×2 brute
 * still walks from the edge to the core, and nothing is left where the
 * drop ship lands. A last flood fill lifts any prop that cut a pocket of
 * floor off from the rest.
 *
 * ```
 *   core     ▣▣ hive   ░░░ pad ░░░   ▣▣ hive
 *   chamber  ◊ brood / eggs round a clear centre, ▤▤▤ carapace on the rim
 *   tunnels  (kept clear)
 * ```
 */
export class CavernDressingPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "cavern-dressing";
  readonly requires: readonly DraftCapability[] = ["cavern", "landing-sites"];
  readonly provides: readonly DraftCapability[] = ["props"];

  // ===========================================
  // Construction
  // ===========================================

  /** Dresses caverns by `tuning` (`HIVE_CAVERN_TUNING` in the shipped pipeline). */
  constructor(private readonly tuning: HiveCavernTuning) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Places every organic prop, then reopens anything they sealed off. */
  run(context: GenerationContext): void {
    const { draft, registries, rng, diagnostics } = context;
    const layout = draft.cavern;
    if (layout === undefined) {
      diagnostics.note("no cavern layout: nothing to dress");
      return;
    }
    const stamp = new PropStamp(
      draft,
      registries,
      layout,
      keepClear(draft, layout, this.tuning),
    );
    const members = chamberMembers(draft, layout);
    const before = draft.props.length;
    dressCore(stamp, layout, this.tuning, rng.fork("core"));
    dressBroods(stamp, layout, this.tuning, rng.fork("broods"));
    dressRims(stamp, draft, layout, members, this.tuning, rng.fork("carapace"));
    scatter(stamp, draft, layout, members, this.tuning, rng.fork("clutter"));
    const lifted = reopenPockets(draft, layout);
    diagnostics.note(
      `cavern dressing: ${String(draft.props.length - before + lifted)} props, ` +
        `${String(lifted)} lifted to reopen pockets`,
    );
  }
}

// ===========================================
// Stamping
// ===========================================

/** Places props on cavern floor, refusing the route, slopes of level and each other. */
class PropStamp {
  // ===========================================
  // Construction
  // ===========================================

  /** Stamps onto `draft`, never on `clear` columns or rock. */
  constructor(
    private readonly draft: MapDraft,
    private readonly registries: Pick<MapGenRegistries, "props">,
    private readonly layout: CavernLayout,
    private readonly clear: Uint8Array,
  ) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Places `kind` anchored at the column when its whole footprint is
   * level, open, passable floor off the route; with `spaced`, nothing
   * else may stand beside it either. Returns whether it was placed.
   */
  place(
    kind: PropKindId,
    anchor: ColumnCoord,
    rotation: Rotation,
    spaced: boolean,
  ): boolean {
    const { draft } = this;
    if (!draft.inBounds(anchor.x, anchor.z)) return false;
    const tile = draft.groundCoord(anchor.x, anchor.z);
    const cells = propPlacementTiles(
      tile,
      this.registries.props.get(kind),
      rotation,
    );
    for (const cell of cells) {
      if (!this.free(cell.x, cell.z)) return false;
      if (draft.groundLevelAt(cell.x, cell.z) !== tile.y) return false;
      if (spaced && this.crowded(cell.x, cell.z)) return false;
    }
    draft.addProp(kind, tile, rotation, cells);
    return true;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Open, passable floor, off the route and the landing site. */
  private free(x: number, z: number): boolean {
    const { draft } = this;
    if (!draft.inBounds(x, z)) return false;
    const i = z * draft.width + x;
    return (
      this.layout.open[i] === 1 &&
      this.clear[i] !== 1 &&
      !draft.isLandingReserved(x, z) &&
      isPassableGround(draft, x, z)
    );
  }

  /** True when a prop already stands on one of the eight neighbours. */
  private crowded(x: number, z: number): boolean {
    const { draft } = this;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!draft.inBounds(x + dx, z + dz)) continue;
        if (draft.propAt(draft.groundCoord(x + dx, z + dz)) !== undefined) {
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * Columns no prop may take: every tunnel's band along its whole centre
 * line — through the chambers it crosses too, so the route and each side
 * passage keep their width — the core pad and its ring, and the floor
 * within `tunnelClearRadius` of any tunnel column, so each tunnel mouth
 * stays open.
 */
function keepClear(
  draft: MapDraft,
  layout: CavernLayout,
  tuning: HiveCavernTuning,
): Uint8Array {
  const clear = new Uint8Array(draft.width * draft.depth);
  for (const tunnel of layout.tunnels) {
    const band =
      (tunnel.kind === "side"
        ? tuning.sideTunnelRadius
        : tuning.mainTunnelRadius) + 0.5;
    for (const p of tunnel.path)
      forEachWithin(draft, p, band, (i) => (clear[i] = 1));
  }
  const reach = new Int16Array(clear.length).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < clear.length; i++) {
    if (layout.open[i] === 1 && layout.chamberOf[i] === -1) {
      reach[i] = 0;
      queue.push(i);
    }
  }
  // The queue grows as it is walked; for-of sees every pushed column.
  for (const u of queue) {
    clear[u] = 1;
    if ((reach[u] ?? 0) >= tuning.tunnelClearRadius) continue;
    for (const v of neighbours4(draft, u)) {
      if (layout.open[v] !== 1 || reach[v] !== -1) continue;
      reach[v] = (reach[u] ?? 0) + 1;
      queue.push(v);
    }
  }
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (nearCorePad(draft, x, z, 1)) clear[z * draft.width + x] = 1;
    }
  }
  return clear;
}

// ===========================================
// Dressing
// ===========================================

/** Hives ringed round the core pad, spines between them. */
function dressCore(
  stamp: PropStamp,
  layout: CavernLayout,
  tuning: HiveCavernTuning,
  rng: Rng,
): void {
  const pad = layout.corePad;
  const cx = pad.x + pad.size / 2;
  const cz = pad.z + pad.size / 2;
  const count = rng.nextInt(tuning.coreHives.min, tuning.coreHives.max);
  const start = rng.next() * 2 * Math.PI;
  for (let k = 0; k < count; k++) {
    const angle = start + (k * 2 * Math.PI) / count + (rng.next() - 0.5) * 0.5;
    for (let attempt = 0; attempt < HIVE_ATTEMPTS; attempt++) {
      const distance =
        rng.nextInt(tuning.coreHiveRing.min, tuning.coreHiveRing.max) +
        (attempt % 3);
      // Terraces, pits and the route's clear band break the ring, so a
      // hive that finds no level floor swings round it a little each try.
      const swing =
        (attempt % 2 === 0 ? 1 : -1) * Math.ceil(attempt / 2) * HIVE_SWING;
      // A 2×2 hive is anchored by its lowest corner; centre it on the ring.
      const anchor = {
        x: Math.round(cx + Math.cos(angle + swing) * distance - 1),
        z: Math.round(cz + Math.sin(angle + swing) * distance - 1),
      };
      if (stamp.place(PropKindIds.INFESTED_HIVE, anchor, 0, true)) break;
    }
    const between = angle + Math.PI / count;
    const spine = {
      x: Math.round(cx + Math.cos(between) * (tuning.coreHiveRing.min - 1)),
      z: Math.round(cz + Math.sin(between) * (tuning.coreHiveRing.min - 1)),
    };
    stamp.place(PropKindIds.INFESTED_SPINES, spine, 0, true);
  }
}

/** Brood mounds and egg clutches round every chamber's clear centre. */
function dressBroods(
  stamp: PropStamp,
  layout: CavernLayout,
  tuning: HiveCavernTuning,
  rng: Rng,
): void {
  for (const chamber of layout.chambers) {
    if (chamber.role === "mouth") continue;
    const clutches = rng.nextInt(
      tuning.broodClutches.min,
      tuning.broodClutches.max,
    );
    for (let n = 0; n < clutches; n++) {
      const kind = rng.chance(0.5)
        ? PropKindIds.INFESTED_BROOD
        : PropKindIds.INFESTED_EGGS;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const angle = rng.next() * 2 * Math.PI;
        const distance = tuning.broodClearRadius + 2 + rng.nextInt(0, 3);
        const anchor = {
          x: Math.round(chamber.centre.x + Math.cos(angle) * distance - 1),
          z: Math.round(chamber.centre.z + Math.sin(angle) * distance - 1),
        };
        if (stamp.place(kind, anchor, 0, true)) break;
      }
    }
  }
}

/**
 * Runs of carapace wall along each chamber's rim, where floor meets rock:
 * grown column by column along the rim, then joined into straights,
 * curves and ends by the infestation kit's own joiner.
 */
function dressRims(
  stamp: PropStamp,
  draft: MapDraft,
  layout: CavernLayout,
  members: readonly (readonly number[])[],
  tuning: HiveCavernTuning,
  rng: Rng,
): void {
  const used = new Set<number>();
  layout.chambers.forEach((chamber, c) => {
    if (chamber.role === "mouth") return;
    const rim = (members[c] ?? []).filter((i) =>
      neighbours4(draft, i).some((j) => layout.open[j] !== 1),
    );
    const onRim = new Set(rim);
    const runs = rng.nextInt(tuning.carapaceRuns.min, tuning.carapaceRuns.max);
    for (let n = 0; n < runs && rim.length > 0; n++) {
      const start = rng.pick(rim);
      if (used.has(start)) continue;
      const length = rng.nextInt(
        tuning.carapaceRunLength.min,
        tuning.carapaceRunLength.max,
      );
      const run = growRun(draft, start, length, onRim, used);
      if (run.length < 2) continue;
      for (const i of run) used.add(i);
      const tiles = run.map((i) =>
        draft.groundCoord(i % draft.width, Math.floor(i / draft.width)),
      );
      for (const cell of joinCarapaceCells(
        tiles,
        rng.fork(`${chamber.id}-${String(n)}`),
      )) {
        stamp.place(cell.kind, cell.tile, cell.rotation, false);
      }
    }
  });
}

/** Walks the rim from `start` for up to `length` level columns. */
function growRun(
  draft: MapDraft,
  start: number,
  length: number,
  onRim: ReadonlySet<number>,
  used: ReadonlySet<number>,
): number[] {
  const level = draft.groundLevelAt(
    start % draft.width,
    Math.floor(start / draft.width),
  );
  const run = [start];
  let current = start;
  while (run.length < length) {
    const next = neighbours4(draft, current).find(
      (j) =>
        onRim.has(j) &&
        !used.has(j) &&
        !run.includes(j) &&
        draft.groundLevelAt(j % draft.width, Math.floor(j / draft.width)) ===
          level,
    );
    if (next === undefined) break;
    run.push(next);
    current = next;
  }
  return run;
}

/** Scattered clutter, `clutterPerHundred` per hundred floor columns. */
function scatter(
  stamp: PropStamp,
  draft: MapDraft,
  layout: CavernLayout,
  members: readonly (readonly number[])[],
  tuning: HiveCavernTuning,
  rng: Rng,
): void {
  layout.chambers.forEach((chamber: CavernChamber, c) => {
    const tiles = members[c] ?? [];
    if (tiles.length === 0) return;
    const mouth = chamber.role === "mouth";
    const kinds = mouth ? MOUTH_CLUTTER : CHAMBER_CLUTTER;
    const density = tuning.clutterPerHundred * (mouth ? 0.5 : 1);
    const count = Math.round((tiles.length * density) / 100);
    for (let n = 0; n < count; n++) {
      const kind = rng.pickWeighted(kinds, (k) => k.weight).kind;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const i = rng.pick(tiles);
        const anchor = { x: i % draft.width, z: Math.floor(i / draft.width) };
        const rotation = rng.nextInt(0, 3) as Rotation;
        if (stamp.place(kind, anchor, rotation, true)) break;
      }
    }
  });
}

// ===========================================
// Pockets
// ===========================================

/**
 * Lifts props until every open floor column joins the core pad again,
 * counting a step of up to two layers as joined because the ramp pass
 * bridges those next. Returns how many props were lifted.
 */
function reopenPockets(draft: MapDraft, layout: CavernLayout): number {
  let lifted = 0;
  for (let round = 0; round < REOPEN_ROUNDS; round++) {
    const reached = floodFromCore(draft, layout);
    const blockers = new Set<string>();
    for (let i = 0; i < reached.length; i++) {
      if (reached[i] === 1 || layout.open[i] !== 1) continue;
      const x = i % draft.width;
      const z = Math.floor(i / draft.width);
      if (!isPassableGround(draft, x, z)) continue;
      for (const j of neighbours4(draft, i)) {
        const prop = draft.propAt(
          draft.groundCoord(j % draft.width, Math.floor(j / draft.width)),
        );
        if (prop !== undefined) blockers.add(prop.id);
      }
    }
    if (blockers.size === 0) return lifted;
    for (const id of blockers) {
      draft.removeProp(id);
      lifted++;
    }
  }
  return lifted;
}

/** Floor reachable from the core pad over passable columns, steps of two layers allowed. */
function floodFromCore(draft: MapDraft, layout: CavernLayout): Uint8Array {
  const reached = new Uint8Array(draft.width * draft.depth);
  const start = layout.corePad.z * draft.width + layout.corePad.x;
  const queue = [start];
  reached[start] = 1;
  // The queue grows as it is walked; for-of sees every pushed column.
  for (const u of queue) {
    const level = draft.groundLevelAt(
      u % draft.width,
      Math.floor(u / draft.width),
    );
    for (const v of neighbours4(draft, u)) {
      if (reached[v] === 1) continue;
      const x = v % draft.width;
      const z = Math.floor(v / draft.width);
      if (!isPassableGround(draft, x, z)) continue;
      if (Math.abs(draft.groundLevelAt(x, z) - level) > 2) continue;
      reached[v] = 1;
      queue.push(v);
    }
  }
  return reached;
}

// ===========================================
// Helpers
// ===========================================

/** Open columns of every chamber, by chamber index. */
function chamberMembers(draft: MapDraft, layout: CavernLayout): number[][] {
  const members = layout.chambers.map((): number[] => []);
  for (let i = 0; i < draft.width * draft.depth; i++) {
    const c = layout.chamberOf[i] ?? -1;
    if (c >= 0 && layout.open[i] === 1) members[c]?.push(i);
  }
  return members;
}

/** On-board four-neighbour column keys of `i`. */
function neighbours4(draft: MapDraft, i: number): number[] {
  const x = i % draft.width;
  const z = Math.floor(i / draft.width);
  const out: number[] = [];
  for (const [dx, dz] of NEIGHBOURS_4) {
    if (draft.inBounds(x + dx, z + dz))
      out.push((z + dz) * draft.width + x + dx);
  }
  return out;
}

/** Visits every on-board column key within `radius` of the column. */
function forEachWithin(
  draft: MapDraft,
  centre: ColumnCoord,
  radius: number,
  visit: (i: number) => void,
): void {
  const r = Math.ceil(radius);
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > radius * radius) continue;
      const x = centre.x + dx;
      const z = centre.z + dz;
      if (draft.inBounds(x, z)) visit(z * draft.width + x);
    }
  }
}
