import { TUNNEL_MOUTH_COUNT } from "../../../mapgen/service/missions/tunnel-sabotage-map";
import { MISSION_TUNING } from "../../../overworld/data/mission-tuning";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { findCity } from "../../../overworld/service/earth-map-query-service";
import { TUNNEL_TUNING } from "../../../tactical/data/tunnel-tuning";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentation,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import { formatWhole } from "../format";

// ===========================================
// Briefing fields
// ===========================================

/** What the force has to do. */
const TUNNELS: BriefingField = { field: "tunnels", label: "Tunnels" };

/** How long a charge burns before it seals its mouth. */
const FUSE: BriefingField = { field: "fuse", label: "Fuse" };

/** When the city spreads if nobody stops it. */
const SPREAD: BriefingField = { field: "spread", label: "Spread due" };

/** What a win buys. */
const IF_WON: BriefingField = { field: "if-won", label: "Win" };

/** What passing it up costs. */
const IF_IGNORED: BriefingField = { field: "if-ignored", label: "Ignored" };

// ===========================================
// Presentation
// ===========================================

/**
 * Tunnel sabotage (arc §6.7): the tunnel glyph in the list, and a
 * briefing that says what to do, how long a charge burns, when the city
 * spreads, and what a win or a pass means for it. The debrief says how
 * many mouths were sealed and whether the spread is held.
 *
 * ```
 *   Tunnels      Seal 3 tunnel mouths, then extract
 *   Fuse         Charges burn for 3 turns
 *   Spread due   In 2 days
 *   Win          Cairo cannot spread for 10 days
 *   Ignored      Cairo spreads
 * ```
 *
 * The numbers are the shipped ones the rules read: the map's
 * `TUNNEL_MOUTH_COUNT`, `TUNNEL_TUNING.fuseTurns` and
 * `MISSION_TUNING.tunnelSabotage.holdDays`.
 */
export const TUNNEL_SABOTAGE_PRESENTATION: MissionPresentation = {
  typeId: "tunnel-sabotage",
  icon: "tunnel",
  briefingFields: [TUNNELS, FUSE, SPREAD, IF_WON, IF_IGNORED],
  briefingRows: tunnelRows,
  debriefTagline: tunnelTagline,
};

// ===========================================
// Helpers
// ===========================================

/**
 * The task and the fuse on every tunnel sabotage; the spread's day and
 * what a win or a pass does to the city when the offer records the
 * spread it races (every offer made since the type exists does).
 */
function tunnelRows(
  mission: Mission,
  ctx: MissionPresentationContext,
): readonly BriefingRow[] {
  const rows: BriefingRow[] = [
    {
      ...TUNNELS,
      value: `Seal ${formatWhole(TUNNEL_MOUTH_COUNT)} tunnel mouths, then extract`,
    },
    {
      ...FUSE,
      value: `Charges burn for ${formatWhole(TUNNEL_TUNING.fuseTurns)} turns`,
    },
  ];
  const spec = mission.tunnelSabotage;
  if (spec === undefined) {
    return rows;
  }
  const city =
    findCity(ctx.state.overworld.map, spec.cityId)?.name ?? spec.cityId;
  rows.push(
    {
      ...SPREAD,
      value: daysUntil(spec.spreadDueDay - ctx.state.overworld.day),
    },
    {
      ...IF_WON,
      value: `${city} cannot spread for ${formatWhole(MISSION_TUNING.tunnelSabotage.holdDays)} days`,
    },
    { ...IF_IGNORED, value: `${city} spreads` },
  );
  return rows;
}

/** "Today", "Tomorrow", "In 3 days". */
function daysUntil(days: number): string {
  if (days <= 0) {
    return "Today";
  }
  return days === 1 ? "Tomorrow" : `In ${formatWhole(days)} days`;
}

/**
 * A tunnel sabotage says how many mouths were sealed and what that did
 * to the spread, instead of the generic line. Only a win holds the
 * spread: every mouth sealed and the force home. Undefined for any
 * result without tunnel mouths.
 *
 * ```
 *   won                      ──► sealed, the spread held for 10 days
 *   all sealed, nobody home  ──► sealed, but the spread goes ahead
 *   some sealed              ──► n of 3 sealed, the city spreads
 *   none sealed              ──► still open, the city spreads
 * ```
 */
function tunnelTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
): string | undefined {
  const total = result.tunnelsTotal;
  if (total === undefined) {
    return undefined;
  }
  const sealed = result.tunnelsSealed ?? 0;
  const city =
    findCity(ctx.state.overworld.map, result.cityId)?.name ?? result.cityId;
  if (result.outcome === "won") {
    return `Every tunnel mouth under ${city} is sealed. ${city} cannot spread for ${formatWhole(MISSION_TUNING.tunnelSabotage.holdDays)} days.`;
  }
  if (total > 0 && sealed >= total) {
    return `The tunnel mouths under ${city} are sealed, but the force did not make it home. ${city} spreads when it is due.`;
  }
  if (sealed > 0) {
    return `${formatWhole(sealed)} of ${formatWhole(total)} tunnel mouths sealed. ${city} spreads when it is due.`;
  }
  return `The tunnel mouths under ${city} are still open. ${city} spreads when it is due.`;
}
