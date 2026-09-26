import { INSTALLATION_SITES } from "../../../content/data/installation-sites";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentation,
} from "../../model/mission-presentation";
import { formatWhole } from "../format";

// ===========================================
// Briefing fields
// ===========================================

/** The installation under attack and how many generators it runs on. */
const INSTALLATION: BriefingField = {
  field: "installation",
  label: "Installation",
};

/** How many timed waves the edges send. */
const WAVES: BriefingField = { field: "waves", label: "Bug waves" };

// ===========================================
// Presentation
// ===========================================

/**
 * Defend installation (#1175): the shield glyph, the installation and
 * its wave count in the briefing, and a debrief that says what became
 * of the installation.
 */
export const DEFEND_INSTALLATION_PRESENTATION: MissionPresentation = {
  typeId: "defend-installation",
  icon: "defend",
  briefingFields: [INSTALLATION, WAVES],
  briefingRows: defenceRows,
  debriefTagline: defenceTagline,
};

// ===========================================
// Helpers
// ===========================================

/**
 * The installation by name with its generator count, and the waves.
 * None when the offer carries no defence, which only a hand-edited or
 * pre-#1175 save can produce: the briefing then keeps the shared grid.
 */
function defenceRows(mission: Mission): readonly BriefingRow[] {
  const defence = mission.defence;
  if (defence === undefined) {
    return [];
  }
  return [
    {
      ...INSTALLATION,
      value: `${INSTALLATION_SITES[defence.installation].name} · ${formatWhole(defence.generators)} generators`,
    },
    { ...WAVES, value: `${formatWhole(defence.waves)} timed waves` },
  ];
}

/**
 * A defence says what became of the installation (#1175) instead of the
 * generic line: held through every wave, held when the force pulled
 * out, or lost with its generators. Undefined for any other mission.
 */
function defenceTagline(result: MissionResult): string | undefined {
  if (result.defence === undefined) {
    return undefined;
  }
  const name = INSTALLATION_SITES[result.defence.installation].name;
  if (result.outcome === "won") {
    return `The ${name.toLowerCase()} held through every wave. The force is coming home with full rewards.`;
  }
  if (result.defence.held) {
    return `The force pulled out with the ${name.toLowerCase()} still running. Survivors are coming home.`;
  }
  return result.outcome === "lost"
    ? `The generators fell and the ${name.toLowerCase()} is lost. The force was wiped, or the mission was left with the installation down.`
    : `The generators fell; the ${name.toLowerCase()} is lost. Survivors are coming home.`;
}
