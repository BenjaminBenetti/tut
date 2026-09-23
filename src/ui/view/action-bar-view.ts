import type { IconId } from "../data/icon-manifest";
import type { TacticalAction } from "../model/tactical-intent";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

/** Tactical actions in the bar; Auto end is a separate UI preference. */
export type ActionBarAction =
  | "move"
  | "attack"
  | "overwatch"
  | "reload"
  | "interact"
  | "extract"
  | "end-turn";

/** What the bar reports back to its owner. */
export interface ActionBarHandlers {
  /** A button was pressed; the HUD treats it exactly as the key would. */
  readonly onAction: (action: ActionBarAction) => void;
  /** A turn preference, independent of the selected actor and action lock. */
  readonly onAutoEndChange?: (enabled: boolean) => void;
}

/** What the bar shows. */
export interface ActionBarModel {
  /** End the player phase automatically once all activations and animations finish. */
  readonly autoEnd?: boolean;
  /** Whether it is the player's phase, so End turn is offered. */
  readonly playerPhase: boolean;
  /** The actions the selected unit cannot take, marked unavailable (#1030). */
  readonly unavailable: readonly ActionBarAction[];
  /** Whether a unit of the player's is selected; without one no unit action is offered. */
  readonly hasActor: boolean;
  /** Label of the reload button: "Vent" for a mech, "Reload" otherwise (#409). */
  readonly reloadLabel: string;
  /** Whether the HUD is aiming, so Attack reads pressed. */
  readonly aiming: boolean;
  /**
   * How many of the player's units still have an action (#1041). Named
   * on End turn, because ending a turn with units that have not acted
   * used to be silent.
   */
  readonly unspent: number;
  /**
   * Whether the bug phase is still playing on the map (#1130). Tactical
   * actions are disabled while the Auto end preference remains editable.
   */
  readonly locked?: boolean;
}

// ===========================================
// Constants
// ===========================================

/** Buttons in display order. */
const ORDER: readonly ActionBarAction[] = [
  "move",
  "attack",
  "overwatch",
  "reload",
  "interact",
  "extract",
  "end-turn",
];

/** The glyph on each button (#495); every id is in `ICON_MANIFEST`. */
const ICONS: Readonly<Record<ActionBarAction, IconId>> = {
  move: "move",
  attack: "attack",
  overwatch: "overwatch",
  reload: "reload",
  interact: "interact",
  extract: "extract",
  "end-turn": "end-turn",
};

/** Label per action. Board is what Extract is to the player (#1112). */
const LABELS: Readonly<Record<ActionBarAction, string>> = {
  move: "Move",
  attack: "Attack",
  overwatch: "Overwatch",
  reload: "Reload",
  interact: "Interact",
  extract: "Board",
  "end-turn": "End turn",
};

// ===========================================
// ActionBarView
// ===========================================

/**
 * The action bar along the bottom of the mission HUD: one button per
 * action plus End turn, each carrying the key that reaches it. Since
 * #1112 the wheel is where actions are *chosen* on the map; the bar is
 * the list of what exists and the hotkeys that reach it, and a press on
 * it is the same as the key (the Executive Director's ask on the first
 * review of #1113: keep the actions listed with their hotkeys).
 *
 * Unavailable actions are marked rather than disabled (#1030), so a
 * press still reaches the HUD to be explained above the unit.
 */
export class ActionBarView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: ActionBarHandlers;
  /** Key per action, written on the button; from the one shortcut table. */
  private readonly keys: Readonly<Partial<Record<ActionBarAction, string>>>;
  private root: HTMLElement | undefined;
  private readonly buttons = new Map<ActionBarAction, HTMLButtonElement>();
  private autoEnd: HTMLButtonElement | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Where presses are reported.
   * @param shortcuts - The key table, `key → action`, so the hint on a
   *   button is the binding and cannot drift from it.
   */
  constructor(
    handlers: ActionBarHandlers,
    shortcuts: Readonly<Record<string, TacticalAction | "end-turn">>,
  ) {
    this.handlers = handlers;
    this.keys = keyHints(shortcuts);
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the bar under `parent`, every button unavailable; call `update` to offer them. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const bar = doc.createElement("div");
    bar.id = "action-bar";
    bar.className = "tut-hud__actions tut-row";
    for (const action of ORDER) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className =
        action === "end-turn" ? "tut-btn tut-btn--primary" : "tut-btn";
      button.dataset.action = action;
      const key = doc.createElement("span");
      key.className = "tut-btn__key";
      key.dataset.role = "shortcut";
      key.textContent = this.keys[action] ?? "";
      const icon = iconGlyph(doc, ICONS[action]);
      const text = doc.createElement("span");
      text.className = "tut-btn__label";
      text.textContent = LABELS[action];
      button.append(key, icon, text);
      button.title = `${LABELS[action]} (${this.keys[action] ?? ""})`;
      button.classList.add("is-unavailable");
      button.setAttribute("aria-disabled", "true");
      bar.appendChild(button);
      this.buttons.set(action, button);
    }
    const autoEnd = doc.createElement("button");
    autoEnd.type = "button";
    autoEnd.className = "tut-btn tut-hud__auto-end";
    autoEnd.dataset.testid = "auto-end-toggle";
    const indicator = doc.createElement("span");
    indicator.className = "tut-hud__auto-end-indicator";
    indicator.setAttribute("aria-hidden", "true");
    autoEnd.append(indicator, "Auto end");
    autoEnd.title =
      "End turn when no units have actions left, after animations finish";
    autoEnd.setAttribute("aria-pressed", "false");
    autoEnd.disabled = this.handlers.onAutoEndChange === undefined;
    autoEnd.addEventListener("keydown", (event) => {
      // Enter activates this toggle, not the document's End Turn shortcut.
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    });
    const turnControls = doc.createElement("div");
    turnControls.className = "tut-row tut-hud__turn-controls";
    turnControls.append(this.buttons.get("end-turn")!, autoEnd);
    bar.appendChild(turnControls);
    this.autoEnd = autoEnd;
    parent.appendChild(bar);
    const onClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('[data-testid="auto-end-toggle"]') === autoEnd) {
        this.handlers.onAutoEndChange?.(
          autoEnd.getAttribute("aria-pressed") !== "true",
        );
        return;
      }
      const button = target.closest<HTMLButtonElement>("button[data-action]");
      const action = button?.dataset.action as ActionBarAction | undefined;
      if (action !== undefined && this.buttons.has(action)) {
        this.handlers.onAction(action);
      }
    };
    bar.addEventListener("click", onClick);
    this.dispose = () => {
      bar.removeEventListener("click", onClick);
    };
    this.root = bar;
  }

  /** Marks action availability and preferences; Auto end stays editable during playback. */
  update(model: ActionBarModel): void {
    this.autoEnd?.setAttribute("aria-pressed", String(model.autoEnd === true));
    const locked = model.locked === true;
    if (this.root) {
      this.root.dataset.locked = String(locked);
    }
    for (const [action, button] of this.buttons) {
      const available = !locked && isOffered(action, model);
      button.disabled = locked;
      button.classList.toggle("is-unavailable", !available);
      button.setAttribute("aria-disabled", available ? "false" : "true");
      const pressed = action === "attack" && model.aiming;
      button.classList.toggle("is-selected", pressed);
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
      const label = button.querySelector<HTMLElement>(".tut-btn__label");
      if (!label) {
        continue;
      }
      if (action === "reload") {
        label.textContent = model.reloadLabel;
        button.title = `${model.reloadLabel} (${this.keys[action] ?? ""})`;
      }
      if (action === "end-turn") {
        label.textContent =
          model.unspent > 0
            ? `${LABELS[action]} (${String(model.unspent)} unspent)`
            : LABELS[action];
        button.dataset.unspent = String(model.unspent);
      }
    }
  }

  /** Removes the bar and its listener. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.buttons.clear();
    this.autoEnd = undefined;
  }
}

// ===========================================
// Helpers
// ===========================================

/** Whether one button is offered for the model. */
function isOffered(action: ActionBarAction, model: ActionBarModel): boolean {
  if (action === "end-turn") {
    return model.playerPhase;
  }
  return model.hasActor && !model.unavailable.includes(action);
}

/**
 * The hint per action from the key table: the first key bound to it,
 * shown upper-case, with the named keys spelled out.
 */
function keyHints(
  shortcuts: Readonly<Record<string, TacticalAction | "end-turn">>,
): Readonly<Partial<Record<ActionBarAction, string>>> {
  const hints: Partial<Record<ActionBarAction, string>> = {};
  for (const [key, bound] of Object.entries(shortcuts)) {
    if (!ORDER.includes(bound as ActionBarAction)) {
      continue;
    }
    const action = bound as ActionBarAction;
    hints[action] ??= key.length === 1 ? key.toUpperCase() : titleCase(key);
  }
  return hints;
}

/** `enter` → `Enter`. */
function titleCase(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}
