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
  /** The mission's egg spawners, for a row that reports one's hit points. */
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
