import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { DomainEvent } from "../../core/model/domain-event";

// ===========================================
// Campaign flag set
// ===========================================

/** Event type emitted when the campaign earns a story flag. */
export const CAMPAIGN_FLAG_SET = "overworld:campaign-flag-set";

/** What presentation needs to announce the flag. */
export interface CampaignFlagSetPayload {
  /** The flag now in `progress.flags`. */
  readonly flag: CampaignFlagId;
}

/**
 * The campaign earned a story flag (ADR 0013 §2.5): a researched Intel
 * project, a won story mission, the platform's first failure. Emitted
 * once per flag, when it is first set; setting a flag already held
 * emits nothing.
 */
export type CampaignFlagSetEvent = DomainEvent<
  typeof CAMPAIGN_FLAG_SET,
  CampaignFlagSetPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [CAMPAIGN_FLAG_SET]: CampaignFlagSetEvent;
  }
}
