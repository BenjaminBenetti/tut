import { JEV_PROMPT_MAX_LENGTH } from "../../tactical/model/jev-control";
import { iconGlyph } from "./icon-glyph";

/** Saved faction orders and whether the current mission can accept edits. */
export interface CommanderPromptModel {
  readonly missionId: string;
  readonly prompt: string;
  readonly editable: boolean;
}

/** Player-facing faction orders; a local draft becomes a command only on Apply. */
export class CommanderPromptView {
  // ===========================================
  // State and lifecycle
  // ===========================================

  private root?: HTMLElement;
  private toggle?: HTMLButtonElement;
  private panel?: HTMLElement;
  private input?: HTMLTextAreaElement;
  private model?: CommanderPromptModel;
  private open = false;
  private dispose?: () => void;

  /** Send an explicit save to the HUD's ordinary command pipeline. */
  constructor(private readonly onApply: (prompt: string) => void) {}

  /** Mount a command flag and an editor anchored below it in the top bar. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("div");
    root.className = "tut-command";
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "tut-btn tut-command__toggle";
    toggle.dataset.testid = "command-toggle";
    toggle.title = "Command TDF units";
    toggle.setAttribute("aria-haspopup", "dialog");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "commander-orders");
    toggle.append(iconGlyph(doc, "command"), "Command");
    toggle.disabled = true;
    toggle.addEventListener("click", () => this.show(!this.open));

    const panel = doc.createElement("section");
    panel.id = "commander-orders";
    panel.className = "tut-panel tut-command__popover";
    panel.dataset.testid = "commander-popover";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "TDF command");
    panel.hidden = true;
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "TDF command";
    const hint = doc.createElement("p");
    hint.id = "commander-orders-hint";
    hint.className = "tut-dim";
    hint.textContent =
      "Shared orders for all Jev-controlled TDF units. New orders guide their next decision.";
    const label = doc.createElement("label");
    label.className = "tut-command__field";
    label.textContent = "Commander orders";
    const input = doc.createElement("textarea");
    input.className = "tut-input";
    input.dataset.testid = "commander-orders-input";
    input.maxLength = JEV_PROMPT_MAX_LENGTH;
    input.rows = 5;
    input.placeholder =
      "Follow Alpha. Keep the squad together and protect the objective.";
    input.setAttribute("aria-describedby", hint.id);
    label.append(input);
    const actions = doc.createElement("div");
    actions.className = "tut-command__actions";
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.className = "tut-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.show(false));
    const apply = doc.createElement("button");
    apply.type = "button";
    apply.className = "tut-btn tut-btn--primary";
    apply.textContent = "Apply orders";
    apply.addEventListener("click", () => {
      if (!this.model?.editable || input.value.length > JEV_PROMPT_MAX_LENGTH)
        return;
      this.onApply(input.value);
      this.show(false);
    });
    actions.append(cancel, apply);
    panel.append(title, hint, label, actions);
    root.append(toggle, panel);
    parent.append(root);

    // Text entry and native scrolling must not reach tactical shortcuts or camera controls.
    root.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape" && this.open) {
        event.preventDefault();
        this.show(false);
      }
    });
    panel.addEventListener("wheel", (event) => event.stopPropagation(), {
      passive: true,
    });
    panel.addEventListener("contextmenu", (event) => event.stopPropagation());
    const dismiss = (event: PointerEvent): void => {
      if (this.open && !event.composedPath().includes(root))
        this.show(false, false);
    };
    root.addEventListener("focusout", (event) => {
      if (
        this.open &&
        event.relatedTarget instanceof Node &&
        !root.contains(event.relatedTarget)
      )
        this.show(false, false);
    });
    doc.addEventListener("pointerdown", dismiss, true);
    this.dispose = () => doc.removeEventListener("pointerdown", dismiss, true);
    this.root = root;
    this.toggle = toggle;
    this.panel = panel;
    this.input = input;
    this.update(this.model);
  }

  /** Keep open drafts intact across selections, animations and other mission updates. */
  update(model: CommanderPromptModel | undefined): void {
    if (model?.missionId !== this.model?.missionId || !model?.editable)
      this.show(false, false);
    this.model = model;
    if (this.toggle) this.toggle.disabled = !model?.editable;
    if (!this.open && this.input) this.input.value = model?.prompt ?? "";
  }

  /** Remove the editor and its document listener when leaving the tactical screen. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.toggle = undefined;
    this.panel = undefined;
    this.input = undefined;
    this.model = undefined;
    this.open = false;
  }

  // ===========================================
  // Draft editing
  // ===========================================

  /** Reopen from saved orders, or dismiss without changing them and optionally restore focus. */
  private show(open: boolean, restoreFocus = true): void {
    if (
      !this.panel ||
      !this.input ||
      !this.toggle ||
      (open && !this.model?.editable)
    )
      return;
    const wasOpen = this.open;
    this.open = open;
    this.panel.hidden = !open;
    this.toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      this.input.value = this.model?.prompt ?? "";
      this.input.focus();
    } else if (wasOpen && restoreFocus) {
      this.toggle.focus();
    }
  }
}
