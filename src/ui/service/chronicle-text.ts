import type {
  ChronicleAct,
  NemesisFate,
  SquadRollEntry,
} from "../../overworld/model/outcome-chronicle";
import { formatWhole } from "./format";

// ===========================================
// Spans
// ===========================================

/**
 * An act's days: `Days 1–14`, or `Day 60` when it began and ended on
 * the same day.
 */
export function daySpanText(fromDay: number, toDay: number): string {
  return fromDay === toDay
    ? `Day ${formatWhole(fromDay)}`
    : `Days ${formatWhole(fromDay)}–${formatWhole(toDay)}`;
}

/**
 * An act's missions by campaign number: `Missions 13–32`, `Mission 48`
 * for one, and `No missions` for an act the campaign ended in before
 * it played any.
 *
 * @param before - Missions resolved before the act began.
 * @param missions - Missions resolved in it.
 */
export function missionSpanText(before: number, missions: number): string {
  if (missions <= 0) {
    return "No missions";
  }
  const first = before + 1;
  return missions === 1
    ? `Mission ${formatWhole(first)}`
    : `Missions ${formatWhole(first)}–${formatWhole(before + missions)}`;
}

/** An act's span in days and missions: `Days 1–14 · Missions 1–12`. */
export function actSpanText(act: ChronicleAct): string {
  return `${daySpanText(act.fromDay, act.toDay)} · ${missionSpanText(act.missionsBefore, act.missions)}`;
}

// ===========================================
// The record
// ===========================================

/** A day in a sentence: `day 14`. */
export function onDayText(day: number): string {
  return `day ${formatWhole(day)}`;
}

/**
 * What became of a nemesis: `Old Scald: killed on day 212`, or
 * `Grey Widow: still out there`.
 */
export function nemesisFateText(fate: NemesisFate): string {
  return fate.killedDay === undefined
    ? `${fate.name}: still out there`
    : `${fate.name}: killed on ${onDayText(fate.killedDay)}`;
}

/** A roll entry's record: `64 kills · 44 missions`, singular for one. */
export function rollRecordText(entry: SquadRollEntry): string {
  return `${countText(entry.kills, "kill")} · ${countText(entry.missionsSurvived, "mission")}`;
}

// ===========================================
// Helpers
// ===========================================

/** `n noun`, with an `s` unless `n` is 1. */
function countText(n: number, noun: string): string {
  return `${formatWhole(n)} ${noun}${n === 1 ? "" : "s"}`;
}
