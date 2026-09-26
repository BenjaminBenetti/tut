import type { PlaceableUnit } from "../../tactical/model/place-unit-command";
import type {
  DebugMenuModel,
  DebugTool,
  DebugToolPage,
} from "../model/debug-tool";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Constants
// ===========================================

/** The spawn tool's id, and so its list button's test id suffix. */
export const SPAWN_TOOL_ID = "spawn";

/**
 * The two lists, by which side the placed unit fights for. A civilian
 * group is the player's to rescue (campaign arc §6.4), so it is listed
 * with the force.
 */
const SIDES = [
  { title: "Friendly", kinds: ["squad", "mech", "civilian"] },
  { title: "Hostile", kinds: ["bug"] },
] as const;

// ===========================================
// Spawn tool
// ===========================================

/**
 * The Spawn tool (#1136, listed since #1138): the page lists every unit
 * the `PlaceUnit` handler can put down, friendly and hostile; pressing
 * an entry arms it, and the HUD then treats the next click on the map
 * as "place it there".
 *
 * ```
 *   Friendly
 *     [Rifle Squad] [Rocket Squad] …
 *     [Mech (starter)] [Civilians (trapped)]
 *   Hostile
 *     [Swarmer] [Lurker] [Brute]
 *   Place: Swarmer — click the map, Esc cancels
 * ```
 *
 * The entries come from the composition, which reads them from the
 * handler's own catalogues, so the tool cannot offer a type the rules
 * would then refuse as unknown.
 *
 * @param entries - Every unit the tool offers, in catalogue order.
 * @param onArm - Where arming is reported: the pressed entry, or
 *   `undefined` when the armed entry is pressed again. The owner keeps
 *   the armed entry and hands it back through the model, so the page
 *   never holds state the HUD does not.
 */
export function createSpawnTool(
  entries: readonly PlaceableUnit[],
  onArm: (entry: PlaceableUnit | undefined) => void,
): DebugTool {
  return {
    id: SPAWN_TOOL_ID,
    label: "Spawn",
    description: "Place a friendly or hostile unit on the map",
    render: (page) => renderSpawnPage(page, entries, onArm),
  };
}

// ===========================================
// Page
// ===========================================

/**
 * Builds the side lists and the armed line under `page`, with one
 * click listener on the page for every entry.
 */
function renderSpawnPage(
  page: HTMLElement,
  entries: readonly PlaceableUnit[],
  onArm: (entry: PlaceableUnit | undefined) => void,
): DebugToolPage {
  const doc = page.ownerDocument;
  const buttons = new Map<string, HTMLButtonElement>();
  for (const side of SIDES) {
    const label = doc.createElement("div");
    label.className = "tut-dim tut-debug-menu__side";
    label.textContent = side.title;
    page.appendChild(label);
    const list = doc.createElement("div");
    list.className = "tut-debug-menu__list";
    list.dataset.side = side.title.toLowerCase();
    for (const entry of entries) {
      if (!(side.kinds as readonly string[]).includes(entry.kind)) {
        continue;
      }
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "tut-btn tut-debug-menu__entry";
      button.dataset.testid = `debug-place-${entry.kind}-${entry.id}`;
      button.dataset.kind = entry.kind;
      button.dataset.id = entry.id;
      button.setAttribute("aria-pressed", "false");
      button.appendChild(iconGlyph(doc, iconFor(entry.kind)));
      const text = doc.createElement("span");
      text.className = "tut-btn__label";
      text.textContent = entry.name;
      button.appendChild(text);
      list.appendChild(button);
      buttons.set(keyOf(entry), button);
    }
    page.appendChild(list);
  }
  const armedLine = doc.createElement("p");
  armedLine.className = "tut-mono tut-debug-menu__armed";
  armedLine.dataset.role = "debug-armed";
  page.appendChild(armedLine);

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>(
      "button.tut-debug-menu__entry",
    );
    if (!button) {
      return;
    }
    const entry = entries.find(
      (candidate) =>
        candidate.kind === button.dataset.kind &&
        candidate.id === button.dataset.id,
    );
    if (entry === undefined) {
      return;
    }
    // Pressing the armed entry again disarms it; the owner decides
    // from what it is holding, so the page asks with the entry and
    // the owner compares.
    onArm(button.getAttribute("aria-pressed") === "true" ? undefined : entry);
  };
  page.addEventListener("click", onClick);

  return {
    /** Marks the armed entry pressed and words the instruction. */
    update(model: DebugMenuModel): void {
      const armedKey =
        model.armed === undefined ? undefined : keyOf(model.armed);
      for (const [key, button] of buttons) {
        const pressed = key === armedKey;
        button.setAttribute("aria-pressed", pressed ? "true" : "false");
        button.classList.toggle("is-selected", pressed);
      }
      armedLine.textContent =
        model.armed === undefined
          ? "Pick a unit, then click the map to place it."
          : armedStatus(model.armed);
      armedLine.dataset.armed = String(model.armed !== undefined);
    },
    /** Drops the click listener; the menu clears the elements. */
    dispose(): void {
      page.removeEventListener("click", onClick);
      buttons.clear();
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/** The status line while an entry is armed, shared with the HUD's banner. */
export function armedStatus(entry: PlaceableUnit): string {
  return `Place: ${entry.name} — click the map, Esc cancels`;
}

/** One key per entry, so a button is found by what it places. */
function keyOf(entry: PlaceableUnit): string {
  return `${entry.kind}:${entry.id}`;
}

/** The glyph beside an entry: the side it fights for. */
function iconFor(kind: PlaceableUnit["kind"]): "squad" | "mech" | "egg" {
  switch (kind) {
    case "bug":
      return "egg";
    case "mech":
      return "mech";
    case "squad":
    case "turret":
    case "generator":
    case "civilian":
      // A turret is never listed (#1138), nor a generator (#1175); they
      // would read as infantry. A civilian group (campaign arc §6.4) is
      // on the squad's side and on foot, so it reads as one too.
      return "squad";
  }
}
