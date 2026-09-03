import type { Applied } from "../../core/model/domain-event";
import type { OverworldEventMap } from "./overworld-domain-event";

// ===========================================
// Campaign event
// ===========================================

/**
 * Every event a campaign command or tick step can emit: the overworld's
 * own events plus the roster and economy groups, since overworld handlers
 * hire squads and move credits and the store forwards the whole list to
 * presentation. Derived from `OverworldEventMap`, which each event module
 * augments from its own file (#246), so it is always complete and this is
 * its one definition; `OverworldDomainEvent` is an alias of it.
 */
export type CampaignEvent = OverworldEventMap[keyof OverworldEventMap];

/**
 * The `{ state, events }` pair command handlers and tick steps return,
 * generic over the state they operate on (the whole campaign or a slice).
 */
export type CampaignApplied<TState> = Applied<TState, CampaignEvent>;
