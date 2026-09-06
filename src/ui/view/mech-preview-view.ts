// ===========================================
// MechPreviewView
// ===========================================

/**
 * The mech bay's picture of the mech being built: a panel holding a
 * viewport a `MechPreviewHost` renders the assembled loadout into.
 *
 * The view owns the panel and nothing else. It never imports three, and
 * it does not know whether a host is attached — with none, the empty
 * note stands in and the bay behaves exactly as it did before (#694).
 *
 * ```
 *   ┌ ASSEMBLY ─────────────┐
 *   │                       │
 *   │      [ canvas ]       │   ◄── host.attach(viewport)
 *   │                       │
 *   └───────────────────────┘
 * ```
 */
export class MechPreviewView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private view: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("aside");
    panel.id = "mech-preview";
    panel.className = "tut-panel tut-mech-bay__preview";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Assembly";

    const view = doc.createElement("div");
    view.className = "tut-mech-bay__preview-view";
    view.dataset.role = "preview-viewport";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "preview-empty";
    empty.textContent = "No preview available.";
    view.appendChild(empty);

    panel.append(title, view);
    parent.appendChild(panel);
    this.root = panel;
    this.view = view;
  }

  /**
   * The element a preview host renders into, or undefined before mount.
   *
   * @returns The viewport element.
   */
  viewport(): HTMLElement | undefined {
    return this.view;
  }

  /**
   * Hides the "no preview" note, for when a host has taken the viewport.
   *
   * The note is not removed: releasing the host puts the panel back to
   * an empty box, and a box with no explanation looks like a bug.
   */
  markAttached(): void {
    const empty = this.view?.querySelector<HTMLElement>(
      '[data-role="preview-empty"]',
    );
    if (empty) {
      empty.hidden = true;
    }
  }

  /** Removes the panel. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.view = undefined;
  }
}
