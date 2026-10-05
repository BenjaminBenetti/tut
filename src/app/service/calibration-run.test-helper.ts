import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameState } from "../../save/model/game-state";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { advanceStage } from "../../tactical/model/advance-stage-command";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { END_TURN } from "../../tactical/model/end-turn-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { isCombatUnit, isStandingForce } from "../../tactical/model/unit";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { registryStructureCatalogue } from "../../tactical/service/structure-catalogue";
import { EXPERT_OBJECTIVE_STRATEGIES } from "../../tactical/service/players/expert-objective-strategies.test-helper";
import { createExpertPlayerPolicy } from "../../tactical/service/players/expert-player-policy.test-helper";
import { createNewPlayerPolicy } from "../../tactical/service/players/new-player-policy.test-helper";
import { OBJECTIVE_STRATEGIES } from "../../tactical/service/players/objective-strategies.test-helper";
import type { PlayerRules } from "../../tactical/service/players/player-combat.test-helper";
import type {
  CommandApplier,
  StageAdvance,
  TacticalPlayer,
} from "../../tactical/service/players/tactical-player.test-helper";
import { playMission } from "../../tactical/service/players/tactical-player.test-helper";
import type { CalibrationCell } from "./calibration-cells.test-helper";
import {
  CALIBRATION_CELLS,
  cellBugMix,
  cellCity,
  cellDifficulty,
  offerContext,
} from "./calibration-cells.test-helper";
import {
  CALIBRATION_FORCES,
  everyone,
  withForce,
} from "./calibration-forces.test-helper";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// One calibration run (#1179, campaign arc §12)
// ===========================================
//
// A run is one mission of one cell, played by one modelled player
// through the shipped composition: the dispatcher's own StartMission
// generates the map and places the force, every tactical command goes
// through the same lifted handlers the screen dispatches to, and the
// bug phase runs inside each EndTurn, timed.
//
//   campaign(seed) ──► withForce(band) ──► offer(cell, seed) on the board
//        ──► StartMission(everyone) ──► meta.rng := luck(seed, player)
//        ──► playMission(player, dispatcher.process) ──► RunResult
//
// A linked mission (the Spore Platform) goes on from a won stage with
// the dispatcher's own AdvanceStage, in the same campaign, so the
// survivors carry their damage and ammunition to the next map.
//
// The map and the bugs' opening come from the offer, so both players
// meet the same mission on the same seed. The dice of every command
// after the start are forked from `meta.rng`, which the run replaces
// with the luck stream: each player rolls its own (`luck` = its id),
// and the decision-gap cell hands the expert the new player's.

/**
 * The shipped rules the modelled players read: the structures from the
 * shipped registries, as the composition root builds them, so a player
 * prices a wall by what brings it down (#1238).
 */
export const CALIBRATION_RULES: PlayerRules = {
  catalogue: SHIPPED_EQUIPMENT,
  combat: COMBAT_TUNING,
  objective: OBJECTIVE_TUNING,
  structures: registryStructureCatalogue(createDefaultRegistries()),
};

/** The two players. */
export type PlayerId = "new" | "expert";

/** Every player id, in report order. */
export const PLAYER_IDS: readonly PlayerId[] = ["new", "expert"];

/**
 * The modelled player called `id`: its policy, and the strategies it
 * reads the objectives with — the shared table for the new player, the
 * expert's own (the shared one with its rescue laid over it) for the
 * expert.
 */
export function playerFor(id: PlayerId): TacticalPlayer {
  return id === "new"
    ? {
        policy: createNewPlayerPolicy(CALIBRATION_RULES),
        strategies: OBJECTIVE_STRATEGIES,
      }
    : {
        policy: createExpertPlayerPolicy(CALIBRATION_RULES),
        strategies: EXPERT_OBJECTIVE_STRATEGIES,
      };
}

/** Turns a mission gets before the force abandons it. */
export const CALIBRATION_TURN_CAP = 60;

/** The clock every calibration campaign reads. */
const NOW = "2026-09-26T00:00:00.000Z";

/** One run to play. */
export interface RunSpec {
  readonly cellIndex: number;
  readonly seedIndex: number;
  /** Who decides. */
  readonly player: PlayerId;
  /** Whose dice: the player's own, or the other's for the decision-gap cell. */
  readonly luck: PlayerId;
}

/** What one run came to. */
export interface RunResult {
  readonly cell: string;
  readonly seedIndex: number;
  readonly player: PlayerId;
  readonly luck: PlayerId;
  readonly difficulty: number;
  readonly outcome: MissionOutcome;
  /** True when the force abandoned it. */
  readonly capped: boolean;
  /** Why it was abandoned: the turn cap, or stalled with the job done; "" when it ended on its own. */
  readonly abandoned: string;
  readonly turns: number;
  /** Squads and mechs deployed that did not extract. */
  readonly unitsLost: number;
  /** Mechs deployed that did not extract. */
  readonly mechsLost: number;
  readonly deployed: number;
  /** Median wall time of the bug phase (EndTurn), ms. */
  readonly bugPhaseMs: number;
  /** Shots the force fired, and how many hit. */
  readonly shots: number;
  readonly hits: number;
  readonly commands: number;
  readonly refused: number;
  /** Wall time of the whole run, ms. */
  readonly wallMs: number;
}

// ===========================================
// Playing
// ===========================================

/** A run's mission, started and handed its dice, ready to play. */
export interface StartedRun {
  readonly game: GameComposition;
  readonly cell: CalibrationCell;
  /** The campaign around the mission. */
  readonly campaign: GameState;
  readonly opening: TacticalState;
}

/**
 * Starts `spec`'s mission through the dispatcher and replaces the
 * campaign's stream with the run's luck, so every tactical command
 * after the start rolls dice forked from it.
 */
export function startRun(spec: RunSpec): StartedRun {
  const cell = cellAt(spec.cellIndex);
  const campaignSeed = 1_000 + spec.seedIndex;
  const game = composeCalibrationGame(campaignSeed);
  const prepared = prepareRun(game, spec);
  const started = game.dispatcher.process(
    prepared.state,
    startMission(
      prepared.missionId,
      everyone(prepared.state, prepared.missionId),
    ),
  );
  if (!started.ok) {
    throw new Error(
      `${cell.id} #${String(spec.seedIndex)}: ${started.error.message}`,
    );
  }
  const campaign: GameState = {
    ...started.value.state,
    meta: {
      ...started.value.state.meta,
      rng: new Mulberry32Rng(luckSeed(campaignSeed, spec.luck)).getState(),
    },
  };
  const opening = campaign.activeMission;
  if (opening === undefined) {
    throw new Error(`${cell.id} #${String(spec.seedIndex)}: no mission`);
  }
  return { game, cell, campaign, opening };
}

/** Plays `spec` to a result. */
export function playRun(spec: RunSpec): RunResult {
  const began = performance.now();
  const { game, cell, campaign, opening } = startRun(spec);
  const meter = createMeter();
  const session = calibrationSession(game, campaign, meter);
  const play = playMission(
    opening,
    playerFor(spec.player),
    session.apply,
    CALIBRATION_TURN_CAP,
    session.advance,
  );
  const outcome = play.mission.outcome;
  if (outcome === undefined) {
    throw new Error(`${cell.id} #${String(spec.seedIndex)}: no outcome`);
  }
  const losses = lossesOf(opening, play.mission);
  return {
    cell: cell.id,
    seedIndex: spec.seedIndex,
    player: spec.player,
    luck: spec.luck,
    difficulty: cellDifficulty(cell, spec.seedIndex),
    outcome,
    capped: play.capped,
    abandoned: play.abandoned ?? "",
    turns: play.turns,
    unitsLost: losses.units,
    mechsLost: losses.mechs,
    deployed: losses.deployed,
    bugPhaseMs: median(meter.bugPhaseMs),
    shots: meter.shots,
    hits: meter.hits,
    commands: play.commands,
    refused: play.refused.length,
    wallMs: performance.now() - began,
  };
}

/** The cell at `index`, or a thrown error. */
export function cellAt(index: number): CalibrationCell {
  const cell = CALIBRATION_CELLS[index];
  if (cell === undefined) throw new Error(`no cell ${String(index)}`);
  return cell;
}

/** The shipped composition over an in-memory store, seeded `seed`. */
export function composeCalibrationGame(seed: number): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => seed,
    onAutosaveFailure: () => undefined,
  });
}

// ===========================================
// Preparing and applying
// ===========================================

/** A campaign with the band's force and the cell's offer on the board. */
export interface PreparedRun {
  readonly state: GameState;
  readonly missionId: string;
}

/**
 * A fresh campaign in the cell's act with the band's force, and the
 * cell's offer for this seed on the board. The offer's streams are the
 * cell's and the seed's, never the player's, so both players meet the
 * same mission.
 */
export function prepareRun(game: GameComposition, spec: RunSpec): PreparedRun {
  const cell = cellAt(spec.cellIndex);
  const campaignSeed = 1_000 + spec.seedIndex;
  const created = game.createCampaign({ seed: campaignSeed, createdAt: NOW });
  const forced = withForce(
    game,
    created,
    CALIBRATION_FORCES[cell.band],
    cell.extraTech,
  );
  const difficulty = cellDifficulty(cell, spec.seedIndex);
  const city = cellCity(
    forced.overworld,
    spec.cellIndex,
    spec.seedIndex,
    difficulty,
  );
  const overworld = {
    ...forced.overworld,
    missions: [],
    map: {
      ...forced.overworld.map,
      cities: forced.overworld.map.cities.map((c) =>
        c.id === city.id ? city : c,
      ),
    },
    progress: {
      ...forced.overworld.progress,
      act: cell.act,
      missionsPlayed: cell.missionsPlayed,
    },
  };
  const ids = new SequentialIdGenerator(forced.meta.ids);
  const rng = new Mulberry32Rng(
    hashSeed(`calibration:${cell.id}:${String(spec.seedIndex)}`),
  );
  const built = cell.offer({
    state: overworld,
    city,
    difficulty,
    seedIndex: spec.seedIndex,
    ctx: offerContext(cell.act, rng, ids),
  });
  const offer = {
    ...built,
    bugMix: built.bugMix ?? cellBugMix(cell, spec.seedIndex),
  };
  return {
    state: {
      ...forced,
      meta: { ...forced.meta, ids: ids.getState() },
      overworld: { ...overworld, missions: [offer] },
    },
    missionId: offer.id,
  };
}

/** What the applier counts as the mission is played. */
export interface RunMeter {
  readonly bugPhaseMs: number[];
  shots: number;
  hits: number;
}

/** An empty meter. */
export function createMeter(): RunMeter {
  return { bugPhaseMs: [], shots: 0, hits: 0 };
}

/** The rules a run is played with: its tactical commands, and a linked mission's next stage. */
export interface CalibrationSession {
  readonly apply: CommandApplier;
  readonly advance: StageAdvance;
}

/**
 * Applies tactical commands through the shipped dispatcher, starting
 * from `state` (the campaign around the mission), timing each EndTurn
 * and counting the force's shots from the events; and advances a
 * linked mission over the same campaign, dispatching AdvanceStage from
 * wherever the last command left it, so the next map starts where the
 * last one ended.
 */
export function calibrationSession(
  game: GameComposition,
  state: GameState,
  meter: RunMeter,
): CalibrationSession {
  let campaign = state;
  const apply = (
    mission: TacticalState,
    command: TacticalCommand,
  ): Result<TacticalState, string> => {
    const before = { ...campaign, activeMission: mission };
    const began = performance.now();
    const applied = game.dispatcher.process(before, command);
    const took = performance.now() - began;
    if (!applied.ok) return err(applied.error.code);
    if (command.type === END_TURN) meter.bugPhaseMs.push(took);
    const tdf = new Set(
      mission.units
        .filter((u) => u.team === "tdf" && isCombatUnit(u))
        .map((u) => u.id),
    );
    for (const event of applied.value.events) {
      if (event.type !== ATTACK_RESOLVED) continue;
      const payload = event.payload as { attackerId: string; hit: boolean };
      if (!tdf.has(payload.attackerId)) continue;
      meter.shots += 1;
      if (payload.hit) meter.hits += 1;
    }
    campaign = applied.value.state;
    const next = campaign.activeMission;
    return next === undefined ? err("no-active-mission") : ok(next);
  };
  const advance = (mission: TacticalState): Result<TacticalState, string> => {
    const before = { ...campaign, activeMission: mission };
    const applied = game.dispatcher.process(
      before,
      advanceStage(mission.missionId),
    );
    if (!applied.ok) return err(applied.error.code);
    campaign = applied.value.state;
    const next = campaign.activeMission;
    return next === undefined ? err("no-active-mission") : ok(next);
  };
  return { apply, advance };
}

// ===========================================
// Private
// ===========================================

/** The dice seed of a run: the campaign's seed and whose luck it is. */
function luckSeed(campaignSeed: number, luck: PlayerId): number {
  return hashSeed(`calibration-luck:${String(campaignSeed)}:${luck}`);
}

/**
 * Squads and mechs deployed at the opening that did not come through:
 * neither extracted nor, on a mission won on the spot (the platform
 * core), still standing. A survivor carried to a later stage keeps its
 * id, so the opening's force is read against the last map.
 */
function lossesOf(
  opening: TacticalState,
  end: TacticalState,
): { units: number; mechs: number; deployed: number } {
  const deployed = opening.units.filter(
    (u) => u.team === "tdf" && isCombatUnit(u),
  );
  const out = new Set(
    [...end.extracted, ...end.units.filter(isStandingForce)].map(
      (u: Unit) => u.id,
    ),
  );
  const lost = deployed.filter((u) => !out.has(u.id));
  return {
    units: lost.length,
    mechs: lost.filter((u) => u.kind === "mech").length,
    deployed: deployed.length,
  };
}

/** The median of `values`; 0 for none. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
