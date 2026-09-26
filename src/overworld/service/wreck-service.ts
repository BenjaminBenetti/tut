import type { Mech, MechId } from "../../roster/model/mech";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import type { Mission } from "../model/mission";
import type { MissionResult } from "../model/mission-result";
import type { WreckRecoveryTuning } from "../model/mission-tuning";
import type { OverworldState } from "../model/overworld-state";
import type { WreckRecoverySpec } from "../model/wreck-recovery-spec";

// ===========================================
// Recording
// ===========================================

/**
 * Writes down the wrecks a resolved mission left (arc §6.6), and drops
 * the records whose offer window has passed. The launch handler calls it
 * once per resolved mission, before the casualties make the roster
 * forget its destroyed mechs, so this is where the roster's view of a
 * lost mech is kept. It counts nothing.
 *
 * ```
 *   stale records (day ≥ lostDay + offerWindowDays) ──► dropped
 *   outcome lost, mechsDestroyed ≠ [] ──► one spec per destroyed mech the roster knows,
 *                                         unless that mech already has a record
 *   won or extracted                 ──► nothing new: the force held the field
 * ```
 *
 * A lost mission is a lost or abandoned one: leaving the field without
 * finishing the objectives reports `lost` (#1132). Returns the input
 * untouched when nothing changed, so a mission without losses leaves the
 * overworld exactly as it was. Pure.
 *
 * @param state - The overworld the result is settled into.
 * @param mission - The mission that was played.
 * @param result - What the resolver reported.
 * @param mechs - The roster's mechs as they stood at launch.
 * @param tuning - How long a wreck waits for its offer, and how long it takes to strip.
 */
export function recordWrecks(
  state: OverworldState,
  mission: Mission,
  result: MissionResult,
  mechs: readonly Mech[],
  tuning: WreckRecoveryTuning,
): OverworldState {
  const kept = (state.wrecks ?? []).filter(
    (wreck) => !isWreckStale(wreck, state.day, tuning),
  );
  const fresh =
    result.outcome === "lost"
      ? wrecksLost(
          result.mechsDestroyed,
          mechs,
          mission,
          state.day,
          tuning.stripTurns,
        ).filter(
          (wreck) => !kept.some((other) => other.mechId === wreck.mechId),
        )
      : [];
  const before = state.wrecks ?? [];
  if (fresh.length === 0 && kept.length === before.length) {
    return state;
  }
  return withWrecks(state, [...kept, ...fresh]);
}

/**
 * The spec for one destroyed mech (see `WreckRecoverySpec`): its name,
 * its chassis, and every other fitted part in loadout order, which is
 * what a won recovery pays.
 *
 * @param mech - The mech as it stood before it was lost.
 * @param mission - The mission it was lost on.
 * @param day - The day it was lost.
 * @param stripTurns - Turns a squad works it to strip it.
 */
export function wreckOf(
  mech: Mech,
  mission: Mission,
  day: number,
  stripTurns: number,
): WreckRecoverySpec {
  return {
    mechId: mech.id,
    mechName: mech.name,
    chassisId: mech.loadout.chassisId,
    // `loadoutPartIds` lists the chassis first; the rest is what comes home.
    parts: loadoutPartIds(mech.loadout).slice(1),
    loadout: mech.loadout,
    cityId: mission.cityId,
    missionId: mission.id,
    lostDay: day,
    stripTurns,
  };
}

// ===========================================
// Removal and queries
// ===========================================

/**
 * The overworld without the wreck record of `mechId`: its one attempt is
 * spent. Returns the input untouched when there is no such record.
 *
 * @param state - The overworld to clear the record from.
 * @param mechId - The lost mech whose record goes.
 */
export function removeWreck(
  state: OverworldState,
  mechId: MechId,
): OverworldState {
  const before = state.wrecks ?? [];
  const after = before.filter((wreck) => wreck.mechId !== mechId);
  return after.length === before.length ? state : withWrecks(state, after);
}

/**
 * Whether the wreck's offer window has passed on `day` without an offer:
 * `day ≥ lostDay + offerWindowDays`. The trigger stops offering it, and
 * the next resolved mission drops its record.
 *
 * @param wreck - The record to judge.
 * @param day - Today.
 * @param tuning - How long a wreck waits.
 */
export function isWreckStale(
  wreck: WreckRecoverySpec,
  day: number,
  tuning: WreckRecoveryTuning,
): boolean {
  return day >= wreck.lostDay + tuning.offerWindowDays;
}

// ===========================================
// Helpers
// ===========================================

/** One spec per destroyed mech the roster still knows, in `mechsDestroyed` order. */
function wrecksLost(
  destroyed: readonly MechId[],
  mechs: readonly Mech[],
  mission: Mission,
  day: number,
  stripTurns: number,
): readonly WreckRecoverySpec[] {
  const lost: WreckRecoverySpec[] = [];
  for (const mechId of destroyed) {
    const mech = mechs.find((candidate) => candidate.id === mechId);
    if (mech !== undefined) {
      lost.push(wreckOf(mech, mission, day, stripTurns));
    }
  }
  return lost;
}

/** The overworld with `wrecks` set, or the field dropped when none are left. */
function withWrecks(
  state: OverworldState,
  wrecks: readonly WreckRecoverySpec[],
): OverworldState {
  if (wrecks.length > 0) {
    return { ...state, wrecks };
  }
  const { wrecks: _dropped, ...rest } = state;
  return rest;
}
