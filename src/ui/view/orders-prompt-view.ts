import { JEV_PROMPT_MAX_LENGTH } from "../../tactical/model/jev-control";
import { iconGlyph } from "./icon-glyph";

/** Text and labels for one saved orders context; updates preserve an open draft. */
export interface OrdersPromptModel {
  readonly contextId: string;
  readonly title?: string;
  readonly toggleLabel?: string;
  readonly prompt: string;
  readonly editable: boolean;
}

/** Labels shared by the faction and entity orders editors. */
export interface OrdersPromptOptions {
  readonly id: string;
  readonly toggleTestId: string;
  readonly panelTestId: string;
  readonly inputTestId: string;
  readonly toggleLabel: string;
  readonly title: string;
  readonly fieldLabel: string;
  readonly hint: string;
  readonly placeholder: string;
  readonly iconOnly?: boolean;
}

/** Reusable orders popover; a local draft becomes a command only on Apply. */
export class OrdersPromptView {
  // ===========================================
  // State and lifecycle
  // ===========================================

  private root?: HTMLElement;
  private toggle?: HTMLButtonElement;
  private panel?: HTMLElement;
  private input?: HTMLTextAreaElement;
  private model?: OrdersPromptModel;
  private title?: HTMLElement;
  private floating = false;
  private open = false;
  private dispose?: () => void;

  /** Send an explicit save to the HUD's ordinary command pipeline. */
  constructor(
    private readonly onApply: (prompt: string) => void,
    private readonly options: OrdersPromptOptions,
  ) {}

  /** Mount a flag; an optional overlay host keeps the popover outside a scrolling panel. */
  mount(parent: HTMLElement, overlay?: HTMLElement): void {
    const doc = parent.ownerDocument;
    const options = this.options;
    this.floating = overlay !== undefined;
    const root = doc.createElement("div");
    root.className = "tut-command";
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "tut-btn tut-command__toggle";
    toggle.dataset.testid = options.toggleTestId;
    toggle.title = options.toggleLabel;
    toggle.setAttribute("aria-label", options.toggleLabel);
    toggle.setAttribute("aria-haspopup", "dialog");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", options.id);
    toggle.append(iconGlyph(doc, "command"));
    if (!options.iconOnly) toggle.append("Command");
    toggle.disabled = true;
    toggle.addEventListener("click", () => this.show(!this.open));

    const panel = doc.createElement("section");
    panel.id = options.id;
    panel.className = "tut-panel tut-command__popover";
    if (this.floating) panel.classList.add("tut-command__popover--floating");
    panel.dataset.testid = options.panelTestId;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", options.title);
    panel.hidden = true;
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = options.title;
    const hint = doc.createElement("p");
    hint.id = `${options.id}-hint`;
    hint.className = "tut-dim";
    hint.textContent = options.hint;
    const label = doc.createElement("label");
    label.className = "tut-command__field";
    label.textContent = options.fieldLabel;
    const input = doc.createElement("textarea");
    input.className = "tut-input";
    input.dataset.testid = options.inputTestId;
    input.maxLength = JEV_PROMPT_MAX_LENGTH;
    input.rows = 5;
    input.placeholder = options.placeholder;
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
    root.append(toggle);
    (overlay ?? root).append(panel);
    parent.append(root);

    // Text entry and native scrolling must not reach tactical shortcuts or camera controls.
    /** Isolate typing and dismissal from tactical shortcuts. */
    const onKey = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (event.key === "Escape" && this.open) {
        event.preventDefault();
        this.show(false);
      }
    };
    root.addEventListener("keydown", onKey);
    panel.addEventListener("keydown", onKey);
    root.addEventListener("click", (event) => event.stopPropagation());
    panel.addEventListener("click", (event) => event.stopPropagation());
    panel.addEventListener("wheel", (event) => event.stopPropagation(), {
      passive: true,
    });
    panel.addEventListener("contextmenu", (event) => event.stopPropagation());
    const dismiss = (event: PointerEvent): void => {
      if (
        this.open &&
        !event.composedPath().includes(root) &&
        !event.composedPath().includes(panel)
      )
        this.show(false, false);
    };
    /** Treat a portalled panel and its flag as a single focus boundary. */
    const onFocusOut = (event: FocusEvent): void => {
      if (
        this.open &&
        event.relatedTarget instanceof Node &&
        !root.contains(event.relatedTarget) &&
        !panel.contains(event.relatedTarget)
      )
        this.show(false, false);
    };
    root.addEventListener("focusout", onFocusOut);
    panel.addEventListener("focusout", onFocusOut);
    const follow = (): void => this.position();
    doc.addEventListener("pointerdown", dismiss, true);
    doc.addEventListener("scroll", follow, true);
    doc.defaultView?.addEventListener("resize", follow);
    const Observer = doc.defaultView?.ResizeObserver;
    const resize = Observer ? new Observer(follow) : undefined;
    resize?.observe(panel);
    this.dispose = () => {
      doc.removeEventListener("pointerdown", dismiss, true);
      doc.removeEventListener("scroll", follow, true);
      doc.defaultView?.removeEventListener("resize", follow);
      resize?.disconnect();
    };
    this.root = root;
    this.toggle = toggle;
    this.panel = panel;
    this.input = input;
    this.title = title;
    this.update(this.model);
  }

  /** Keep drafts through mission updates; changing the orders context discards them. */
  update(model: OrdersPromptModel | undefined): void {
    if (model?.contextId !== this.model?.contextId || !model?.editable)
      this.show(false, false);
    this.model = model;
    if (this.toggle) {
      this.toggle.disabled = !model?.editable;
      this.toggle.title = model?.toggleLabel ?? this.options.toggleLabel;
      this.toggle.setAttribute("aria-label", this.toggle.title);
    }
    if (this.title) this.title.textContent = model?.title ?? this.options.title;
    this.panel?.setAttribute("aria-label", model?.title ?? this.options.title);
    this.position();
    if (!this.open && this.input) this.input.value = model?.prompt ?? "";
  }

  /** Remove the editor and its document listener when leaving the tactical screen. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.panel?.remove();
    this.root?.remove();
    this.root = undefined;
    this.toggle = undefined;
    this.panel = undefined;
    this.input = undefined;
    this.model = undefined;
    this.title = undefined;
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
      this.position();
      this.input.focus();
    } else if (wasOpen && restoreFocus) {
      this.toggle.focus();
    }
  }

  /** Keep a floating editor beside its flag and wholly inside the viewport. */
  private position(): void {
    if (!this.open || !this.floating || !this.panel || !this.toggle) return;
    const win = this.panel.ownerDocument.defaultView;
    if (!win) return;
    const anchor = this.toggle.getBoundingClientRect();
    const bounds = this.panel.getBoundingClientRect();
    const gap = 12;
    let left = anchor.right + gap;
    if (left + bounds.width > win.innerWidth - gap)
      left = anchor.left - bounds.width - gap;
    left = Math.max(gap, Math.min(left, win.innerWidth - bounds.width - gap));
    const top = Math.max(
      gap,
      Math.min(anchor.top, win.innerHeight - bounds.height - gap),
    );
    this.panel.style.left = `${String(left)}px`;
    this.panel.style.top = `${String(top)}px`;
  }
}
