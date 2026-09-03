import type { EventChoiceId } from "../../overworld/model/event-type";
import { CITY_NAME_TOKEN } from "../../overworld/model/event-type";
import type { EventTypeCatalogue } from "../../overworld/model/event-type-catalogue";
import type {
  PendingEvent,
  PendingEventId,
} from "../../overworld/model/pending-event";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { GameState } from "../../save/model/game-state";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the dialog reports back to its owner. */
export interface EventDialogViewHandlers {
  /** The player picked a choice for the shown event. */
  readonly onChoose: (eventId: PendingEventId, choiceId: EventChoiceId) => void;
}

/** What the dialog needs to name things. */
export interface EventDialogViewDeps {
  readonly eventTypes: EventTypeCatalogue;
}

// ===========================================
// EventDialogView
// ===========================================

/**
 * The pending event as a modal over the overworld (GDD §5.4): title and
 * body with the city's name substituted, the city if the event has one,
 * days before it resolves by default, and one button per choice. Shows
 * the head of `pendingEvents`; hidden when there is none. The buttons are
 * rebuilt only when a different event comes up.
 *
 * ```
 *   ┌ EVENT ──────────────────────────────────────╱
 *   │ City plea · Berlin                           │
 *   │ Berlin's council begs for …    (expires 4 d) │
 *   │ [Send relief convoys] [Hold the line] …      │
 *   └──────────────────────────────────────────────┘
 * ```
 */
export class EventDialogView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: EventDialogViewDeps;
  private readonly handlers: EventDialogViewHandlers;
  private root: HTMLElement | undefined;
  private title: HTMLElement | undefined;
  private city: HTMLElement | undefined;
  private text: HTMLElement | undefined;
  private expiry: HTMLElement | undefined;
  private choices: HTMLElement | undefined;
  private shown: PendingEventId | undefined;
  private onClick: ((event: Event) => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param deps - Catalogue for the event's copy and choices.
   * @param handlers - Callback for a chosen option.
   */
  constructor(deps: EventDialogViewDeps, handlers: EventDialogViewHandlers) {
    this.deps = deps;
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the hidden modal under `parent`; `update` shows it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const backdrop = doc.createElement("div");
    backdrop.className = "tut-modal";
    backdrop.dataset.role = "event-dialog";
    backdrop.hidden = true;

    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-panel--raised tut-modal__panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Event";

    const title = doc.createElement("h2");
    title.dataset.field = "event-title";

    const city = doc.createElement("p");
    city.className = "tut-label";
    city.dataset.field = "event-city";
    city.hidden = true;

    const text = doc.createElement("p");
    text.dataset.field = "event-text";

    const expiry = doc.createElement("p");
    expiry.className = "tut-dim";
    expiry.dataset.field = "event-expiry";

    const choices = doc.createElement("div");
    choices.className = "tut-stack";
    choices.dataset.role = "event-choices";

    panel.append(kicker, title, city, text, expiry, choices);
    backdrop.appendChild(panel);
    parent.appendChild(backdrop);

    this.onClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest<HTMLElement>("[data-choice-id]");
      const choiceId = button?.dataset.choiceId;
      if (choiceId !== undefined && this.shown !== undefined) {
        this.handlers.onChoose(this.shown, choiceId);
      }
    };
    choices.addEventListener("click", this.onClick);

    this.root = backdrop;
    this.title = title;
    this.city = city;
    this.text = text;
    this.expiry = expiry;
    this.choices = choices;
  }

  /** Shows the first pending event of `state`, or hides the modal. */
  update(state: GameState | undefined): void {
    if (
      !this.root ||
      !this.title ||
      !this.city ||
      !this.text ||
      !this.expiry ||
      !this.choices
    ) {
      return;
    }
    const event = state?.overworld.pendingEvents[0];
    const type = event
      ? this.deps.eventTypes.getEventType(event.typeId)
      : undefined;
    if (!state || !event || !type) {
      this.shown = undefined;
      delete this.root.dataset.eventId;
      this.root.hidden = true;
      return;
    }
    const cityName = this.cityName(state, event);
    this.setText(this.title, this.substitute(type.title, cityName));
    this.city.hidden = cityName === undefined;
    this.setText(this.city, cityName ?? "");
    this.setText(this.text, this.substitute(type.text, cityName));
    this.setText(
      this.expiry,
      `Resolves by default in ${formatWhole(event.expiresDay - state.overworld.day)} d`,
    );
    if (this.shown !== event.id) {
      this.rebuildChoices(type.choices);
      this.shown = event.id;
      this.root.dataset.eventId = event.id;
    }
    this.root.hidden = false;
  }

  /** Removes the modal and its listener. */
  unmount(): void {
    if (this.choices && this.onClick) {
      this.choices.removeEventListener("click", this.onClick);
    }
    this.root?.remove();
    this.root = undefined;
    this.title = undefined;
    this.city = undefined;
    this.text = undefined;
    this.expiry = undefined;
    this.choices = undefined;
    this.shown = undefined;
    this.onClick = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Replaces the city token in copy; global events have no city and no token. */
  private substitute(copy: string, cityName: string | undefined): string {
    return copy.replaceAll(CITY_NAME_TOKEN, cityName ?? "");
  }

  /** The attached city's display name, if the event has one that is on the map. */
  private cityName(state: GameState, event: PendingEvent): string | undefined {
    if (event.cityId === undefined) {
      return undefined;
    }
    return findCity(state.overworld.map, event.cityId)?.name ?? event.cityId;
  }

  /** One button per choice, in catalogue order. */
  private rebuildChoices(
    choices: readonly { id: EventChoiceId; label: string }[],
  ): void {
    if (!this.choices) {
      return;
    }
    const doc = this.choices.ownerDocument;
    this.choices.replaceChildren();
    choices.forEach((choice, index) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = index === 0 ? "tut-btn tut-btn--primary" : "tut-btn";
      button.dataset.action = "choose";
      button.dataset.choiceId = choice.id;
      button.textContent = choice.label;
      this.choices?.appendChild(button);
    });
  }

  /** Writes text only when it changed. */
  private setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }
}
