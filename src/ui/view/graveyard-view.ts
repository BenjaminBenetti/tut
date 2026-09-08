import type { EarthMap } from "../../overworld/model/earth-map";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { GraveyardEntry } from "../../roster/model/roster-state";
import { formatWhole } from "../service/format";

// ===========================================
// Constants
// ===========================================

/**
 * Shown when an entry names a city the map no longer has. Only reachable
 * from a hand-edited save; #739 uses the same words on the debrief.
 *
 * An entry with no city at all is a different case — a loss from before
 * schema v17, where the city was never recorded and cannot be recovered.
 * Those rows drop the segment instead, because "unknown" would read as a
 * fault in the memorial rather than as the honest gap it is.
 */
const UNKNOWN_CITY = "Unknown city";

// ===========================================
// GraveyardView
// ===========================================

/**
 * The roster's memorial: every squad wiped and mech destroyed, newest
 * first, with the day and the city it was lost over (GDD §2). Read-only.
 */
export class GraveyardView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private empty: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.id = "graveyard";
    panel.className = "tut-panel tut-roster__panel";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Graveyard";

    const list = doc.createElement("ul");
    list.className = "tut-list";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-losses";
    empty.textContent = "No losses. Keep it that way.";

    panel.append(title, list, empty);
    parent.appendChild(panel);
    this.root = panel;
    this.list = list;
    this.empty = empty;
  }

  /**
   * Rebuilds the memorial from `graveyard`, newest loss first. `map`
   * turns each entry's city id into the name the player knows it by.
   */
  update(graveyard: readonly GraveyardEntry[], map: EarthMap): void {
    if (!this.list || !this.empty) {
      return;
    }
    const doc = this.list.ownerDocument;
    this.list.replaceChildren(
      ...[...graveyard].reverse().map((entry) => {
        const item = doc.createElement("li");
        item.dataset.kind = entry.kind;
        item.textContent = describe(entry, map);
        return item;
      }),
    );
    this.empty.hidden = graveyard.length > 0;
  }

  /** Removes the panel. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.empty = undefined;
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * One memorial row: who, what, when and where.
 *
 * ```
 *   Ada Chen · squad · day 12 · Johannesburg    city on the map
 *   Ada Chen · squad · day 12                   pre-v17, no city recorded
 *   Ada Chen · squad · day 12 · Unknown city    city the map does not have
 * ```
 *
 * Never the mission id (#950): by the time the memorial is read the
 * mission is gone from the offers, so the id names nothing the player
 * could look up.
 */
function describe(entry: GraveyardEntry, map: EarthMap): string {
  const head = `${entry.name} · ${entry.kind} · day ${formatWhole(entry.day)}`;
  if (entry.cityId === undefined) {
    return head;
  }
  return `${head} · ${findCity(map, entry.cityId)?.name ?? UNKNOWN_CITY}`;
}
