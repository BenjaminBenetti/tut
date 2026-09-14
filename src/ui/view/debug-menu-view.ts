import type { PlaceableUnit } from "../../tactical/model/place-unit-command";
import type {
  DebugMenuModel,
  DebugTool,
  DebugToolPage,
} from "../model/debug-tool";
import { createSpawnTool } from "./debug-spawn-tool";
import { iconGlyph } from "./icon-glyph";

export { armedStatus } from "./debug-spawn-tool";
export type { DebugMenuModel } from "../model/debug-tool";

// ===========================================
// Types
// ===========================================

/** What the menu reports back to its owner. */
export interface DebugMenuHandlers {
  /**
   * The player armed an entry, or disarmed the armed one by pressing it
   * again; `undefined` is the disarm. The owner keeps the armed entry
   * and hands it back through `update`, so the menu never holds state
   * the HUD does not.
   */
  readonly onArm: (entry: PlaceableUnit | undefined) => void;
  /** The close button. The owner closes the menu and disarms. */
  readonly onClose: () => void;
}

// ===========================================
// Constants
// ===========================================

/** `data-testid` of the panel, for the specs. */
export const DEBUG_MENU_TEST_ID = "debug-menu";

/** `data-testid` of the Back button on a tool's page, for the specs. */
export const DEBUG_BACK_TEST_ID = "debug-back";

// ===========================================
// DebugMenuView
// ===========================================

/**
 * The development tools' panel (#1136): a dev-only menu the bug button
 * at the bottom left of the mission bar opens, laid over the left rail.
 * It opens on a high-level **tool list** (#1138) — one line per tool
 * with what it does — and pressing a tool replaces the body with that
 * tool's page under its title and a Back button. Spawn is the one tool
 * so far; its page lists every unit the `PlaceUnit` handler can put
 * down, and pressing an entry arms it for the next click on the map.
 *
 * ```
 *   ┌ DEBUG ─────────────────────────── ✕ ┐      ┌ DEBUG ─────────────────────────── ✕ ┐
 *   │ [Spawn                            ] │      │ [← Back]  Spawn                     │
 *   │ [ Place a friendly or hostile unit] │ ──►  │ Friendly                            │
 *   │                                     │      │   [Rifle Squad] [Rocket Squad] …    │
 *   │                                     │ ◄──  │ Hostile                             │
 *   │                                     │      │   [Swarmer] [Lurker] [Brute]        │
 *   │                                     │      │ Place: Swarmer — click the map,     │
 *   └─────────────────────────────────────┘      └─────────────────────────────────────┘
 * ```
 *
 * Closing the panel puts it back on the tool list for the next opening,
 * and Back disarms whatever the page had armed, so nothing stays armed
 * behind a page that is no longer on screen. The tools declare
 * themselves (`DebugTool`); the view renders the list and the page
 * chrome, so a second tool is one more entry in `tools`. The panel is a
 * child of the HUD grid, so the HUD's pointer guard keeps clicks on it
 * off the map picker (#1113) the way it does for every other panel.
 */
export class DebugMenuView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: DebugMenuHandlers;
  private readonly tools: readonly DebugTool[];
  private root: HTMLElement | undefined;
  private body: HTMLElement | undefined;
  private page: DebugToolPage | undefined;
  private model: DebugMenuModel = { open: false, armed: undefined };
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Where arming and closing are reported.
   * @param entries - Every unit the Spawn tool offers, in catalogue order.
   */
  constructor(handlers: DebugMenuHandlers, entries: readonly PlaceableUnit[]) {
    this.handlers = handlers;
    // The tool list (#1138): add a tool here, not a branch in the view.
    this.tools = [createSpawnTool(entries, handlers.onArm)];
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`, closed on the tool list; call `update` to open it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-debug-menu";
    panel.dataset.testid = DEBUG_MENU_TEST_ID;
    panel.dataset.role = "debug-menu";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Debug");
    panel.hidden = true;

    const head = doc.createElement("div");
    head.className = "tut-debug-menu__head tut-row";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Debug";
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "tut-btn tut-debug-menu__close";
    close.dataset.action = "debug-menu-close";
    close.setAttribute("aria-label", "Close debug menu");
    close.appendChild(iconGlyph(doc, "close"));
    head.append(title, close);
    panel.appendChild(head);

    const body = doc.createElement("div");
    body.className = "tut-debug-menu__body tut-stack";
    body.dataset.role = "debug-body";
    panel.appendChild(body);
    parent.appendChild(panel);

    const onClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('[data-action="debug-menu-close"]')) {
        this.handlers.onClose();
        return;
      }
      if (target.closest('[data-action="debug-back"]')) {
        this.goBack();
        return;
      }
      const button = target.closest<HTMLButtonElement>(
        "button.tut-debug-menu__tool",
      );
      if (!button) {
        return;
      }
      const tool = this.tools.find(
        (candidate) => candidate.id === button.dataset.tool,
      );
      if (tool !== undefined) {
        this.openTool(tool);
      }
    };
    panel.addEventListener("click", onClick);
    this.dispose = () => {
      panel.removeEventListener("click", onClick);
    };
    this.root = panel;
    this.body = body;
    this.showTools();
  }

  /**
   * Shows or hides the panel and refreshes the open page. Closing
   * returns the body to the tool list, so the next opening starts high
   * level again (#1138).
   */
  update(model: DebugMenuModel): void {
    this.model = model;
    if (!this.root) {
      return;
    }
    this.root.hidden = !model.open;
    this.root.dataset.open = String(model.open);
    if (!model.open && this.page !== undefined) {
      this.showTools();
    }
    this.page?.update(model);
  }

  /** Removes the panel and its listeners. */
  unmount(): void {
    this.page?.dispose();
    this.page = undefined;
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.body = undefined;
  }

  // ===========================================
  // Pages
  // ===========================================

  /** Replaces the body with the tool list: one line per tool, label over description. */
  private showTools(): void {
    const body = this.clearBody();
    if (!body) {
      return;
    }
    const doc = body.ownerDocument;
    const list = doc.createElement("div");
    list.className = "tut-debug-menu__tools tut-stack";
    list.dataset.role = "debug-tools";
    for (const tool of this.tools) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "tut-btn tut-debug-menu__tool";
      button.dataset.testid = `debug-tool-${tool.id}`;
      button.dataset.tool = tool.id;
      const label = doc.createElement("span");
      label.className = "tut-btn__label";
      label.textContent = tool.label;
      const description = doc.createElement("span");
      description.className = "tut-dim tut-debug-menu__tool-description";
      description.textContent = tool.description;
      button.append(label, description);
      list.appendChild(button);
    }
    body.appendChild(list);
  }

  /** Replaces the body with `tool`'s page under its title and a Back button. */
  private openTool(tool: DebugTool): void {
    const body = this.clearBody();
    if (!body) {
      return;
    }
    const doc = body.ownerDocument;
    const head = doc.createElement("div");
    head.className = "tut-debug-menu__page-head tut-row";
    const back = doc.createElement("button");
    back.type = "button";
    back.className = "tut-btn tut-debug-menu__back";
    back.dataset.testid = DEBUG_BACK_TEST_ID;
    back.dataset.action = "debug-back";
    back.setAttribute("aria-label", "Back to the tool list");
    back.appendChild(iconGlyph(doc, "back"));
    const backLabel = doc.createElement("span");
    backLabel.className = "tut-btn__label";
    backLabel.textContent = "Back";
    back.appendChild(backLabel);
    const title = doc.createElement("div");
    title.className = "tut-debug-menu__heading";
    title.dataset.role = "debug-page-title";
    title.textContent = tool.label;
    head.append(back, title);
    body.appendChild(head);
    const page = doc.createElement("div");
    page.className = "tut-debug-menu__page tut-stack";
    page.dataset.tool = tool.id;
    body.appendChild(page);
    this.page = tool.render(page);
    this.page.update(this.model);
  }

  /**
   * Back: the page goes, and so does anything it had armed — the owner
   * is asked to disarm, so the status line does not keep an instruction
   * for a page that is no longer on screen.
   */
  private goBack(): void {
    this.showTools();
    if (this.model.armed !== undefined) {
      this.handlers.onArm(undefined);
    }
  }

  /** Disposes the open page, if any, and empties the body for the next one. */
  private clearBody(): HTMLElement | undefined {
    this.page?.dispose();
    this.page = undefined;
    if (this.body) {
      this.body.replaceChildren();
    }
    return this.body;
  }
}
