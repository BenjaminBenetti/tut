// ===========================================
// Campaign flag id
// ===========================================

/**
 * One story item or event the campaign remembers (campaign arc §4,
 * ADR 0013 §2.1): an item recovered, a mission won, a failure that
 * changed the story. Shared vocabulary: the overworld stores the flags
 * in its campaign progress, the story service sets them, and hidden tech
 * nodes read them as conditions.
 *
 * A closed union, so a misspelt flag fails to compile. Later packages
 * append: a new story item or event is one new member here and one entry
 * in `CAMPAIGN_FLAG_IDS`.
 *
 * | Flag                    | Set when                                        |
 * |-------------------------|-------------------------------------------------|
 * | `spore-sample`          | the first Crash Site is won                     |
 * | `capture-net`           | Intel I, Pheromone Analysis, is researched      |
 * | `hive-core-sample`      | the first Hive Assault is won                   |
 * | `uplink-won`            | the Uplink story mission is won                 |
 * | `platform-failed`       | the first Spore Platform assault fails (D7)     |
 * | `last-hope`             | Last Hope is researched after that failure (D7) |
 * | `campaign-won`          | the story spine ends in victory (D1)            |
 * | `campaign-lost`         | the Spore Platform assault fails again (D7)     |
 * | `platform-approach`     | Intel III, Platform Approach, is researched     |
 * | `great-hives-destroyed` | the last Great Hive falls (Great Hives package) |
 *
 * `campaign-won` and `campaign-lost` are the story's verdicts: the
 * outcome step ends the campaign on the next day tick once either is
 * set (ADR 0013 §2.5).
 */
export type CampaignFlagId =
  | "spore-sample"
  | "capture-net"
  | "hive-core-sample"
  | "uplink-won"
  | "platform-failed"
  | "last-hope"
  | "campaign-won"
  | "campaign-lost"
  /** Set by Intel III, Platform Approach (`tech.platform-approach`); half of Launch Window's pin. */
  | "platform-approach"
  /**
   * Set by the Great Hives package when the last of the three Great Hives
   * falls (campaign arc §3, Act III); half of Launch Window's pin. Nothing
   * sets it yet: until the Great Hives are built, Launch Window never pins.
   */
  | "great-hives-destroyed";

/** Every campaign flag id, in a fixed order. Append, never insert. */
export const CAMPAIGN_FLAG_IDS: readonly CampaignFlagId[] = [
  "spore-sample",
  "capture-net",
  "hive-core-sample",
  "uplink-won",
  "platform-failed",
  "last-hope",
  "campaign-won",
  "campaign-lost",
  "platform-approach",
  "great-hives-destroyed",
];

/**
 * Narrows a plain string to a `CampaignFlagId`: a tech node's flag
 * effect, say, which `tech/` keeps as a plain string because it may not
 * import this vocabulary (ADR 0013 §2.7).
 */
export function isCampaignFlagId(value: string): value is CampaignFlagId {
  return (CAMPAIGN_FLAG_IDS as readonly string[]).includes(value);
}
