import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { Mission } from "../../overworld/model/mission";
import type { MissionResult } from "../../overworld/model/mission-result";
import type { GameState } from "../../save/model/game-state";
import type { IconId } from "../data/icon-manifest";

// ===========================================
// Briefing rows
// ===========================================

/**
 * A row a mission type may add to the briefing grid: its key and the
 * term the grid prints beside the value.
 */
export interface BriefingField {
  /** Stable key; the value cell carries `data-field="detail-<field>"`. */
  readonly field: string;
  /** The term as the grid shows it, e.g. "Bug waves". */
  readonly label: string;
}

/** A filled briefing row: one of the type's fields with its formatted value. */
export interface BriefingRow extends BriefingField {
  /** The value as the grid shows it, e.g. "5 timed waves". */
  readonly value: string;
}

// ===========================================
// Mission presentation
// ===========================================

/** What a presentation may read besides the mission or result it is handed. */
export interface MissionPresentationContext {
  /** The campaign the mission belongs to, for names on the map and in the roster. */
  readonly state: GameState;
}

/**
 * How the UI shows one mission type (ADR 0013 §2.3): the glyph in the
 * mission list, the rows the type adds to the briefing, and the
 * debrief's tagline when the type has its own words for an outcome.
 *
 * ```
 *   MISSION_PRESENTATION[typeId]
 *     ├ icon            ──► mission list glyph
 *     ├ briefingFields  ──► briefing grid slots, built once at mount
 *     ├ briefingRows    ──► the slots this mission fills; the rest hide
 *     └ debriefTagline  ──► results banner line, else the outcome's own
 * ```
 *
 * The briefing's shared rows (city, difficulty, reward, map parameters)
 * belong to the view; a type only adds what no other type has.
 */
export interface MissionPresentation {
  /** The type this entry presents; equal to its key in the table. */
  readonly typeId: MissionTypeId;
  /** The mission list's glyph for the type; the name stays in its tooltip. */
  readonly icon: IconId;
  /**
   * Every row `briefingRows` can return, in grid order, so the briefing
   * builds its slots once and only rewrites values afterwards.
   */
  readonly briefingFields: readonly BriefingField[];
  /**
   * The rows this mission fills, a subset of `briefingFields` in the
   * same order. A field left out is hidden, so a type whose payload is
   * missing (an older save) shows the shared grid alone.
   */
  briefingRows(
    mission: Mission,
    ctx: MissionPresentationContext,
  ): readonly BriefingRow[];
  /**
   * The debrief's line for `result` in this type's words, or undefined
   * to keep the outcome's generic line. A result carries no type id, so
   * the tagline reads its own payload and answers undefined for a
   * result that is not its type's.
   */
  debriefTagline?(
    result: MissionResult,
    ctx: MissionPresentationContext,
  ): string | undefined;
}

/**
 * The presentation of every mission type, keyed by id; the shipped one
 * is `MISSION_PRESENTATION`. A missing type is a compile error.
 */
export type MissionPresentationCatalogue = Readonly<
  Record<MissionTypeId, MissionPresentation>
>;
