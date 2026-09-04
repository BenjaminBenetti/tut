/**
 * Radial menu harness: renders the real `RadialMenuView` over a still of a
 * mission, so the look can be judged before #528 wires it to attacks.
 *
 * ```
 *   ?items=5     how many choices on the ring
 *   window.__radial__.open()   re-render, for a screenshot
 * ```
 *
 * Served by the dev server; shot with `shoot-radial.mjs`.
 */
import "../../../src/ui/style/theme.css";
import "../../../src/ui/style/screens.css";

import type { RadialMenuItem } from "../../../src/ui/view/radial-menu-view";
import { RadialMenuView } from "../../../src/ui/view/radial-menu-view";

const params = new URLSearchParams(location.search);
const count = Number(params.get("items") ?? 5);

document.body.style.margin = "0";
document.body.style.background = "#0b0d12";

const stage = document.createElement("div");
stage.id = "radial-stage";
stage.style.cssText =
  "position:relative;width:900px;height:560px;overflow:hidden;" +
  "background:url(/docs/design/tactical-mission-with-log.png) -180px -60px no-repeat";
document.body.appendChild(stage);

const ITEMS: readonly RadialMenuItem[] = [
  {
    id: "fire",
    label: "Autocannon",
    icon: "attack",
    detail: "8-13",
    primary: true,
  },
  { id: "pod", label: "Missile pod", icon: "ability", detail: "12-20" },
  { id: "move", label: "Move", icon: "move" },
  { id: "over", label: "Overwatch", icon: "overwatch" },
  {
    id: "vent",
    label: "Vent",
    icon: "reload",
    disabled: true,
    reason: "No heat to vent",
  },
  { id: "back", label: "Cancel", icon: "close" },
];

const view = new RadialMenuView({
  /**
   * Logs the choice; the harness has no commands to dispatch.
   * @param id - Chosen item id.
   */
  onSelect: (id: string) => {
    console.log("select", id);
  },
  /** Logs the dismissal. */
  onDismiss: () => {
    console.log("dismiss");
  },
});
view.mount(stage);

declare global {
  interface Window {
    /** Re-renders the ring; the screenshot tool calls it after load. */
    __radial__?: {
      /** Opens the ring at the middle of the stage. */
      open(): void;
    };
  }
}

/** Opens the ring at the middle of the stage. */
function open(): void {
  view.open(
    ITEMS.slice(0, count),
    { value: "62%", caption: "hit chance", tone: "ok" },
    { x: 450, y: 280 },
  );
  document.title = "READY radial";
}

window.__radial__ = { open };
open();
