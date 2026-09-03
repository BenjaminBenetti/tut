import type { DomainEvent } from "../../core/model/domain-event";
import type { EconomyEvent } from "../../economy/model/economy-event";
import type { EconomyState } from "../../economy/model/economy-state";
import type { Mech, MechId } from "./mech";
import type { MechLoadout } from "./mech-loadout";
import type { MechStatSheet } from "./mech-stat-sheet";
import type { GraveyardEntry, RosterState } from "./roster-state";
import type { Squad, SquadId } from "./squad";

// ===========================================
// Squad hired
// ===========================================

/** Event type emitted when a squad joins the roster. Namespaced for the event bus. */
export const SQUAD_HIRED = "roster:squad-hired";

/** What presentation needs to show the new squad. */
export interface SquadHiredPayload {
  readonly squad: Squad;
  /** Credits paid. */
  readonly cost: number;
}

/** A squad was hired at full strength. */
export type SquadHiredEvent = DomainEvent<
  typeof SQUAD_HIRED,
  SquadHiredPayload
>;

// ===========================================
// Squad reinforced
// ===========================================

/** Event type emitted when soldiers are added to a depleted squad. */
export const SQUAD_REINFORCED = "roster:squad-reinforced";

/** What presentation needs to animate the strength bar. */
export interface SquadReinforcedPayload {
  readonly squadId: SquadId;
  /** Strength before. */
  readonly from: number;
  /** Strength after. Always greater than `from`. */
  readonly to: number;
  /** Credits paid. */
  readonly cost: number;
}

/** A squad's strength rose through reinforcement. */
export type SquadReinforcedEvent = DomainEvent<
  typeof SQUAD_REINFORCED,
  SquadReinforcedPayload
>;

// ===========================================
// Mech built
// ===========================================

/** Event type emitted when a mech is built from a saved loadout. */
export const MECH_BUILT = "roster:mech-built";

/** What presentation needs to show the new mech and its sheet. */
export interface MechBuiltPayload {
  readonly mech: Mech;
  readonly statSheet: MechStatSheet;
  /** Credits paid; equals `statSheet.totalCost`. */
  readonly cost: number;
}

/** A mech was built and joined the roster. */
export type MechBuiltEvent = DomainEvent<typeof MECH_BUILT, MechBuiltPayload>;

// ===========================================
// Loadout saved
// ===========================================

/** Event type emitted when a loadout template is saved. */
export const LOADOUT_SAVED = "roster:loadout-saved";

/** What presentation needs to refresh the template list. */
export interface LoadoutSavedPayload {
  readonly loadout: MechLoadout;
  /** True when a template of the same name was overwritten. */
  readonly replaced: boolean;
}

/** A loadout template was saved or overwritten. */
export type LoadoutSavedEvent = DomainEvent<
  typeof LOADOUT_SAVED,
  LoadoutSavedPayload
>;

// ===========================================
// Loadout deleted
// ===========================================

/** Event type emitted when a loadout template is removed. */
export const LOADOUT_DELETED = "roster:loadout-deleted";

/** What presentation needs to refresh the template list. */
export interface LoadoutDeletedPayload {
  readonly name: string;
}

/** A loadout template was deleted. */
export type LoadoutDeletedEvent = DomainEvent<
  typeof LOADOUT_DELETED,
  LoadoutDeletedPayload
>;

// ===========================================
// Unit damaged
// ===========================================

/** Event type emitted for every squad or mech that came back hurt. */
export const UNIT_DAMAGED = "roster:unit-damaged";

/** What presentation needs to animate a casualty or damage bar. */
export interface UnitDamagedPayload {
  readonly kind: "squad" | "mech";
  /** The squad or mech id. */
  readonly unitId: string;
  /** Squad strength or mech damage before. */
  readonly from: number;
  /** Squad strength or mech damage after. Never equal to `from`. */
  readonly to: number;
}

/** A squad lost soldiers or a mech took damage and survived. */
export type UnitDamagedEvent = DomainEvent<
  typeof UNIT_DAMAGED,
  UnitDamagedPayload
>;

// ===========================================
// Squad wiped
// ===========================================

/** Event type emitted when a squad is lost for good. */
export const SQUAD_WIPED = "roster:squad-wiped";

/** What presentation needs to memorialise the squad. */
export interface SquadWipedPayload {
  /** The squad as it was before the mission. */
  readonly squad: Squad;
  readonly grave: GraveyardEntry;
}

/** A squad's strength reached zero; it is gone (GDD §5.7). */
export type SquadWipedEvent = DomainEvent<
  typeof SQUAD_WIPED,
  SquadWipedPayload
>;

// ===========================================
// Mech destroyed
// ===========================================

/** Event type emitted when a mech is destroyed, parts and all. */
export const MECH_DESTROYED = "roster:mech-destroyed";

/** What presentation needs to memorialise the mech. */
export interface MechDestroyedPayload {
  /** The mech as it was before the mission. */
  readonly mech: Mech;
  readonly grave: GraveyardEntry;
}

/** A mech reached maximum damage; it and its parts are gone (GDD §5.7). */
export type MechDestroyedEvent = DomainEvent<
  typeof MECH_DESTROYED,
  MechDestroyedPayload
>;

// ===========================================
// Mech repaired
// ===========================================

/** Event type emitted when a mech's damage is paid off. */
export const MECH_REPAIRED = "roster:mech-repaired";

/** What presentation needs to animate the repair. */
export interface MechRepairedPayload {
  readonly mechId: MechId;
  /** Damage before; always positive. */
  readonly from: number;
  /** Damage after; always `0`. */
  readonly to: number;
  /** Credits paid. */
  readonly cost: number;
}

/** A mech was fully repaired. */
export type MechRepairedEvent = DomainEvent<
  typeof MECH_REPAIRED,
  MechRepairedPayload
>;

// ===========================================
// Mech renamed
// ===========================================

/** Event type emitted when a mech's name changes. */
export const MECH_RENAMED = "roster:mech-renamed";

/** What presentation needs to refresh a label. */
export interface MechRenamedPayload {
  readonly mechId: MechId;
  readonly from: string;
  readonly to: string;
}

/** A mech was renamed. */
export type MechRenamedEvent = DomainEvent<
  typeof MECH_RENAMED,
  MechRenamedPayload
>;

// ===========================================
// Union and applied shape
// ===========================================

/** Every event the roster domain can emit, one line per event. */
export type RosterEvent =
  | SquadHiredEvent
  | SquadReinforcedEvent
  | MechBuiltEvent
  | LoadoutSavedEvent
  | LoadoutDeletedEvent
  | UnitDamagedEvent
  | SquadWipedEvent
  | MechDestroyedEvent
  | MechRepairedEvent
  | MechRenamedEvent;

/**
 * What a roster command returns: the next roster and economy slices plus
 * the roster events and any `CreditsChanged` the purchase produced, in
 * the order they happened.
 *
 * ```
 *   (roster, economy, command) ──► service ──► { roster', economy', events[] }
 * ```
 */
export interface RosterApplied {
  readonly roster: RosterState;
  readonly economy: EconomyState;
  readonly events: readonly (RosterEvent | EconomyEvent)[];
}
