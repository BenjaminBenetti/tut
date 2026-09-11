import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

/** What the control reports back to its owner. */
export interface EndTurnHandlers {
  /** The player pressed End turn. */
  readonly onEndTurn: () => void;
}

/** What the control shows. */
export interface EndTurnModel {
  /** Whether it is the player's phase, so ending the turn is offered. */
  readonly playerPhase: boolean;
  /**
   * How many of the player's units still have an action (#1041). Named
   * on the button, because ending a turn with units that have not acted
   * used to be silent — the player found out on the next turn.
   */
  readonly unspent: number;
}

// ===========================================
// Constants
// ===========================================

/** What the button says with nothing left behind. */
const LABEL = "End turn";

// ===========================================
// EndTurnView
// ===========================================

/**
 * The one control left at the bottom of the mission HUD since the
 * action bar moved into the scene (#1112): End turn. Every other action
 * belongs to a tile, a unit or an enemy and is offered on the wheel
 * there; ending the turn belongs to nothing on the map, so it keeps a
 * button.
 *
 * Marked unavailable rather than disabled outside the player's phase
 * (#1030), so a press still reaches the HUD to be explained.
 */
export class EndTurnView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: EndTurnHandlers;
  private root: HTMLElement | undefined;
  private button: HTMLButtonElement | undefined;
  private label: HTMLElement | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Where the press is reported. */
  constructor(handlers: EndTurnHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the control under `parent`, unavailable; call `update` to offer it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const bar = doc.createElement("div");
    bar.id = "turn-bar";
    bar.className = "tut-hud__actions tut-row";
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tut-btn tut-btn--primary is-unavailable";
    button.dataset.action = "end-turn";
    button.setAttribute("aria-disabled", "true");
    const icon = iconGlyph(doc, "end-turn");
    const label = doc.createElement("span");
    label.className = "tut-btn__label";
    label.textContent = LABEL;
    button.append(icon, label);
    button.title = `${LABEL} (Enter)`;
    bar.appendChild(button);
    parent.appendChild(bar);
    const onClick = (): void => {
      this.handlers.onEndTurn();
    };
    button.addEventListener("click", onClick);
    this.dispose = () => {
      button.removeEventListener("click", onClick);
    };
    this.root = bar;
    this.button = button;
    this.label = label;
  }

  /** Offers the button per the model and names what it would leave unspent. */
  update(model: EndTurnModel): void {
    const button = this.button;
    const label = this.label;
    if (!button || !label) {
      return;
    }
    button.classList.toggle("is-unavailable", !model.playerPhase);
    button.setAttribute("aria-disabled", model.playerPhase ? "false" : "true");
    label.textContent =
      model.unspent > 0 ? `${LABEL} (${String(model.unspent)} unspent)` : LABEL;
    button.dataset.unspent = String(model.unspent);
  }

  /** Removes the control and its listener. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.button = undefined;
    this.label = undefined;
  }
}
