import type { IconId } from "../data/icon-manifest";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

/** One choice on the ring. */
export interface RadialMenuItem {
  /** Reported to `onSelect`; the caller maps it to a command. */
  readonly id: string;
  /** Short verb — "Fire", "Move", "Autocannon". Long labels break the ring. */
  readonly label: string;
  /** Glyph from the icon set; the ring reads by shape before it reads by word. */
  readonly icon: IconId;
  /** Secondary line, e.g. `8–13 dmg`. Omitted when there is nothing to add. */
  readonly detail?: string;
  /** The one entry that resolves the decision, drawn in `ui-accent`. */
  readonly primary?: boolean;
  /** Shown but unpickable, with the reason as its title. */
  readonly disabled?: boolean;
  /** Why it is disabled; becomes the tooltip. */
  readonly reason?: string;
}

/** What the menu shows at its centre: the fact the decision turns on. */
export interface RadialMenuHub {
  /** Headline, e.g. `62%`. */
  readonly value: string;
  /** Caption under it, e.g. `hit chance`. */
  readonly caption: string;
  /** Tone of the headline; `ok` above a comfortable chance, `danger` below. */
  readonly tone?: "plain" | "ok" | "warn" | "danger";
}

/** Where the menu sits, in client pixels: a projected world point (ADR 0007). */
export interface ScreenAnchor {
  readonly x: number;
  readonly y: number;
}

/** What the menu reports back. */
export interface RadialMenuHandlers {
  /** An enabled item was chosen. */
  readonly onSelect: (id: string) => void;
  /** The player dismissed it — Escape, or a click outside the ring. */
  readonly onDismiss: () => void;
}

// ===========================================
// Constants
// ===========================================

/**
 * Vertical ring radius in pixels by item count. Two entries sit close enough
 * to read as a pair; six need room not to collide. Beyond six the ring is the
 * wrong shape and the caller should split the menu.
 */
const RADIUS_BY_COUNT: readonly number[] = [0, 84, 84, 92, 100, 108, 118];

/**
 * The ring is an ellipse, not a circle: labels grow sideways, so a circular
 * ring puts a wide pill like "Missile pod 12-20" straight through the hub.
 */
const RADIUS_X_SCALE = 1.75;

/** Largest ring the layout is designed for. */
const MAX_ITEMS = 6;

/** Where the first item sits, measured clockwise from twelve o'clock. */
const START_ANGLE = -Math.PI / 2;

// ===========================================
// RadialMenuView
// ===========================================

/**
 * The in-world decision menu (ADR 0007, #528): a ring of choices around the
 * thing being decided about, with the fact the decision turns on at its
 * centre.
 *
 * ```
 *            ( Fire )
 *      ( Vent )     ( Move )      hub: 62% hit chance
 *            ( Wait )
 * ```
 *
 * Presentation only. It takes items and a screen anchor and reports a
 * choice; it knows nothing about commands, units or hit chances, and it does
 * not project anything itself — the caller passes the anchor the world→screen
 * bridge already produces.
 *
 * The look answers ADR 0007 §2.5 point by point: it sits at the target, it is
 * a ring rather than a box, it has no panel chrome so the battlefield stays
 * visible, it animates in and is dismissed by the world, and it carries only
 * the numbers the decision needs.
 */
export class RadialMenuView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: RadialMenuHandlers;
  private root: HTMLElement | undefined;
  private ring: HTMLElement | undefined;
  private hub: HTMLElement | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Where choices and dismissals are reported. */
  constructor(handlers: RadialMenuHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the (hidden) menu under `parent`; call `open` to show one. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("div");
    root.id = "radial-menu";
    root.className = "tut-radial";
    root.hidden = true;
    const hub = doc.createElement("div");
    hub.className = "tut-radial__hub";
    hub.dataset.role = "radial-hub";
    const ring = doc.createElement("div");
    ring.className = "tut-radial__ring";
    ring.dataset.role = "radial-ring";
    root.append(ring, hub);
    parent.appendChild(root);

    const onClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest<HTMLButtonElement>("button[data-item]");
      if (!button || button.disabled) {
        return;
      }
      const id = button.dataset.item;
      if (id !== undefined) {
        this.handlers.onSelect(id);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (!root.hidden && event.key === "Escape") {
        this.handlers.onDismiss();
      }
    };
    const onOutside = (event: Event): void => {
      const target = event.target;
      if (root.hidden || !(target instanceof Node) || root.contains(target)) {
        return;
      }
      this.handlers.onDismiss();
    };
    root.addEventListener("click", onClick);
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("pointerdown", onOutside);

    this.root = root;
    this.ring = ring;
    this.hub = hub;
    this.dispose = () => {
      root.removeEventListener("click", onClick);
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("pointerdown", onOutside);
    };
  }

  /** Removes the menu and its listeners. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.ring = undefined;
    this.hub = undefined;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Shows `items` around `anchor` with `hub` at the centre. Calling it again
   * re-renders in place, so a menu can follow its unit as the camera moves.
   *
   * @param items - Choices, at most six; extra entries are dropped rather
   *   than crowded onto a ring that cannot hold them.
   * @param hub - The fact at the centre, or undefined for a bare ring.
   * @param anchor - Screen position of the world point this belongs to.
   */
  open(
    items: readonly RadialMenuItem[],
    hub: RadialMenuHub | undefined,
    anchor: ScreenAnchor,
  ): void {
    const root = this.root;
    const ring = this.ring;
    const hubEl = this.hub;
    if (!root || !ring || !hubEl) {
      return;
    }
    const shown = items.slice(0, MAX_ITEMS);
    const doc = root.ownerDocument;
    ring.textContent = "";
    const radius = RADIUS_BY_COUNT[shown.length] ?? RADIUS_BY_COUNT[MAX_ITEMS]!;
    shown.forEach((item, index) => {
      const angle = START_ANGLE + (index * 2 * Math.PI) / shown.length;
      const button = doc.createElement("button");
      button.type = "button";
      button.className = item.primary
        ? "tut-btn tut-btn--primary tut-radial__item"
        : "tut-btn tut-radial__item";
      button.dataset.item = item.id;
      button.disabled = item.disabled ?? false;
      if (item.reason !== undefined) {
        button.title = item.reason;
      }
      // Positioned from the centre so the ring scales with its content and
      // needs no layout box of its own.
      button.style.left = `${String(Math.cos(angle) * radius * RADIUS_X_SCALE)}px`;
      button.style.top = `${String(Math.sin(angle) * radius)}px`;
      const icon = iconGlyph(doc, item.icon);
      const label = doc.createElement("span");
      label.className = "tut-radial__label";
      label.textContent = item.label;
      button.append(icon, label);
      if (item.detail !== undefined) {
        const detail = doc.createElement("span");
        detail.className = "tut-radial__detail tut-mono";
        detail.textContent = item.detail;
        button.appendChild(detail);
      }
      ring.appendChild(button);
    });

    hubEl.textContent = "";
    hubEl.hidden = hub === undefined;
    if (hub) {
      const value = doc.createElement("div");
      value.className = `tut-radial__value tut-radial__value--${hub.tone ?? "plain"}`;
      value.dataset.field = "hub-value";
      value.textContent = hub.value;
      const caption = doc.createElement("div");
      caption.className = "tut-radial__caption tut-label";
      caption.textContent = hub.caption;
      hubEl.append(value, caption);
    }

    root.style.left = `${String(anchor.x)}px`;
    root.style.top = `${String(anchor.y)}px`;
    root.hidden = false;
    root.dataset.open = "true";
  }

  /** Hides the menu without destroying it. */
  close(): void {
    if (this.root) {
      this.root.hidden = true;
      delete this.root.dataset.open;
    }
  }

  /** True while a menu is on screen. */
  get isOpen(): boolean {
    return this.root !== undefined && !this.root.hidden;
  }
}
