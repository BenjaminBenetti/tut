import type { TacticalAction } from "../model/tactical-intent";

// ===========================================
// Types
// ===========================================

/** What the bar can be told to do. */
export type ActionBarAction =
  Exclude<TacticalAction, "next-unit" | "cancel"> | "end-turn";

/** What the bar reports back to its owner. */
export interface ActionBarHandlers {
  /** The player pressed an action button. */
  readonly onAction: (action: ActionBarAction) => void;
}

/** What the bar shows. */
export interface ActionBarModel {
  /** Whether the selected unit may act this phase (friendly, alive, with action points). */
  readonly canAct: boolean;
  /** Whether it is the player's phase, so End turn is offered. */
  readonly playerPhase: boolean;
  /** The armed action, if any; its button reads pressed. */
  readonly mode: "move" | "attack" | undefined;
  /** Label of the reload button: "Vent" for a mech, "Reload" otherwise (#409). */
  readonly reloadLabel?: string;
}

// ===========================================
// Constants
// ===========================================

/** Buttons in display order with their labels. */
const BUTTONS: readonly {
  action: ActionBarAction;
  label: string;
  primary: boolean;
}[] = [
  { action: "move", label: "Move", primary: false },
  { action: "attack", label: "Attack", primary: false },
  { action: "overwatch", label: "Overwatch", primary: false },
  { action: "reload", label: "Reload", primary: false },
  { action: "end-turn", label: "End turn", primary: true },
];

// ===========================================
// ActionBarView
// ===========================================

/**
 * The action bar (GDD §6.2): one button per action plus End turn. Unit
 * actions are enabled only while a unit that can act is selected; the
 * armed action (move or attack) reads pressed until it is used or
 * cancelled. One delegated click listener serves every button.
 */
export class ActionBarView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: ActionBarHandlers;
  private root: HTMLElement | undefined;
  private readonly buttons = new Map<ActionBarAction, HTMLButtonElement>();
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Where presses are reported. */
  constructor(handlers: ActionBarHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the bar under `parent`, every button disabled; call `update` to enable. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const bar = doc.createElement("div");
    bar.id = "action-bar";
    bar.className = "tut-hud__actions tut-row";
    for (const { action, label, primary } of BUTTONS) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = primary ? "tut-btn tut-btn--primary" : "tut-btn";
      button.dataset.action = action;
      button.textContent = label;
      button.disabled = true;
      bar.appendChild(button);
      this.buttons.set(action, button);
    }
    parent.appendChild(bar);
    const onClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest<HTMLButtonElement>("button[data-action]");
      if (!button || button.disabled) {
        return;
      }
      const action = button.dataset.action as ActionBarAction | undefined;
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

  /** Enables buttons per the model and marks the armed action. */
  update(model: ActionBarModel): void {
    for (const [action, button] of this.buttons) {
      const enabled = action === "end-turn" ? model.playerPhase : model.canAct;
      button.disabled = !enabled;
      const pressed = action === model.mode;
      button.classList.toggle("is-selected", pressed);
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
      if (action === "reload") {
        button.textContent = model.reloadLabel ?? "Reload";
      }
      if (action === "reload") {
        button.textContent = model.reloadLabel ?? "Reload";
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
  }
}
