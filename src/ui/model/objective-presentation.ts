import type {
  Objective,
  ObjectiveId,
  Spawner,
  TacticalState,
} from "../../tactical/model/tactical-state";
import type { IconId } from "../data/icon-manifest";

// ===========================================
// Kinds
// ===========================================

/** Every objective kind the tactical union has. */
export type ObjectiveKind = Objective["kind"];

/**
 * The objective record of one kind. An intersection rather than
 * `Extract` so the compiler can relate one kind's presentation to the
 * table's wide entry; for a single kind it reduces to that member.
 */
export type ObjectiveOfKind<K extends ObjectiveKind> = Objective & {
  readonly kind: K;
};

// ===========================================
// Tracker rows
// ===========================================

/** What the tracker hands a kind's `row` besides the objective. */
export interface ObjectiveRowContext<P = unknown> {
  /**
   * One-based place of the objective in `mission.objectives`. It is what
   * "spawner 2" counts (#949), and it is stable for the whole mission
   * because a finished objective stays in the array.
   */
  readonly ordinal: number;
  /** The mission's egg spawners and pods, for a row that reports one's hit points. */
  readonly spawners: readonly Spawner[];
  /** The reading this kind's `progress` took, when the HUD took one. */
  readonly progress: P | undefined;
}

/** A dim monospace fact on a tracker row: "20 hp", "2 / 3 generators · wave 3 / 5". */
export interface ObjectiveRowDetail {
  readonly text: string;
  /** `data-role` of the fact's span, so a spec can find it. */
  readonly role?: string;
}

/**
 * A deadline counting down on an open objective (ADR 0013 §2.3):
 * "Pod matures in 3 turns". Built by `deadlineCountdown` for any kind
 * whose objective carries a `deadlineTurn`, in the words of the kind's
 * `deadlinePhrase`; the tracker shows it under the row and the banner
 * shows the soonest.
 *
 * ```
 *   deadlineTurn 8   turn 6 ──► 3 turns left            plain
 *                    turn 7 ──► 2 turns left            urgent (pulses)
 *                    turn 8 ──► at the end of this turn urgent
 *                    turn 9 ──► none: the deadline step failed it
 * ```
 */
export interface ObjectiveCountdown {
  /** The sentence: "Pod matures in 3 turns". */
  readonly text: string;
  /** Turns the player still has, this one included; at least one. */
  readonly turnsLeft: number;
  /** True in the last `DEADLINE_URGENT_TURNS` turns, when the countdown pulses. */
  readonly urgent: boolean;
}

/**
 * A countdown a kind keeps on its own row, beside any deadline: a
 * tunnel charge's fuse, "Tunnel 2 blows in 3 turns" (arc §6.7). Built
 * with `countdownAt`, so it counts, words and pulses as a deadline does;
 * `role` names its line's `data-role`, so a spec can tell a fuse from a
 * deadline.
 */
export interface ObjectiveRowCountdown extends ObjectiveCountdown {
  /** `data-role` of the countdown's line: "fuse". */
  readonly role: string;
}

/**
 * One tracker row as its kind describes it; the tracker turns it into
 * DOM. `inline` sets the detail beside the label; `stacked` sets it
 * under the label, for a progress line wider than the rail leaves.
 *
 * ```
 *   inline    ○ Destroy spawner 2          20 hp   in reach
 *   stacked   ⛨ Defend the sensor array
 *               2 / 3 generators · wave 3 / 5
 * ```
 */
export interface ObjectiveRow {
  /** The state glyph before the words. */
  readonly icon: IconId;
  /** What the objective asks, in its current state: "Destroyed spawner 1". */
  readonly label: string;
  /**
   * `data-*` entries for the row after its id and completion flag, in
   * order, keyed as `dataset` keys ("targetId" is `data-target-id`).
   */
  readonly data: Readonly<Record<string, string>>;
  /** Where the detail goes relative to the label. */
  readonly layout: "inline" | "stacked";
  /** The row's numbers, when it shows any now. */
  readonly detail?: ObjectiveRowDetail;
  /**
   * The row's own countdowns, one line each under the label after any
   * deadline: each burning tunnel charge's fuse (arc §6.7). Absent or
   * empty, the row shows none.
   */
  readonly countdowns?: readonly ObjectiveRowCountdown[];
  /**
   * Whether the row reads the objective done, for a kind whose
   * completion is live rather than recorded: a wreck's parts are home
   * the moment a worker boards, and the Extract handler never writes
   * that on the objective (arc §6.6). The tracker's `data-complete` and
   * its "done / total" summary read this, so the count never lags the
   * row under it. Absent, both read the objective's stored `complete`.
   */
  readonly complete?: boolean;
}

// ===========================================
// Objective presentation
// ===========================================

/**
 * How the UI shows one objective kind (ADR 0013 §2.3): its row in the
 * tracker, its name in a sentence, the live numbers the HUD reads for
 * it, and the entity whose id a refusal may carry in its place.
 *
 * ```
 *   OBJECTIVE_PRESENTATION[objective.kind]
 *     ├ row        ──► objective tracker
 *     ├ name       ──► event log and refusals ("spawner 2", "the bank")
 *     ├ progress   ──► the HUD's live reading, handed back to `row`
 *     └ trackedId  ──► a refusal naming the target by the objective
 * ```
 *
 * `P` is the kind's own reading. The HUD takes it with `progress` and
 * the tracker hands it to the same kind's `row`, so the two agree by
 * construction; a kind without live numbers leaves both at `unknown`.
 */
export interface ObjectivePresentation<
  K extends ObjectiveKind = ObjectiveKind,
  P = unknown,
> {
  /** The kind this entry presents; equal to its key in the table. */
  readonly kind: K;
  /**
   * The objective in a sentence, lower case: "spawner 2", "the sensor
   * array". The log and every refusal use it, and the tracker's label
   * is built on it, so the three never disagree (#949, #1072).
   *
   * @param objective - The objective to name.
   * @param ordinal - One-based place of the objective in the mission.
   */
  name(objective: ObjectiveOfKind<K>, ordinal: number): string;
  /** The tracker's row for the objective in its current state. */
  row(objective: ObjectiveOfKind<K>, ctx: ObjectiveRowContext<P>): ObjectiveRow;
  /**
   * The live reading the tracker shows, taken from the mission. The
   * objective record only mirrors it at phase ends, so the HUD reads it
   * afresh on every update.
   */
  progress?(objective: ObjectiveOfKind<K>, mission: TacticalState): P;
  /**
   * The id of the entity the objective tracks, when a refusal can carry
   * that id instead of the objective's (a spawner in `target-destroyed`).
   */
  trackedId?(objective: ObjectiveOfKind<K>): string;
  /**
   * What happens when the objective's deadline passes, as the subject
   * and verb of its countdown: "Pod matures" reads "Pod matures in 3
   * turns". Only read for an objective with a `deadlineTurn`; a kind
   * without one says `DEFAULT_DEADLINE_PHRASE`.
   */
  deadlinePhrase?(objective: ObjectiveOfKind<K>): string;
}

/**
 * The presentation of every objective kind; the shipped one is
 * `OBJECTIVE_PRESENTATION`. A missing kind is a compile error.
 */
export type ObjectivePresentationCatalogue = Readonly<
  Record<ObjectiveKind, ObjectivePresentation>
>;

/**
 * Live readings keyed by objective id, one per objective whose kind has
 * a `progress`. Values are each kind's own `P`, which only that kind's
 * `row` reads.
 */
export type ObjectiveProgressReadings = ReadonlyMap<ObjectiveId, unknown>;

/** Every open objective's deadline countdown, keyed by its id; objectives without one are absent. */
export type ObjectiveCountdowns = ReadonlyMap<ObjectiveId, ObjectiveCountdown>;
