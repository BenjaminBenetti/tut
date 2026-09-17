import type { PopoverContent } from "../model/popover-content";

// ===========================================
// Constants
// ===========================================

/** Pixels between the anchor's edge and the popover. */
const GAP = 8;

/** Keeps the popover off the screen edge. */
const EDGE_MARGIN = 8;

/** The popover element's id, which anchors point at through `aria-describedby`. */
export const POPOVER_ID = "tut-popover";

// ===========================================
// Popover view
// ===========================================

/**
 * The one popover a document shows beside whatever the pointer or the
 * keyboard focus rests on (#1155): a title over typed lines, placed to
 * the left of the anchor (the Situation panel sits at the right edge,
 * so the map side is where there is room), or to the right when the
 * left has none, clamped to the viewport either way. It is a tooltip
 * to assistive tech: `role="tooltip"`, and the anchor is marked
 * `aria-describedby` while it shows.
 *
 * ```
 *   ┌──────────────────────────────┐
 *   │ SENSOR ARRAY                 │   ◄── GAP ──►  [Sensor array · L1 · ¢800 · 0/1]
 *   │ Finds infested cities at 60% │
 *   │ Build ¢800 · upkeep ¢20/day  │
 *   └──────────────────────────────┘
 * ```
 *
 * Presentation only: it takes `PopoverContent` and knows nothing about
 * deployables. `attachPopover` binds the hover and focus events.
 */
export class PopoverView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly doc: Document;
  private element: HTMLElement | undefined;
  private anchor: HTMLElement | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param doc - The document the popover lives in. */
  constructor(doc: Document) {
    this.doc = doc;
    doc.addEventListener("keydown", this.onKeyDown);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Shows `content` beside `anchor`, creating the popover on first use.
   *
   * @param anchor - The element the pointer or focus rests on.
   * @param content - Title and lines.
   */
  show(anchor: HTMLElement, content: PopoverContent): void {
    const element = this.ensure();
    const title = this.doc.createElement("div");
    title.className = "tut-popover__title";
    title.textContent = content.title;
    element.replaceChildren(
      title,
      ...content.lines.map((line) => {
        const row = this.doc.createElement("div");
        row.className = `tut-popover__line tut-popover__line--${line.kind}`;
        row.textContent = line.text;
        return row;
      }),
    );
    if (this.anchor !== anchor) {
      this.anchor?.removeAttribute("aria-describedby");
    }
    this.anchor = anchor;
    anchor.setAttribute("aria-describedby", POPOVER_ID);
    element.hidden = false;
    this.place(anchor, element);
  }

  /**
   * Hides the popover when it is open for `anchor`, or for anything
   * when no anchor is given.
   *
   * @param anchor - The anchor whose leave this is; omit to force.
   */
  hide(anchor?: HTMLElement): void {
    if (anchor !== undefined && anchor !== this.anchor) {
      return;
    }
    if (this.element) {
      this.element.hidden = true;
    }
    this.anchor?.removeAttribute("aria-describedby");
    this.anchor = undefined;
  }

  /** Hides the popover when its anchor has left the document: a list rebuilt under the pointer. */
  hideIfDetached(): void {
    if (this.anchor !== undefined && !this.anchor.isConnected) {
      this.hide();
    }
  }

  /** Whether the popover is showing. */
  get open(): boolean {
    return this.element !== undefined && !this.element.hidden;
  }

  /** The popover element, for tests; undefined before the first show. */
  get root(): HTMLElement | undefined {
    return this.element;
  }

  /** Removes the popover and the key listener. */
  dispose(): void {
    this.doc.removeEventListener("keydown", this.onKeyDown);
    this.hide();
    this.element?.remove();
    this.element = undefined;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** The popover element, built on first use under the body. */
  private ensure(): HTMLElement {
    if (this.element) {
      return this.element;
    }
    const element = this.doc.createElement("div");
    element.id = POPOVER_ID;
    element.className = "tut-tooltip tut-popover";
    element.dataset.role = "popover";
    element.setAttribute("role", "tooltip");
    element.hidden = true;
    this.doc.body.appendChild(element);
    this.element = element;
    return element;
  }

  /**
   * Puts the popover beside the anchor: to its left when that fits,
   * else to its right, else clamped; top-aligned with the anchor and
   * kept inside the viewport.
   */
  private place(anchor: HTMLElement, element: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const view = this.doc.defaultView;
    const width = view?.innerWidth ?? Number.POSITIVE_INFINITY;
    const height = view?.innerHeight ?? Number.POSITIVE_INFINITY;
    const box = element.getBoundingClientRect();
    let left = rect.left - GAP - box.width;
    if (left < EDGE_MARGIN) {
      left = rect.right + GAP;
      if (left + box.width + EDGE_MARGIN > width) {
        left = Math.max(EDGE_MARGIN, width - box.width - EDGE_MARGIN);
      }
    }
    let top = rect.top;
    if (top + box.height + EDGE_MARGIN > height) {
      top = Math.max(EDGE_MARGIN, height - box.height - EDGE_MARGIN);
    }
    element.style.left = `${String(Math.round(left))}px`;
    element.style.top = `${String(Math.round(top))}px`;
  }

  /** Escape closes whatever is open. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.open) {
      this.hide();
    }
  };
}

// ===========================================
// Shared instance
// ===========================================

const shared = new WeakMap<Document, PopoverView>();

/**
 * The document's one popover, built on first use. Every view shares
 * it, so two anchors can never show two popovers.
 *
 * @param doc - The document.
 */
export function popoverFor(doc: Document): PopoverView {
  let view = shared.get(doc);
  if (view === undefined) {
    view = new PopoverView(doc);
    shared.set(doc, view);
  }
  return view;
}

/**
 * Makes `element` open the popover while the pointer or the focus
 * rests on it or on anything inside it: `mouseenter` and `focusin`
 * show what `content` answers at that moment, `mouseleave` and
 * `focusout` hide it. Nothing shows when `content` answers undefined.
 * Focus events are the bubbling pair, so a button inside a row anchors
 * the row.
 *
 * @param element - The anchor.
 * @param content - What to show, read fresh on every open.
 */
export function attachPopover(
  element: HTMLElement,
  content: () => PopoverContent | undefined,
): void {
  const popover = popoverFor(element.ownerDocument);
  const open = (): void => {
    const shown = content();
    if (shown !== undefined) {
      popover.show(element, shown);
    }
  };
  const close = (): void => {
    popover.hide(element);
  };
  element.addEventListener("mouseenter", open);
  element.addEventListener("focusin", open);
  element.addEventListener("mouseleave", close);
  element.addEventListener("focusout", close);
}
