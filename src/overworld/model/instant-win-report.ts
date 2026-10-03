import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { Mission } from "./mission";
import type { MissionResult } from "./mission-result";

// ===========================================
// Report
// ===========================================

/**
 * What a mission's own map reports beside the fields every result
 * shares (#1235): what became of a crash site's pod, a defence's
 * installation, a hunt's Broodmother, an evacuation's civilians. The
 * instant win lays it over its won result, so the type's consequence
 * rule, the story and the debrief read a clean win of the mission's own
 * kind rather than a bare outcome.
 *
 * `speciesKilled` names only the species the win itself required
 * killing (an Alpha Hunt's Broodmother); the resolver adds the offer's
 * bug mix to it.
 *
 * ```
 *   crash site   { podDestroyed: true }
 *   alpha hunt   { broodmotherKilled: true, broodmotherEscaped: false,
 *                  speciesKilled: ["broodmother"] }
 * ```
 */
export type InstantWinReport = Partial<
  Pick<
    MissionResult,
    | "defence"
    | "wreck"
    | "podDestroyed"
    | "hiveCoreDestroyed"
    | "podRecovered"
    | "podHpLeft"
    | "civiliansRescued"
    | "civiliansTotal"
    | "tunnelsSealed"
    | "tunnelsTotal"
    | "broodmotherKilled"
    | "broodmotherEscaped"
    | "specimenCaptured"
    | "stages"
    | "speciesKilled"
  >
>;

/** What a clean win of `mission` reports from its map. Pure; draws nothing. */
export type InstantWinReporter = (mission: Mission) => InstantWinReport;

// ===========================================
// Reports
// ===========================================

/**
 * Who says what a clean win reports, per mission type and per story
 * mission (#1235).
 *
 * ```
 *   storyId set and stories[storyId] ──► that report, in place of the type's
 *   otherwise                         ──► types[mission.typeId]
 * ```
 *
 * A story report replaces its type's rather than adding to it, because
 * a story can change what its map is about: Intact Pod is a crash site
 * whose pod is kept, so it reports `podRecovered`, never the crash
 * site's `podDestroyed`.
 */
export interface InstantWinReports {
  /**
   * One reporter per mission type. A `Record` over the closed
   * `MissionTypeId` union, so a type added without one fails to compile.
   */
  readonly types: Readonly<Record<MissionTypeId, InstantWinReporter>>;
  /** The story missions whose map reports something else than their type's; most have none. */
  readonly stories: Readonly<
    Partial<Record<StoryMissionId, InstantWinReporter>>
  >;
}
