import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type { PartId } from "../../../roster/model/mech-part";
import type { PartCatalogue } from "../../../roster/model/part-catalogue";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentation,
} from "../../model/mission-presentation";
import { formatWhole } from "../format";

// ===========================================
// Briefing fields
// ===========================================

/** Whose parts the recovery brings home, and how many. */
const WRECK: BriefingField = { field: "wreck", label: "Wreck" };

/** The parts by name, repeats counted. */
const PARTS: BriefingField = { field: "parts", label: "Parts" };

/** How long a squad works the wreck. */
const STRIP: BriefingField = { field: "strip", label: "Strip time" };

// ===========================================
// Presentation
// ===========================================

/**
 * Wreck recovery (arc §6.6): the mech glyph, and a briefing that says
 * whose wreck it is, which parts it pays, and what stripping it takes.
 * The debrief says whether the parts made it home.
 *
 * ```
 *   Wreck        Recover Hammerhead's parts: 6 parts
 *   Parts        Strider legs, Manipulator arms, …, Radiator ×2
 *   Strip time   2 turns by an infantry squad
 * ```
 *
 * Built over a part catalogue so the rows name parts the way the mech
 * bay does; the table passes the shipped one.
 *
 * @param parts - Where part names come from.
 */
export function createWreckRecoveryPresentation(
  parts: Pick<PartCatalogue, "getPart">,
): MissionPresentation {
  return {
    typeId: "wreck-recovery",
    icon: "mech",
    briefingFields: [WRECK, PARTS, STRIP],
    briefingRows: (mission) => wreckRows(mission, parts),
    debriefTagline: wreckTagline,
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The lost mech by name with its part count, the parts by name, and the
 * turns it takes. None when the offer carries no record, which the
 * trigger never makes: the briefing then keeps the shared grid.
 */
function wreckRows(
  mission: Mission,
  parts: Pick<PartCatalogue, "getPart">,
): readonly BriefingRow[] {
  const wreck = mission.wreck;
  if (wreck === undefined) {
    return [];
  }
  const count = wreck.parts.length;
  return [
    {
      ...WRECK,
      value: `Recover ${wreck.mechName}'s parts: ${formatWhole(count)} ${count === 1 ? "part" : "parts"}`,
    },
    { ...PARTS, value: partNames(wreck.parts, parts) },
    {
      ...STRIP,
      value: `${formatWhole(wreck.stripTurns)} ${wreck.stripTurns === 1 ? "turn" : "turns"} by an infantry squad`,
    },
  ];
}

/**
 * The parts by catalogue name in first-seen order, a repeat as "×2";
 * "none" for a wreck stripped to the frame. A part the catalogue no
 * longer knows is named by its id rather than dropped, so the count
 * and the list agree.
 */
export function partNames(
  ids: readonly PartId[],
  parts: Pick<PartCatalogue, "getPart">,
): string {
  if (ids.length === 0) {
    return "none";
  }
  const counts = new Map<PartId, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .map(([id, count]) => {
      const name = parts.getPart(id)?.name ?? id;
      return count > 1 ? `${name} ×${formatWhole(count)}` : name;
    })
    .join(", ");
}

/**
 * A recovery says whether the parts came home, instead of the generic
 * line: stripped and carried out, stripped and left behind, or never
 * stripped. Undefined for any other mission.
 */
function wreckTagline(result: MissionResult): string | undefined {
  const wreck = result.wreck;
  if (wreck === undefined) {
    return undefined;
  }
  if (result.outcome === "won") {
    const count = result.partsAwarded?.length ?? 0;
    return `The wreck was stripped and the parts are coming home: ${formatWhole(count)} ${count === 1 ? "part goes" : "parts go"} to the stock.`;
  }
  if (wreck.stripped) {
    return "The wreck was stripped, but the parts never reached the drop ship. They are lost with it.";
  }
  return `The wreck was worked ${formatWhole(wreck.turnsWorked)} of ${formatWhole(wreck.turnsNeeded)} turns. Its parts are lost.`;
}
