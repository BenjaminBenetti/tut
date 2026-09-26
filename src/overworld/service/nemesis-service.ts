import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { CampaignProgress } from "../model/campaign-progress";
import type { Mission, MissionId } from "../model/mission";
import type { MissionResult } from "../model/mission-result";
import type { Nemesis, NemesisId, NemesisMark } from "../model/nemesis";
import type { NemesisLore } from "../model/nemesis-lore";
import type { RegionId } from "../model/region";
import { chronicleNemesisKill } from "./campaign-chronicle-service";

// ===========================================
// Constants
// ===========================================

/**
 * The Broodmother's species id as the nemesis record stores it. The
 * overworld names the species by its content id rather than importing
 * the bugs domain's service constant, which lives beside tactical code.
 */
export const BROODMOTHER_NEMESIS_SPECIES: BugSpeciesId = "broodmother";

// ===========================================
// Types
// ===========================================

/** Which kind of named enemy a nemesis id is minted for. */
export type NemesisRole = "broodmother" | "alpha";

/**
 * A named enemy that got away from a mission (campaign arc §6.8, §11),
 * as the launch handler knows it: who it was, where, and what last
 * hurt it. `recordNemesisEscape` turns it into a new or updated record.
 */
export interface NemesisEscape {
  /** Its record, when it was a nemesis already; absent on a first meeting. */
  readonly nemesisId?: NemesisId;
  /** The id a first meeting is recorded under (`nemesisIdFor`). */
  readonly newId: NemesisId;
  readonly speciesId: BugSpeciesId;
  readonly name: string;
  /** The region of the mission it got away from, where it hunts next. */
  readonly regionId: RegionId;
  /** What last hurt it, or `"unmarked"`. */
  readonly mark: NemesisMark;
}

// ===========================================
// Queries
// ===========================================

/**
 * The id a named enemy met on mission `missionId` is recorded under.
 * Derived rather than drawn, so recording it consumes no RNG and a
 * replayed launch records the same id.
 *
 * ```
 *   nemesisIdFor("mission-12", "broodmother") ──► "nemesis:mission-12:broodmother"
 * ```
 */
export function nemesisIdFor(
  missionId: MissionId,
  role: NemesisRole,
): NemesisId {
  return `nemesis:${missionId}:${role}`;
}

/** The record with `id`, or `undefined` once it was killed or never made. */
export function findNemesis(
  progress: Pick<CampaignProgress, "nemeses">,
  id: NemesisId,
): Nemesis | undefined {
  return progress.nemeses.find((nemesis) => nemesis.id === id);
}

/** Living Broodmother nemeses, in the order they were first recorded. */
export function broodmotherNemeses(
  progress: Pick<CampaignProgress, "nemeses">,
): readonly Nemesis[] {
  return progress.nemeses.filter(
    (nemesis) => nemesis.speciesId === BROODMOTHER_NEMESIS_SPECIES,
  );
}

/** Living alpha nemeses (every species but the Broodmother), in record order. */
export function alphaNemeses(
  progress: Pick<CampaignProgress, "nemeses">,
): readonly Nemesis[] {
  return progress.nemeses.filter(
    (nemesis) => nemesis.speciesId !== BROODMOTHER_NEMESIS_SPECIES,
  );
}

/**
 * The scar a named enemy carries after its `escapes`-th escape, marked
 * by `mark` (campaign arc §6.8: "the briefing names her scar"). Chosen
 * from the lore's lines for that mark by a hash of its name plus its
 * escapes, so no RNG is drawn, two enemies wounded alike rarely read
 * alike, and one enemy's next scar differs from its last.
 *
 * ```
 *   lines = lore.scars[mark]
 *   scar  = lines[(hash(name) + escapes) mod lines.length]
 * ```
 */
export function nemesisScar(
  lore: Pick<NemesisLore, "scars">,
  name: string,
  mark: NemesisMark,
  escapes: number,
): string {
  const lines = lore.scars[mark];
  const index = (nameHash(name) + Math.max(0, escapes)) % lines.length;
  return lines[index] ?? lines[0] ?? "";
}

// ===========================================
// Record
// ===========================================

/**
 * Records a named enemy that got away (campaign arc §6.8, §11). A first
 * meeting joins `progress.nemeses` at level 1 with one escape; a nemesis
 * already on the record gains a level, an escape and a new scar, and
 * moves to the region it was last seen in. The input is never mutated.
 *
 * ```
 *   nemesisId on record? ──yes──► { …it, level + 1, escapes + 1, scar, regionId }
 *          │no
 *   nemeses + { id: newId, level 1, escapes 1, scar, regionId }
 * ```
 */
export function recordNemesisEscape(
  progress: CampaignProgress,
  escape: NemesisEscape,
  lore: Pick<NemesisLore, "scars">,
): CampaignProgress {
  const known =
    escape.nemesisId === undefined
      ? undefined
      : findNemesis(progress, escape.nemesisId);
  if (known !== undefined) {
    const escapes = known.escapes + 1;
    const updated: Nemesis = {
      ...known,
      level: known.level + 1,
      escapes,
      scar: nemesisScar(lore, known.name, escape.mark, escapes),
      regionId: escape.regionId,
    };
    return {
      ...progress,
      nemeses: progress.nemeses.map((nemesis) =>
        nemesis.id === known.id ? updated : nemesis,
      ),
    };
  }
  const fresh: Nemesis = {
    id: escape.nemesisId ?? escape.newId,
    speciesId: escape.speciesId,
    name: escape.name,
    scar: nemesisScar(lore, escape.name, escape.mark, 1),
    regionId: escape.regionId,
    level: 1,
    escapes: 1,
  };
  return { ...progress, nemeses: [...progress.nemeses, fresh] };
}

/**
 * Records that the squad killed the nemesis `id` on `day`: the kill is
 * written into the campaign chronicle first, while the record still
 * holds its name, then the record is struck. The end screen reads the
 * chronicle for its nemesis fates ("killed on day N"), so a nemesis
 * struck without this would vanish from them. Returns `progress` itself
 * when `id` is not on the record: a first meeting killed is no nemesis.
 *
 * ```
 *   on record? ──no──► progress
 *       │yes
 *   chronicleNemesisKill(progress, it, day) ──► removeNemesis(·, id)
 * ```
 */
export function recordNemesisKill(
  progress: CampaignProgress,
  id: NemesisId,
  day: number,
): CampaignProgress {
  const nemesis = findNemesis(progress, id);
  if (nemesis === undefined) {
    return progress;
  }
  return removeNemesis(chronicleNemesisKill(progress, nemesis, day), id);
}

/**
 * Strikes the nemesis `id` from the record, and nothing else; a kill
 * goes through `recordNemesisKill`, which chronicles it first. Returns
 * `progress` itself when it is not on the record.
 */
export function removeNemesis(
  progress: CampaignProgress,
  id: NemesisId,
): CampaignProgress {
  if (findNemesis(progress, id) === undefined) {
    return progress;
  }
  return {
    ...progress,
    nemeses: progress.nemeses.filter((nemesis) => nemesis.id !== id),
  };
}

/**
 * What the named alpha of an Alpha Present mission leaves on the record
 * (campaign arc §11, "Built on: Nemesis record"). The offer's
 * `Mission.alpha` says who it was, the result's `alpha` how it ended.
 *
 * ```
 *   no alpha on the offer, or none crowned     ──► unchanged
 *   died                                       ──► its kill chronicled and its record
 *                                                  struck (recordNemesisKill)
 *   lived, mission not won                     ──► recordNemesisEscape: level 1, or level + 1
 *   lived, mission won                         ──► unchanged: it lost the field, not its life
 * ```
 *
 * @param progress - The campaign's progress after the mission was counted.
 * @param mission - The offer that was played.
 * @param result - What the resolver reported.
 * @param regionId - The region of the mission's city, where it hunts next.
 * @param day - The day the mission was played, for a kill's chronicle entry.
 * @param lore - The scars an alpha that got away may carry.
 * @returns The progress with the record updated, or `progress` itself.
 */
export function recordAlphaOutcome(
  progress: CampaignProgress,
  mission: Pick<Mission, "id" | "alpha">,
  result: Pick<MissionResult, "outcome" | "alpha">,
  regionId: RegionId,
  day: number,
  lore: Pick<NemesisLore, "scars">,
): CampaignProgress {
  const alpha = mission.alpha;
  const ended = result.alpha;
  if (alpha === undefined || ended === undefined) {
    return progress;
  }
  if (!ended.survived) {
    return alpha.nemesisId === undefined
      ? progress
      : recordNemesisKill(progress, alpha.nemesisId, day);
  }
  if (result.outcome === "won") {
    return progress;
  }
  return recordNemesisEscape(
    progress,
    {
      ...(alpha.nemesisId === undefined ? {} : { nemesisId: alpha.nemesisId }),
      newId: nemesisIdFor(mission.id, "alpha"),
      speciesId: ended.speciesId,
      name: alpha.name,
      regionId,
      mark: ended.wound ?? "unmarked",
    },
    lore,
  );
}

// ===========================================
// Helpers
// ===========================================

/** A small non-negative string hash (djb2), stable across runs. */
function nameHash(name: string): number {
  let hash = 5381;
  for (let index = 0; index < name.length; index++) {
    hash = ((hash * 33) ^ name.charCodeAt(index)) >>> 0;
  }
  return hash;
}
