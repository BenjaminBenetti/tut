import { OrdersPromptView } from "./orders-prompt-view";

/** Saved faction orders and whether the current mission can accept edits. */
export interface CommanderPromptModel {
  readonly missionId: string;
  readonly prompt: string;
  readonly editable: boolean;
}

/** Top-bar faction orders, using the same editor as individual unit orders. */
export class CommanderPromptView {
  private readonly editor: OrdersPromptView;

  /** Send explicit saves through the ordinary command pipeline. */
  constructor(onApply: (prompt: string) => void) {
    this.editor = new OrdersPromptView(onApply, {
      id: "commander-orders",
      toggleTestId: "command-toggle",
      panelTestId: "commander-popover",
      inputTestId: "commander-orders-input",
      toggleLabel: "Command",
      title: "TDF command",
      fieldLabel: "Commander orders",
      hint: "Shared orders for all Jev-controlled TDF units. New orders guide their next decision.",
      placeholder:
        "Follow Alpha. Keep the squad together and protect the objective.",
    });
  }

  /** Mount the command flag and its editor in the top bar. */
  mount(parent: HTMLElement): void {
    this.editor.mount(parent);
  }

  /** Preserve open drafts across mission updates. */
  update(model: CommanderPromptModel | undefined): void {
    this.editor.update(model && { ...model, contextId: model.missionId });
  }

  /** Release DOM and event listeners on leaving the tactical screen. */
  unmount(): void {
    this.editor.unmount();
  }
}
