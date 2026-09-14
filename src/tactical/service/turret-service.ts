import type { IdGenerator } from "../../core/model/id-generator";
import { err } from "../../core/model/result";
import type { Result } from "../../core/model/result";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { TurretTuning } from "../model/turret";
import { turretIsActive } from "../model/turret";
import { TURRET_BURNED_OUT } from "../model/turret-burned-out-event";
import { TURRET_DEPLOYED } from "../model/turret-deployed-event";
import type { Unit } from "../model/unit";
import { overwatchShotsOf } from "../model/weapon-profile";
import type { MoveGraph } from "./movement-service";
import { buildMoveGraph } from "./movement-service";
import { enterOverwatch } from "./overwatch-status";
import { validateRadarSite } from "./radar-service";
import type { PhaseStep } from "./turn-service";
import { turretUnit } from "./unit-factory";

// ===========================================
// Deployment
// ===========================================

/**
 * Whether a turret may be put on `tile` by a unit standing where `unit`
 * stands (#1138): the scanner's rule exactly — a free, standing tile a
 * bounded infantry walk away, within `range` straight-line tiles, at
 * most a layer off — worded for a gun. A turret is a unit, so a tile a
 * living unit holds is taken (`occupiedKeys`), and a burnt-out turret
 * at zero hit points holds nothing.
 *
 * @param mission - The mission the turret would join.
 * @param unit - The unit carrying it.
 * @param tile - Where it would be put.
 * @param range - Straight-line tiles from the unit it may be carried.
 * @param graph - Traversal structures for the map, built here when the caller has none.
 * @returns Nothing when the site is fine, else why not.
 */
export function validateTurretSite(
  mission: TacticalState,
  unit: Unit,
  tile: TileCoord,
  range: number,
  graph: MoveGraph = buildMoveGraph(mission.map),
): Result<void, TacticalError> {
  const site = validateRadarSite(mission, unit, tile, range, graph);
  if (site.ok) {
    return site;
  }
  switch (site.error.kind) {
    case "radar-out-of-reach":
      return err({ kind: "turret-out-of-reach", range: site.error.range });
    case "radar-tile-blocked":
      return err({ kind: "turret-tile-blocked" });
    default:
      return site;
  }
}

/**
 * Puts a turret with a full battery on `tile` for `unit`'s side,
 * already on overwatch, and announces it (#1138). The site is taken as
 * already validated; the caller bills the action and the use. The
 * turret's template joins the mission's the first time one is
 * deployed and is shared by every turret after it, as a species'
 * template is shared by its bugs. Pure: draws one unit id.
 *
 * ```
 *   UseEquipment(turret) ──► units + turret { status: [overwatch], overwatchShots: 2, turnsLeft: 3 }
 *                            templates ∪ turret template
 *                            TurretDeployed { unitId, turretId, tile, turnsLeft, overwatchShots }
 * ```
 *
 * @param mission - The mission the turret joins.
 * @param unit - The unit placing it; the turret faces the way it does.
 * @param tile - Where it goes.
 * @param tuning - The turret's stats and battery.
 * @param ids - Issues the turret's id.
 * @returns The mission with the turret, and the `TurretDeployed` event.
 */
export function placeTurret(
  mission: TacticalState,
  unit: Unit,
  tile: TileCoord,
  tuning: TurretTuning,
  ids: IdGenerator,
): TacticalApplied<TacticalState> {
  const built = turretUnit(
    tuning,
    unit.team,
    { pos: { x: tile.x, y: tile.y, z: tile.z }, facing: unit.facing },
    ids,
  );
  const turret = armed(built.unit, tuning);
  return {
    state: {
      ...mission,
      units: [...mission.units, turret],
      templates:
        built.template.id in mission.templates
          ? mission.templates
          : { ...mission.templates, [built.template.id]: built.template },
    },
    events: [
      {
        type: TURRET_DEPLOYED,
        payload: {
          unitId: unit.id,
          turretId: turret.id,
          tile: turret.pos,
          turnsLeft: tuning.batteryTurns,
          overwatchShots: overwatchShotsOf(tuning.weapon.profile),
        },
      },
    ],
  };
}

// ===========================================
// Battery and watch
// ===========================================

/**
 * Runs every turret as a **player** turn opens (#1138): drains its
 * battery by one, and either puts it back on overwatch with a fresh
 * pair of shots or, at zero, burns it out — hit points to zero, a
 * `TurretBurnedOut` rather than a `UnitDied`, so nothing is credited
 * and nothing is mourned. A phase step for `createEndTurnHandler`, run
 * after `refreshSides` has let the last turn's watch lapse and beside
 * the radar drain; the bug phase opening touches nothing, so a turret
 * deployed on turn T watches the bug phases of T, T+1 and T+2 and is
 * burnt out when turn T+3 opens.
 *
 * ```
 *   player phase opens ──► for each living turret: turnsLeft − 1
 *                              ├─ > 0 ──► overwatch again, ap = maxAp, overwatchShots = the gun's
 *                              └─ = 0 ──► hp 0, TurretBurnedOut { turretId, pos }
 *   bugs phase opens   ──► unchanged
 * ```
 *
 * No `UnitStatusChanged` for the watch itself: it is the turret's
 * standing state, and a line a turn for every turret would drown the
 * log in what the card already says.
 *
 * @param tuning - The turret's stats; the gun says how many shots a watch gets.
 * @returns The step.
 */
export function createTurretStep(tuning: TurretTuning): PhaseStep {
  return (mission) => {
    if (
      mission.phase !== "player" ||
      !mission.units.some((unit) => turretIsActive(unit))
    ) {
      return { state: mission, events: [] };
    }
    const events: TacticalEvent[] = [];
    const units = mission.units.map((unit): Unit => {
      if (!turretIsActive(unit)) {
        return unit;
      }
      const turnsLeft = (unit.turnsLeft ?? 0) - 1;
      if (turnsLeft <= 0) {
        events.push({
          type: TURRET_BURNED_OUT,
          payload: { turretId: unit.id, pos: unit.pos },
        });
        return { ...unit, hp: 0, turnsLeft: 0 };
      }
      return { ...armed(unit, tuning), turnsLeft };
    });
    return { state: { ...mission, units }, events };
  };
}

// ===========================================
// Helpers
// ===========================================

/** The turret at full action points and on watch with its gun's shots. */
function armed(unit: Unit, tuning: TurretTuning): Unit {
  return enterOverwatch({ ...unit, ap: unit.maxAp }, [tuning.weapon]);
}
