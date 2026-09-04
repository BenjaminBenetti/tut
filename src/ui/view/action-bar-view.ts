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
  /**
   * Whether the selected unit is standing in the extraction zone, so it
   * can leave the map (#341). Extraction costs no action points, so it is
   * offered to a unit that has already spent its turn.
   */
  readonly canExtract?: boolean;
  /**
   * Whether the selected unit is in reach of an objective it could work
   * (#427). Its own flag rather than `canAct`, because being able to act
   * is not enough: there has to be something in reach to act on.
   */
  readonly canInteract?: boolean;
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
  { action: "interact", label: "Interact", primary: false },
  { action: "extract", label: "Extract", primary: false },
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
 *
 * Three buttons answer to their own flag rather than to `canAct`: End
 * turn is offered for the whole player phase, Extract whenever the
 * selected unit stands in the extraction zone (walking out costs no
 * action points), and Interact only when an objective is in reach.
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
      button.disabled = !isEnabled(action, model);
      const pressed = action === model.mode;
      button.classList.toggle("is-selected", pressed);
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
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

// ===========================================
// Helpers
// ===========================================

/** Whether one button is offered for the model. */
function isEnabled(action: ActionBarAction, model: ActionBarModel): boolean {
  switch (action) {
    case "end-turn":
      return model.playerPhase;
    case "extract":
      return model.canExtract ?? false;
    case "interact":
      return model.canInteract ?? false;
    default:
      return model.canAct;
  }
}
