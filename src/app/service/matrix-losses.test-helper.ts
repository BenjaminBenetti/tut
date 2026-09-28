import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { Rng } from "../../core/model/rng";
import type { Mission } from "../../overworld/model/mission";
import type {
  MechDamageReport,
  MissionOutcome,
  SquadCasualties,
} from "../../overworld/model/mission-result";
import { isMissionOutcome } from "../../overworld/model/mission-result";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import { CALIBRATION_FORCES } from "./calibration-forces.test-helper";
import type { PlayerId } from "./calibration-run.test-helper";
import { PLAYER_IDS } from "./calibration-run.test-helper";
import type { LossModel, MatrixPlayerId } from "./modelled-player.test-helper";
import { deployedUnits } from "./modelled-player.test-helper";
import type { OptInPlayer } from "./realistic-spender.test-helper";
import { OPT_IN_PLAYERS } from "./realistic-spender.test-helper";

// ===========================================
// The calibration matrix's losses, for a modelled player (#1179, C7)
// ===========================================
//
// The calibration matrix (`calibration-matrix.sim.test.ts`) plays every
// cell's mission with the tactical new and expert players and writes one
// row per run to `<SIM_MATRIX_OUT>.runs.tsv`. Its `units_lost` is
// `lossesOf` in `calibration-run.test-helper.ts`: the squads and mechs
// deployed at the opening that neither extracted nor stood at the end
// (`mechs_lost` is the mechs among them). The game reads each such unit
// at 0 hit points, since a unit falls at 0 and abandoning the map, or the
// drop ship leaving, zeroes whoever it strands
// (`abandon-mission-handler.ts`, `left-behind-service.ts`), so the
// tactical resolver reports a lost squad as wiped and a lost mech as
// destroyed (`tactical-mission-resolver.ts`). The row does not record the
// soldiers a squad that came home lost, nor the damage a mech that came
// home took, so a unit that came home comes home whole here.
//
// A modelled mission keeps its modelled outcome and draws its losses
// from one run of the same outcome:
//
//   the mission's cell           route
//   story:<its story>/<any band>  story         a story mission the matrix plays
//   <its type>/<its act>          type          everything else, by the act it was offered in
//   <its type>/<nearest band>     nearest-band  a type the matrix plays in other acts (earlier on a tie)
//   every cell of its act         band          a type the matrix never plays
//
//   the runs drawn from          pool
//   the cell's, of the outcome    cell
//   the cell's band's, of it      band          the cell never ended that way
//   every band's, of it           any
//
// One run is picked from the pool with the mission's stream, and its
// losses are dealt to the deployment: the run's squad slots (lost or
// not) are shuffled and the deployed squads take them in order, then
// the same for mechs. A deployment with more units of a kind than the
// run had deals from the slots repeated. A dealt-lost squad is wiped
// (every soldier it still has); a dealt-lost mech is destroyed (the rest
// of its hull).
//
// To regenerate the table from a new matrix, point the economy probe at
// its runs: SIM_MATRIX_RUNS=<prefix>.runs.tsv (campaign-economy-probe.sim.test.ts).

/** One run of the matrix, as the loss model reads it. */
export interface MatrixRun {
  /** The cell id, `<type>/<band>` or `story:<story>/<band>`. */
  readonly cell: string;
  readonly band: ActId;
  readonly player: PlayerId;
  readonly outcome: MissionOutcome;
  /** Why the force abandoned the map (`cap`, `stall`), or `""`. */
  readonly abandoned: string;
  readonly squads: UnitLosses;
  readonly mechs: UnitLosses;
}

/** How many of one kind of unit a run deployed, and how many it lost. */
export interface UnitLosses {
  readonly deployed: number;
  readonly lost: number;
}

/** How a mission's cell was chosen (the table above). */
export type CellRoute = "story" | "type" | "nearest-band" | "band";

/** Where the runs of the mission's outcome were drawn from (the table above). */
export type OutcomePool = "cell" | "band" | "any";

/** One mission's draw. */
export interface MatrixDraw {
  readonly run: MatrixRun;
  /** The cell the mission maps to, or `band:<act>` when no cell plays its type. */
  readonly cell: string;
  readonly route: CellRoute;
  readonly pool: OutcomePool;
}

/** One cell's runs of one outcome, for the loss table's TSV. */
export interface MatrixLossRow {
  readonly cell: string;
  readonly outcome: MissionOutcome;
  readonly runs: number;
  readonly squadsLost: number;
  readonly mechsLost: number;
  /** The share of the runs the force abandoned (turn cap or stall). */
  readonly abandoned: number;
}

/** The columns `readMatrixRuns` needs. */
const COLUMNS = [
  "cell",
  "player",
  "luck",
  "outcome",
  "abandoned",
  "units_lost",
  "mechs_lost",
  "deployed",
] as const;

// ===========================================
// Reading the runs
// ===========================================

/**
 * Every run of a matrix's `runs.tsv` played on its own player's dice
 * (the decision-gap runs, one player on the other's luck, are left out).
 *
 * @param tsv - The file's text, header first.
 * @returns The runs, in file order.
 * @throws {Error} on a missing column, an unknown player, outcome or
 *   band, or a run whose deployment is not its band's calibration force.
 */
export function readMatrixRuns(tsv: string): MatrixRun[] {
  const [head, ...lines] = tsv.split("\n").filter((line) => line !== "");
  const header = (head ?? "").split("\t");
  const at = Object.fromEntries(
    COLUMNS.map((column) => {
      const index = header.indexOf(column);
      if (index < 0) throw new Error(`runs.tsv has no ${column} column`);
      return [column, index];
    }),
  ) as Record<(typeof COLUMNS)[number], number>;
  return lines.flatMap((line) => {
    const cells = line.split("\t");
    const field = (column: (typeof COLUMNS)[number]): string =>
      cells[at[column]] ?? "";
    const player = playerOf(field("player"));
    if (field("luck") !== player) return [];
    const outcome = field("outcome");
    if (!isMissionOutcome(outcome)) {
      throw new Error(`runs.tsv: unknown outcome ${outcome}`);
    }
    const cell = field("cell");
    const band = bandOf(cell);
    const force = forceShape(band);
    const deployed = Number(field("deployed"));
    if (deployed !== force.squads + force.mechs) {
      throw new Error(
        `runs.tsv: ${cell} deployed ${String(deployed)}, not the force's ${String(force.squads + force.mechs)}`,
      );
    }
    const mechsLost = Number(field("mechs_lost"));
    return [
      {
        cell,
        band,
        player,
        outcome,
        abandoned: field("abandoned"),
        squads: {
          deployed: force.squads,
          lost: Number(field("units_lost")) - mechsLost,
        },
        mechs: { deployed: force.mechs, lost: mechsLost },
      },
    ];
  });
}

/**
 * The squads and mechs a band's calibration force deploys: the starting
 * roster and the band's reinforcements (`calibration-forces.test-helper.ts`).
 *
 * @param band - The cell's act band.
 * @returns How many squads and mechs every run of the band deployed.
 */
export function forceShape(band: ActId): {
  readonly squads: number;
  readonly mechs: number;
} {
  const extra = CALIBRATION_FORCES[band].reinforcements;
  return {
    squads: STARTER_ROSTER.squads.length + extra.squads.length,
    mechs: STARTER_ROSTER.mechs.length + extra.mechs.length,
  };
}

// ===========================================
// The table
// ===========================================

/** One tactical player's runs, drawn from by mission and outcome. */
export class MatrixLossTable {
  // ===========================================
  // Construction
  // ===========================================

  /**
   * The table of `player`'s runs.
   *
   * @param runs - The matrix's runs (`readMatrixRuns`).
   * @param player - Whose losses the table holds.
   * @returns The table.
   * @throws {Error} if the matrix holds no run of `player`.
   */
  static of(runs: readonly MatrixRun[], player: PlayerId): MatrixLossTable {
    const mine = runs.filter((run) => run.player === player);
    if (mine.length === 0) throw new Error(`the matrix has no ${player} run`);
    return new MatrixLossTable(player, mine);
  }

  /** A table of `runs`, every one `player`'s; `of` builds it. */
  private constructor(
    /** Whose losses these are. */
    readonly player: PlayerId,
    private readonly runs: readonly MatrixRun[],
  ) {}

  // ===========================================
  // Public
  // ===========================================

  /**
   * The cell `mission` maps to, and by which route (the table in the
   * module comment). A mission offered before acts existed counts as
   * Act I's.
   *
   * @param mission - The campaign's mission.
   * @returns The cell id (`band:<act>` for the band's pool) and route.
   */
  cellOf(mission: Mission): {
    readonly cell: string;
    readonly route: CellRoute;
  } {
    const band = mission.act ?? "act-1";
    if (mission.storyId !== undefined) {
      const story = this.cells().find((cell) =>
        cell.startsWith(`story:${mission.storyId ?? ""}/`),
      );
      if (story !== undefined) return { cell: story, route: "story" };
    }
    const own = `${mission.typeId}/${band}`;
    if (this.cells().includes(own)) return { cell: own, route: "type" };
    const nearest = this.nearestBandOf(mission.typeId, band);
    if (nearest !== undefined) {
      return { cell: `${mission.typeId}/${nearest}`, route: "nearest-band" };
    }
    return { cell: `band:${band}`, route: "band" };
  }

  /**
   * One run to take `mission`'s losses from: a run of `outcome` from its
   * cell, or from wider pools when the cell never ended that way.
   *
   * @param mission - The campaign's mission.
   * @param outcome - Its modelled outcome.
   * @param rng - The mission's stream.
   * @returns The run, the cell, and how both were found.
   * @throws {Error} if the player never ended a run with `outcome`.
   */
  draw(mission: Mission, outcome: MissionOutcome, rng: Rng): MatrixDraw {
    const { cell, route } = this.cellOf(mission);
    const band = route === "band" ? (mission.act ?? "act-1") : bandOf(cell);
    const ended = this.runs.filter((run) => run.outcome === outcome);
    const pools: readonly [OutcomePool, readonly MatrixRun[]][] = [
      ["cell", ended.filter((run) => run.cell === cell)],
      ["band", ended.filter((run) => run.band === band)],
      ["any", ended],
    ];
    for (const [pool, runs] of pools) {
      if (pool === "cell" && route === "band") continue;
      if (runs.length > 0) {
        return { run: rng.pick(runs), cell, route, pool };
      }
    }
    throw new Error(`the matrix has no ${this.player} run that ${outcome}`);
  }

  /**
   * The table itself: each cell's runs of each outcome, with their mean
   * losses, in cell then outcome order.
   *
   * @returns One row per cell and outcome that has runs.
   */
  rows(): MatrixLossRow[] {
    return this.cells().flatMap((cell) =>
      (["won", "extracted", "lost"] as const).flatMap((outcome) => {
        const runs = this.runs.filter(
          (run) => run.cell === cell && run.outcome === outcome,
        );
        if (runs.length === 0) return [];
        const mean = (pick: (run: MatrixRun) => number): number =>
          runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
        return [
          {
            cell,
            outcome,
            runs: runs.length,
            squadsLost: mean((run) => run.squads.lost),
            mechsLost: mean((run) => run.mechs.lost),
            abandoned: mean((run) => (run.abandoned === "" ? 0 : 1)),
          },
        ];
      }),
    );
  }

  // ===========================================
  // Private
  // ===========================================

  /** Every cell the player has runs in, in first-run order. */
  private cells(): string[] {
    return [...new Set(this.runs.map((run) => run.cell))];
  }

  /** The band nearest `band` in which the matrix plays `type`, the earlier on a tie. */
  private nearestBandOf(type: string, band: ActId): ActId | undefined {
    const at = ACT_IDS.indexOf(band);
    const played = ACT_IDS.filter((each) =>
      this.cells().includes(`${type}/${each}`),
    );
    return [...played].sort(
      (a, b) =>
        Math.abs(ACT_IDS.indexOf(a) - at) - Math.abs(ACT_IDS.indexOf(b) - at) ||
        ACT_IDS.indexOf(a) - ACT_IDS.indexOf(b),
    )[0];
  }
}

// ===========================================
// The loss model
// ===========================================

/**
 * The loss model that takes each mission's losses from one of `table`'s
 * runs (the module comment): a dealt-lost squad is wiped, a dealt-lost
 * mech destroyed, and every other unit comes home whole.
 *
 * @param table - Whose runs.
 * @param observe - Told every draw, for the probe's mapping counts.
 * @returns The loss model.
 */
export function matrixLosses(
  table: MatrixLossTable,
  observe?: (draw: MatrixDraw, mission: Mission) => void,
): LossModel {
  return {
    roll: (outcome, mission, deployment, state, rng) => {
      const draw = table.draw(mission, outcome, rng);
      observe?.(draw, mission);
      const squads = deployedUnits(deployment.squadIds, state.squads);
      const squadLost = dealLosses(draw.run.squads, squads.length, rng);
      const squadCasualties: SquadCasualties[] = [];
      const squadsWiped: string[] = [];
      squads.forEach((squad, index) => {
        if (squadLost[index] !== true || squad.strength === 0) return;
        squadCasualties.push({ squadId: squad.id, losses: squad.strength });
        squadsWiped.push(squad.id);
      });
      const mechs = deployedUnits(deployment.mechIds, state.mechs);
      const mechLost = dealLosses(draw.run.mechs, mechs.length, rng);
      const mechDamage: MechDamageReport[] = [];
      const mechsDestroyed: string[] = [];
      mechs.forEach((mech, index) => {
        const remaining = MECH_MAX_DAMAGE - mech.damage;
        if (mechLost[index] !== true || remaining <= 0) return;
        mechDamage.push({ mechId: mech.id, damage: remaining });
        mechsDestroyed.push(mech.id);
      });
      return { squadCasualties, squadsWiped, mechDamage, mechsDestroyed };
    },
  };
}

/**
 * Deals a run's losses of one kind to `count` deployed units: the run's
 * slots, `losses.lost` of `losses.deployed` marked lost, repeated as
 * often as `count` needs, shuffled, and the first `count` taken.
 *
 * ```
 *   run: 5 squads, 2 lost ──► [L L . . .] ──► shuffle ──► first `count`
 *   count 7            ──► [L L . . . L L . . .] ──► shuffle ──► first 7
 * ```
 *
 * @param losses - The run's deployed and lost units of the kind.
 * @param count - The deployment's units of the kind.
 * @param rng - The mission's stream.
 * @returns Whether each deployed unit, in order, is lost.
 */
export function dealLosses(
  losses: UnitLosses,
  count: number,
  rng: Rng,
): boolean[] {
  if (losses.deployed === 0 || count === 0) {
    return Array.from({ length: count }, () => false);
  }
  const slots = Array.from(
    { length: losses.deployed },
    (_, index) => index < losses.lost,
  );
  const copies = Math.ceil(count / losses.deployed);
  const dealt = rng.shuffle(Array.from({ length: copies }, () => slots).flat());
  return dealt.slice(0, count);
}

// ===========================================
// The players
// ===========================================

/** The opt-in player that takes each tactical player's losses. */
export const MATRIX_PLAYER_OF: Readonly<Record<PlayerId, MatrixPlayerId>> = {
  new: "matrix-new",
  expert: "matrix-expert",
};

/**
 * The `realistic` player, its spending and everything else unchanged,
 * with its losses taken from `table`'s runs instead of the
 * auto-resolver's scale.
 *
 * @param table - Whose losses.
 * @param observe - Told every draw (`matrixLosses`).
 * @returns The opt-in player, `matrix-new` or `matrix-expert`.
 */
export function matrixPlayer(
  table: MatrixLossTable,
  observe?: (draw: MatrixDraw, mission: Mission) => void,
): OptInPlayer {
  const realistic = OPT_IN_PLAYERS.realistic;
  return {
    player: {
      ...realistic.player,
      id: MATRIX_PLAYER_OF[table.player],
      losses: matrixLosses(table, observe),
    },
    spending: realistic.spending,
  };
}

// ===========================================
// Helpers
// ===========================================

/** The band a cell id ends in. */
function bandOf(cell: string): ActId {
  const band = cell.slice(cell.lastIndexOf("/") + 1);
  const known = ACT_IDS.find((act) => act === band);
  if (known === undefined) throw new Error(`runs.tsv: ${cell} has no band`);
  return known;
}

/** A player id off the file, or a thrown error. */
function playerOf(value: string): PlayerId {
  const known = PLAYER_IDS.find((id) => id === value);
  if (known === undefined) throw new Error(`runs.tsv: unknown player ${value}`);
  return known;
}
