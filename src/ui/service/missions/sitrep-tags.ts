import type { SitrepId } from "../../../content/model/sitrep-id";
import type { Mission } from "../../../overworld/model/mission";
import { SITREP_PRESENTATION } from "../../data/sitrep-presentation";
import type {
  SitrepPresentation,
  SitrepPresentationCatalogue,
} from "../../model/sitrep-presentation";

// ===========================================
// Constants
// ===========================================

/** The text marker on a sitrep that favours the player, so the colour is never the only sign. */
export const HELPS_MARKER = "Helps you";

/** The text marker on every other sitrep. */
export const HAZARD_MARKER = "Hazard";

/** The prefix a helping sitrep's compact tag carries in the mission list. */
export const HELPS_PREFIX = "+ ";

// ===========================================
// Tags
// ===========================================

/** One sitrep as the UI shows it: its id and its presentation. */
export interface SitrepTag extends SitrepPresentation {
  readonly id: SitrepId;
}

/**
 * The sitreps an offer carries, as tags in the order the offer rolled
 * them. None for an offer without sitreps (every offer before mission
 * 10, and every save from before sitreps).
 *
 * @param mission - The offer.
 * @param presentation - Names and lines; the shipped table by default.
 * @returns One tag per sitrep, in the offer's order.
 */
export function sitrepTagsOf(
  mission: Pick<Mission, "sitreps">,
  presentation: SitrepPresentationCatalogue = SITREP_PRESENTATION,
): readonly SitrepTag[] {
  return (mission.sitreps ?? []).map((id) => ({ id, ...presentation[id] }));
}

/**
 * The text marker a tag carries beside its colour.
 *
 * @param tag - The sitrep.
 * @returns "Helps you" for one that favours the player, "Hazard" otherwise.
 */
export function sitrepMarker(tag: Pick<SitrepTag, "helpsPlayer">): string {
  return tag.helpsPlayer ? HELPS_MARKER : HAZARD_MARKER;
}

/**
 * The badge modifier that colours a tag: the theme's "ok" for one that
 * helps, "warn" for the rest.
 *
 * @param tag - The sitrep.
 * @returns The `tut-badge--*` class.
 */
export function sitrepBadgeClass(tag: Pick<SitrepTag, "helpsPlayer">): string {
  return tag.helpsPlayer ? "tut-badge--ok" : "tut-badge--warn";
}

/**
 * The compact tag the mission list shows: the name, with `+ ` in front
 * when it helps, so the list carries the marker too.
 *
 * @param tag - The sitrep.
 * @returns E.g. "Nightfall" or "+ Local Guides".
 */
export function compactSitrepLabel(
  tag: Pick<SitrepTag, "name" | "helpsPlayer">,
): string {
  return tag.helpsPlayer ? `${HELPS_PREFIX}${tag.name}` : tag.name;
}
