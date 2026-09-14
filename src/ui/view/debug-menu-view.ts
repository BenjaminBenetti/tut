import type { PlaceableUnit } from "../../tactical/model/place-unit-command";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

/** What the menu reports back to its owner. */
export interface DebugMenuHandlers {
  /**
   * The player armed an entry, or disarmed the armed one by pressing it
   * again; `undefined` is the disarm. The owner keeps the armed entry
   * and hands it back through `update`, so the menu never holds state
   * the HUD does not.
   */
  readonly onArm: (entry: PlaceableUnit | undefined) => void;
  /** The close button. The owner closes the menu and disarms. */
  readonly onClose: () => void;
}

/** What the menu shows. */
export interface DebugMenuModel {
  /** Whether the panel is on screen. */
  readonly open: boolean;
  /** The entry armed for placement, if any; its button reads pressed. */
  readonly armed: PlaceableUnit | undefined;
}

// ===========================================
// Constants
// ===========================================

/** `data-testid` of the panel, for the specs. */
export const DEBUG_MENU_TEST_ID = "debug-menu";

/** The two lists, by which side the placed unit fights for. */
const SIDES = [
  { title: "Friendly", kinds: ["squad", "mech"] },
  { title: "Hostile", kinds: ["bug"] },
] as const;

// ===========================================
// DebugMenuView
// ===========================================

/**
 * The development tools' panel (#1136): a dev-only menu the bug button
 * at the bottom left of the mission bar opens, laid over the left rail.
 * Its one section so far lists every unit the `PlaceUnit` handler can
 * put down, friendly and hostile; pressing an entry arms it, and the
 * HUD then treats the next click on the map as "place it there".
 *
 * ```
 *   ┌ DEBUG ─────────────────────────── ✕ ┐
 *   │ Place unit                          │
 *   │ Friendly                            │
 *   │   [Rifle Squad] [Rocket Squad] …    │
 *   │   [Mech (starter)]                  │
 *   │ Hostile                             │
 *   │   [Swarmer] [Lurker] [Brute]        │
 *   │ Place: Swarmer — click the map,     │
 *   │ Esc cancels                         │
 *   └─────────────────────────────────────┘
 * ```
 *
 * The entries come from the composition, which reads them from the
 * handler's own catalogues, so the menu cannot offer a type the rules
 * would then refuse as unknown. The panel is a child of the HUD grid,
 * so the HUD's pointer guard keeps clicks on it off the map picker
 * (#1113) the way it does for every other panel.
 */
export class DebugMenuView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: DebugMenuHandlers;
  private readonly entries: readonly PlaceableUnit[];
  private root: HTMLElement | undefined;
  private armedLine: HTMLElement | undefined;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Where arming and closing are reported.
   * @param entries - Every unit the menu offers, in catalogue order.
   */
  constructor(handlers: DebugMenuHandlers, entries: readonly PlaceableUnit[]) {
    this.handlers = handlers;
    this.entries = entries;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`, closed; call `update` to open it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-debug-menu";
    panel.dataset.testid = DEBUG_MENU_TEST_ID;
    panel.dataset.role = "debug-menu";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Debug");
    panel.hidden = true;

    const head = doc.createElement("div");
    head.className = "tut-debug-menu__head tut-row";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Debug";
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "tut-btn tut-debug-menu__close";
    close.dataset.action = "debug-menu-close";
    close.setAttribute("aria-label", "Close debug menu");
    close.appendChild(iconGlyph(doc, "close"));
    head.append(title, close);
    panel.appendChild(head);

    const section = doc.createElement("div");
    section.className = "tut-debug-menu__section tut-stack";
    const heading = doc.createElement("div");
    heading.className = "tut-debug-menu__heading";
    heading.textContent = "Place unit";
    section.appendChild(heading);
    for (const side of SIDES) {
      const label = doc.createElement("div");
      label.className = "tut-dim tut-debug-menu__side";
      label.textContent = side.title;
      section.appendChild(label);
      const list = doc.createElement("div");
      list.className = "tut-debug-menu__list";
      list.dataset.side = side.title.toLowerCase();
      for (const entry of this.entries) {
        if (!(side.kinds as readonly string[]).includes(entry.kind)) {
          continue;
        }
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "tut-btn tut-debug-menu__entry";
        button.dataset.testid = `debug-place-${entry.kind}-${entry.id}`;
        button.dataset.kind = entry.kind;
        button.dataset.id = entry.id;
        button.setAttribute("aria-pressed", "false");
        button.appendChild(iconGlyph(doc, iconFor(entry.kind)));
        const text = doc.createElement("span");
        text.className = "tut-btn__label";
        text.textContent = entry.name;
        button.appendChild(text);
        list.appendChild(button);
        this.buttons.set(keyOf(entry), button);
      }
      section.appendChild(list);
    }
    const armedLine = doc.createElement("p");
    armedLine.className = "tut-mono tut-debug-menu__armed";
    armedLine.dataset.role = "debug-armed";
    section.appendChild(armedLine);
    panel.appendChild(section);
    parent.appendChild(panel);

    const onClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('[data-action="debug-menu-close"]')) {
        this.handlers.onClose();
        return;
      }
      const button = target.closest<HTMLButtonElement>(
        "button.tut-debug-menu__entry",
      );
      if (!button) {
        return;
      }
      const entry = this.entries.find(
        (candidate) =>
          candidate.kind === button.dataset.kind &&
          candidate.id === button.dataset.id,
      );
      if (entry === undefined) {
        return;
      }
      // Pressing the armed entry again disarms it; the owner decides
      // from what it is holding, so the menu asks with the entry and
      // the owner compares.
      this.handlers.onArm(
        button.getAttribute("aria-pressed") === "true" ? undefined : entry,
      );
    };
    panel.addEventListener("click", onClick);
    this.dispose = () => {
      panel.removeEventListener("click", onClick);
    };
    this.root = panel;
    this.armedLine = armedLine;
  }

  /** Shows or hides the panel and marks the armed entry. */
  update(model: DebugMenuModel): void {
    if (!this.root || !this.armedLine) {
      return;
    }
    this.root.hidden = !model.open;
    this.root.dataset.open = String(model.open);
    const armedKey = model.armed === undefined ? undefined : keyOf(model.armed);
    for (const [key, button] of this.buttons) {
      const pressed = key === armedKey;
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
      button.classList.toggle("is-selected", pressed);
    }
    this.armedLine.textContent =
      model.armed === undefined
        ? "Pick a unit, then click the map to place it."
        : armedStatus(model.armed);
    this.armedLine.dataset.armed = String(model.armed !== undefined);
  }

  /** Removes the panel and its listener. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.armedLine = undefined;
    this.buttons.clear();
  }
}

// ===========================================
// Helpers
// ===========================================

/** The status line while an entry is armed, shared with the HUD's banner. */
export function armedStatus(entry: PlaceableUnit): string {
  return `Place: ${entry.name} — click the map, Esc cancels`;
}

/** One key per entry, so a button is found by what it places. */
function keyOf(entry: PlaceableUnit): string {
  return `${entry.kind}:${entry.id}`;
}

/** The glyph beside an entry: the side it fights for. */
function iconFor(kind: PlaceableUnit["kind"]): "squad" | "mech" | "egg" {
  return kind === "bug" ? "egg" : kind;
}
