import type { MechLoadout } from "../../roster/model/mech-loadout";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import type { MechPart, PartSlot } from "../../roster/model/mech-part";
import { PART_SLOTS } from "../../roster/model/mech-part";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import { partThumbnail } from "../data/part-thumbnail-table";
import { thumbnailUrl } from "../data/thumbnail-manifest";
import { formatCredits } from "../service/format";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

/** What the palette reports back to its owner. */
export interface PartPaletteViewHandlers {
  /** The pointer or focus rests on a card, or left the last one. */
  readonly onHover: (part: MechPart | undefined) => void;
  /** The player asked for the part to be fitted without dragging: Enter or a double-click. */
  readonly onFit: (part: MechPart) => void;
  /** A card started being dragged; the owner tells the stage what to expect. */
  readonly onDragStart: (part: MechPart) => void;
  /** The drag ended, dropped or not. */
  readonly onDragEnd: () => void;
}

/** A filter chip's value: one slot, or every slot. */
type Filter = PartSlot | "all";

// ===========================================
// Constants
// ===========================================

/** Slot labels for the filter chips and the card lines. */
export const SLOT_LABELS: Readonly<Record<PartSlot, string>> = {
  chassis: "Chassis",
  legs: "Legs",
  arms: "Arms",
  "arm-weapon": "Arm weapon",
  "back-weapon": "Back weapon",
  utility: "Utility",
};

/** Edge of a card's thumbnail in CSS pixels; the assets are 128 px square. */
const THUMB_PX = 40;

/** The MIME type the drag carries the part id under, for a drop target outside the bay. */
const DRAG_TYPE = "text/plain";

// ===========================================
// PartPaletteView
// ===========================================

/**
 * The mech bay's left panel (#1145): every catalogue part as a card
 * that can be dragged onto the mech, behind a search box and a row of
 * slot filters. Nothing is decided here — the owner hears which card is
 * rested on and which is being dragged, and the stage decides what a
 * drop means.
 *
 * ```
 *   ┌ Parts ─────────────────────────────┐
 *   │ [search…                         ] │
 *   │ (All)(Chassis)(Legs)(Arms)(…)      │
 *   │ ┌────┐ Railgun            [Fitted] │ ◄─ draggable, tabindex
 *   │ │ img│ ARM WEAPON · T2 · ¢1,200    │
 *   │ └────┘                             │
 *   │ …                                  │
 *   └────────────────────────────────────┘
 * ```
 *
 * Cards are built once for the whole catalogue and only shown or hidden
 * by the filters, so a hover or a drag never lands on a card that was
 * rebuilt under the pointer.
 */
export class PartPaletteView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: PartPaletteViewHandlers;
  private readonly parts: PartCatalogue;
  private root: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private search: HTMLInputElement | undefined;
  private chips = new Map<Filter, HTMLButtonElement>();
  private cards = new Map<string, HTMLElement>();
  private filter: Filter = "all";
  private hovered: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Hover, fit and drag callbacks.
   * @param parts - The catalogue the cards list.
   */
  constructor(handlers: PartPaletteViewHandlers, parts: PartCatalogue) {
    this.handlers = handlers;
    this.parts = parts;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent` with every catalogue part listed. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.id = "part-palette";
    panel.className = "tut-panel tut-mech-bay__palette";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Parts";

    const search = doc.createElement("input");
    search.type = "search";
    search.className = "tut-input tut-mech-bay__search";
    search.placeholder = "Search parts";
    search.dataset.field = "part-search";
    search.setAttribute("aria-label", "Search parts");
    this.listen(search, "input", () => {
      this.applyFilters();
    });

    const filters = doc.createElement("div");
    filters.className = "tut-mech-bay__filters";
    filters.dataset.role = "slot-filters";
    for (const value of ["all", ...PART_SLOTS] as const) {
      filters.appendChild(this.chip(doc, value));
    }

    const list = doc.createElement("ul");
    list.className = "tut-list tut-mech-bay__parts";
    list.dataset.role = "part-list";
    for (const slot of PART_SLOTS) {
      for (const part of this.parts.partsForSlot(slot)) {
        list.appendChild(this.card(doc, part));
      }
    }
    this.listen(list, "mouseover", (event) => {
      this.hover(this.cardOf(event.target));
    });
    this.listen(list, "mouseout", (event) => {
      const to = this.cardOf((event as MouseEvent).relatedTarget);
      if (to !== this.hovered) {
        this.hover(to);
      }
    });
    this.listen(list, "focusin", (event) => {
      this.hover(this.cardOf(event.target));
    });
    this.listen(list, "focusout", (event) => {
      const to = this.cardOf((event as FocusEvent).relatedTarget);
      if (to !== this.hovered) {
        this.hover(to);
      }
    });
    this.listen(list, "dblclick", (event) => {
      const part = this.partOf(this.cardOf(event.target));
      if (part) {
        this.handlers.onFit(part);
      }
    });
    this.listen(list, "keydown", (event) => {
      if ((event as KeyboardEvent).key !== "Enter") {
        return;
      }
      const part = this.partOf(this.cardOf(event.target));
      if (part) {
        event.preventDefault();
        this.handlers.onFit(part);
      }
    });
    this.listen(list, "dragstart", (event) => {
      const card = this.cardOf(event.target);
      const part = this.partOf(card);
      if (!card || !part) {
        return;
      }
      const transfer = (event as DragEvent).dataTransfer;
      if (transfer) {
        transfer.effectAllowed = "copy";
        transfer.setData(DRAG_TYPE, part.id);
      }
      card.classList.add("is-dragging");
      this.handlers.onDragStart(part);
    });
    this.listen(list, "dragend", (event) => {
      this.cardOf(event.target)?.classList.remove("is-dragging");
      this.handlers.onDragEnd();
    });

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-parts";
    empty.textContent = "No part matches.";
    empty.hidden = true;

    panel.append(title, search, filters, list, empty);
    parent.appendChild(panel);
    this.root = panel;
    this.empty = empty;
    this.search = search;
    this.setFilter("all");
  }

  /** Marks the cards whose part the draft carries. */
  setLoadout(loadout: MechLoadout): void {
    const fitted = new Set(loadoutPartIds(loadout));
    for (const [id, card] of this.cards) {
      const on = fitted.has(id);
      card.dataset.fitted = on ? "true" : "false";
      const badge = card.querySelector<HTMLElement>('[data-role="fitted"]');
      if (badge) {
        badge.hidden = !on;
      }
    }
  }

  /** Removes the panel and every listener. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.empty = undefined;
    this.search = undefined;
    this.chips = new Map();
    this.cards = new Map();
    this.hovered = undefined;
  }

  // ===========================================
  // Filters
  // ===========================================

  /** Presses one chip and shows the cards it and the search allow. */
  private setFilter(filter: Filter): void {
    this.filter = filter;
    for (const [value, chip] of this.chips) {
      chip.setAttribute("aria-pressed", value === filter ? "true" : "false");
    }
    this.applyFilters();
  }

  /** Hides every card the chip or the search text rules out. */
  private applyFilters(): void {
    const needle = (this.search?.value ?? "").trim().toLowerCase();
    let shown = 0;
    for (const [id, card] of this.cards) {
      const part = this.parts.getPart(id);
      const bySlot = this.filter === "all" || part?.slot === this.filter;
      const byText =
        needle === "" ||
        (part?.name.toLowerCase().includes(needle) ?? false) ||
        (part !== undefined &&
          SLOT_LABELS[part.slot].toLowerCase().includes(needle));
      card.hidden = !(bySlot && byText);
      if (!card.hidden) {
        shown += 1;
      }
    }
    if (this.empty) {
      this.empty.hidden = shown > 0;
    }
  }

  // ===========================================
  // Hover
  // ===========================================

  /** Reports the card under the pointer or focus, once per change. */
  private hover(card: HTMLElement | undefined): void {
    if (card === this.hovered) {
      return;
    }
    this.hovered?.classList.remove("is-hovered");
    this.hovered = card;
    card?.classList.add("is-hovered");
    this.handlers.onHover(this.partOf(card));
  }

  // ===========================================
  // DOM
  // ===========================================

  /** One filter chip. */
  private chip(doc: Document, value: Filter): HTMLButtonElement {
    const chip = doc.createElement("button");
    chip.type = "button";
    chip.className = "tut-btn tut-mech-bay__chip";
    chip.dataset.filter = value;
    chip.textContent = value === "all" ? "All" : SLOT_LABELS[value];
    chip.setAttribute("aria-pressed", "false");
    this.listen(chip, "click", () => {
      this.setFilter(value);
    });
    this.chips.set(value, chip);
    return chip;
  }

  /** One draggable card: picture, name, slot · tier · price, and the fitted badge. */
  private card(doc: Document, part: MechPart): HTMLElement {
    const card = doc.createElement("li");
    card.className = "tut-mech-bay__part";
    card.draggable = true;
    card.tabIndex = 0;
    card.dataset.partId = part.id;
    card.dataset.slot = part.slot;
    card.dataset.fitted = "false";
    card.title = part.description;
    card.setAttribute("aria-label", `${part.name}, ${SLOT_LABELS[part.slot]}`);

    const body = doc.createElement("span");
    body.className = "tut-mech-bay__part-body";
    const name = doc.createElement("span");
    name.className = "tut-mech-bay__part-name";
    name.dataset.field = "name";
    name.textContent = part.name;
    const meta = doc.createElement("span");
    meta.className = "tut-label tut-mech-bay__part-meta";
    meta.textContent = `${SLOT_LABELS[part.slot]} · T${String(part.tier)} · ${formatCredits(part.cost)}`;
    body.append(name, meta);

    const badge = doc.createElement("span");
    badge.className = "tut-badge tut-badge--ok";
    badge.dataset.role = "fitted";
    badge.textContent = "Fitted";
    badge.hidden = true;

    card.append(this.thumbnail(doc, part), body, badge);
    this.cards.set(part.id, card);
    return card;
  }

  /**
   * The part's picture, or the ability glyph for a part that has none
   * (#594): a utility has no visual slot, and an empty box reads as a
   * picture that failed to load.
   */
  private thumbnail(doc: Document, part: MechPart): HTMLElement {
    const cell = doc.createElement("span");
    cell.className = "tut-mech-bay__thumb";
    const id = partThumbnail(part.id);
    if (id === undefined) {
      const none = iconGlyph(doc, "ability");
      none.classList.add("tut-mech-bay__thumb-none");
      none.dataset.role = "part-thumb-none";
      cell.appendChild(none);
      return cell;
    }
    const img = doc.createElement("img");
    img.className = "tut-mech-bay__thumb-img";
    img.dataset.role = "part-thumb";
    img.dataset.thumb = id;
    img.src = thumbnailUrl(id);
    img.width = THUMB_PX;
    img.height = THUMB_PX;
    // Decorative: the card names the part beside it.
    img.alt = "";
    img.draggable = false;
    cell.appendChild(img);
    return cell;
  }

  /** The card an event target sits in, if any. */
  private cardOf(target: EventTarget | null): HTMLElement | undefined {
    if (!(target instanceof Element)) {
      return undefined;
    }
    const card = target.closest<HTMLElement>("[data-part-id]");
    return card ?? undefined;
  }

  /** The catalogue part a card stands for. */
  private partOf(card: HTMLElement | undefined): MechPart | undefined {
    const id = card?.dataset.partId;
    return id === undefined ? undefined : this.parts.getPart(id);
  }

  /** Attaches a listener and remembers how to remove it. */
  private listen(
    target: HTMLElement,
    event: string,
    handler: (event: Event) => void,
  ): void {
    target.addEventListener(event, handler);
    this.disposers.push(() => {
      target.removeEventListener(event, handler);
    });
  }
}
