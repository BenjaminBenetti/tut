import { PERSONAS } from "../../bugs/data/personas";
import {
  createPersonaLookup,
  personaName,
} from "../../bugs/service/persona-lookup";
import type { GameState } from "../../save/model/game-state";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { CommandError } from "../../core/model/command-error";
import type { AttackTarget } from "../../tactical/model/attack-target";
import type { TacticalError } from "../../tactical/model/tactical-error";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import {
  describeTacticalError,
  tacticalCause,
} from "../../tactical/model/tactical-error";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { ObjectivePresentationCatalogue } from "../model/objective-presentation";
import type { ChargeRegister } from "./charge-register";
import { chargeRegisterFor } from "./charge-register";
import { OBJECTIVE_PRESENTATION } from "./objectives/objective-presentation";

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
  /**
   * A unit's name — its **roster identity** where it has one, never its
   * id.
   *
   * Alpha and Bravo are both `squad:rifle`, so a template name calls
   * them the same thing and an event about one reads as an event about
   * the other (#1040). The debrief already calls them Alpha and Bravo,
   * from the roster; in-mission text has to agree. A bug has no roster
   * entry: a named enemy is called by its persona ("Broodmother",
   * "Alpha Swarmer"), and any other bug by its species name from the
   * template.
   */
  unit(id: string): string;
  /**
   * An objective, named the way its kind's presentation names it:
   * a spawner by its **ordinal** — "spawner 2" — and a defence by what
   * it holds — "the sensor array" (#1175).
   *
   * A spawner goes by ordinal and not by any name of its own, because
   * that is what the objective tracker says (#949): `Destroy spawner
   * ${index + 1}`, counted in `mission.objectives`. The tracker builds
   * its label on the same `name`, so a refusal can never contradict the
   * panel next to it.
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
  /**
   * Whatever an attack or a targeting refusal is pointed at, which may
   * be a **unit or an egg spawner**.
   *
   * `unit` and `spawner` each know one kind and answer anonymously for
   * the other, and the ids that reach here do not say which they are:
   * `attack-resolved` and `no-line-of-sight` both carry a bare
   * `targetId`, and the HUD resolves it through one port precisely so a
   * spawner is aimed at exactly as a unit is. Asking `unit` for a
   * spawner is how every shot at a nest came to be logged as
   * "Hammerhead hit that unit for 15".
   */
  target(id: string): string;
  /**
   * The words this unit uses for what its weapons spend (#1062).
   *
   * Here rather than inlined per case because the unit card and
   * the action bar answer the same question, and the three used to
   * answer it separately: `ammo 0 / 3` on the card beside "is out
   * of charges; reload or vent first" in the refusal.
   */
  charge(id: string): ChargeRegister;
  /** A mech's name from the roster. */
  mech(id: string): string;
  /** A mission, named by the city it is fought over (#739, #753). */
  mission(id: string): string;
}

// ===========================================
// Constants
// ===========================================

/** The shipped personas, which name the named enemies. */
const personaOf = createPersonaLookup(PERSONAS);

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
  // A spawner no objective tracks has no ordinal to be called by, and
  // "that objective" would be a lie about a thing that is not one.
  spawner: "that egg spawner",
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
 * @param presentations - How each objective kind is named; the shipped
 *   table by default.
 * @returns A resolver for every id a refusal can carry.
 */
export function namesFor(
  mission: TacticalState | undefined,
  campaign?: GameState,
  presentations: ObjectivePresentationCatalogue = OBJECTIVE_PRESENTATION,
): TacticalNames {
  // A bug that fled off the map (#1179) keeps its name: the line that
  // says it escaped is read after it has left `units`.
  const units = new Map(
    [...(mission?.escaped ?? []), ...(mission?.units ?? [])].map((unit) => [
      unit.id,
      unit,
    ]),
  );
  const objectives = mission?.objectives ?? [];
  const spawners = new Set((mission?.spawners ?? []).map((nest) => nest.id));
  /** The index of the objective tracking `id` as its target, or -1. */
  const trackedAs = (id: string): number =>
    objectives.findIndex(
      (objective) =>
        presentations[objective.kind].trackedId?.(objective) === id,
    );
  /** The objective at `index` by its kind's name, or the anonymous form. */
  const nameAt = (index: number): string => {
    const objective = objectives[index];
    return objective === undefined
      ? ANONYMOUS.objective
      : presentations[objective.kind].name(objective, index + 1);
  };
  const nameUnit = (id: string): string => {
    const unit = units.get(id);
    if (!unit) {
      return ANONYMOUS.unit;
    }
    // The roster identity first: a deployed squad or mech keeps the
    // name the player gave it, which is what the debrief shows.
    const roster = campaign?.roster;
    const named =
      roster?.squads.find((squad) => squad.id === unit.sourceId)?.name ??
      roster?.mechs.find((mech) => mech.id === unit.sourceId)?.name;
    if (named !== undefined) {
      return named;
    }
    // Then a named enemy's persona (campaign arc §9), which the event
    // log, the unit card and Jev's observation all call it by.
    const species = mission?.templates[unit.templateId]?.name;
    const persona =
      unit.persona === undefined ? undefined : personaOf(unit.persona);
    if (persona !== undefined) {
      return personaName(persona, species);
    }
    // Then the template, which is the species for a bug and the only
    // name it has.
    return species ?? ANONYMOUS.unit;
  };
  return {
    unit: nameUnit,
    // Each kind names its own (#1175): a defence for what it holds, a
    // spawner objective by its ordinal, as the tracker shows it.
    objective: (id) =>
      nameAt(objectives.findIndex((candidate) => candidate.id === id)),
    spawner: (id) => nameAt(trackedAs(id)),
    // Units first: they are the common target and the id sets do not
    // overlap, since the mission issues both from one generator. Then
    // anything an objective tracks, by that objective's ordinal -- the
    // tracker is the authority on what a nest is called, so agreeing
    // with it is the whole requirement (#949, #1072). Only a spawner no
    // objective tracks falls to its own anonymous wording.
    target: (id) => {
      if (units.has(id)) {
        return nameUnit(id);
      }
      const tracked = trackedAs(id);
      if (tracked >= 0) {
        return nameAt(tracked);
      }
      return spawners.has(id) ? ANONYMOUS.spawner : ANONYMOUS.unit;
    },
    charge: (id) => chargeRegisterFor(units.get(id)?.kind ?? "squad"),
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
 * What the aim readouts (the hit preview's header, the weapon wheel's
 * hub) call the thing being aimed at: a unit by the name the card and
 * the log use, so a named enemy reads "Broodmother" and not its species
 * (campaign arc §9); a spawner by the target's own name, as before.
 *
 * @param target - What the attack is aimed at.
 * @param names - The resolver the card and the log use.
 * @returns The target's name.
 */
export function attackTargetName(
  target: AttackTarget,
  names: TacticalNames,
): string {
  return target.kind === "unit" ? names.unit(target.id) : target.name;
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
    case "systems-unavailable":
      return error.reason;
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
      return `No line of sight to ${names.target(error.targetId)}`;
    case "target-destroyed":
      return `${capitalise(names.spawner(error.targetId))} is already destroyed`;
    case "no-charges":
      // `charges` is the field name; the player sees `ammo` or `heat`
      // on the card and `Reload` or `Vent` on the bar. Offering a
      // Rifle Squad a vent named an action its bar does not have
      // (#1062, QA on `0a47be2`).
      return `${names.unit(error.unitId)} ${names.charge(error.unitId).emptyPhrase}`;
    case "no-area-weapon":
      return `${names.unit(error.unitId)} has no weapon that can be fired at the ground`;
    case "no-aim":
      return `${names.unit(error.unitId)} was given nothing to fire at`;
    case "no-such-weapon":
      return `${names.unit(error.unitId)} is not carrying that weapon`;
    case "charges-full":
      return `${names.unit(error.unitId)} is already fully loaded`;
    case "no-reload":
      return `${names.unit(error.unitId)} has nothing to reload`;
    case "no-equipment":
      return `${names.unit(error.unitId)} does not carry a ${equipmentName(error.equipmentId)}`;
    case "equipment-spent":
      return `${names.unit(error.unitId)} has no ${equipmentName(error.equipmentId)} left`;
    case "nothing-to-heal":
      // A repair kit mends metal and a medkit flesh (#1138); the
      // sentence says which was missing, so a medic who threw at the
      // mech learns why rather than reading "nobody".
      return `${names.unit(error.unitId)} has ${
        SHIPPED_EQUIPMENT.get(error.equipmentId)?.heal?.target === "mechanical"
          ? "nothing to repair"
          : "nobody to heal"
      } there`;
    case "no-deploy-room":
      return `No ${error.passClass} tile is left in the deploy zone for ${names.unit(error.unitId)}`;
    case "illegal-move":
      return `${names.unit(error.unitId)} cannot make that move: ${moveReason(error)}`;
    case "illegal-burrow":
      return `${names.unit(error.unitId)} cannot do that: ${moveReason(error)}`;
    case "unit-burrowed":
      // A burrower's own refusal (#1179); the player never orders one,
      // but a log or a test reads this, and it names a unit.
      return `${names.unit(error.unitId)} is under the ground`;
    case "target-burrowed":
      return `${names.target(error.targetId)} is under the ground`;
    case "invalid-loadout":
      return `${names.mech(error.mechId)} has a loadout that no longer validates`;
    case "objective-not-found":
      return `That objective is not in this mission`;
    case "objective-complete":
      return `${capitalise(names.objective(error.objectiveId))} is already done`;
    case "objective-not-interactive":
      return `${capitalise(names.objective(error.objectiveId))} is held by standing your ground, not by working it`;
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
    case "takes-no-orders":
      // A deployed turret (#1138): it fires by rule, and the player
      // clicked it to read its battery, not to command it.
      return `${names.unit(error.unitId)} takes no orders; it fires on its own`;
    case "unit-trapped":
      // Campaign arc §6.4: the group waits in its building until a
      // squad or mech beside it uses Interact.
      return `${names.unit(error.unitId)} are trapped; free them with Interact from beside them`;
    case "cannot-interact":
      return `${names.unit(error.unitId)} cannot work objectives; a squad or mech must`;
    case "unknown-unit-type":
      // A catalogue id, not an entity id, but it is still an id and
      // the menu that sent it already knows what it asked for (#1136).
      return `No ${error.unitKind} of that type can be placed`;
    case "not-a-squad":
      return `${names.unit(error.unitId)} cannot do that; only an infantry squad can strip salvage`;
    case "objective-worked-this-turn":
      return `${capitalise(names.objective(error.objectiveId))} has already been worked this turn`;
    case "wreck-stripped":
      return `${capitalise(names.objective(error.objectiveId))} is stripped; carry the parts to the drop ship`;
    case "unknown-carcass":
      return "There is no tech carcass there";
    case "carcass-already-harvested":
      return "That tech carcass has already been stripped";
    case "carcass-out-of-reach":
      return `The tech carcass is ${String(error.distance)} tiles away; harvesting reaches ${String(error.range)}`;
    case "no-capture-target":
      // The capture net and its catch (#1179).
      return "There is no bug there to net";
    case "specimen-not-wanted":
      return `Nobody asked for ${names.target(error.targetId)} alive`;
    case "target-too-healthy":
      return `${capitalise(names.target(error.targetId))} is too strong to net: ${String(error.hp)} hit points, and the net holds at ${String(error.threshold)} or less`;
    case "already-carrying":
      return `${names.unit(error.unitId)} is already carrying a specimen`;
    case "cannot-carry":
      return `${names.unit(error.unitId)} cannot carry a specimen; only an infantry squad can`;
    default:
      // Every remaining kind names nothing, so the developer wording is
      // already the player's. The test guards that claim.
      return describeTacticalError(error);
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * What to put in front of the player for a refused command.
 *
 * A dispatched refusal reaches the UI as a `CommandError`, whose
 * `message` was built inside the simulation and names its ids:
 *
 * ```
 *   Unit "unit-1" is already fully loaded          ← error.message
 *   Hammerhead is already fully loaded             ← this function
 * ```
 *
 * The typed refusal rides along as `cause` (#1035), so the same resolver
 * the HUD uses for its own previews can phrase the dispatched ones too.
 * When there is no tactical cause -- an overworld refusal, a save
 * written before `cause` existed, `unknown-command` from the dispatcher
 * -- the message is already the best text available and is used as it
 * stands. Nothing about this path can leave the player with no sentence.
 */
export function refusalText(error: CommandError, names: TacticalNames): string {
  const cause = tacticalCause(error);
  return cause === undefined ? error.message : describeRefusal(cause, names);
}

/** A move or burrow rejection's own words, taken from the shared text. */
function moveReason(
  error: Extract<TacticalError, { kind: "illegal-move" | "illegal-burrow" }>,
): string {
  const full = describeTacticalError(error);
  const at = full.indexOf(": ");
  return at < 0 ? full : full.slice(at + 2);
}

/** Sentence case for a name that opens a sentence. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The item's name in lower case, or its id when the catalogue does not know it. */
function equipmentName(equipmentId: string): string {
  return SHIPPED_EQUIPMENT.get(equipmentId)?.name.toLowerCase() ?? equipmentId;
}
