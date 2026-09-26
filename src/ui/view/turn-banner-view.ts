import type { TacticalPhase } from "../../tactical/model/tactical-state";
import type { ObjectiveCountdown } from "../model/objective-presentation";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the banner reports back to its owner. */
export interface TurnBannerHandlers {
  /**
   * The player asked to leave the mission (#1132): abandon it where it
   * stands, with whoever is not aboard left behind. The screen decides
   * whether that needs confirming; the banner only offers it.
   */
  readonly onLeave: () => void;
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
   * Which floor the scene is drawing, one-based, or `undefined` for the
   * roofed top view; and how many floors the map has (#961, #1136).
   * `undefined` as a whole before a scene is attached.
   *
   * The player is changing this constantly, so it is a banner stat and
   * not a menu: it has to be readable without being looked for. The top
   * view is not numbered because it is not a floor: it is every floor
   * with the roofs back on, and numbering it sent the player looking
   * for a floor that was not there.
   */
  readonly layer:
    { readonly floor: number | undefined; readonly floors: number } | undefined;
  /**
   * The soonest deadline counting down on an open objective ("Pod
   * matures in 3 turns"), or absent when nothing is. A clock the player
   * is racing belongs where the turn number is, not only in the rail.
   */
  readonly deadline?: ObjectiveCountdown;
}

/**
 * The one strip across the top of the mission (GDD §6.2, #403): the
 * city, turn, whose phase it is, the living unit counts, a status line for
 * rejected commands and the way out of the mission (#1132: Leave, which
 * abandons the fight, rather than a detour to the overworld with the
 * mission still running).
 *
 * ```
 *   ┌ MISSION Lagos · TURN 3 · PLAYER PHASE ── [Command] ── TDF 3 · BUGS 1 · FLOOR [-] 2/3 [+] · [Leave] ┐
 *   ┌ MISSION Lagos · TURN 7 · PLAYER PHASE · POD MATURES IN 2 TURNS ── …                                ┐
 * ```
 *
 * The deadline badge is hidden unless an objective is counting down,
 * and pulses in its last two turns.
 */
export class TurnBannerView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: TurnBannerHandlers;
  private root: HTMLElement | undefined;
  /** The Leave button, held with the rest of the controls while a phase plays (#1132). */
  private leave: HTMLButtonElement | undefined;
  private fields = new Map<string, HTMLElement>();
  private phase: HTMLElement | undefined;
  private deadline: HTMLElement | undefined;
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

  /** Builds the banner with an optional centered control; call `update` to fill its mission facts. */
  mount(parent: HTMLElement, center?: HTMLElement): void {
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
    const deadline = doc.createElement("span");
    deadline.className = "tut-badge tut-badge--warn tut-deadline";
    deadline.dataset.field = "deadline";
    deadline.hidden = true;
    const status = doc.createElement("span");
    status.className = "tut-topbar__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;
    const back = doc.createElement("button");
    back.type = "button";
    back.className = "tut-btn";
    back.dataset.action = "leave-mission";
    back.textContent = "Leave";
    this.leave = back;
    const tdf = this.createStat(doc, "TDF", "tdf-units");
    const bugs = this.createStat(doc, "Bugs", "bug-units");
    const layer = this.createLayerControl(doc);
    const left = doc.createElement("div");
    left.className = "tut-hud__banner-left";
    left.append(mission, turn, phase, deadline);
    const right = doc.createElement("div");
    right.className = "tut-hud__banner-right";
    right.append(tdf, bugs, layer, status, back);
    bar.append(left, center ?? doc.createElement("div"), right);
    parent.appendChild(bar);
    const onBack = (): void => {
      this.handlers.onLeave();
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
    this.deadline = deadline;
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
      this.setDeadline(undefined);
      return;
    }
    this.setField("mission-name", model.missionName);
    this.setField("turn", formatWhole(model.turn));
    this.setField("tdf-units", formatWhole(model.tdfUnits));
    this.setField("bug-units", formatWhole(model.bugUnits));
    this.setLayer(model.layer);
    this.setDeadline(model.deadline);
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
    this.deadline = undefined;
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
   * Enables or holds the Leave button (#1132). Leaving is refused while
   * a bug phase is still playing, so the button says so rather than
   * swallowing the click.
   *
   * @param enabled - False while the controls are held.
   */
  setLeaveEnabled(enabled: boolean): void {
    if (this.leave) {
      this.leave.disabled = !enabled;
    }
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

  /**
   * Writes the storey readout and enables each button only where it can
   * go: "All" at the roofed top, "floor / floors" below it (#1136).
   */
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
      layer.floor === undefined
        ? "All"
        : `${formatWhole(layer.floor)} / ${formatWhole(layer.floors)}`,
    );
    if (this.layerDown) {
      // Down from the top goes to the last floor, when there is one.
      this.layerDown.disabled =
        layer.floor === undefined ? layer.floors < 1 : layer.floor <= 1;
    }
    if (this.layerUp) {
      this.layerUp.disabled = layer.floor === undefined;
    }
  }

  /**
   * Shows the soonest countdown, urgent in the danger colour and
   * pulsing, or hides the badge when nothing is counting down.
   */
  private setDeadline(deadline: ObjectiveCountdown | undefined): void {
    if (!this.deadline) {
      return;
    }
    this.deadline.hidden = deadline === undefined;
    this.deadline.textContent = deadline?.text ?? "";
    this.deadline.dataset.urgent = deadline?.urgent === true ? "true" : "false";
    this.deadline.classList.toggle(
      "tut-badge--danger",
      deadline?.urgent === true,
    );
    this.deadline.classList.toggle(
      "tut-badge--warn",
      deadline?.urgent !== true,
    );
  }

  /** Writes a field's text when it changed. */
  private setField(field: string, text: string): void {
    const el = this.fields.get(field);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }
}
