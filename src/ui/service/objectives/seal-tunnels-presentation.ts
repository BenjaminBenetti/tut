import type {
  SealTunnelsObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import {
  sealProgress,
  trackedMouths,
} from "../../../tactical/service/objectives/seal-tunnels-objective";
import type { IconId } from "../../data/icon-manifest";
import type {
  ObjectivePresentation,
  ObjectiveRow,
  ObjectiveRowContext,
  ObjectiveRowCountdown,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";
import { countdownAt } from "./turn-countdown";

// ===========================================
// Types
// ===========================================

/** A charge burning on a mouth: which mouth, counted from one, and when it blows. */
export interface TunnelFuse {
  /** The mouth's place in the objective's `mouthIds`, from one: "Tunnel 2". */
  readonly ordinal: number;
  /** The turn whose player phase opens with the blast. */
  readonly detonatesOnTurn: number;
}

/** The live reading the tracker shows for a `seal-tunnels` objective. */
export interface SealTunnelsReading {
  /** Mouths sealed so far. */
  readonly sealed: number;
  /** Mouths the objective names. */
  readonly total: number;
  /** The mission's turn, which the fuses count from. */
  readonly turn: number;
  /** Every charge burning on a mouth, in the objective's mouth order. */
  readonly fuses: readonly TunnelFuse[];
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

/** `data-role` of each fuse's line, so a spec can tell it from a deadline. */
export const FUSE_ROLE = "fuse";

// ===========================================
// Presentation
// ===========================================

/**
 * Seal the tunnel mouths (arc §6.7): the mouths sealed of the mouths
 * named beside the label, and a fuse line under it for every charge
 * burning, in the same words and pulse as a deadline. The objective is
 * complete the moment the last charge blows, before the force boards,
 * so the tick reads the live count and the summary agrees with it.
 *
 * ```
 *   ◇ Tunnels sealed                 1 / 3   in reach
 *       Tunnel 2 blows in 3 turns
 *       Tunnel 3 blows at the end of this turn   (urgent: pulses)
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
};

// ===========================================
// Helpers
// ===========================================

/** "the tunnel mouths": what the log and refusals call them. */
function tunnelsName(): string {
  return "the tunnel mouths";
}

/**
 * The live reading from the mission: the mouths sealed, and each charge
 * still burning paired with its mouth's place in the objective, so a
 * fuse names the mouth the player set it on.
 */
export function liveReading(
  objective: SealTunnelsObjective,
  mission: TacticalState,
): SealTunnelsReading {
  const progress = sealProgress(objective, mission);
  const mouthOf = new Map(
    trackedMouths(objective, mission).flatMap((mouth) =>
      mouth.chargeId === undefined ? [] : [[mouth.chargeId, mouth.id]],
    ),
  );
  return {
    sealed: progress.sealed,
    total: progress.total,
    turn: mission.turn,
    // `burning` follows the objective's mouth order, so the fuses do too.
    fuses: progress.burning.flatMap((charge) => {
      const mouthId = mouthOf.get(charge.id);
      return mouthId === undefined
        ? []
        : [
            {
              ordinal: objective.mouthIds.indexOf(mouthId) + 1,
              detonatesOnTurn: charge.detonatesOnTurn,
            },
          ];
    }),
  };
}

/**
 * The row: the count beside the label, the fuses under it while any
 * burn, and whether it reads done. Without a reading it falls back to
 * the objective's own flags and shows no count.
 */
function tunnelsRow(
  objective: SealTunnelsObjective,
  ctx: ObjectiveRowContext<SealTunnelsReading>,
): ObjectiveRow {
  const reading = ctx.progress;
  const status = statusOf(objective, reading);
  const countdowns =
    status === "open" && reading !== undefined ? fuseLines(reading) : [];
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
    ...(countdowns.length > 0 ? { countdowns } : {}),
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
 * Each burning charge's fuse as a countdown to the end of the turn
 * before it blows: set on turn 4 with a 3-turn fuse, it blows as turn
 * 7 opens, so turn 6 is the last turn it burns through.
 *
 * ```
 *   detonatesOnTurn 7:  turn 4 ──► "Tunnel 2 blows in 3 turns"
 *                       turn 6 ──► "Tunnel 2 blows at the end of this turn"
 * ```
 */
function fuseLines(reading: SealTunnelsReading): ObjectiveRowCountdown[] {
  return reading.fuses.flatMap((fuse) => {
    const countdown = countdownAt(
      fuse.detonatesOnTurn - 1,
      reading.turn,
      `Tunnel ${formatWhole(fuse.ordinal)} blows`,
    );
    return countdown === undefined ? [] : [{ ...countdown, role: FUSE_ROLE }];
  });
}
