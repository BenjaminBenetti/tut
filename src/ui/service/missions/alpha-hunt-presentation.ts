import { BROODMOTHER_TUNING } from "../../../bugs/data/broodmother-tuning";
import type { BroodmotherTuning } from "../../../bugs/model/broodmother-tuning";
import { MISSION_TUNING } from "../../../overworld/data/mission-tuning";
import type { AlphaHuntSpec } from "../../../overworld/model/alpha-hunt-spec";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type { AlphaHuntTuning } from "../../../overworld/model/mission-tuning";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentation,
} from "../../model/mission-presentation";
import { formatWhole } from "../format";

// ===========================================
// Types
// ===========================================

/** The numbers the Alpha Hunt's words quote, as the game tunes them. */
export interface AlphaHuntPresentationTuning {
  /** Her clutch interval and flight threshold: `BROODMOTHER_TUNING` in the shipped game. */
  readonly broodmother: Pick<
    BroodmotherTuning,
    "clutchInterval" | "fleeAtHpFraction"
  >;
  /** The growth pause her death buys: `MISSION_TUNING.alphaHunt` in the shipped game. */
  readonly hunt: AlphaHuntTuning;
}

// ===========================================
// Briefing fields
// ===========================================

/** Who she is and what the hunt asks. */
const QUARRY: BriefingField = { field: "quarry", label: "Quarry" };

/** The scar and level of a Broodmother come back. */
const NEMESIS: BriefingField = { field: "nemesis", label: "Nemesis" };

/** How she fights: her clutches and her flight. */
const BROODMOTHER: BriefingField = {
  field: "broodmother",
  label: "Broodmother",
};

/** What letting her go costs. */
const ESCAPED: BriefingField = { field: "escaped", label: "Escaped" };

// ===========================================
// Presentation
// ===========================================

/**
 * Builds the Alpha Hunt's presentation (campaign arc §6.8, #1179) over
 * the tuning its words quote: the nemesis crown in the mission list;
 * her name, her scar when she is a nemesis come back, how she fights
 * and what her escape costs in the briefing; and a debrief that says
 * whether she died, got away, or outlived the force.
 *
 * ```
 *   Quarry        Kill Old Scald before she reaches the map edge
 *   Nemesis       Old Scald, scarred: burned along the flank. Level 2   (a nemesis only)
 *   Broodmother   She lays a clutch every 3 turns and flees at half health
 *   Escaped       She returns stronger
 * ```
 *
 * @param tuning - Her tuning and the hunt's, whose numbers the rows quote.
 */
export function createAlphaHuntPresentation(
  tuning: AlphaHuntPresentationTuning,
): MissionPresentation {
  return {
    typeId: "alpha-hunt",
    icon: "nemesis",
    briefingFields: [QUARRY, NEMESIS, BROODMOTHER, ESCAPED],
    briefingRows: (mission) => huntRows(mission, tuning),
    debriefTagline: (result) => huntTagline(result, tuning),
  };
}

/** `alpha-hunt` as the shipped game shows it. */
export const ALPHA_HUNT_PRESENTATION: MissionPresentation =
  createAlphaHuntPresentation({
    broodmother: BROODMOTHER_TUNING,
    hunt: MISSION_TUNING.alphaHunt,
  });

// ===========================================
// Queries
// ===========================================

/**
 * "Old Scald, scarred: burned along the flank. Level 2": a nemesis the
 * way the briefing and the overworld's readout name her. Undefined for
 * a Broodmother met for the first time, who has no scar yet.
 *
 * @param spec - The hunt's frozen quarry.
 */
export function nemesisLine(
  spec: Pick<AlphaHuntSpec, "name" | "scar" | "level">,
): string | undefined {
  if (spec.scar === undefined || spec.level === undefined) {
    return undefined;
  }
  return `${spec.name}, scarred: ${spec.scar}. Level ${formatWhole(spec.level)}`;
}

// ===========================================
// Helpers
// ===========================================

/**
 * The rows. Her name when the offer carries its spec (every offer since
 * hunts exist does), the nemesis row when she has been met before, and
 * the rules of the hunt always.
 */
function huntRows(
  mission: Mission,
  tuning: AlphaHuntPresentationTuning,
): readonly BriefingRow[] {
  const spec = mission.alphaHunt;
  const rows: BriefingRow[] = [];
  if (spec !== undefined) {
    rows.push({
      ...QUARRY,
      value: `Kill ${spec.name} before she reaches the map edge`,
    });
    const nemesis = nemesisLine(spec);
    if (nemesis !== undefined) {
      rows.push({ ...NEMESIS, value: nemesis });
    }
  }
  rows.push(
    {
      ...BROODMOTHER,
      value: `She lays a clutch every ${formatWhole(tuning.broodmother.clutchInterval)} turns and flees at ${healthWords(tuning.broodmother.fleeAtHpFraction)}`,
    },
    { ...ESCAPED, value: "She returns stronger" },
  );
  return rows;
}

/**
 * The debrief's line for a hunt the squad played: killed (and whether
 * the force came home), escaped, or left alive when the force pulled
 * out or fell. Undefined for any result without a hunt, and for a hunt
 * nobody played (auto-resolved), whose outcome's line stands.
 */
function huntTagline(
  result: MissionResult,
  tuning: AlphaHuntPresentationTuning,
): string | undefined {
  if (result.broodmotherKilled === undefined) {
    return undefined;
  }
  if (result.broodmotherKilled) {
    const pause = `Her region's growth holds for ${formatWhole(tuning.hunt.growthPauseDays)} days.`;
    return result.outcome === "lost"
      ? `The Broodmother is dead, but the force did not make it home. ${pause}`
      : `The Broodmother is dead and the force is coming home. ${pause}`;
  }
  if (result.broodmotherEscaped === true) {
    return "The Broodmother reached the map edge. She will return stronger.";
  }
  return result.outcome === "lost"
    ? "The force is lost and the Broodmother lives. She will return stronger."
    : "The force pulled out and the Broodmother lives. She will return stronger.";
}

/** "half health" at 0.5, else "40% health": her flight threshold in words. */
function healthWords(fraction: number): string {
  return fraction === 0.5
    ? "half health"
    : `${formatWhole(Math.round(fraction * 100))}% health`;
}
