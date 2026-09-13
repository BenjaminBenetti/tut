// ===========================================
// Types
// ===========================================

/** What the dialog reports back to its owner. */
export interface ConfirmDialogHandlers {
  /** The player pressed the confirming button. */
  readonly onConfirm: () => void;
  /** The player pressed the cancelling button, or Escape. */
  readonly onCancel: () => void;
}

/** How the dialog is identified in the DOM, fixed for its lifetime. */
export interface ConfirmDialogOptions {
  /** `data-role` of the backdrop, e.g. `"leave-dialog"`. */
  readonly role: string;
  /** The small label above the title, e.g. `"Leave mission"`. */
  readonly kicker: string;
  /** `data-action` of the confirming button. */
  readonly confirmAction: string;
  /** `data-action` of the cancelling button. */
  readonly cancelAction: string;
}

/** What one showing of the dialog says. */
export interface ConfirmDialogContent {
  readonly title: string;
  /** One paragraph per line, in order. */
  readonly lines: readonly string[];
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

// ===========================================
// ConfirmDialogView
// ===========================================

/**
 * A modal that asks one question and takes yes or no (#1132). Built on
 * the event dialog's panel so the two read as one family; hidden until
 * `show`, and hidden again by either button, by Escape, or by `hide`.
 *
 * ```
 *   ┌ LEAVE MISSION ──────────────────────────────╱
 *   │ Leave Alpha and Hammerhead behind?           │
 *   │ They will be lost.                           │
 *   │ 1 objective is still open: the mission …     │
 *   │ [Leave] [Stay]                               │
 *   └──────────────────────────────────────────────┘
 * ```
 *
 * The owner decides what is at stake and what happens next; the view
 * only asks. Escape is read off the document while the dialog is open,
 * so a keyboard player can back out without reaching for the mouse.
 */
export class ConfirmDialogView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly options: ConfirmDialogOptions;
  private readonly handlers: ConfirmDialogHandlers;
  private root: HTMLElement | undefined;
  private title: HTMLElement | undefined;
  private body: HTMLElement | undefined;
  private confirm: HTMLButtonElement | undefined;
  private cancel: HTMLButtonElement | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param options - How the dialog is identified in the DOM.
   * @param handlers - Callbacks for the two answers.
   */
  constructor(options: ConfirmDialogOptions, handlers: ConfirmDialogHandlers) {
    this.options = options;
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the hidden modal under `parent`; `show` opens it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const backdrop = doc.createElement("div");
    backdrop.className = "tut-modal";
    backdrop.dataset.role = this.options.role;
    backdrop.hidden = true;

    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-panel--raised tut-modal__panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = this.options.kicker;

    const title = doc.createElement("h2");
    title.dataset.field = "confirm-title";

    const body = doc.createElement("div");
    body.className = "tut-stack";
    body.dataset.field = "confirm-body";

    const buttons = doc.createElement("div");
    buttons.className = "tut-stack";
    buttons.dataset.role = "confirm-choices";
    const confirm = doc.createElement("button");
    confirm.type = "button";
    confirm.className = "tut-btn tut-btn--primary";
    confirm.dataset.action = this.options.confirmAction;
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.className = "tut-btn";
    cancel.dataset.action = this.options.cancelAction;
    buttons.append(confirm, cancel);

    panel.append(kicker, title, body, buttons);
    backdrop.appendChild(panel);
    parent.appendChild(backdrop);

    const onConfirm = (): void => {
      this.hide();
      this.handlers.onConfirm();
    };
    const onCancel = (): void => {
      this.hide();
      this.handlers.onCancel();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && this.open) {
        event.preventDefault();
        onCancel();
      }
    };
    confirm.addEventListener("click", onConfirm);
    cancel.addEventListener("click", onCancel);
    doc.addEventListener("keydown", onKey);
    this.dispose = () => {
      confirm.removeEventListener("click", onConfirm);
      cancel.removeEventListener("click", onCancel);
      doc.removeEventListener("keydown", onKey);
    };

    this.root = backdrop;
    this.title = title;
    this.body = body;
    this.confirm = confirm;
    this.cancel = cancel;
  }

  /** Removes the modal and its listeners. Safe to call unmounted. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.title = undefined;
    this.body = undefined;
    this.confirm = undefined;
    this.cancel = undefined;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Whether the dialog is on screen. */
  get open(): boolean {
    return this.root !== undefined && !this.root.hidden;
  }

  /** Opens the dialog with `content`, replacing whatever it said before. */
  show(content: ConfirmDialogContent): void {
    if (
      !this.root ||
      !this.title ||
      !this.body ||
      !this.confirm ||
      !this.cancel
    ) {
      return;
    }
    const doc = this.root.ownerDocument;
    this.title.textContent = content.title;
    this.body.replaceChildren(
      ...content.lines.map((line) => {
        const paragraph = doc.createElement("p");
        paragraph.textContent = line;
        return paragraph;
      }),
    );
    this.confirm.textContent = content.confirmLabel;
    this.cancel.textContent = content.cancelLabel;
    this.root.hidden = false;
    this.cancel.focus();
  }

  /** Closes the dialog without answering. */
  hide(): void {
    if (this.root) {
      this.root.hidden = true;
    }
  }
}
