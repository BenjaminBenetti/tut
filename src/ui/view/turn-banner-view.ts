import type { TacticalPhase } from "../../tactical/model/tactical-state";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the banner reports back to its owner. */
export interface TurnBannerHandlers {
  /** The player asked to leave the mission screen. */
  readonly onBack: () => void;
}

// ===========================================
// TurnBannerView
// ===========================================

/**
 * The strip across the top of the mission (GDD §6.2): turn number, whose
 * phase it is, a status line for rejected commands and a way back.
 *
 * ```
 *   ┌ TURN 3 · PLAYER PHASE ─────────── status ──── [Overworld] ┐
 * ```
 */
export class TurnBannerView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: TurnBannerHandlers;
  private root: HTMLElement | undefined;
  private turn: HTMLElement | undefined;
  private phase: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Where the back button reports. */
  constructor(handlers: TurnBannerHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the banner under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const bar = doc.createElement("header");
    bar.id = "turn-banner";
    bar.className = "tut-topbar tut-hud__banner";
    const turnLabel = doc.createElement("span");
    turnLabel.className = "tut-label";
    turnLabel.textContent = "Turn";
    const turn = doc.createElement("span");
    turn.className = "tut-data";
    turn.dataset.field = "turn";
    turn.textContent = "—";
    const phase = doc.createElement("span");
    phase.className = "tut-badge tut-badge--info";
    phase.dataset.field = "phase";
    phase.textContent = "—";
    const spacer = doc.createElement("span");
    spacer.className = "tut-topbar__spacer";
    const status = doc.createElement("span");
    status.className = "tut-topbar__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;
    const back = doc.createElement("button");
    back.type = "button";
    back.className = "tut-btn";
    back.dataset.action = "overworld";
    back.textContent = "Overworld";
    bar.append(turnLabel, turn, phase, spacer, status, back);
    parent.appendChild(bar);
    const onBack = (): void => {
      this.handlers.onBack();
    };
    back.addEventListener("click", onBack);
    this.dispose = () => {
      back.removeEventListener("click", onBack);
    };
    this.root = bar;
    this.turn = turn;
    this.phase = phase;
    this.status = status;
  }

  /** Writes the turn and phase. */
  update(turn: number, phase: TacticalPhase): void {
    if (this.turn) {
      this.turn.textContent = formatWhole(turn);
    }
    if (this.phase) {
      this.phase.textContent =
        phase === "player" ? "player phase" : "bug phase";
      this.phase.dataset.phase = phase;
      this.phase.className = `tut-badge ${phase === "player" ? "tut-badge--info" : "tut-badge--bug"}`;
    }
  }

  /** Shows a one-line message, or hides the line when empty. */
  showStatus(message: string): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.hidden = message === "";
  }

  /** Removes the banner and its listener. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.turn = undefined;
    this.phase = undefined;
    this.status = undefined;
  }
}
