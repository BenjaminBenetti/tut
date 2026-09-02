import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import {
  manhattanDistance,
  oppositeDirection,
  stepGridPos,
} from "../../core/service/grid-math";
import type { DiagnosticSink } from "../model/diagnostics";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { Hook } from "../model/hook";
import { HookKinds } from "../model/hook";
import type { HookGroup, MapDraft } from "../model/map-draft";
import type { HookRequirement } from "../model/map-recipe";
import type { UnitClass } from "../model/pass-mask";
import { allows, classesIn, PassMask } from "../model/pass-mask";
import type { MapGenRegistries } from "../model/registries";
import type { ResolvedMapGenParams } from "../model/resolved-params";
import type { TacticalMap } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import { freezeDraft } from "../service/draft-freezer";
import { isBoundaryColumn } from "../service/draft-queries";
import {
  ReachabilityService,
  wallKindBlocks,
} from "../service/reachability-service";
import { TileIndex } from "../service/tile-index";
import { deployTiles, hookTileKeys } from "./placer/placer-support";

// ===========================================
// Types
// ===========================================

/** One change to the draft that opens a route. */
type Repair =
  | { readonly kind: "prop"; readonly propId: string; readonly at: TileCoord }
  | { readonly kind: "door"; readonly at: TileCoord; readonly side: Direction }
  | {
      readonly kind: "ramp";
      readonly lower: TileCoord;
      readonly upper: TileCoord;
    };

/** The draft frozen as it stands, with lookups. */
interface Snapshot {
  readonly map: TacticalMap;
  readonly index: TileIndex;
  readonly reach: ReachabilityService;
  readonly links: ReadonlyMap<number, readonly { to: Tile; pass: number }[]>;
}

/** Search bookkeeping per tile key. */
interface Visit {
  readonly cost: number;
  readonly from?: number;
  readonly repair?: Repair;
}

/** Hook groups the pass repairs; deploy zones are the sources. */
const REPAIRED_GROUPS: readonly HookGroup[] = ["objectives", "edgeSpawns"];

// ===========================================
// ConnectivityPass
// ===========================================

/**
 * Pass 9 of the settlement archetype (ADR 0004 §7.3): makes invariant I7
 * true. For every hook and every class it requires, the draft is frozen
 * and checked with the real traversal rule. When a hook is unreachable, a
 * 0-1 search from the deploy zones finds the route needing the fewest
 * repairs, where a legal step is free and crossing a prop, opening a door
 * in a building wall, or bridging a one-level step costs one. The repairs
 * on that route are applied and the check repeated; a hook with no
 * repairable route is relocated to the nearest reachable legal tile.
 * Every change is noted for the preview and the property sweep.
 *
 * ```
 *   deploy ──0──►░░──1(prop)──►░░──0──►[ hook ]
 *                └──1(ramp)──►▓▓──1(door)──►[_hook_]
 * ```
 */
export class ConnectivityPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "connectivity";
  readonly requires: readonly DraftCapability[] = ["hooks"];
  readonly provides: readonly DraftCapability[] = ["connected"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Repairs or relocates every unreachable hook. */
  run(context: GenerationContext): void {
    const { draft, params, registries, diagnostics } = context;
    let checks = 0;
    let repairs = 0;
    let relocations = 0;
    for (const group of REPAIRED_GROUPS) {
      const hooks = draft.hooks[group];
      for (let i = 0; i < hooks.length; i++) {
        const hook = hooks[i];
        if (hook === undefined) {
          continue;
        }
        for (const unitClass of classesIn(hook.requiredPass)) {
          checks++;
          let snapshot = snapshotOf(draft, params, registries);
          if (isReachable(snapshot, draft, hook, unitClass)) {
            continue;
          }
          const plan = planRepairs(
            snapshot,
            draft,
            hook,
            unitClass,
            registries,
          );
          if (plan !== undefined && plan.length > 0) {
            applyRepairs(draft, plan, hook, diagnostics);
            repairs += plan.length;
            snapshot = snapshotOf(draft, params, registries);
            if (isReachable(snapshot, draft, hook, unitClass)) {
              continue;
            }
          }
          const moved = relocate(
            snapshot,
            draft,
            hook,
            unitClass,
            params.hooks,
          );
          if (moved === undefined) {
            diagnostics.note(
              `${hook.id} (${hook.kind}) stays unreachable for class ${unitClass}`,
              hook.tiles[0],
            );
            continue;
          }
          hooks[i] = moved;
          relocations++;
          diagnostics.note(`${hook.id} relocated`, moved.tiles[0]);
        }
      }
    }
    repairExtraction(draft, params, registries, diagnostics);
    diagnostics.note(
      `${checks} hook/class checks, ${repairs} repairs, ${relocations} relocations`,
    );
  }
}

// ===========================================
// Snapshots and checks
// ===========================================

/** Freezes the draft and prepares lookups for one round of checks. */
function snapshotOf(
  draft: MapDraft,
  params: ResolvedMapGenParams,
  registries: MapGenRegistries,
): Snapshot {
  const map = freezeDraft(
    draft,
    {
      seed: "",
      params: {
        archetype: params.archetype,
        biome: params.biome.id,
        settlement: params.settlement.id,
        size: { width: params.width, depth: params.depth },
        hooks: params.hooks,
      },
    },
    registries,
  );
  const index = new TileIndex(map);
  const links = new Map<number, { to: Tile; pass: number }[]>();
  for (const connector of map.connectors) {
    const from = index.getAt(connector.from);
    const to = index.getAt(connector.to);
    if (from === undefined || to === undefined) {
      continue;
    }
    links.set(index.keyOf(from), [
      ...(links.get(index.keyOf(from)) ?? []),
      { to, pass: connector.pass },
    ]);
    links.set(index.keyOf(to), [
      ...(links.get(index.keyOf(to)) ?? []),
      { to: from, pass: connector.pass },
    ]);
  }
  return {
    map,
    index,
    reach: new ReachabilityService(index, map.connectors),
    links,
  };
}

/** True when some tile of the hook is reachable by the class. */
function isReachable(
  snapshot: Snapshot,
  draft: MapDraft,
  hook: Hook,
  unitClass: UnitClass,
): boolean {
  const reachable = snapshot.reach.reachableFrom(deployTiles(draft), unitClass);
  return snapshot.reach.anyReachable(reachable, hook.tiles);
}

// ===========================================
// Repair planning
// ===========================================

/**
 * 0-1 breadth-first search from every deploy tile to any hook tile.
 * Returns the repairs along the cheapest route, or undefined when no
 * route exists even with repairs.
 */
function planRepairs(
  snapshot: Snapshot,
  draft: MapDraft,
  hook: Hook,
  unitClass: UnitClass,
  registries: MapGenRegistries,
): Repair[] | undefined {
  const { index } = snapshot;
  const targets = new Set<number>();
  for (const coord of hook.tiles) {
    const tile = index.getAt(coord);
    if (tile !== undefined) {
      targets.add(index.keyOf(tile));
    }
  }
  const visits = new Map<number, Visit>();
  const front: Tile[] = [];
  const back: Tile[] = [];
  for (const coord of deployTiles(draft)) {
    const tile = index.getAt(coord);
    if (tile !== undefined && allows(tile.pass, unitClass)) {
      visits.set(index.keyOf(tile), { cost: 0 });
      front.push(tile);
    }
  }
  let current: Tile | undefined;
  while ((current = front.shift() ?? back.shift()) !== undefined) {
    const key = index.keyOf(current);
    const visit = visits.get(key);
    if (visit === undefined) {
      continue;
    }
    if (targets.has(key)) {
      return unwind(visits, key);
    }
    for (const edge of edgesFrom(snapshot, current, unitClass, registries)) {
      const nextKey = index.keyOf(edge.to);
      const cost = visit.cost + (edge.repair === undefined ? 0 : 1);
      const known = visits.get(nextKey);
      if (known !== undefined && known.cost <= cost) {
        continue;
      }
      visits.set(nextKey, { cost, from: key, repair: edge.repair });
      if (edge.repair === undefined) {
        front.push(edge.to);
      } else {
        back.push(edge.to);
      }
    }
  }
  return undefined;
}

/** Follows `from` links back to a source, collecting repairs in order. */
function unwind(visits: ReadonlyMap<number, Visit>, key: number): Repair[] {
  const repairs: Repair[] = [];
  let cursor: number | undefined = key;
  while (cursor !== undefined) {
    const visit = visits.get(cursor);
    if (visit === undefined) {
      break;
    }
    if (visit.repair !== undefined) {
      repairs.push(visit.repair);
    }
    cursor = visit.from;
  }
  return repairs.reverse();
}

/** Moves the class could make from a tile, free or at one repair each. */
function edgesFrom(
  snapshot: Snapshot,
  from: Tile,
  unitClass: UnitClass,
  registries: MapGenRegistries,
): { to: Tile; repair?: Repair }[] {
  const { index, reach, links } = snapshot;
  const edges: { to: Tile; repair?: Repair }[] = [];
  for (const direction of DIRECTIONS) {
    const level = index.neighbour(from, direction);
    if (level !== undefined) {
      const wall =
        from.walls[direction] ?? level.walls[oppositeDirection(direction)];
      if (wallKindBlocks(wall, unitClass)) {
        const inBuilding =
          from.buildingId !== undefined || level.buildingId !== undefined;
        if (
          unitClass === PassMask.INFANTRY &&
          inBuilding &&
          allows(level.pass, unitClass)
        ) {
          edges.push({
            to: level,
            repair: { kind: "door", at: from, side: direction },
          });
        }
      } else if (allows(level.pass, unitClass)) {
        edges.push({ to: level });
      } else if (
        level.propId !== undefined &&
        surfaceAllows(registries, level, unitClass)
      ) {
        edges.push({
          to: level,
          repair: { kind: "prop", propId: level.propId, at: level },
        });
      }
    }
    for (const dy of [1, -1]) {
      const stepped = index.getAt(
        stepGridPos({ ...from, y: from.y + dy }, direction),
      );
      if (
        stepped === undefined ||
        from.buildingId !== undefined ||
        stepped.buildingId !== undefined ||
        from.propId !== undefined ||
        !allows(stepped.pass, unitClass) ||
        reach.canStep(from, stepped, unitClass)
      ) {
        continue;
      }
      const lower = dy > 0 ? from : stepped;
      const upper = dy > 0 ? stepped : from;
      edges.push({ to: stepped, repair: { kind: "ramp", lower, upper } });
    }
  }
  for (const link of links.get(index.keyOf(from)) ?? []) {
    if (!allows(link.pass, unitClass)) {
      continue;
    }
    if (allows(link.to.pass, unitClass)) {
      edges.push({ to: link.to });
    } else if (
      link.to.propId !== undefined &&
      surfaceAllows(registries, link.to, unitClass)
    ) {
      edges.push({
        to: link.to,
        repair: { kind: "prop", propId: link.to.propId, at: link.to },
      });
    }
  }
  return edges;
}

/** Whether the tile would admit the class once its prop is gone. */
function surfaceAllows(
  registries: MapGenRegistries,
  tile: Tile,
  unitClass: UnitClass,
): boolean {
  return allows(registries.surfaces.get(tile.surface).defaultPass, unitClass);
}

/** Applies repairs to the draft and notes each one. */
function applyRepairs(
  draft: MapDraft,
  repairs: readonly Repair[],
  hook: Hook,
  diagnostics: DiagnosticSink,
): void {
  for (const repair of repairs) {
    switch (repair.kind) {
      case "prop":
        draft.removeProp(repair.propId);
        diagnostics.note(`${hook.id}: removed ${repair.propId}`, repair.at);
        break;
      case "door":
        draft.setWall(repair.at, repair.side, "door");
        diagnostics.note(
          `${hook.id}: opened a door on side ${repair.side}`,
          repair.at,
        );
        break;
      case "ramp": {
        const ramp = draft.addConnector("ramp", repair.lower, repair.upper);
        diagnostics.note(`${hook.id}: added ${ramp.id}`, repair.lower);
        break;
      }
    }
  }
}

// ===========================================
// Relocation
// ===========================================

/**
 * Moves the hook onto the reachable legal tiles nearest its current
 * position: on the boundary for edge spawns, off it for anything else,
 * honouring the recipe's minimum distance from deploy. Returns undefined
 * when no such tile exists.
 */
function relocate(
  snapshot: Snapshot,
  draft: MapDraft,
  hook: Hook,
  unitClass: UnitClass,
  requirements: readonly HookRequirement[],
): Hook | undefined {
  const { index, reach } = snapshot;
  const anchor = hook.tiles[0];
  if (anchor === undefined) {
    return undefined;
  }
  const reachable = reach.reachableFrom(deployTiles(draft), unitClass);
  const taken = hookTileKeys(draft);
  const minDistance =
    requirements.find((r) => r.kind === hook.kind)?.minDistanceFromDeploy ?? 0;
  const deploy = deployTiles(draft);
  const wantBoundary = hook.kind === HookKinds.EDGE_SPAWN;
  const candidates = snapshot.map.tiles
    .filter((tile) => {
      const key = index.keyOf(tile);
      return (
        reachable.has(key) &&
        allows(tile.pass, hook.requiredPass) &&
        !taken.has(draft.tileKey(tile)) &&
        isBoundaryColumn(draft, tile.x, tile.z) === wantBoundary &&
        deploy.every((d) => manhattanDistance(d, tile) >= minDistance)
      );
    })
    .sort(
      (a, b) => manhattanDistance(a, anchor) - manhattanDistance(b, anchor),
    );
  const chosen = candidates.slice(0, hook.tiles.length);
  if (chosen.length === 0) {
    return undefined;
  }
  return { ...hook, tiles: chosen.map((t) => ({ x: t.x, y: t.y, z: t.z })) };
}

/** Extraction shares the deploy zone; anything else falls back to it. */
function repairExtraction(
  draft: MapDraft,
  params: ResolvedMapGenParams,
  registries: MapGenRegistries,
  diagnostics: DiagnosticSink,
): void {
  const extraction = draft.hooks.extraction;
  const deploy = draft.hooks.deployZones[0];
  if (extraction === undefined || deploy === undefined) {
    return;
  }
  const snapshot = snapshotOf(draft, params, registries);
  const unreachable = classesIn(extraction.requiredPass).some(
    (unitClass) => !isReachable(snapshot, draft, extraction, unitClass),
  );
  if (unreachable) {
    draft.setExtraction(deploy.tiles, extraction.requiredPass, extraction.meta);
    diagnostics.note("extraction moved onto the deploy zone", deploy.tiles[0]);
  }
}
