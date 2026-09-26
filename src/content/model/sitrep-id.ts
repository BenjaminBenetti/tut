// ===========================================
// Sitrep id
// ===========================================

/**
 * A situation report: a modifier rolled onto a mission when it is
 * offered and shown on its briefing (campaign arc §11, ADR 0013 §2.2).
 * Shared vocabulary: the overworld rolls and freezes them on
 * `Mission.sitreps`, tactical applies each through its rule, and the UI
 * names them. A closed union, so every table keyed by it (the overworld's
 * definitions, tactical's rules, the UI's presentation) must name each
 * sitrep, and a missing entry fails to compile.
 *
 * | Sitrep         | Effect                                           | Helps |
 * |----------------|--------------------------------------------------|-------|
 * | `nightfall`    | sight −4 for both sides                          |       |
 * | `spore-fog`    | smoke clouds scattered at the start              |       |
 * | `city-ablaze`  | burning tiles that rekindle every three turns    |       |
 * | `salvage-rich` | two extra tech carcasses                         | yes   |
 * | `local-guides` | the map starts explored                          | yes   |
 *
 * Later sitreps (Hardened Clutches, Swarm Tide, Dust-off Window, Alpha
 * Present) append one member here and one entry per table.
 */
export type SitrepId =
  "nightfall" | "spore-fog" | "city-ablaze" | "salvage-rich" | "local-guides";

/**
 * Every sitrep id, in a fixed order. Append, never insert: the offer
 * roll draws over this order and tactical applies the rules in it, so
 * the order is part of determinism.
 */
export const SITREP_IDS: readonly SitrepId[] = [
  "nightfall",
  "spore-fog",
  "city-ablaze",
  "salvage-rich",
  "local-guides",
];
