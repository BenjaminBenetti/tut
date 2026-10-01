import type {
  SealTunnelsObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import { isPulled, isSealed } from "../../../tactical/model/tunnel-mouth";
import {
  sealProgress,
  isTunnelChargeOf,
  trackedMouths,
} from "../../../tactical/service/objectives/seal-tunnels-objective";
import type { IconId } from "../../data/icon-manifest";
import type {
  ObjectivePresentation,
  ObjectiveRow,
  ObjectiveRowContext,
  ObjectiveRowLine,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";
import { countdownAt } from "./turn-countdown";

// ===========================================
// Types
// ===========================================

/**
 * Where one mouth stands (arc §6.7, Ben's rule of 2026-09-28): open and
 * never charged, a charge burning on it, its charge pulled by a bug
 * (open again, to be set anew), or caved in.
 */
export type TunnelMouthState = "open" | "burning" | "pulled" | "sealed";

/** One mouth as the tracker reads it. */
export interface TunnelMouthReading {
  /** The mouth's place in the objective's `mouthIds`, from one: "Tunnel 2". */
  readonly ordinal: number;
  readonly state: TunnelMouthState;
  /** While a charge burns: the turn whose player phase opens with the blast. */
  readonly detonatesOnTurn?: number;
}

/** The live reading the tracker shows for a `seal-tunnels` objective. */
export interface SealTunnelsReading {
  /** Mouths sealed so far. */
  readonly sealed: number;
  /** Mouths the objective names. */
  readonly total: number;
  /** The mission's turn, which the fuses count from. */
  readonly turn: number;
  /** Every mouth the objective names, in its order, with its state. */
  readonly mouths: readonly TunnelMouthReading[];
}

/** Where the row stands. */
type SealStatus = "open" | "complete" | "failed";

// ===========================================
// Constants
// ===========================================

/** The row's words per status: the count beside it says how far. */
const LABELS: Readonly<Record<SealStatus, string>> = {
  open: "Tunnels sealed",
  complete: "Tunnels sealed",
  failed: "Tunnels left open",
};

/** The row's glyph per status. */
const STATUS_ICONS: Readonly<Record<SealStatus, IconId>> = {
  open: "interact",
  complete: "check",
  failed: "warning",
};

/** `data-role` of a burning mouth's line, so a spec can tell it from a deadline. */
export const FUSE_ROLE = "fuse";

/** `data-role` of every other mouth's line. */
export const MOUTH_ROLE = "mouth";

/** Each state's line after "Tunnel N", bar a burning mouth's countdown, and its tone. */
const MOUTH_LINES: Readonly<
  Record<
    Exclude<TunnelMouthState, "burning">,
    { readonly words: string; readonly tone: ObjectiveRowLine["tone"] }
  >
> = {
  open: { words: "open", tone: "quiet" },
  pulled: { words: "charge pulled", tone: "alert" },
  sealed: { words: "sealed", tone: "quiet" },
};

// ===========================================
// Presentation
// ===========================================

/**
 * Seal the tunnel mouths (arc §6.7): the mouths sealed of the mouths
 * named beside the label, and under it a line for every mouth in the
 * objective's order saying where it stands. A burning charge's line is
 * its fuse, in the same words and pulse as a deadline; a charge a bug
 * pulled (Ben's rule, 2026-09-28) reads in the danger colour, since the
 * mouth needs a new one. The objective is complete the moment the last
 * charge blows, before the force boards, so the tick reads the live
 * count and the summary agrees with it.
 *
 * ```
 *   ◇ Tunnels sealed                 1 / 3   in reach
 *       Tunnel 1 sealed                          (dim)
 *       Tunnel 2 blows at the end of this turn   (urgent: pulses)
 *       Tunnel 3 charge pulled                   (danger colour)
 *   ✓ Tunnels sealed                 3 / 3
 *   ⚠ Tunnels left open              2 / 3
 * ```
 */
export const SEAL_TUNNELS_PRESENTATION: ObjectivePresentation<
  "seal-tunnels",
  SealTunnelsReading
> = {
  kind: "seal-tunnels",
  name: tunnelsName,
  row: tunnelsRow,
  progress: liveReading,
  partName: chargeName,
};

// ===========================================
// Helpers
// ===========================================

/** "the tunnel mouths": what the log and refusals call them. */
function tunnelsName(): string {
  return "the tunnel mouths";
}

/**
 * "the charge on tunnel 2": a charge the objective's mouths were set
 * with, burning, gone off or pulled, named by its mouth's place in the
 * objective as the tracker's line is; undefined for any other id.
 */
function chargeName(
  objective: SealTunnelsObjective,
  id: string,
): string | undefined {
  const index = objective.mouthIds.findIndex((mouthId) =>
    isTunnelChargeOf(id, mouthId),
  );
  return index < 0
    ? undefined
    : `the charge on tunnel ${formatWhole(index + 1)}`;
}

/**
 * The live reading from the mission: the mouths sealed, and every mouth
 * the objective names by its place in it, with its state and, while a
 * charge burns on it, when that blows, so a line names the mouth the
 * player set the charge on.
 */
export function liveReading(
  objective: SealTunnelsObjective,
  mission: TacticalState,
): SealTunnelsReading {
  const progress = sealProgress(objective, mission);
  const burning = new Map(
    progress.burning.map((charge) => [charge.id, charge.detonatesOnTurn]),
  );
  return {
    sealed: progress.sealed,
    total: progress.total,
    turn: mission.turn,
    mouths: trackedMouths(objective, mission).map((mouth) => {
      const ordinal = objective.mouthIds.indexOf(mouth.id) + 1;
      const detonatesOnTurn =
        isSealed(mouth) || mouth.chargeId === undefined
          ? undefined
          : burning.get(mouth.chargeId);
      if (detonatesOnTurn !== undefined) {
        return { ordinal, state: "burning", detonatesOnTurn };
      }
      return {
        ordinal,
        state: isSealed(mouth) ? "sealed" : isPulled(mouth) ? "pulled" : "open",
      };
    }),
  };
}

/**
 * The row: the count beside the label, each mouth's line under it while
 * the objective is open, and whether it reads done. Without a reading
 * it falls back to the objective's own flags and shows no count.
 */
function tunnelsRow(
  objective: SealTunnelsObjective,
  ctx: ObjectiveRowContext<SealTunnelsReading>,
): ObjectiveRow {
  const reading = ctx.progress;
  const status = statusOf(objective, reading);
  const lines =
    status === "open" && reading !== undefined ? mouthLines(reading) : [];
  return {
    icon: STATUS_ICONS[status],
    label: LABELS[status],
    data: { status },
    layout: "inline",
    complete: status === "complete",
    ...(reading === undefined
      ? {}
      : {
          detail: {
            text: `${formatWhole(reading.sealed)} / ${formatWhole(reading.total)}`,
            role: "tunnels-sealed",
          },
        }),
    ...(lines.length > 0 ? { lines } : {}),
  };
}

/**
 * Where the row stands: failed as the objective records it, complete
 * once every mouth named is sealed (live, or as recorded), open until
 * then.
 */
function statusOf(
  objective: SealTunnelsObjective,
  reading: SealTunnelsReading | undefined,
): SealStatus {
  if (objective.failed === true) {
    return "failed";
  }
  const sealed =
    reading === undefined
      ? objective.complete
      : reading.total > 0 && reading.sealed === reading.total;
  return sealed ? "complete" : "open";
}

/**
 * Each mouth's line, in the objective's order. A burning charge's is its
 * fuse, counting to the end of the turn before it blows: set on turn 4
 * with a 3-turn fuse, it blows as turn 7 opens, so turn 6 is the last
 * turn it burns through. A fuse with no turn left (the blast is this
 * phase's business) has no line until the mouth seals.
 *
 * ```
 *   detonatesOnTurn 7:  turn 4 ──► "Tunnel 2 blows in 3 turns"
 *                       turn 6 ──► "Tunnel 2 blows at the end of this turn"
 *   pulled             ──────────► "Tunnel 3 charge pulled"
 * ```
 */
function mouthLines(reading: SealTunnelsReading): ObjectiveRowLine[] {
  return reading.mouths.flatMap((mouth): ObjectiveRowLine[] => {
    const name = `Tunnel ${formatWhole(mouth.ordinal)}`;
    const data = { mouthState: mouth.state };
    if (mouth.state === "burning" && mouth.detonatesOnTurn !== undefined) {
      const countdown = countdownAt(
        mouth.detonatesOnTurn - 1,
        reading.turn,
        `${name} blows`,
      );
      return countdown === undefined
        ? []
        : [
            {
              text: countdown.text,
              role: FUSE_ROLE,
              tone: "timer",
              urgent: countdown.urgent,
              data,
            },
          ];
    }
    const line = MOUTH_LINES[mouth.state === "burning" ? "open" : mouth.state];
    return [
      {
        text: `${name} ${line.words}`,
        role: MOUTH_ROLE,
        tone: line.tone,
        data,
      },
    ];
  });
}
