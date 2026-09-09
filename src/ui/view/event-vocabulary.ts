import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import type { IconId } from "../data/icon-manifest";
import { formatWhole } from "../service/format";
import type { GameState } from "../../save/model/game-state";
import { namesFor } from "../service/tactical-error-text";

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

/** Reads a unit's display name out of the mission, falling back to its id. */
export type NameOf = (unitId: UnitId) => string;

/**
 * One event, one sentence. Everything the log knows how to say lives here,
 * so supporting a new event type is a single entry rather than a change to
 * the view (#525). Returning `undefined` drops the event silently — some
 * events exist for the renderer, not for the player.
 *
 * @param event - The tactical event.
 * @param nameOf - Resolves a unit id to its display name.
 * @returns The line to show, or undefined to skip it.
 */
export function describeEvent(
  event: TacticalEvent,
  nameOf: NameOf,
): LogEntry | undefined {
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
            text: `${nameOf(event.payload.attackerId)} hit ${nameOf(
              event.payload.targetId,
            )} for ${formatWhole(event.payload.damage)}`,
            icon: "attack",
            tone: "danger",
          }
        : {
            text: `${nameOf(event.payload.attackerId)} missed ${nameOf(
              event.payload.targetId,
            )}`,
            icon: "attack",
            tone: "dim",
          };
    case "tactical:unit-died":
      return {
        text: `${nameOf(event.payload.unitId)} destroyed`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:unit-reloaded":
      return {
        text: `${nameOf(event.payload.unitId)} reloaded`,
        icon: "reload",
        tone: "dim",
      };
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
    case "tactical:bugs-spawned":
      return {
        text: `${formatWhole(event.payload.unitIds.length)} bugs ${
          event.payload.source === "spawner" ? "hatched" : "arrived at the edge"
        }`,
        icon: "egg",
        tone: "bug",
      };
    case "tactical:objective-updated":
      return {
        text: event.payload.complete
          ? `Objective complete: ${event.payload.objectiveId}`
          : `Objective updated: ${event.payload.objectiveId}`,
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
    case "tactical:unit-died":
      // Above the unit that died, not its killer: the death is the
      // thing that happened, and it happened there.
      return event.payload.unitId;
    case "tactical:unit-moved":
    case "tactical:turn-started":
    case "tactical:bugs-spawned":
    case "tactical:objective-updated":
    case "tactical:mission-ended":
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Resolves unit ids to the names a player recognises, from the mission's
 * templates. Falls back to the id so a log line never reads as blank.
 *
 * @param mission - Current mission state, if there is one.
 * @returns A name lookup.
 */
export function nameResolver(
  mission: TacticalState | undefined,
  campaign?: GameState,
): NameOf {
  // Through `namesFor` rather than reading the templates again. The
  // campaign carries the roster, which is where a squad's own name lives
  // (#1040/#1047) — "Alpha" rather than "Rifle Squad" — and the shared
  // resolver falls back to "that unit" where a local copy fell back to
  // the raw id, which is the leak #1035 exists to remove.
  const names = namesFor(mission, campaign);
  return (unitId) => names.unit(unitId);
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
    default:
      return `is ${status}`;
  }
}
