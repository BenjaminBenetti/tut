// ===========================================
// Kill group id
// ===========================================

/**
 * A named set of bug species whose first kill counts as one (campaign
 * arc §10.2, #1179): the armoured carapace is one autopsy however the
 * campaign first cracks it, on a swarmer, a lurker or a brute. The
 * tech tree reveals a group's autopsy on a `killed:<group>` flag the
 * way it reveals a species' on `killed:<species>`; the overworld
 * derives the flag from the first-kill record and the bestiary's
 * `KILL_GROUPS`, which name each group's members.
 *
 * Shared vocabulary (ADR 0002 §2.1): the bestiary defines the groups,
 * the overworld derives their flags and the tech tree's data names
 * them. A closed union, disjoint from `BugSpeciesId`, so a group's
 * flag can never be mistaken for a species'.
 *
 * | Group               | Members                                          |
 * |---------------------|--------------------------------------------------|
 * | `armoured-carapace` | swarmer-armoured, lurker-armoured, brute-armoured |
 */
export type KillGroupId = "armoured-carapace";

/** Every kill group id, in a fixed order. Append, never insert. */
export const KILL_GROUP_IDS: readonly KillGroupId[] = ["armoured-carapace"];
