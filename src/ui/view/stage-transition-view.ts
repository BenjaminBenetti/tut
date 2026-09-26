import type { StageTransition } from "../service/stage-transition";

// ===========================================
// Types
// ===========================================

/** What the transition reports back to its owner. */
export interface StageTransitionHandlers {
  /** The player pressed Continue: on to the next stage. */
  readonly onContinue: () => void;
}

// ===========================================
// StageTransitionView
// ===========================================

/**
 * The screen between two stages of a linked mission (ADR 0013
 * amendment, #1179): what was cleared, who goes on and in what shape,
 * and one way forward. Built on the confirm dialog's panel, over the
 * map the squad just left; hidden until `show`.
 *
 * ```
 *   ┌ STAGE CLEARED ──────────────────────────────────╱
 *   │ Hull cleared. The squad boards the core.         │
 *   │ Next: The core, stage 2 of 2                     │
 *   │ No repairs, no re-arm, no swaps: …               │
 *   │ Hammerhead   7 / 10   Autocannon · heat 2 / 4    │
 *   │ Alpha        6 / 6    ammo 1 / 3                 │
 *   │ [Continue]                                       │
 *   └──────────────────────────────────────────────────┘
 * ```
 *
 * One button and no cancel, not even Escape: there is no base, no
 * repair bay and no roster between the stages, and leaving is the
 * mission's own Leave. The owner says when to close it (`hide`), so a
 * refused Continue keeps the panel up with the reason (`showStatus`).
 */
export class StageTransitionView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: StageTransitionHandlers;
  private root: HTMLElement | undefined;
  private headline: HTMLElement | undefined;
  private next: HTMLElement | undefined;
  private note: HTMLElement | undefined;
  private survivors: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private proceed: HTMLButtonElement | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Callback for Continue. */
  constructor(handlers: StageTransitionHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the hidden panel under `parent`; `show` opens it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const backdrop = doc.createElement("div");
    backdrop.className = "tut-modal";
    backdrop.dataset.role = "stage-transition";
    backdrop.hidden = true;

    const panel = doc.createElement("section");
    panel.className =
      "tut-panel tut-panel--raised tut-modal__panel tut-stage-transition";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Stage cleared";

    const headline = doc.createElement("h2");
    headline.dataset.field = "stage-headline";

    const next = doc.createElement("p");
    next.dataset.field = "stage-next";

    const note = doc.createElement("p");
    note.className = "tut-dim";
    note.dataset.field = "stage-note";

    const table = doc.createElement("table");
    table.className = "tut-table tut-stage-transition__survivors";
    const head = doc.createElement("thead");
    const heading = doc.createElement("tr");
    for (const label of ["Unit", "HP", "Left"]) {
      const cell = doc.createElement("th");
      cell.textContent = label;
      heading.appendChild(cell);
    }
    head.appendChild(heading);
    const body = doc.createElement("tbody");
    body.dataset.role = "stage-survivors";
    table.append(head, body);

    const status = doc.createElement("p");
    status.className = "tut-dim";
    status.dataset.field = "stage-status";
    status.hidden = true;

    const buttons = doc.createElement("div");
    buttons.className = "tut-stack";
    const proceed = doc.createElement("button");
    proceed.type = "button";
    proceed.className = "tut-btn tut-btn--primary";
    proceed.dataset.action = "stage-continue";
    proceed.textContent = "Continue";
    buttons.appendChild(proceed);

    panel.append(kicker, headline, next, note, table, status, buttons);
    backdrop.appendChild(panel);
    parent.appendChild(backdrop);

    const onContinue = (): void => {
      this.handlers.onContinue();
    };
    proceed.addEventListener("click", onContinue);
    this.dispose = () => {
      proceed.removeEventListener("click", onContinue);
    };

    this.root = backdrop;
    this.headline = headline;
    this.next = next;
    this.note = note;
    this.survivors = body;
    this.status = status;
    this.proceed = proceed;
  }

  /** Removes the panel and its listener. Safe to call unmounted. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.headline = undefined;
    this.next = undefined;
    this.note = undefined;
    this.survivors = undefined;
    this.status = undefined;
    this.proceed = undefined;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Whether the transition is on screen. */
  get open(): boolean {
    return this.root !== undefined && !this.root.hidden;
  }

  /** Opens the transition with `transition`, replacing what it said before. */
  show(transition: StageTransition): void {
    if (
      !this.root ||
      !this.headline ||
      !this.next ||
      !this.note ||
      !this.survivors ||
      !this.proceed
    ) {
      return;
    }
    const doc = this.root.ownerDocument;
    this.headline.textContent = transition.headline;
    this.next.textContent = transition.next;
    this.note.textContent = transition.note;
    this.survivors.replaceChildren(
      ...transition.survivors.map((survivor) => {
        const row = doc.createElement("tr");
        row.dataset.unitId = survivor.unitId;
        const name = doc.createElement("td");
        name.textContent = survivor.name;
        const hp = doc.createElement("td");
        hp.className = "tut-data";
        hp.dataset.field = "survivor-hp";
        hp.textContent = survivor.hp;
        if (survivor.wounded) hp.dataset.wounded = "true";
        const stores = doc.createElement("td");
        stores.dataset.field = "survivor-stores";
        // One line per pool: a pool's own line already uses the dot.
        if (survivor.stores.length === 0) {
          stores.textContent = "—";
        } else {
          stores.replaceChildren(
            ...survivor.stores.map((line) => {
              const store = doc.createElement("div");
              store.textContent = line;
              return store;
            }),
          );
        }
        row.append(name, hp, stores);
        return row;
      }),
    );
    this.showStatus("");
    this.root.hidden = false;
    this.proceed.focus();
  }

  /** Says why Continue was refused, or clears the line with "". */
  showStatus(text: string): void {
    if (!this.status) return;
    this.status.textContent = text;
    this.status.hidden = text === "";
  }

  /** Closes the transition. */
  hide(): void {
    if (this.root) {
      this.root.hidden = true;
    }
  }
}
