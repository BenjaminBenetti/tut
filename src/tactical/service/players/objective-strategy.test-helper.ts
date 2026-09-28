import type { BugSpeciesId } from "../../../content/model/bug-species-id";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type {
  ObjectiveKind,
  ObjectiveOfKind,
} from "../../model/objective-rules";
import type { Objective, ObjectiveId } from "../../model/tactical-state";
import type { UnitId } from "../../model/unit";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// Objective strategies (#1179, campaign arc §12)
// ===========================================
//
// How a player works one objective, kind by kind, kept apart from how
// it fights: a strategy reads the HUD (the view) and says what jobs
// the objective needs; a policy decides who takes which job and how
// each unit carries its job out. A new objective kind adds a strategy
// to the table, and the compiler insists on it.
//
//   Objective ──► strategy.settled ──► done with it (extract when all are)
//             ├─► strategy.jobs    ──► [ Job { order, crew, who } ]
//             ├─► strategy.couriers ─► units carrying it home
//             └─► strategy.spared  ──► bugs no order may kill
//                                          │
//                              policy.assign ──► unit ──► UnitOrder
//                              policy.next   ──► unit + order ──► command

/** What a unit is told to do this turn. */
export interface UnitOrder {
  /** What the order is for: the log and the tests read it. */
  readonly kind:
    | "work"
    | "destroy"
    | "guard"
    | "escort"
    | "capture"
    | "explore"
    | "hunt"
    | "extract";
  /** Tiles to head for; empty for an order carried out where the unit stands. */
  readonly goals: readonly TileCoord[];
  /** The objective to Interact with once it is in reach. */
  readonly interact?: ObjectiveId;
  /** A spawner, or a named bug (the Broodmother), the order may shoot at while it is in sight. */
  readonly targetId?: string;
  /** Units of ours the order keeps close to. */
  readonly protect?: readonly UnitId[];
  /** Field steps from the goals within which the unit holds instead of closing further. */
  readonly holdRadius?: number;
  /** A species to wear down and net rather than kill. */
  readonly capture?: BugSpeciesId;
  /** A clock is running (a pod ripening): no time to creep from cover to cover. */
  readonly urgent?: boolean;
  /**
   * The target comes before the bugs: a unit with it in its sights fires
   * at it unless a bug offers a likely kill (a hive core under waves
   * that never stop).
   */
  readonly focus?: boolean;
  /**
   * Bugs in sight the force wants alive (a specimen still to net): the
   * unit holds any shot, grenade or reaction that could kill one.
   */
  readonly spare?: readonly UnitId[];
  /**
   * The unit carries the objective home (a netted specimen): it walks
   * rather than stops to trade shots, and fires only once no step gets
   * it nearer home.
   */
  readonly courier?: boolean;
}

/** Which units a job can use. */
export type JobCrew = "any" | "squad";

/** One piece of work an objective needs. */
export interface Job {
  readonly order: UnitOrder;
  /** How many units the job wants; absent, as many as are free. */
  readonly crew?: number;
  /** Which units can do it; absent, any member of the force. */
  readonly who?: JobCrew;
  /** A job only the careful player takes: escorting, guarding what is not the objective itself. */
  readonly expertOnly?: boolean;
}

/**
 * How a player works one kind of objective. Pure: it reads the view
 * only, so it can never know more than the screen shows.
 */
export interface ObjectiveStrategy<K extends ObjectiveKind = ObjectiveKind> {
  /**
   * Whether the force is done with the objective as far as the HUD says:
   * complete, failed, or at the point where only getting home is left.
   */
  settled(objective: ObjectiveOfKind<K>, view: PlayerView): boolean;
  /** The jobs the objective needs now, most urgent first. */
  jobs(objective: ObjectiveOfKind<K>, view: PlayerView): readonly Job[];
  /**
   * Units that now carry the objective home — a specimen's carrier, a
   * wreck's workers once it is stripped — and so head for the drop ship
   * whatever else is going on. Absent: nobody does.
   */
  couriers?(objective: ObjectiveOfKind<K>, view: PlayerView): readonly UnitId[];
  /**
   * True when this objective's couriers walk home rather than stop to
   * trade shots on the way (a squad carrying a netted specimen): their
   * home order says so (`UnitOrder.courier`). Absent: they fight their
   * way home like anyone else.
   */
  readonly couriersWalk?: boolean;
  /**
   * The bugs in sight the objective wants alive, as the HUD shows them:
   * no unit of ours fires a shot that could kill one (`UnitOrder.spare`).
   * Absent: none.
   */
  spared?(objective: ObjectiveOfKind<K>, view: PlayerView): readonly UnitId[];
  /**
   * True when the walk home, once the objective is settled, is longer
   * than the driver's stall patience (a hive's cavern): a turn in which
   * a unit got nearer the drop ship then counts as getting somewhere.
   * Absent: only a unit getting out does.
   */
  readonly longWalkHome?: boolean;
}

/**
 * One strategy per objective kind: a mapped record, so a kind without a
 * strategy, or one filed under another kind, is a compile error.
 */
export type ObjectiveStrategies = {
  readonly [K in ObjectiveKind]: ObjectiveStrategy<K>;
};

/**
 * The strategy for `objective`'s own kind, typed for the whole union as
 * `objectiveRulesFor` hands out rules: the methods are bivariant, so
 * the table is usable for any objective without a cast.
 */
export function strategyFor(
  strategies: ObjectiveStrategies,
  objective: Objective,
): ObjectiveStrategy {
  return strategies[objective.kind];
}
