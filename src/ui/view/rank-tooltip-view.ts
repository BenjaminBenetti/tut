import type { RankTuning } from "../../roster/model/rank";
import { rankTooltipLines } from "../service/rank-text";

// ===========================================
// Constants
// ===========================================

/** Pixels between the anchor's bottom edge and the popover. */
const GAP = 6;

/** Keeps the popover off the screen edge. */
const EDGE_MARGIN = 8;

/** Class the anchor gets so it reads as something that can be rested on. */
export const RANK_ANCHOR_CLASS = "tut-rank";

// ===========================================
// Tooltip view
// ===========================================

/**
 * The popover that says what a rank is worth (#1134). One per document:
 * a rank name anywhere — the unit card badge, the roster's rank cells,
 * a promotion line on the debrief — rests on the same element, which
 * follows the anchor it was opened for and hides on leave, blur or
 * Escape.
 *
 * ```
 *   [Corporal]  ◄── mouseenter / focus ──► show(anchor, lines)
 *   ┌────────────────────────────────────────────┐
 *   │ Corporal · 30 xp — +1 move · +4 accuracy … │  position: fixed, below
 *   │ Sergeant at 60 xp: +1 move · +6 accuracy … │  the anchor's rect
 *   └────────────────────────────────────────────┘
 * ```
 */
export class RankTooltipView {
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
   * Shows `lines` under `anchor`, creating the popover on first use.
   *
   * @param anchor - The element the pointer or focus rests on.
   * @param lines - What to say, one paragraph per line.
   */
  show(anchor: HTMLElement, lines: readonly string[]): void {
    if (lines.length === 0) {
      return;
    }
    const element = this.ensure();
    element.replaceChildren(
      ...lines.map((line) => {
        const p = this.doc.createElement("p");
        p.textContent = line;
        return p;
      }),
    );
    this.anchor = anchor;
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
    this.anchor = undefined;
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
    this.element?.remove();
    this.element = undefined;
    this.anchor = undefined;
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
    element.className = "tut-tooltip";
    element.dataset.role = "rank-tooltip";
    element.setAttribute("role", "tooltip");
    element.hidden = true;
    this.doc.body.appendChild(element);
    this.element = element;
    return element;
  }

  /** Puts the popover just under the anchor, kept inside the viewport. */
  private place(anchor: HTMLElement, element: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const view = this.doc.defaultView;
    const width = view?.innerWidth ?? Number.POSITIVE_INFINITY;
    const height = view?.innerHeight ?? Number.POSITIVE_INFINITY;
    const box = element.getBoundingClientRect();
    let left = rect.left;
    if (left + box.width + EDGE_MARGIN > width) {
      left = Math.max(EDGE_MARGIN, width - box.width - EDGE_MARGIN);
    }
    let top = rect.bottom + GAP;
    if (top + box.height + EDGE_MARGIN > height) {
      top = Math.max(EDGE_MARGIN, rect.top - box.height - GAP);
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

const shared = new WeakMap<Document, RankTooltipView>();

/**
 * The document's one rank tooltip, built on first use. Every screen
 * shares it, so two anchors can never show two popovers.
 *
 * @param doc - The document.
 */
export function rankTooltipFor(doc: Document): RankTooltipView {
  let view = shared.get(doc);
  if (view === undefined) {
    view = new RankTooltipView(doc);
    shared.set(doc, view);
  }
  return view;
}

/**
 * Makes `element` open the rank popover while the pointer or focus
 * rests on it (#1134): what rank `index` boosts and by how much, read
 * through `rankTooltipLines`. The element gets the anchor class, a
 * `tabindex` so the keyboard reaches it, and `data-rank-index`.
 *
 * @param element - The rank name on screen.
 * @param index - The rank index on the ladder.
 * @param tuning - The ladder and its rates.
 */
export function attachRankTooltip(
  element: HTMLElement,
  index: number,
  tuning: RankTuning,
): void {
  const doc = element.ownerDocument;
  const tooltip = rankTooltipFor(doc);
  element.classList.add(RANK_ANCHOR_CLASS);
  element.dataset.rankIndex = String(index);
  if (!element.hasAttribute("tabindex")) {
    element.tabIndex = 0;
  }
  // Listeners go on once; a later attach for a new rank only rewrites
  // the dataset, and the popover reads the index from there. Otherwise
  // a badge that changed rank three times carried three sets, and the
  // one that won was the last registered, by accident (#1134 review).
  if (element.dataset.rankAttached === "true") {
    return;
  }
  element.dataset.rankAttached = "true";
  const open = (): void => {
    const current = Number(element.dataset.rankIndex ?? index);
    tooltip.show(element, rankTooltipLines(current, tuning));
  };
  const close = (): void => {
    tooltip.hide(element);
  };
  for (const type of ["mouseenter", "focus"]) {
    element.addEventListener(type, open);
  }
  for (const type of ["mouseleave", "blur"]) {
    element.addEventListener(type, close);
  }
}
