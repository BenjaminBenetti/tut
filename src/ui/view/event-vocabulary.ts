import {
  DEFAULT_CHARGE_DELAY_TURNS,
  isDeployable,
} from "../../tactical/model/equipment";
import { SPAWNER_VARIANT_TRAITS } from "../../tactical/model/spawner-variant";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { chargeDelayText } from "../service/charge-delay-text";
import type { BugsSpawnedEvent } from "../../tactical/model/bugs-spawned-event";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { UnitId } from "../../tactical/model/unit";
import type { IconId } from "../data/icon-manifest";
import { formatWhole } from "../service/format";
import { speciesNoun } from "../service/species-noun";
import type { TacticalNames } from "../service/tactical-error-text";

// ===========================================
// The completed-action vocabulary
// ===========================================

/**
 * What the game says happened, in one place.
 *
 * Lifted out of `event-log-view` (#1029) because the log is no longer
 * its only reader: an indicator above the acting unit says the same
 * thing where it happened, while the log keeps the scrollback. Two
 * copies of this table would drift apart, which is the defect shape
 * #735 found and #992 removed, so there is one and both use it.
 *
 * This is the **completed-action** half of the vocabulary. The refusal
 * half is `describeTacticalError` (#1030): why something could *not*
 * happen. They stay separate deliberately — different questions, read at
 * different moments.
 */

/** One line in the log: what to say, how to mark it, and how loud it is. */
export interface LogEntry {
  readonly text: string;
  readonly icon: IconId;
  /** Style-guide tone; `plain` is body text. */
  readonly tone: "plain" | "danger" | "ok" | "accent" | "bug" | "dim";
}

/** One line in the log: what to say, how to mark it, and how loud it is. */

/**
 * One event, one sentence. Everything the log knows how to say lives here,
 * so supporting a new event type is a single entry rather than a change to
 * the view (#525). Returning `undefined` drops the event silently — some
 * events exist for the renderer, not for the player.
 *
 * Takes the whole resolver rather than a unit-name function. A line can
 * be about a unit, an egg spawner or an objective, and a single-kind
 * function is what produced `Hammerhead hit that unit for 15` and
 * `Objective complete: objective-1` (#1072): the cases that needed another
 * kind of name had nothing to ask.
 *
 * @param event - The tactical event.
 * @param names - Resolves every kind of id a line can mention.
 * @returns The line to show, or undefined to skip it.
 */
export function describeEvent(
  event: TacticalEvent,
  names: TacticalNames,
): LogEntry | undefined {
  const nameOf = (unitId: UnitId): string => names.unit(unitId);
  switch (event.type) {
    case "tactical:turn-started":
      return {
        text: `Turn ${formatWhole(event.payload.turn)} — ${
          event.payload.phase === "player" ? "TDF" : "bug"
        } phase`,
        icon: "advance",
        tone: "accent",
      };
    case "tactical:unit-moved":
      // Movement is the most frequent thing a player does and the least
      // worth reporting (#1028). Logging it pushed the things that do
      // matter -- a shot, a kill, a unit running dry -- off the top of
      // a short log, so the log stopped being where you look to find
      // out what happened.
      //
      // **All** movement is silent, including a move that provoked
      // something. That is safe rather than a judgement call:
      // `move-handler` pushes `UNIT_MOVED` and then pushes the
      // reaction's own events beside it, so an overwatch shot is an
      // `attack-resolved` entry in its own right. Dropping the move
      // line removes "Alpha moved 3 tiles" and keeps "Bravo hit Alpha
      // for 12" -- the consequence still speaks, in its own words.
      return undefined;
    case "tactical:attack-resolved":
      return event.payload.hit
        ? {
            text: `${nameOf(event.payload.attackerId)} hit ${names.target(
              event.payload.targetId,
            )} for ${formatWhole(event.payload.damage)}`,
            icon: "attack",
            tone: "danger",
          }
        : {
            text: `${nameOf(event.payload.attackerId)} missed ${names.target(
              event.payload.targetId,
            )}`,
            icon: "attack",
            tone: "dim",
          };
    case "tactical:blast-resolved": {
      // A shot at the ground says where it went; a blast around a unit
      // says who else it caught, since the aimed target's own line is
      // the `attack-resolved` before it (#1121).
      const shooter = nameOf(event.payload.attackerId);
      const hurt = event.payload.victims.filter((v) => v.damage > 0);
      // A grenade or a charge names itself (#1132); a shot is a blast.
      const source = event.payload.source;
      if (!event.payload.hit) {
        return {
          text:
            source === undefined
              ? `${shooter} fired at the ground and missed`
              : `${shooter}'s ${source} missed`,
          icon: "attack",
          tone: "dim",
        };
      }
      if (hurt.length === 0) {
        return event.payload.aimedAtTile
          ? {
              text:
                source === undefined
                  ? `${shooter} hit the ground; nothing was standing there`
                  : `${shooter}'s ${source} went off; nothing was standing there`,
              icon: "attack",
              tone: "dim",
            }
          : undefined;
      }
      return {
        text: `${shooter}'s ${source ?? "blast"} caught ${hurt
          .map(
            (v) => `${names.target(v.targetId)} for ${formatWhole(v.damage)}`,
          )
          .join(", ")}`,
        icon: "attack",
        tone: "danger",
      };
    }
    case "tactical:structure-destroyed": {
      const what =
        event.payload.structure.kind === "prop"
          ? structureName(event.payload.structure.propKind)
          : wallName(event.payload.structure.wallKind);
      return {
        text: `${nameOf(event.payload.unitId)} brought down ${what}`,
        icon: "warning",
        tone: "accent",
      };
    }
    case "tactical:effect-started":
      return {
        text: event.payload.rekindled
          ? `${effectName(event.payload.kind)} flares up again`
          : `${effectName(event.payload.kind)} breaks out`,
        icon: "warning",
        tone: "accent",
      };
    case "tactical:effect-damaged":
      return {
        text: `${names.target(event.payload.targetId)} ${effectVerb(
          event.payload.kind,
        )} for ${formatWhole(event.payload.damage)}`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:effect-ended":
      return {
        text: `${effectName(event.payload.kind)} burns out`,
        icon: "warning",
        tone: "dim",
      };
    case "tactical:unit-died":
      return {
        // A carrier that falls drops its specimen where it stood (#1179).
        text:
          event.payload.dropped === undefined
            ? `${nameOf(event.payload.unitId)} destroyed`
            : `${nameOf(event.payload.unitId)} destroyed · dropped the ${speciesNoun(event.payload.dropped.species)} specimen`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:specimen-captured":
      return {
        text: `${nameOf(event.payload.unitId)} netted a live ${speciesNoun(event.payload.specimen.species)} · carrying it`,
        icon: "bug",
        tone: "ok",
      };
    case "tactical:specimen-picked-up":
      return {
        text: `${nameOf(event.payload.unitId)} picked up the ${speciesNoun(event.payload.specimen.species)} specimen`,
        icon: "interact",
        tone: "ok",
      };
    case "tactical:unit-abandoned":
      return {
        text: `${nameOf(event.payload.unitId)} left behind`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:drop-ship-departed":
      // Dust-off Window (campaign arc §11): the ship's last turn ended.
      // Each unit it strands gets its own "left behind" line after this.
      return {
        text:
          event.payload.leftBehind > 0
            ? `Drop ship departed · ${formatWhole(event.payload.leftBehind)} left behind`
            : "Drop ship departed",
        icon: "warning",
        tone: "danger",
      };
    case "tactical:unit-reloaded":
      return {
        text: `${nameOf(event.payload.unitId)} reloaded`,
        icon: "reload",
        tone: "dim",
      };
    case "tactical:radar-deployed":
      return {
        text: `${nameOf(event.payload.unitId)} deployed radar · ${String(event.payload.radar.range)}-tile scan · ${String(event.payload.radar.turnsLeft)}-turn battery`,
        icon: "radar",
        tone: "accent",
      };
    case "tactical:radar-burned-out":
      return {
        text: "Radar burnt out · battery dead",
        icon: "radar",
        tone: "dim",
      };
    case "tactical:turret-deployed": {
      // A garrison turret (#1155) was standing when the mission opened
      // and runs on mains: nobody deployed it and no battery to read.
      const who =
        event.payload.unitId === undefined
          ? "Garrison turret standing"
          : `${nameOf(event.payload.unitId)} deployed a turret`;
      const power =
        event.payload.turnsLeft === undefined
          ? "on mains"
          : `${formatWhole(event.payload.turnsLeft)}-turn battery`;
      return {
        text: `${who} · ${formatWhole(event.payload.overwatchShots)} shots a turn on overwatch · ${power}`,
        icon: "overwatch",
        tone: "accent",
      };
    }
    case "tactical:turret-burned-out":
      return {
        text: "Turret burned out · battery dead",
        icon: "overwatch",
        tone: "dim",
      };
    case "tactical:turret-destroyed":
      return {
        text:
          event.payload.killerId === undefined
            ? `${nameOf(event.payload.turretId)} destroyed`
            : `${nameOf(event.payload.turretId)} destroyed by ${nameOf(event.payload.killerId)}`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:mech-system-used": {
      const verbs = {
        jump: "jumped",
        brace: "deployed stabilisers",
        coolant: "injected emergency coolant",
        designate: "designated a target",
      };
      return {
        text: `${nameOf(event.payload.unitId)} ${verbs[event.payload.action]}`,
        icon: "ability",
        tone: "accent",
      };
    }
    case "tactical:equipment-used": {
      // A scanner's or a turret's deployment logs itself with its
      // battery on the next line; a second line for the same act read
      // as a stutter.
      // A net's catch logs itself on the next line (#1179), for the
      // same reason.
      const definition = SHIPPED_EQUIPMENT.get(event.payload.equipmentId);
      if (
        definition !== undefined &&
        (isDeployable(definition) || definition.kind === "net")
      ) {
        return undefined;
      }
      return {
        text: `${nameOf(event.payload.unitId)} used ${event.payload.name.toLowerCase()} · ${formatWhole(event.payload.usesLeft)} left`,
        icon: "ability",
        tone: "accent",
      };
    }
    case "tactical:charge-placed":
      return {
        text: `${nameOf(event.payload.charge.ownerId)} set a breaching charge · goes off ${chargeDelayText(
          SHIPPED_EQUIPMENT.get(event.payload.charge.equipmentId)?.delayTurns ??
            DEFAULT_CHARGE_DELAY_TURNS,
        )}`,
        icon: "warning",
        tone: "accent",
      };
    case "tactical:charge-detonated":
      return {
        text: "Breaching charge detonated",
        icon: "warning",
        tone: "danger",
      };
    case "tactical:units-healed": {
      // One line for the whole area, as a blast gets (#1138): who was
      // mended and by how much, "repaired" when the kit mends metal.
      const verb =
        SHIPPED_EQUIPMENT.get(event.payload.kitId)?.heal?.target ===
        "mechanical"
          ? "repaired"
          : "healed";
      const mended = event.payload.healed.map(
        (unit) => `${nameOf(unit.unitId)} for ${formatWhole(unit.amount)}`,
      );
      return {
        text: `${nameOf(event.payload.userId)} ${verb} ${mended.join(", ")}`,
        icon: "hp",
        tone: "ok",
      };
    }
    case "tactical:unit-status-changed":
      return {
        text:
          event.payload.status.length > 0
            ? `${nameOf(event.payload.unitId)} ${event.payload.status
                .map(statusPhrase)
                .join(" and ")}`
            : `${nameOf(event.payload.unitId)} is clear`,
        icon: statusIcon(event.payload.status[0]),
        tone: "plain",
      };
    case "tactical:unit-surfaced":
      // The surfacing moment (#1179). Only a burrower that comes up
      // beside a squad is announced: that squad sees it, and the line
      // names who it is on. One that comes up alone may be far off in
      // the dark, and a line would say it exists where nobody saw it.
      return event.payload.beside.length === 0
        ? undefined
        : {
            text: `${nameOf(event.payload.unitId)} burst out of the ground beside ${event.payload.beside
              .map(nameOf)
              .join(" and ")}`,
            icon: "warning",
            tone: "bug",
          };
    case "tactical:unit-tunnelled":
    case "tactical:unit-burrowed":
      // Digging is silent, as movement is (#1028), and more so: nobody
      // on the surface can say where a burrower went.
      return undefined;
    case "tactical:bugs-spawned":
      return {
        text: `${waveLabel(event.payload.wave, event.payload.totalWaves)}${formatWhole(event.payload.unitIds.length)} bugs ${
          SPAWN_VERBS[event.payload.source]
        }`,
        icon: "egg",
        tone: "bug",
      };
    case "tactical:spawner-damaged":
      // An egg spawner's wreck is told by its objective's line; a pod
      // (campaign arc §6.3) says so itself, since the race was the point.
      return event.payload.destroyed && event.payload.variant !== undefined
        ? {
            text: `${SPAWNER_VARIANT_TRAITS[event.payload.variant].name} destroyed`,
            icon: "check",
            tone: "ok",
          }
        : undefined;
    case "tactical:spore-pod-matured":
      return {
        text: `${SPAWNER_VARIANT_TRAITS["spore-pod"].name} matured`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:clutch-laid":
      // A Broodmother's clutch (#1179): a new nest on the map, which is
      // the reason she is worth hunting before it hatches.
      return {
        text: `${nameOf(event.payload.unitId)} laid a clutch of eggs`,
        icon: "egg",
        tone: "bug",
      };
    case "tactical:broodmother-fleeing":
      return {
        text: `${nameOf(event.payload.unitId)} is fleeing for the map edge`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:broodmother-escaped":
      return {
        text: `${nameOf(event.payload.unitId)} escaped off the map edge`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:brood-woke":
      // The whole brood in one line (#1179): its members get the stir
      // on the map, not a status sentence each.
      return {
        text:
          event.payload.label === undefined
            ? "A brood stirs"
            : `A brood stirs in the ${event.payload.label}`,
        icon: "warning",
        tone: "bug",
      };
    case "tactical:generator-destroyed":
      return {
        text:
          event.payload.killerId === undefined
            ? `${nameOf(event.payload.generatorId)} destroyed`
            : `${nameOf(event.payload.generatorId)} destroyed by ${nameOf(event.payload.killerId)}`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:civilians-freed":
      return {
        text: `${nameOf(event.payload.unitId)} freed by ${nameOf(event.payload.rescuerId)}`,
        icon: "interact",
        tone: "ok",
      };
    case "tactical:civilians-extracted":
      // The group has left the map, so the line counts rather than
      // names: there is no unit left to ask for a name.
      return {
        text: `Civilians aboard: ${formatWhole(event.payload.rescued)} of ${formatWhole(event.payload.total)} rescued`,
        icon: "extract",
        tone: "ok",
      };
    case "tactical:civilians-killed":
      return {
        text:
          event.payload.killerId === undefined
            ? `${nameOf(event.payload.unitId)} killed`
            : `${nameOf(event.payload.unitId)} killed by ${nameOf(event.payload.killerId)}`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:unit-placed":
      // The development tools did this, and the log says so (#1136):
      // a tester reading back a staged fight should see where the
      // staging was.
      return {
        text: `Debug: placed ${nameOf(event.payload.unitId)} at (${String(event.payload.tile.x)}, ${String(event.payload.tile.z)})`,
        icon: "bug",
        tone: "dim",
      };
    case "tactical:wreck-worked":
      // One turn's work on a lost mech's wreck (arc §6.6); the last
      // turn names the step that is left.
      return event.payload.turnsWorked >= event.payload.turnsNeeded
        ? {
            text: `${nameOf(event.payload.unitId)} stripped the wreck; carry the parts to the drop ship`,
            icon: "extract",
            tone: "ok",
          }
        : {
            text: `${nameOf(event.payload.unitId)} worked the wreck: ${formatWhole(event.payload.turnsWorked)} / ${formatWhole(event.payload.turnsNeeded)} turns`,
            icon: "interact",
            tone: "accent",
          };
    case "tactical:objective-updated":
      return event.payload.failed === true
        ? {
            text: `Objective failed: ${names.objective(event.payload.objectiveId)}`,
            icon: "warning",
            tone: "danger",
          }
        : {
            text: event.payload.complete
              ? `Objective complete: ${names.objective(event.payload.objectiveId)}`
              : `Objective updated: ${names.objective(event.payload.objectiveId)}`,
            icon: event.payload.complete ? "check" : "mission",
            tone: event.payload.complete ? "ok" : "accent",
          };
    case "tactical:mission-ended":
      return {
        text: `Mission ${event.payload.outcome}`,
        icon: event.payload.outcome === "won" ? "check" : "warning",
        tone: event.payload.outcome === "won" ? "ok" : "danger",
      };
    default:
      return undefined;
  }
}

/** What bugs did to arrive, by where they came from. */
const SPAWN_VERBS: Readonly<
  Record<BugsSpawnedEvent["payload"]["source"], string>
> = {
  spawner: "hatched",
  edge: "arrived at the edge",
  pod: "burst from the spore pod",
};

/** The glyph for a status change, defaulting to the overwatch eye. */
function statusIcon(status: string | undefined): IconId {
  return status === "hidden" || status === "suppressed" ? status : "overwatch";
}

// ===========================================
// Who acted
// ===========================================

/**
 * The unit an event should be announced above, or `undefined` when the
 * event belongs to nobody in particular.
 *
 * **Movement is excluded deliberately** (#1029). Every other logged
 * action gets an indicator where it happened; a move is the one thing
 * the player already sees, because the unit walks. #1028 removes it from
 * the log as well, which makes the rule "everything in the log is
 * indicated" true by construction rather than by this exception — but
 * the exception is stated here so the rule holds either way.
 *
 * A turn starting, bugs arriving, an objective changing and a mission
 * ending have no single actor: they belong to the log, not to a unit.
 *
 * @param event - The tactical event.
 * @returns The acting unit, or `undefined` to indicate nothing.
 */
export function actorOf(event: TacticalEvent): UnitId | undefined {
  switch (event.type) {
    case "tactical:attack-resolved":
      return event.payload.attackerId;
    case "tactical:unit-reloaded":
    case "tactical:unit-status-changed":
      return event.payload.unitId;
    case "tactical:radar-deployed":
    case "tactical:turret-deployed":
    case "tactical:equipment-used":
    case "tactical:mech-system-used":
      return event.payload.unitId;
    case "tactical:turret-destroyed":
      // Above the turret, as a death is above the unit that died.
      return event.payload.turretId;
    case "tactical:generator-destroyed":
      return event.payload.generatorId;
    case "tactical:clutch-laid":
    case "tactical:broodmother-fleeing":
      // Above the Broodmother: she laid it, and she turned.
      return event.payload.unitId;
    case "tactical:civilians-freed":
      // Above the group: being let out is what happened to it.
      return event.payload.unitId;
    case "tactical:civilians-killed":
      return event.payload.unitId;
    case "tactical:charge-placed":
      return event.payload.charge.ownerId;
    case "tactical:specimen-captured":
    case "tactical:specimen-picked-up":
      // Above the squad now carrying it (#1179).
      return event.payload.unitId;
    case "tactical:units-healed":
      // Above the medic: the heal is what they did; each mended unit
      // gets its own number from the scene (#1138).
      return event.payload.userId;
    case "tactical:unit-died":
      // Above the unit that died, not its killer: the death is the
      // thing that happened, and it happened there.
      return event.payload.unitId;
    case "tactical:blast-resolved":
      // Above the shooter: the blast is what they did (#1121).
      return event.payload.attackerId;
    case "tactical:unit-surfaced":
      // Above the burrower, where the ground broke (#1179); a surfacing
      // with nothing to say shows nothing, as `describeEvent` decides.
      return event.payload.unitId;
    case "tactical:structure-destroyed":
      return event.payload.unitId;
    case "tactical:wreck-worked":
      // Above the squad at the wreck: the work is what it did.
      return event.payload.unitId;
    case "tactical:effect-damaged":
      // Above whoever burned; a spawner has no head to put it over.
      return event.payload.targetKind === "unit"
        ? event.payload.targetId
        : undefined;
    case "tactical:effect-started":
    case "tactical:effect-ended":
    case "tactical:radar-burned-out":
    case "tactical:turret-burned-out":
    case "tactical:charge-detonated":
      return undefined;
    case "tactical:unit-moved":
    case "tactical:unit-tunnelled":
    case "tactical:unit-burrowed":
    case "tactical:turn-started":
    case "tactical:bugs-spawned":
    case "tactical:objective-updated":
    case "tactical:mission-ended":
    case "tactical:unit-abandoned":
    case "tactical:spore-pod-matured":
    case "tactical:drop-ship-departed":
    case "tactical:brood-woke":
    case "tactical:civilians-extracted":
    case "tactical:broodmother-escaped":
      // A brood is many bugs, and the scene stirs each of them; civilians
      // aboard and gone leave nobody on the map to mark, and neither does
      // a Broodmother that escaped off its edge (#1179).
      return undefined;
    default:
      return undefined;
  }
}

/** "a car", "a fence": the prop kind id read as words with an article. */
function structureName(kind: string): string {
  const words = kind.replace(/-/g, " ");
  return `${/^[aeiou]/.test(words) ? "an" : "a"} ${words}`;
}

/**
 * The wave prefix of an edge arrival (#1175): "Wave 3 of 5: " when the
 * mission counts its waves, "Wave 3: " when it does not, nothing for a
 * hatch.
 */
function waveLabel(
  wave: number | undefined,
  totalWaves: number | undefined,
): string {
  if (wave === undefined) {
    return "";
  }
  return totalWaves === undefined
    ? `Wave ${formatWhole(wave)}: `
    : `Wave ${formatWhole(wave)} of ${formatWhole(totalWaves)}: `;
}

/** What a wall of this kind is called when it falls. */
function wallName(kind: string): string {
  switch (kind) {
    case "half":
      return "a parapet";
    case "window":
      return "a window";
    case "door":
      return "a door";
    default:
      return "a wall";
  }
}

/** The noun for a tile effect, capitalised to open a sentence. */
function effectName(kind: string): string {
  return kind === "fire" ? "Fire" : capitaliseWord(kind);
}

/** The verb for taking a tile effect's damage. */
function effectVerb(kind: string): string {
  return kind === "fire" ? "burned" : `took ${kind}`;
}

/** Sentence case for one word. */
function capitaliseWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * How a status reads in a sentence.
 *
 * The template used to be `is ${status}`, which interpolated the **id**
 * as English (#1029). It reads correctly for `hidden` and `suppressed`
 * by luck, because those are adjectives; `overwatch` is a noun, so the
 * same template produced "Rifle Squad is overwatch" — awkward on the log
 * line and, once #1029 put the log's words above the unit, awkward in
 * the most prominent place on the map.
 *
 * A table rather than a template, so a status added tomorrow gets a
 * phrase someone chose instead of whatever grammar its id happens to
 * have. The fallback keeps a new id readable rather than blank.
 *
 * @param status - The status id.
 * @returns The phrase that follows the unit's name.
 */
function statusPhrase(status: string): string {
  switch (status) {
    case "overwatch":
      return "is on overwatch";
    case "hidden":
      return "is hidden";
    case "suppressed":
      return "is suppressed";
    case "dormant":
      // A lone sleeper placed without a brood (#1179); a brood's wake
      // is its own line.
      return "is dormant";
    default:
      return `is ${status}`;
  }
}
