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
 * | Flag               | Set when                                          |
 * |--------------------|---------------------------------------------------|
 * | `spore-sample`     | the first Crash Site is won                       |
 * | `capture-net`      | Intel I, Pheromone Analysis, is researched        |
 * | `hive-core-sample` | the first Hive Assault is won                     |
 * | `uplink-won`       | the Uplink story mission is won                   |
 * | `platform-failed`  | the first Spore Platform assault fails (D7)       |
 */
export type CampaignFlagId =
  | "spore-sample"
  | "capture-net"
  | "hive-core-sample"
  | "uplink-won"
  | "platform-failed";

/** Every campaign flag id, in a fixed order. Append, never insert. */
export const CAMPAIGN_FLAG_IDS: readonly CampaignFlagId[] = [
  "spore-sample",
  "capture-net",
  "hive-core-sample",
  "uplink-won",
  "platform-failed",
];
