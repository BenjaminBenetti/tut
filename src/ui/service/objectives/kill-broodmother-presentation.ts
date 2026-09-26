import type {
  KillBroodmotherObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type { HuntStatus } from "../../../tactical/service/objectives/kill-broodmother-objective";
import { huntStatus } from "../../../tactical/service/objectives/kill-broodmother-objective";
import type { IconId } from "../../data/icon-manifest";
import type {
  ObjectivePresentation,
  ObjectiveRow,
  ObjectiveRowContext,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";

// ===========================================
// Types
// ===========================================

/** The live reading the tracker shows for a hunt (#1179). */
export interface HuntProgress {
  /** The rules' own answer: open, killed, or out of reach. */
  readonly status: HuntStatus;
  /** Her name, on the map or among the escaped; undefined when she has none. */
  readonly name: string | undefined;
  /** Her hit points while she is on the map. */
  readonly hp: number | undefined;
  /** Her full health while she is on the map. */
  readonly maxHp: number | undefined;
  /** True once she has turned for the map edge. */
  readonly fleeing: boolean;
  /** True once she has left the map alive. */
  readonly escaped: boolean;
}

// ===========================================
// Constants
// ===========================================

/** What a hunt calls her when she has no name of her own. */
const UNNAMED = "the Broodmother";

/** The row's glyph per status: killed, lost, or still hunted. */
const STATUS_ICONS: Readonly<Record<HuntStatus, IconId>> = {
  complete: "check",
  failed: "warning",
  open: "nemesis",
};

// ===========================================
// Presentation
// ===========================================

/**
 * Kill the Broodmother before she reaches the map edge (campaign arc
 * §6.8, #1179). The row names her, shows her hit points against her
 * full health while she stands, and says when she has turned to run, so
 * the squad sees the moment the hunt becomes a chase. Once she is dead
 * the row is done and the tracker's extraction line says what is left.
 *
 * ```
 *   ♛ Kill Old Scald
 *     48 / 70 hp
 *   ♛ Kill Old Scald
 *     30 / 70 hp · fleeing
 *   ✓ Killed Old Scald
 *   ⚠ Old Scald escaped: she returns stronger
 * ```
 *
 * The numbers sit under her name, not beside it: a name like "The
 * Tallow Queen" and "30 / 70 hp · fleeing" do not share the tracker's
 * width, and inline they overprint each other.
 */
export const KILL_BROODMOTHER_PRESENTATION: ObjectivePresentation<
  "kill-broodmother",
  HuntProgress
> = {
  kind: "kill-broodmother",
  name: huntName,
  row: huntRow,
  progress: liveProgress,
};

// ===========================================
// Helpers
// ===========================================

/** "the Broodmother": a hunt has one quarry, whatever the squad calls her. */
function huntName(): string {
  return UNNAMED;
}

/**
 * The live reading: the rules' status, and her name, health and flight
 * from her unit on the map or, once she has gone, among the escaped.
 */
function liveProgress(
  objective: KillBroodmotherObjective,
  mission: TacticalState,
): HuntProgress {
  const onMap = mission.units.find((unit) => unit.id === objective.targetId);
  const gone = mission.escaped?.find((unit) => unit.id === objective.targetId);
  const her = onMap ?? gone;
  return {
    status: huntStatus(objective, mission),
    name: her?.name,
    hp: onMap?.hp,
    maxHp: onMap?.maxHp,
    fleeing: her?.fleeing === true,
    escaped: gone !== undefined,
  };
}

/**
 * The row: her name in the tense of the hunt's status, and while she
 * stands her hit points, with "fleeing" once she runs. Without a reading
 * (a tracker drawn before the HUD took one) it reads the objective's
 * stored flags and calls her the Broodmother.
 */
function huntRow(
  objective: KillBroodmotherObjective,
  ctx: ObjectiveRowContext<HuntProgress>,
): ObjectiveRow {
  const reading = ctx.progress;
  const status: HuntStatus =
    reading?.status ??
    (objective.complete
      ? "complete"
      : objective.failed === true
        ? "failed"
        : "open");
  const name = reading?.name ?? UNNAMED;
  return {
    icon: STATUS_ICONS[status],
    label: labelFor(status, name, reading?.escaped === true),
    data: { targetId: objective.targetId },
    layout: "stacked",
    ...(status === "open" &&
    reading?.hp !== undefined &&
    reading.maxHp !== undefined
      ? {
          detail: {
            text: `${formatWhole(reading.hp)} / ${formatWhole(reading.maxHp)} hp${reading.fleeing ? " · fleeing" : ""}`,
            role: "broodmother-hp",
          },
        }
      : {}),
  };
}

/** The label: kill her, killed her, or she got away (by the edge, or because nobody was left to stop her). */
function labelFor(status: HuntStatus, name: string, escaped: boolean): string {
  switch (status) {
    case "complete":
      return `Killed ${name}`;
    case "failed":
      return `${capitalise(name)} ${escaped ? "escaped" : "lives"}: she returns stronger`;
    case "open":
      return `Kill ${name}`;
  }
}

/** "The Broodmother" at the start of a sentence; a proper name is unchanged. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
