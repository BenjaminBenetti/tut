import type { Applied } from "../../core/model/domain-event";
import type { EconomyEvent } from "../../economy/model/economy-event";
import type { OverworldDomainEvent } from "./overworld-domain-event";

// ===========================================
// Campaign event
// ===========================================

/**
 * Every event a campaign command can emit. Overworld handlers move
 * credits through the economy (upkeep, stipend, mission rewards), so
 * their outcome carries economy events alongside overworld ones; the
 * store forwards the whole list to presentation.
 */
export type CampaignEvent = OverworldDomainEvent | EconomyEvent;

/**
 * The `{ state, events }` pair command handlers and tick steps return,
 * generic over the state they operate on (the whole campaign or a slice).
 */
export type CampaignApplied<TState> = Applied<TState, CampaignEvent>;
