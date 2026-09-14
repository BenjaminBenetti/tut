import type { PlaceableUnit } from "../../tactical/model/place-unit-command";

// ===========================================
// Menu model
// ===========================================

/** What the debug menu shows, handed to every page on each refresh. */
export interface DebugMenuModel {
  /** Whether the panel is on screen. */
  readonly open: boolean;
  /** The entry armed for placement, if any; its button reads pressed. */
  readonly armed: PlaceableUnit | undefined;
}

// ===========================================
// Tools
// ===========================================

/**
 * A tool's page once it is on screen: the menu refreshes it with the
 * model on every HUD refresh and disposes it when the player goes back
 * to the tool list or the panel closes.
 */
export interface DebugToolPage {
  /** Marks the page with what the owner holds (the armed entry, so far). */
  update(model: DebugMenuModel): void;
  /** Drops any listener the page put on its elements; the menu clears the DOM. */
  dispose(): void;
}

/**
 * One tool on the debug menu's tool list (#1138). The menu opens on
 * the list and shows one line per tool — its label and what it does —
 * and pressing a line replaces the panel body with the page the tool
 * renders. A tool declares itself; the menu renders the chrome (the
 * page title, Back, close), so a second tool is one more entry in the
 * list and not a change to the view.
 *
 * ```
 *   tool list ──press "Spawn"──► page: [Back] Spawn
 *             ◄──── Back ───────       …tool.render(page)…
 * ```
 */
export interface DebugTool {
  /** Plain string id; the list button's test id is `debug-tool-<id>`. */
  readonly id: string;
  /** The line on the list, and the page title once opened. */
  readonly label: string;
  /** One line under the label saying what the tool does. */
  readonly description: string;
  /** Fills `page` with the tool's controls and returns the handle to refresh them. */
  readonly render: (page: HTMLElement) => DebugToolPage;
}
