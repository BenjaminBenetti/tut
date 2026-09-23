import type { JevEntityControl } from "../../tactical/model/jev-control";
import type { UnitId } from "../../tactical/model/unit";
import { OrdersPromptView } from "./orders-prompt-view";

/** Settings for the controllable unit currently shown in the right-hand card. */
export interface UnitControlModel {
  readonly missionId: string;
  readonly unitId: UnitId;
  readonly name: string;
  readonly control?: JevEntityControl;
  readonly jevAvailable: boolean;
  readonly editable: boolean;
}

/** Independent edits preserve whichever setting the player did not change. */
export interface UnitControlHandlers {
  readonly onToggleJev: (unitId: UnitId) => void;
  readonly onEntityPrompt: (unitId: UnitId, prompt: string) => void;
}

/** A single control toolbar and orders editor for the unit being inspected. */
export class UnitControlView {
  // ===========================================
  // State and construction
  // ===========================================

  private root?: HTMLElement;
  private toggle?: HTMLButtonElement;
  private model?: UnitControlModel;
  private readonly orders: OrdersPromptView;

  /** Send edits through the HUD's existing configuration command. */
  constructor(private readonly handlers: UnitControlHandlers) {
    this.orders = new OrdersPromptView(
      (prompt) => {
        if (this.model?.editable)
          this.handlers.onEntityPrompt(this.model.unitId, prompt);
      },
      {
        id: "entity-orders",
        toggleTestId: "entity-command-toggle",
        panelTestId: "entity-orders-popover",
        inputTestId: "entity-orders-input",
        toggleLabel: "Command unit",
        title: "Unit orders",
        fieldLabel: "Unit orders",
        hint: "Orders for this unit when Jev controls it. Shared commander orders take priority when they conflict.",
        placeholder: "Follow Alpha. Cover the squad and stay out of danger.",
        iconOnly: true,
      },
    );
  }

  // ===========================================
  // Lifecycle and rendering
  // ===========================================

  /** Place controls in the card header and the popover outside its scrolling panel. */
  mount(parent: HTMLElement, overlay: HTMLElement): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("div");
    root.className = "tut-unit-controls";
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "tut-btn tut-unit-controls__jev";
    toggle.dataset.testid = "unit-jev-toggle";
    toggle.textContent = "Jev";
    toggle.addEventListener("click", () => {
      if (this.model?.editable) this.handlers.onToggleJev(this.model.unitId);
    });
    root.addEventListener("click", (event) => event.stopPropagation());
    root.addEventListener("keydown", (event) => event.stopPropagation());
    root.append(toggle);
    this.orders.mount(root, overlay);
    parent.append(root);
    this.root = root;
    this.toggle = toggle;
    this.update(undefined);
  }

  /** Preserve drafts for this unit; changing selection closes and clears its editor. */
  update(model: UnitControlModel | undefined): void {
    this.model = model;
    if (this.root) this.root.hidden = model === undefined;
    const enabled = model?.control?.enabled === true;
    if (this.toggle) {
      this.toggle.setAttribute(
        "aria-label",
        `Jev control for ${model?.name ?? "unit"}`,
      );
      this.toggle.setAttribute("aria-pressed", String(enabled));
      this.toggle.disabled =
        !model?.editable || (!enabled && !model.jevAvailable);
      this.toggle.title =
        !enabled && !model?.jevAvailable
          ? "Jev control is unavailable"
          : enabled
            ? "Switch to player control"
            : "Switch to Jev control";
    }
    this.orders.update(
      model
        ? {
            contextId: JSON.stringify([model.missionId, model.unitId]),
            title: `${model.name} orders`,
            toggleLabel: `Command ${model.name}`,
            prompt: model.control?.entityPrompt ?? "",
            editable: model.editable,
          }
        : undefined,
    );
  }

  /** Dispose the floating editor and its document listeners with the HUD. */
  unmount(): void {
    this.orders.unmount();
    this.root?.remove();
    this.root = undefined;
    this.toggle = undefined;
    this.model = undefined;
  }
}
