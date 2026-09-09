import type { GameState } from "../../save/model/game-state";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { TacticalError } from "../../tactical/model/tactical-error";
import { describeTacticalError } from "../../tactical/model/tactical-error";
import type { TacticalState } from "../../tactical/model/tactical-state";

// ===========================================
// Types
// ===========================================

/**
 * Turns the ids a refusal carries into what the player calls those
 * things (#1035).
 *
 * The typed error keeps its ids — they are what a log, a test and a
 * diagnostic need, and `describeTacticalError` still renders them. This
 * is the other half: the same refusal in the words on the screen.
 */
export interface TacticalNames {
  /** A unit's name from its template, never its id. */
  unit(id: string): string;
  /**
   * An objective, named by its **ordinal** — "spawner 2".
   *
   * By ordinal and not by any name of its own, because that is what the
   * objective tracker says (#949): `Destroy spawner ${index + 1}`,
   * counted in `mission.objectives`. A refusal that named the same nest
   * any other way would contradict the panel next to it.
   */
  objective(id: string): string;
  /**
   * The spawner a refusal names, by the ordinal of the objective that
   * tracks it.
   *
   * Separate from `objective` because the errors carry both: an
   * objective id in `objective-complete`, and the **spawner's** id in
   * `target-destroyed`. Both have to come out as the same "spawner 2"
   * the tracker shows, so the lookup differs but the wording cannot.
   */
  spawner(id: string): string;
  /** A mech's name from the roster. */
  mech(id: string): string;
  /** A mission, named by the city it is fought over (#739, #753). */
  mission(id: string): string;
}

// ===========================================
// Constants
// ===========================================

/**
 * What a name resolves to when the thing is not in state any more.
 *
 * Never the id — that is the defect this exists to remove, and #753
 * settled that a fallback to the id is a permanent route back to it.
 * Never "unknown" either: `No line of sight to unknown` reads as a
 * missing value, where `No line of sight to that unit` reads as a
 * sentence about a thing the player was just looking at.
 */
const ANONYMOUS = {
  unit: "that unit",
  objective: "that objective",
  mech: "that mech",
  mission: "that mission",
} as const;

// ===========================================
// Public Functions
// ===========================================

/**
 * Builds a resolver from what the screen already holds.
 *
 * @param mission - The mission in progress, for unit and objective names.
 * @param campaign - The campaign, for the roster and the map. Optional:
 *   a tactical screen without one still resolves everything in-mission.
 * @returns A resolver for every id a refusal can carry.
 */
export function namesFor(
  mission: TacticalState | undefined,
  campaign?: GameState,
): TacticalNames {
  const units = new Map((mission?.units ?? []).map((unit) => [unit.id, unit]));
  const objectives = mission?.objectives ?? [];
  return {
    unit: (id) => {
      const unit = units.get(id);
      const template = unit ? mission?.templates[unit.templateId] : undefined;
      return template?.name ?? ANONYMOUS.unit;
    },
    objective: (id) =>
      ordinalOf(objectives.findIndex((objective) => objective.id === id)),
    spawner: (id) =>
      ordinalOf(objectives.findIndex((objective) => objective.targetId === id)),
    mech: (id) =>
      campaign?.roster.mechs.find((mech) => mech.id === id)?.name ??
      ANONYMOUS.mech,
    mission: (id) => {
      if (!campaign) {
        return ANONYMOUS.mission;
      }
      const found = campaign.overworld.missions.find((m) => m.id === id);
      const city = found
        ? findCity(campaign.overworld.map, found.cityId)
        : undefined;
      return city?.name ?? ANONYMOUS.mission;
    },
  };
}

/**
 * A refusal in the player's words, with names where the typed error
 * carries ids (#1035).
 *
 * Only the kinds that interpolate an id are rewritten; everything else
 * delegates to `describeTacticalError`, so a new error kind that names
 * nothing is right without being touched. A new kind that *does* name
 * something would fall through to the developer wording — which is the
 * old defect returning quietly — so `tactical-error-text.test.ts` walks
 * every kind with a sentinel in each id field and fails if the sentinel
 * reaches this function's output.
 *
 * @param error - The refusal the rules produced.
 * @param names - Resolver for the ids it carries.
 * @returns The sentence to show the player.
 */
export function describeRefusal(
  error: TacticalError,
  names: TacticalNames,
): string {
  switch (error.kind) {
    case "mission-active":
      return `${names.mission(error.missionId)} is already in progress`;
    case "mission-not-found":
      return `That mission is no longer on offer`;
    case "mission-not-over":
      return `${names.mission(error.missionId)} is still being fought`;
    case "mission-mismatch":
      return `${names.mission(error.expected)} was expected, but ${names.mission(error.active)} is in progress`;
    case "unit-not-found":
      return `${names.unit(error.unitId)} is not in the roster`;
    case "unit-not-on-map":
      return `${names.unit(error.unitId)} is not in this mission`;
    case "unit-dead":
      return `${names.unit(error.unitId)} is dead`;
    case "wrong-phase":
      return `${names.unit(error.unitId)} cannot act in this phase`;
    case "no-action-points":
      return `${names.unit(error.unitId)} has no action points left`;
    case "self-target":
      return `${names.unit(error.unitId)} cannot attack itself`;
    case "friendly-target":
      return `${names.unit(error.targetId)} is on the same side`;
    case "no-line-of-sight":
      return `No line of sight to ${names.unit(error.targetId)}`;
    case "target-destroyed":
      return `${capitalise(names.spawner(error.targetId))} is already destroyed`;
    case "no-charges":
      return `${names.unit(error.unitId)} is out of charges; reload or vent first`;
    case "no-such-weapon":
      return `${names.unit(error.unitId)} is not carrying that weapon`;
    case "charges-full":
      return `${names.unit(error.unitId)} is already fully loaded`;
    case "no-reload":
      return `${names.unit(error.unitId)} has nothing to reload`;
    case "no-deploy-room":
      return `No ${error.passClass} tile is left in the deploy zone for ${names.unit(error.unitId)}`;
    case "illegal-move":
      return `${names.unit(error.unitId)} cannot make that move: ${moveReason(error)}`;
    case "invalid-loadout":
      return `${names.mech(error.mechId)} has a loadout that no longer validates`;
    case "objective-not-found":
      return `That objective is not in this mission`;
    case "objective-complete":
      return `${capitalise(names.objective(error.objectiveId))} is already done`;
    case "objective-not-yours":
      return `${names.unit(error.unitId)} is not on the side whose objective that is`;
    case "objective-target-missing":
      return `${capitalise(names.objective(error.objectiveId))} has lost track of its target`;
    case "no-objective-in-reach":
      // Added with the kind itself (#1030). It names a unit, so it
      // cannot fall through to the developer wording below.
      return `${names.unit(error.unitId)} has no objective within reach`;
    case "not-in-extraction-zone":
      return `${names.unit(error.unitId)} is not standing in the extraction zone`;
    case "not-extractable":
      return `${names.unit(error.unitId)} cannot leave through the extraction zone`;
    default:
      // Every remaining kind names nothing, so the developer wording is
      // already the player's. The test guards that claim.
      return describeTacticalError(error);
  }
}

// ===========================================
// Helpers
// ===========================================

/** "spawner 2" from an index, or the anonymous form when there is none. */
function ordinalOf(index: number): string {
  return index < 0 ? ANONYMOUS.objective : `spawner ${String(index + 1)}`;
}

/** The move rejection's own words, taken from the shared text. */
function moveReason(
  error: Extract<TacticalError, { kind: "illegal-move" }>,
): string {
  const full = describeTacticalError(error);
  const at = full.indexOf(": ");
  return at < 0 ? full : full.slice(at + 2);
}

/** Sentence case for a name that opens a sentence. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
