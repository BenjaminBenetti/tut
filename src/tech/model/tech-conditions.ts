// ===========================================
// Conditions
// ===========================================

/**
 * What the campaign has achieved, as far as the tech tree needs to know
 * (ADR 0013 §2.7): the flags that reveal hidden nodes. `tech/` never
 * reads the overworld itself; whoever asks the tree a question (the
 * unlock handler, the tech tree screen, the mech bay) derives this from
 * the campaign and passes it in, so the tree stays below the overworld
 * in the layering.
 *
 * ```
 *   campaign ──conditionsOf(state)──► TechConditions { flags } ──► unlockTech
 *                                                               └─► techNodeStatus
 * ```
 *
 * **Two kinds of flag** share the set, so a node's `requiresFlags` can
 * name either:
 *
 * | Flag                 | Present when                                   | Example            |
 * |----------------------|------------------------------------------------|--------------------|
 * | a campaign flag      | the story set it (`progress.flags`)            | `"spore-sample"`   |
 * | `killed:<species>`   | the campaign has killed that species at least  | `"killed:spitter"` |
 * |                      | once (`progress.speciesKilled`)                |                    |
 *
 * The `killed:` flags are derived, never stored: the campaign's
 * first-kill record is the truth, and `killedFlag(species)` names the
 * flag an autopsy node requires (campaign arc §8, §10.2).
 */
export interface TechConditions {
  /** Every campaign flag currently set, plus `killed:<species>` for each species killed. */
  readonly flags: ReadonlySet<string>;
}

/** No flags at all: a fresh campaign, or a caller with no campaign. Every node with `requiresFlags` is hidden. */
export const NO_TECH_CONDITIONS: TechConditions = { flags: new Set<string>() };

/** The prefix of a derived species-kill flag: `killed:<species>`. */
export const KILLED_FLAG_PREFIX = "killed:";

/**
 * The condition flag that holds once the campaign has killed `species`
 * at least once, e.g. `"killed:spitter"`. An autopsy node lists it in
 * `requiresFlags` to stay hidden until the first kill.
 *
 * @param species - A bug species id; plain string, since `tech/` does
 *   not import the species vocabulary.
 */
export function killedFlag(species: string): string {
  return `${KILLED_FLAG_PREFIX}${species}`;
}

/**
 * The species a `killed:<species>` flag names, or undefined for any
 * other flag: the inverse of `killedFlag`, so the tree screen can say
 * whose autopsy a node is from the flag that hides it.
 *
 * ```
 *   "killed:spitter" ──► "spitter"
 *   "spore-sample"   ──► undefined
 *   "killed:"        ──► undefined
 * ```
 *
 * @param flag - Any condition flag.
 */
export function killedSpeciesOf(flag: string): string | undefined {
  if (!flag.startsWith(KILLED_FLAG_PREFIX)) {
    return undefined;
  }
  const species = flag.slice(KILLED_FLAG_PREFIX.length);
  return species === "" ? undefined : species;
}
