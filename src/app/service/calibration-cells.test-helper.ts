import { MISSION_TYPES } from "../../content/data/mission-types";
import { INSTALLATION_SITES } from "../../content/data/installation-sites";
import type { ActId } from "../../content/model/act-id";
import type { InstallationSiteId } from "../../content/model/installation-site-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { SpeciesMix } from "../../bugs/model/species-mix";
import { bugMixFor } from "../../bugs/service/bestiary-service";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import { ACTS } from "../../overworld/data/acts";
import { HIVE_TUNING } from "../../overworld/data/hive-tuning";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import type { City } from "../../overworld/model/city";
import type { Mission } from "../../overworld/model/mission";
import type { MissionOfferContext } from "../../overworld/model/mission-offer-rule";
import type { MissionPinContext } from "../../overworld/model/mission-pin-trigger";
import type { OverworldState } from "../../overworld/model/overworld-state";
import {
  asCrashSiteOffer,
  landedCity,
} from "../../overworld/service/missions/crash-site-landing";
import { wavesFor } from "../../overworld/service/missions/defend-installation-trigger";
import { asEvacuationOffer } from "../../overworld/service/missions/evacuation-offer";
import { buildOfferAtDifficulty } from "../../overworld/service/missions/mission-offer-builder";
import { buildStoryOffer } from "../../overworld/service/story/story-offer-builder";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import { wreckOf } from "../../overworld/service/wreck-service";
import type { Mech } from "../../roster/model/mech";
import type { TechNodeId } from "../../tech/model/tech-node";
import type { ForceBand } from "./calibration-forces.test-helper";
import { CALIBRATION_FORCES } from "./calibration-forces.test-helper";

// ===========================================
// The matrix's cells (#1179, campaign arc §12)
// ===========================================
//
// One cell per mission type (or story mission) per act band the arc
// offers it in. A cell builds its offer the way the director does —
// the type's own decoration over `buildOfferAtDifficulty` — at a
// difficulty cycled through the act's band by seed, with the act's bug
// mix at a mission count spread over the act's length, so a cell's
// seeds sample the whole act.
//
//   cell × seed index ──► difficulty  band[i mod |band|]
//                     ──► mix         bugMixFor(act, spread[i mod |spread|])
//                     ──► city        cities[(i × 7 + cell) mod |cities|], infestation ≈ d × 10
//                     ──► offer       the type's recipe, story rule or trigger shape

/** What an offer recipe is handed. */
export interface OfferInput {
  readonly state: OverworldState;
  readonly city: City;
  readonly difficulty: number;
  readonly seedIndex: number;
  readonly ctx: MissionOfferContext;
}

/** One cell of the matrix. */
export interface CalibrationCell {
  /** `<mission>/<band>`, e.g. `crash-site/act-2`. */
  readonly id: string;
  /** The mission type, or `story:<id>` for a story mission. */
  readonly mission: string;
  /** Whose force deploys, and whose band target the new player's wins count towards. */
  readonly band: ForceBand;
  /** The act the offer is made in: its bug mix and band. */
  readonly act: ActId;
  /** Difficulties cycled over the seeds. */
  readonly difficulties: readonly number[];
  /** Tech the mission itself needs besides the force's. */
  readonly extraTech: readonly TechNodeId[];
  /** Missions played before this one, for a story gate. */
  readonly missionsPlayed: number;
  /** The offer for seed `seedIndex`. */
  offer(input: OfferInput): Mission;
}

// ===========================================
// Spreads
// ===========================================

/** Missions into each act the seeds sample, spread over the act's length (arc: I 12, II 20, III 15). */
const MISSIONS_INTO_ACT: Readonly<Record<ActId, readonly number[]>> = {
  "act-1": [2, 5, 8, 11],
  "act-2": [2, 7, 12, 17],
  "act-3": [1, 5, 9, 13],
  finale: [0, 1, 2, 2],
};

/** Every difficulty of the act's band, low to high. */
function bandOf(act: ActId): readonly number[] {
  const { min, max } = ACTS[act].difficultyBand;
  const band: number[] = [];
  for (let d = min; d <= max; d++) band.push(d);
  return band;
}

/** The bug mix a seed of `cell` fights. */
export function cellBugMix(
  cell: CalibrationCell,
  seedIndex: number,
): SpeciesMix {
  const spread = MISSIONS_INTO_ACT[cell.act];
  return bugMixFor(cell.act, spread[seedIndex % spread.length] ?? 0);
}

/** The difficulty a seed of `cell` plays at. */
export function cellDifficulty(
  cell: CalibrationCell,
  seedIndex: number,
): number {
  const band = cell.difficulties;
  return band[seedIndex % band.length] ?? band[0] ?? 1;
}

// ===========================================
// Recipes
// ===========================================

/** An ordinary offer of `typeId`. */
function ordinary(typeId: MissionTypeId) {
  return (input: OfferInput): Mission =>
    buildOfferAtDifficulty(
      input.state,
      input.city,
      typeId,
      input.difficulty,
      input.ctx,
    );
}

/** A crash site: built on the landed city, then marked. */
function crashSite(input: OfferInput): Mission {
  const tuning = MISSION_TUNING.crashSite;
  const offer = buildOfferAtDifficulty(
    input.state,
    landedCity(input.city, tuning),
    "crash-site",
    input.difficulty,
    input.ctx,
  );
  return asCrashSiteOffer(offer, input.city, tuning);
}

/** An evacuation: its groups from the difficulty. */
function evacuation(input: OfferInput): Mission {
  return asEvacuationOffer(
    ordinary("evacuation")(input),
    MISSION_TUNING.evacuation,
  );
}

/** A tunnel sabotage: the spread it stops is due in two days. */
function tunnelSabotage(input: OfferInput): Mission {
  return {
    ...ordinary("tunnel-sabotage")(input),
    tunnelSabotage: {
      cityId: input.city.id,
      spreadDueDay: input.state.day + 2,
    },
  };
}

/** A defence of one of the buildable installations, cycled by seed, waves from the city's infestation. */
function defence(input: OfferInput): Mission {
  const sites: readonly InstallationSiteId[] = [
    "sensor-array",
    "repellent-dispersal",
    "defensive-battery",
    "bank",
  ];
  const installation = sites[input.seedIndex % sites.length] ?? "sensor-array";
  return {
    ...ordinary("defend-installation")(input),
    defence: {
      installation,
      generators: INSTALLATION_SITES[installation].generators,
      waves: wavesFor(input.city.infestation, MISSION_TUNING.defence),
    },
  };
}

/** A hive assault on a hive of level 0–2 by seed. */
function hiveAssault(input: OfferInput): Mission {
  return {
    ...ordinary("hive-assault")(input),
    pinned: true,
    hive: {
      hiveId: `hive-calibration-${String(input.seedIndex)}`,
      regionId: input.city.regionId,
      level: input.seedIndex % 3,
    },
  };
}

/** A wreck recovery of a mech like the band's own, lost the day before. */
function wreckRecovery(band: ForceBand) {
  return (input: OfferInput): Mission => {
    const offer = ordinary("wreck-recovery")(input);
    const lost: Mech = {
      id: "mech-lost",
      name: "Lost",
      loadout: CALIBRATION_FORCES[band].loadout,
      damage: 0,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    };
    const wreck = wreckOf(
      lost,
      { ...offer, id: "mission-lost" },
      input.state.day,
      MISSION_TUNING.wreck.stripTurns,
    );
    return {
      ...offer,
      wreck,
      rewards: { ...offer.rewards, parts: wreck.parts },
    };
  };
}

/** A story mission from its own rule, at the state the rule reads. */
function story(storyId: StoryMissionId) {
  return (input: OfferInput): Mission => {
    const rule = STORY_MISSION_RULES[storyId];
    if (rule === undefined) throw new Error(`story ${storyId} is not built`);
    const ctx: MissionPinContext = { ...input.ctx, displaceable: () => true };
    const offer = rule.create(input.state, ctx);
    if (offer === undefined)
      throw new Error(`story ${storyId} offered nothing`);
    return offer;
  };
}

/** A Great Hive assault: the story offer at its fixed difficulty on a level-0 great hive. */
function greatHive(input: OfferInput): Mission {
  const offer = buildStoryOffer(
    input.state,
    input.city,
    {
      storyId: "great-hive",
      typeId: "hive-assault",
      difficulty: MISSION_TUNING.greatHive.difficulty,
      act: "act-3",
    },
    input.ctx,
  );
  return {
    ...offer,
    hive: {
      hiveId: "great-hive-calibration",
      regionId: input.city.regionId,
      level: 0,
      great: true,
    },
  };
}

// ===========================================
// The cells
// ===========================================

/** A cell over an ordinary mission type in `act`, played by that act's force. */
function typeCell(
  mission: MissionTypeId,
  act: ActId,
  offer: (input: OfferInput) => Mission,
): CalibrationCell {
  return {
    id: `${mission}/${act}`,
    mission,
    band: act,
    act,
    difficulties: bandOf(act),
    extraTech: [],
    missionsPlayed: 6,
    offer,
  };
}

/** A story cell at its fixed difficulty. */
function storyCell(
  storyId: StoryMissionId,
  band: ForceBand,
  act: ActId,
  difficulty: number,
  offer: (input: OfferInput) => Mission,
  extraTech: readonly TechNodeId[] = [],
): CalibrationCell {
  return {
    id: `story:${storyId}/${band}`,
    mission: `story:${storyId}`,
    band,
    act,
    difficulties: [difficulty],
    extraTech,
    missionsPlayed: 6,
    offer,
  };
}

/** Every cell the matrix plays, in report order. */
export const CALIBRATION_CELLS: readonly CalibrationCell[] = [
  typeCell("infestation-clearance", "act-1", ordinary("infestation-clearance")),
  typeCell("infestation-clearance", "act-2", ordinary("infestation-clearance")),
  typeCell("infestation-clearance", "act-3", ordinary("infestation-clearance")),
  typeCell("crash-site", "act-1", crashSite),
  typeCell("crash-site", "act-2", crashSite),
  typeCell("crash-site", "act-3", crashSite),
  typeCell("evacuation", "act-1", evacuation),
  typeCell("evacuation", "act-2", evacuation),
  typeCell("evacuation", "act-3", evacuation),
  typeCell("defend-installation", "act-1", defence),
  typeCell("defend-installation", "act-2", defence),
  typeCell("defend-installation", "act-3", defence),
  typeCell("tunnel-sabotage", "act-2", tunnelSabotage),
  typeCell("tunnel-sabotage", "act-3", tunnelSabotage),
  typeCell("wreck-recovery", "act-2", wreckRecovery("act-2")),
  typeCell("wreck-recovery", "act-3", wreckRecovery("act-3")),
  typeCell("hive-assault", "act-2", hiveAssault),
  typeCell("hive-assault", "act-3", hiveAssault),
  storyCell("first-skyfall", "act-1", "act-1", 1, story("first-skyfall")),
  storyCell("live-specimen", "act-1", "act-1", 3, story("live-specimen"), [
    "tech.pheromone-analysis",
  ]),
  storyCell("intact-pod", "act-2", "act-2", 6, story("intact-pod")),
  storyCell("uplink", "act-3", "act-3", 6, story("uplink")),
  storyCell(
    "great-hive",
    "act-3",
    "act-3",
    MISSION_TUNING.greatHive.difficulty,
    greatHive,
  ),
  storyCell("launch-window", "finale", "act-3", 8, story("launch-window")),
];

// ===========================================
// Selecting cells
// ===========================================
//
// `SIM_MATRIX_CELLS` names the cells a matrix run plays, so a tuning
// package can replay only its own: a comma-separated list of cell ids
// or prefixes of them. A cell is selected when any entry is a prefix of
// its id; no entries selects every cell.
//
//   hive-assault                     hive-assault/act-2, hive-assault/act-3
//   story:great-hive/act-3           that cell only
//   evacuation/act-2,story:uplink    those two
//   story:                           every story cell

/** A cell of the matrix with its place in `CALIBRATION_CELLS`, which its runs are keyed by. */
export interface SelectedCell {
  readonly cell: CalibrationCell;
  readonly cellIndex: number;
}

/** The entries of a `SIM_MATRIX_CELLS` value: split on commas, trimmed, blanks dropped; none when unset. */
export function parseCellFilters(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Whether `filters` select the cell `cellId`: no filters select everything, else any entry that prefixes it. */
export function cellMatches(
  filters: readonly string[],
  cellId: string,
): boolean {
  return (
    filters.length === 0 || filters.some((entry) => cellId.startsWith(entry))
  );
}

/**
 * The cells `filters` select, in `CALIBRATION_CELLS` order, each with
 * its index there. An entry that selects no cell is a typo, not an
 * empty run, and throws.
 */
export function selectCells(
  filters: readonly string[],
  cells: readonly CalibrationCell[] = CALIBRATION_CELLS,
): readonly SelectedCell[] {
  for (const entry of filters) {
    if (!cells.some((cell) => cell.id.startsWith(entry))) {
      throw new Error(`SIM_MATRIX_CELLS entry "${entry}" selects no cell`);
    }
  }
  return cells
    .map((cell, cellIndex) => ({ cell, cellIndex }))
    .filter(({ cell }) => cellMatches(filters, cell.id));
}

// ===========================================
// Offer context
// ===========================================

/** The director's offer context for `act`, over the caller's streams. */
export function offerContext(
  act: ActId,
  rng: Rng,
  ids: IdGenerator,
): MissionOfferContext {
  return {
    rng,
    ids,
    tuning: MISSION_TUNING,
    missionTypes: MISSION_TYPES,
    intelBonus: {},
    act: ACTS[act],
    hive: HIVE_TUNING,
  };
}

/** The city a seed of `cell` is offered at, its infestation set to the difficulty's ten times. */
export function cellCity(
  state: OverworldState,
  cellIndex: number,
  seedIndex: number,
  difficulty: number,
): City {
  const cities = state.map.cities;
  const city = cities[(seedIndex * 7 + cellIndex * 3) % cities.length];
  if (city === undefined) throw new Error("the map has no cities");
  return {
    ...city,
    infestation: Math.min(100, difficulty * 10),
    detected: true,
  };
}
