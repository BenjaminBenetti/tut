import type { ActId } from "../../content/model/act-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";

// ===========================================
// Story spine
// ===========================================

/**
 * How one act ends and what entering it does (campaign arc §3, §13;
 * ADR 0013 §2.5).
 *
 * The act **exists** once the story mission in `endedBy` is defined in
 * the story rules and every earlier act exists (`actExists`). A win whose effect is `advance-act` moves the
 * campaign into the next act only if that act exists; otherwise the
 * spine is over and the campaign is won. So each build phase ends in a
 * campaign that can be finished: "the spine ends the game after the last
 * act that exists" (arc §13).
 */
export interface ActGate {
  /** The story mission whose win ends the act. */
  readonly endedBy: StoryMissionId;
  /**
   * Whether entering the act scripts the first hive in the worst region
   * (arc §3: "the first hive is scripted" when Act II opens).
   */
  readonly formsFirstHive: boolean;
}

/**
 * Every act's gate, keyed by the closed `ActId` union so an act without
 * one fails to compile. The data lives in `overworld/data/story-spine.ts`;
 * the story service is handed it.
 */
export type StorySpine = Readonly<Record<ActId, ActGate>>;
