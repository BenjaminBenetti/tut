import type { TacticalPhase } from "../../tactical/model/tactical-state";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the banner reports back to its owner. */
export interface TurnBannerHandlers {
  /** The player asked to leave the mission screen. */
  readonly onBack: () => void;
  /**
   * The player asked to move the view `delta` storeys (#961). The
   * keyboard is the fast path — `]` and `[` — and these buttons are the
   * discoverable one; both end up here.
   */
  readonly onLayerStep: (delta: number) => void;
}

// ===========================================
// TurnBannerView
// ===========================================

/** What the banner shows; every value is copied from the mission state. */
export interface TurnBannerModel {
  /**
   * What to call the mission: the city it is fought over, not its id
   * (#753). The banner sat over the whole fight reading `mission-1`
   * while the list the player chose from called it Seoul.
   */
  readonly missionName: string;
  readonly turn: number;
  readonly phase: TacticalPhase;
  /** Living TDF units. */
  readonly tdfUnits: number;
  /** Living bugs. */
  readonly bugUnits: number;
  /**
   * Which storey the scene is drawing, one-based, and how many there are
   * (#961); `undefined` before a scene is attached.
   *
   * The player is changing this constantly, so it is a banner stat and
   * not a menu: it has to be readable without being looked for.
   */
  readonly layer:
    { readonly storey: number; readonly storeyCount: number } | undefined;
}

/**
 * The one strip across the top of the mission (GDD §6.2, #403): the
 * city, turn, whose phase it is, the living unit counts, a status line for
 * rejected commands and the way back to the overworld.
 *
 * ```
 *   ┌ MISSION Lagos · TURN 3 · PLAYER PHASE · TDF 3 · BUGS 1 · FLOOR [-] 2/3 [+] ── status ── [Overworld] ┐
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
  private layerDown: HTMLButtonElement | undefined;
  private layerUp: HTMLButtonElement | undefined;
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
    const mission = this.createStat(doc, "Mission", "mission-name");
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
    const layer = this.createLayerControl(doc);
    bar.append(mission, turn, phase, tdf, bugs, layer, spacer, status, back);
    parent.appendChild(bar);
    const onBack = (): void => {
      this.handlers.onBack();
    };
    back.addEventListener("click", onBack);
    const onDown = (): void => {
      this.handlers.onLayerStep(-1);
    };
    const onUp = (): void => {
      this.handlers.onLayerStep(1);
    };
    this.layerDown?.addEventListener("click", onDown);
    this.layerUp?.addEventListener("click", onUp);
    this.dispose = () => {
      back.removeEventListener("click", onBack);
      this.layerDown?.removeEventListener("click", onDown);
      this.layerUp?.removeEventListener("click", onUp);
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
      this.setLayer(undefined);
      return;
    }
    this.setField("mission-name", model.missionName);
    this.setField("turn", formatWhole(model.turn));
    this.setField("tdf-units", formatWhole(model.tdfUnits));
    this.setField("bug-units", formatWhole(model.bugUnits));
    this.setLayer(model.layer);
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

  /**
   * The storey readout and its two buttons.
   *
   * Both buttons are always present, and disabled rather than removed
   * when there is nowhere to go: a control that appears and disappears
   * with the map is harder to learn than one that is visibly inert on
   * open ground, and the player is meant to reach for this without
   * looking.
   */
  private createLayerControl(doc: Document): HTMLElement {
    const stat = doc.createElement("span");
    stat.className = "tut-topbar__stat";
    stat.dataset.role = "layer-control";
    const term = doc.createElement("span");
    term.className = "tut-label";
    term.textContent = "Floor";
    const down = this.createLayerButton(
      doc,
      "layer-down",
      "−",
      "Down a floor ([)",
    );
    const value = doc.createElement("span");
    value.className = "tut-data";
    value.dataset.field = "floor";
    value.textContent = "—";
    const up = this.createLayerButton(doc, "layer-up", "+", "Up a floor (])");
    this.fields.set("floor", value);
    this.layerDown = down;
    this.layerUp = up;
    stat.append(term, down, value, up);
    return stat;
  }

  /** One step button, labelled for a pointer and titled for its key. */
  private createLayerButton(
    doc: Document,
    action: string,
    glyph: string,
    title: string,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tut-btn tut-btn--icon";
    button.dataset.action = action;
    button.title = title;
    button.textContent = glyph;
    button.disabled = true;
    return button;
  }

  /** Writes the storey readout and enables each button only where it can go. */
  private setLayer(layer: TurnBannerModel["layer"] | undefined): void {
    if (!layer) {
      this.setField("floor", "—");
      if (this.layerDown) {
        this.layerDown.disabled = true;
      }
      if (this.layerUp) {
        this.layerUp.disabled = true;
      }
      return;
    }
    this.setField(
      "floor",
      `${formatWhole(layer.storey)} / ${formatWhole(layer.storeyCount)}`,
    );
    if (this.layerDown) {
      this.layerDown.disabled = layer.storey <= 1;
    }
    if (this.layerUp) {
      this.layerUp.disabled = layer.storey >= layer.storeyCount;
    }
  }

  /** Writes a field's text when it changed. */
  private setField(field: string, text: string): void {
    const el = this.fields.get(field);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }
}
