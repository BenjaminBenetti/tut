import type { DomainEvent } from "../../core/model/domain-event";
import type { GreatHive } from "../../overworld/model/great-hive";
import type { GreatHivesRevealedEvent } from "../../overworld/model/great-hives-revealed-event";
import { GREAT_HIVES_REVEALED } from "../../overworld/model/great-hives-revealed-event";
import { formatWhole } from "../service/format";

// ===========================================
// Constants
// ===========================================

/** The story beat's headline (campaign arc §6.9). */
export const GREAT_HIVE_REVEAL_TITLE =
  "Three Great Hives: the platform's beacons";

// ===========================================
// GreatHiveRevealView
// ===========================================

/**
 * The story beat for the Great Hives' reveal (campaign arc §3 Act III,
 * §6.9, #1179): a modal over the overworld, opened by the
 * `GREAT_HIVES_REVEALED` event of the day tick that follows Uplink's
 * win, naming the three continents. It reads the event, not the state,
 * so it shows once, on the day it happens; a loaded save shows the
 * beacons on the map and the count in the top bar instead.
 *
 * ```
 *   ┌ UPLINK · TRACKING DATA ─────────────────────╱
 *   │ Three Great Hives: the platform's beacons   │
 *   │ Uplink's tracking data found what the …     │
 *   │   Europe                      4 regions     │
 *   │   Asia                        4 regions     │
 *   │   Oceania                     1 region      │
 *   │ All three: the launch window opens.         │
 *   │ [Mark the targets]                          │
 *   └─────────────────────────────────────────────┘
 * ```
 */
export class GreatHiveRevealView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private text: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private dismiss: HTMLButtonElement | undefined;
  /** Closes the beat: the dismiss button's click handler. */
  private readonly onDismiss = (): void => {
    this.hide();
  };

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the hidden modal under `parent`; `notice` opens it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const backdrop = doc.createElement("div");
    backdrop.className = "tut-modal";
    backdrop.dataset.role = "great-hive-reveal";
    backdrop.hidden = true;
    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-panel--raised tut-modal__panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Uplink · tracking data";
    const title = doc.createElement("h2");
    title.dataset.field = "great-hive-reveal-title";
    title.textContent = GREAT_HIVE_REVEAL_TITLE;
    const text = doc.createElement("p");
    text.dataset.field = "great-hive-reveal-text";
    const list = doc.createElement("ul");
    list.className = "tut-list";
    list.dataset.role = "great-hive-continents";
    const goal = doc.createElement("p");
    goal.className = "tut-dim";
    goal.textContent =
      "All three: the launch window opens. Each assault stays on the board until its core falls.";
    const actions = doc.createElement("div");
    actions.className = "tut-stack";
    const dismiss = doc.createElement("button");
    dismiss.type = "button";
    dismiss.className = "tut-btn tut-btn--primary";
    dismiss.dataset.action = "dismiss-great-hive-reveal";
    dismiss.textContent = "Mark the targets";
    dismiss.addEventListener("click", this.onDismiss);
    actions.appendChild(dismiss);
    panel.append(kicker, title, text, list, goal, actions);
    backdrop.appendChild(panel);
    parent.appendChild(backdrop);
    this.root = backdrop;
    this.text = text;
    this.list = list;
    this.dismiss = dismiss;
  }

  /**
   * Opens the beat when `events` hold the reveal; leaves the modal as it
   * is otherwise, so a later change neither opens nor closes it.
   */
  notice(events: readonly DomainEvent[]): void {
    const revealed = events.find(isGreatHivesRevealed);
    if (revealed !== undefined) {
      this.show(revealed.payload.greatHives);
    }
  }

  /** Removes the modal and its listener. */
  unmount(): void {
    this.dismiss?.removeEventListener("click", this.onDismiss);
    this.root?.remove();
    this.root = undefined;
    this.text = undefined;
    this.list = undefined;
    this.dismiss = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Fills the text and the continent list from `greatHives` and shows the modal. */
  private show(greatHives: readonly GreatHive[]): void {
    if (!this.root || !this.text || !this.list) {
      return;
    }
    const doc = this.root.ownerDocument;
    const names = greatHives.map((hive) => hive.name);
    this.text.textContent = `Uplink's tracking data found what the Spore Platform homes on: the Great Hives under ${joinNames(names)}. Each is a hive cavern past anything fought so far, and each assault is pinned to the mission board.`;
    this.list.replaceChildren(
      ...greatHives.map((hive) => {
        const item = doc.createElement("li");
        item.dataset.greatHiveId = hive.id;
        const name = doc.createElement("span");
        name.className = "tut-badge tut-badge--bug";
        name.textContent = hive.name;
        const size = doc.createElement("span");
        size.className = "tut-dim";
        const count = hive.regionIds.length;
        size.textContent = `${formatWhole(count)} ${count === 1 ? "region" : "regions"}`;
        item.append(name, size);
        return item;
      }),
    );
    this.root.hidden = false;
  }

  /** Closes the modal. */
  private hide(): void {
    if (this.root) {
      this.root.hidden = true;
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/** Whether `event` is the Great Hives' reveal. */
function isGreatHivesRevealed(
  event: DomainEvent,
): event is GreatHivesRevealedEvent {
  return event.type === GREAT_HIVES_REVEALED;
}

/**
 * "Europe, Asia and Oceania": names joined as a sentence lists them.
 *
 * @param names - The names, in order.
 */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}
