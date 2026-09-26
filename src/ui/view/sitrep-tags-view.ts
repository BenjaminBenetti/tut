import type { Mission } from "../../overworld/model/mission";
import type { SitrepPresentationCatalogue } from "../model/sitrep-presentation";
import { SITREP_PRESENTATION } from "../data/sitrep-presentation";
import type { SitrepTag } from "../service/missions/sitrep-tags";
import {
  sitrepBadgeClass,
  sitrepMarker,
  sitrepTagsOf,
} from "../service/missions/sitrep-tags";

// ===========================================
// SitrepTagsView
// ===========================================

/**
 * The briefing's sitrep rows (campaign arc §11): one tag row per sitrep
 * the offer carries, each its name, a text marker and its one-line
 * effect. A sitrep that helps the player takes the theme's "ok" colour
 * and says "Helps you"; the rest take "warn" and say "Hazard", so the
 * difference never rests on colour alone. Hidden when the offer carries
 * none.
 *
 * ```
 *   SITREPS
 *   [NIGHTFALL]     HAZARD
 *   Sight −4 for both sides.
 *   [LOCAL GUIDES]  HELPS YOU
 *   The map starts explored; bugs stay hidden.
 * ```
 *
 * Rows are rebuilt only when the offer's sitreps change, which is only
 * when another offer is shown: they are frozen on the offer.
 */
export class SitrepTagsView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly presentation: SitrepPresentationCatalogue;
  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private shownKey: string | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param presentation - Names and lines; the shipped table by default. */
  constructor(presentation: SitrepPresentationCatalogue = SITREP_PRESENTATION) {
    this.presentation = presentation;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the hidden block under `parent`; `update` fills it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("div");
    root.className = "tut-sitreps";
    root.dataset.role = "sitreps";
    root.hidden = true;
    const heading = doc.createElement("h4");
    heading.className = "tut-label tut-sitreps__heading";
    heading.textContent = "Sitreps";
    const list = doc.createElement("ul");
    list.className = "tut-sitreps__list";
    root.append(heading, list);
    parent.appendChild(root);
    this.root = root;
    this.list = list;
  }

  /** Shows `mission`'s sitreps, or hides the block when it has none. */
  update(mission: Pick<Mission, "sitreps"> | undefined): void {
    if (!this.root || !this.list) {
      return;
    }
    const tags = mission ? sitrepTagsOf(mission, this.presentation) : [];
    const key = tags.map((tag) => tag.id).join(",");
    this.root.hidden = tags.length === 0;
    if (key === this.shownKey) {
      return;
    }
    this.shownKey = key;
    this.list.replaceChildren(
      ...tags.map((tag) => sitrepRow(this.list!.ownerDocument, tag)),
    );
  }

  /** Removes the block. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.shownKey = undefined;
  }
}

// ===========================================
// Helpers
// ===========================================

/** One tag row: the coloured name, its text marker, and the effect on the line under them. */
function sitrepRow(doc: Document, tag: SitrepTag): HTMLElement {
  const row = doc.createElement("li");
  row.className = `tut-sitrep${tag.helpsPlayer ? " tut-sitrep--helps" : ""}`;
  row.dataset.sitrep = tag.id;
  row.dataset.helps = String(tag.helpsPlayer);
  const name = doc.createElement("span");
  name.className = `tut-badge ${sitrepBadgeClass(tag)}`;
  name.dataset.field = "sitrep-name";
  name.textContent = tag.name;
  const marker = doc.createElement("span");
  marker.className = "tut-sitrep__marker";
  marker.dataset.field = "sitrep-marker";
  marker.textContent = sitrepMarker(tag);
  const effect = doc.createElement("span");
  effect.className = "tut-sitrep__effect";
  effect.dataset.field = "sitrep-effect";
  effect.textContent = tag.effect;
  row.append(name, marker, effect);
  return row;
}
