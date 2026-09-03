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

/** What the banner shows; every value is copied from the mission state. */
export interface TurnBannerModel {
  readonly missionId: string;
  readonly turn: number;
  readonly phase: TacticalPhase;
  /** Living TDF units. */
  readonly tdfUnits: number;
  /** Living bugs. */
  readonly bugUnits: number;
}

/**
 * The one strip across the top of the mission (GDD §6.2, #403): mission
 * id, turn, whose phase it is, the living unit counts, a status line for
 * rejected commands and the way back to the overworld.
 *
 * ```
 *   ┌ MISSION mission-4 · TURN 3 · PLAYER PHASE · TDF 3 · BUGS 1 ── status ── [Overworld] ┐
 * ```
 */
export class TurnBannerView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: TurnBannerHandlers;
  private root: HTMLElement | undefined;
  private fields = new Map<string, HTMLElement>();
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
    const mission = this.createStat(doc, "Mission", "mission-id");
    const turn = this.createStat(doc, "Turn", "turn");
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
    const tdf = this.createStat(doc, "TDF", "tdf-units");
    const bugs = this.createStat(doc, "Bugs", "bug-units");
    bar.append(mission, turn, phase, tdf, bugs, spacer, status, back);
    parent.appendChild(bar);
    const onBack = (): void => {
      this.handlers.onBack();
    };
    back.addEventListener("click", onBack);
    this.dispose = () => {
      back.removeEventListener("click", onBack);
    };
    this.root = bar;
    this.phase = phase;
    this.status = status;
  }

  /** Writes the mission facts, or dashes for `undefined` (no mission in progress). */
  update(model: TurnBannerModel | undefined): void {
    if (!model) {
      for (const field of this.fields.values()) {
        field.textContent = "—";
      }
      if (this.phase) {
        this.phase.textContent = "—";
        delete this.phase.dataset.phase;
      }
      return;
    }
    this.setField("mission-id", model.missionId);
    this.setField("turn", formatWhole(model.turn));
    this.setField("tdf-units", formatWhole(model.tdfUnits));
    this.setField("bug-units", formatWhole(model.bugUnits));
    if (this.phase) {
      this.phase.textContent =
        model.phase === "player" ? "player phase" : "bug phase";
      this.phase.dataset.phase = model.phase;
      this.phase.className = `tut-badge ${model.phase === "player" ? "tut-badge--info" : "tut-badge--bug"}`;
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
    this.fields = new Map();
    this.phase = undefined;
    this.status = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Label plus value; the value carries `data-field` for tests. */
  private createStat(doc: Document, label: string, field: string): HTMLElement {
    const stat = doc.createElement("span");
    stat.className = "tut-topbar__stat";
    const term = doc.createElement("span");
    term.className = "tut-label";
    term.textContent = label;
    const value = doc.createElement("span");
    value.className = "tut-data";
    value.dataset.field = field;
    value.textContent = "—";
    stat.append(term, value);
    this.fields.set(field, value);
    return stat;
  }

  /** Writes a field's text when it changed. */
  private setField(field: string, text: string): void {
    const el = this.fields.get(field);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }
}
