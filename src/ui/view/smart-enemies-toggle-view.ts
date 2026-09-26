import type { JevPreference } from "../model/jev-preference";

// ===========================================
// Constants
// ===========================================

/** The hint under the switch; says what turning it off does and does not do. */
export const SMART_ENEMIES_HINT =
  "Named enemies are played by Jev. Off: new ones play their built-in tactics; any already under Jev in a mission in progress stay so until it ends.";

// ===========================================
// SmartEnemiesToggleView
// ===========================================

/**
 * The "Smart enemies (Jev)" switch (campaign arc §9): one checkbox that
 * reads and writes the player's `JevPreference`, with a hint that says
 * turning it off stops new actors only.
 *
 * ```
 *   ┌───────────────────────────────────────┐
 *   │ ☑ Smart enemies (Jev)                 │
 *   │   Named enemies are played by Jev. …  │
 *   └───────────────────────────────────────┘
 * ```
 *
 * The owner decides whether to show it at all: the main menu mounts it
 * only when a relay is configured.
 */
export class SmartEnemiesToggleView {
  // ===========================================
  // Fields
  // ===========================================

  private element: HTMLElement | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Construction
  // ===========================================

  /** @param preference - Where the choice is read from and written to. */
  constructor(private readonly preference: JevPreference) {}

  // ===========================================
  // Lifecycle
  // ===========================================

  /**
   * Builds the switch, checked when the preference is on, and appends it
   * to `parent`.
   *
   * @param parent - The container the switch goes into.
   */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const row = doc.createElement("div");
    row.className = "tut-menu__option";
    row.dataset.role = "smart-enemies";

    const label = doc.createElement("label");
    label.className = "tut-menu__check";
    const box = doc.createElement("input");
    box.type = "checkbox";
    box.dataset.field = "smart-enemies";
    box.dataset.testid = "smart-enemies-toggle";
    box.checked = this.preference.enabled();
    const text = doc.createElement("span");
    text.textContent = "Smart enemies (Jev)";
    label.append(box, text);

    const hint = doc.createElement("p");
    hint.className = "tut-menu__hint tut-dim";
    hint.textContent = SMART_ENEMIES_HINT;

    row.append(label, hint);
    parent.appendChild(row);

    const onChange = (): void => {
      this.preference.setEnabled(box.checked);
    };
    box.addEventListener("change", onChange);
    this.dispose = () => {
      box.removeEventListener("change", onChange);
    };
    this.element = row;
  }

  /** Removes the switch and its listener. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.element?.remove();
    this.element = undefined;
  }
}
