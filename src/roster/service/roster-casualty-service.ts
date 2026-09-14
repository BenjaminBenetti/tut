import type { CasualtyReport } from "../model/casualty-report";
import type { Mech } from "../model/mech";
import { MECH_MAX_DAMAGE } from "../model/mech";
import type { RosterEvent } from "../model/roster-event";
import {
  MECH_DESTROYED,
  SQUAD_WIPED,
  UNIT_DAMAGED,
  UNIT_PROMOTED,
} from "../model/roster-event";
import type { GraveyardEntry, RosterState } from "../model/roster-state";
import type { RosterTuning } from "../model/roster-tuning";
import type { Squad } from "../model/squad";
import { promotionBetween, rankOf } from "./rank-service";

// ===========================================
// Types
// ===========================================

/** What applying a mission's casualties returns. Only the roster changes. */
export interface CasualtiesApplied {
  readonly roster: RosterState;
  readonly events: readonly RosterEvent[];
}

// ===========================================
// Public Functions
// ===========================================

/**
 * Applies a finished mission to the roster (GDD §2, §5.7): deployed
 * squads lose soldiers, deployed mechs accumulate damage, every survivor
 * is credited with the mission, its kills, what those kills were worth
 * and `xpPerMissionSurvived`, is promoted when the experience reaches a
 * new rung of the ladder (#1130), and wiped squads and destroyed mechs
 * are removed and memorialised in the graveyard. Pure: never mutates its
 * inputs and reads only its arguments.
 *
 * ```
 *   for each deployed squad            for each deployed mech
 *     strength −= losses                 damage += report (clamped)
 *     wiped? ──► graveyard + SquadWiped  destroyed? ──► graveyard + MechDestroyed
 *     hurt?  ──► UnitDamaged             hurt?      ──► UnitDamaged
 *     survivor: kills, xp, missions +1   survivor: kills, xp, missions +1
 *     new rung? ──► UnitPromoted         new rung? ──► UnitPromoted
 * ```
 *
 * A squad is wiped when it is listed in `squadsWiped` or its strength
 * reaches zero; a mech is destroyed when listed in `mechsDestroyed` or
 * its damage reaches `MECH_MAX_DAMAGE`, so a resolver's summary lists
 * and its reports cannot disagree. Ids the roster does not hold are
 * ignored: the mission validated its deployment at launch, and a stale
 * id must not poison the whole result. Events come out in roster order,
 * squads then mechs.
 */
export function applyCasualties(
  roster: RosterState,
  report: CasualtyReport,
  day: number,
  tuning: RosterTuning,
): CasualtiesApplied {
  const events: RosterEvent[] = [];
  const graves: GraveyardEntry[] = [];

  const squads = roster.squads.flatMap((squad) =>
    settleSquad(squad, report, day, tuning, events, graves),
  );
  const mechs = roster.mechs.flatMap((mech) =>
    settleMech(mech, report, day, tuning, events, graves),
  );

  return {
    roster: {
      ...roster,
      squads,
      mechs,
      graveyard: [...roster.graveyard, ...graves],
    },
    events,
  };
}

// ===========================================
// Private Functions
// ===========================================

/** The squad after the mission, or nothing when it was wiped. */
function settleSquad(
  squad: Squad,
  report: CasualtyReport,
  day: number,
  tuning: RosterTuning,
  events: RosterEvent[],
  graves: GraveyardEntry[],
): Squad[] {
  const casualties = report.squadCasualties.find((c) => c.squadId === squad.id);
  const deployed =
    casualties !== undefined || report.deployedSquadIds.includes(squad.id);
  if (!deployed) {
    return [squad];
  }
  const losses = Math.min(squad.strength, Math.max(0, casualties?.losses ?? 0));
  const strength = squad.strength - losses;
  if (strength <= 0 || report.squadsWiped.includes(squad.id)) {
    const grave = bury(
      "squad",
      squad.name,
      day,
      report.missionId,
      report.cityId,
    );
    graves.push(grave);
    events.push({ type: SQUAD_WIPED, payload: { squad, grave } });
    return [];
  }
  if (losses > 0) {
    events.push({
      type: UNIT_DAMAGED,
      payload: {
        kind: "squad",
        unitId: squad.id,
        from: squad.strength,
        to: strength,
      },
    });
  }
  const xp = squad.xp + tuning.xpPerMissionSurvived + (casualties?.xp ?? 0);
  pushPromotion(events, "squad", squad.id, squad.name, squad.xp, xp, tuning);
  return [
    {
      ...squad,
      strength,
      kills: squad.kills + (casualties?.kills ?? 0),
      missionsSurvived: squad.missionsSurvived + 1,
      xp,
    },
  ];
}

/** The mech after the mission, or nothing when it was destroyed. */
function settleMech(
  mech: Mech,
  report: CasualtyReport,
  day: number,
  tuning: RosterTuning,
  events: RosterEvent[],
  graves: GraveyardEntry[],
): Mech[] {
  const damageReport = report.mechDamage.find((d) => d.mechId === mech.id);
  const deployed =
    damageReport !== undefined || report.deployedMechIds.includes(mech.id);
  if (!deployed) {
    return [mech];
  }
  const added = Math.max(0, damageReport?.damage ?? 0);
  const damage = Math.min(MECH_MAX_DAMAGE, mech.damage + added);
  if (damage >= MECH_MAX_DAMAGE || report.mechsDestroyed.includes(mech.id)) {
    const grave = bury("mech", mech.name, day, report.missionId, report.cityId);
    graves.push(grave);
    events.push({ type: MECH_DESTROYED, payload: { mech, grave } });
    return [];
  }
  if (damage !== mech.damage) {
    events.push({
      type: UNIT_DAMAGED,
      payload: { kind: "mech", unitId: mech.id, from: mech.damage, to: damage },
    });
  }
  const xp = mech.xp + tuning.xpPerMissionSurvived + (damageReport?.xp ?? 0);
  pushPromotion(events, "mech", mech.id, mech.name, mech.xp, xp, tuning);
  return [
    {
      ...mech,
      damage,
      kills: mech.kills + (damageReport?.kills ?? 0),
      missionsSurvived: mech.missionsSurvived + 1,
      xp,
    },
  ];
}

/**
 * Announces a promotion when the experience crossed a rung of the
 * ladder (#1130), after the unit's own damage event so the debrief reads
 * the cost before the reward.
 */
function pushPromotion(
  events: RosterEvent[],
  kind: "squad" | "mech",
  unitId: string,
  name: string,
  xpBefore: number,
  xpAfter: number,
  tuning: RosterTuning,
): void {
  const ladder = tuning.ranks.ladder;
  const to = promotionBetween(xpBefore, xpAfter, ladder);
  const from = rankOf(xpBefore, ladder);
  if (to === undefined || from === undefined) {
    return;
  }
  events.push({
    type: UNIT_PROMOTED,
    payload: { kind, unitId, name, from, to },
  });
}

/** A graveyard entry for a unit lost on `day` in `missionId`, over `cityId`. */
function bury(
  kind: GraveyardEntry["kind"],
  name: string,
  day: number,
  missionId: string,
  cityId: string,
): GraveyardEntry {
  return { kind, name, day, missionId, cityId };
}
