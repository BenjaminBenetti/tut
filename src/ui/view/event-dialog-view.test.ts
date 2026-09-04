// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EVENT_TYPES } from "../../overworld/data/event-types";
import { EVENT_TYPE_IDS } from "../../overworld/model/event-type";
import type { PendingEvent } from "../../overworld/model/pending-event";
import { DataEventTypeCatalogue } from "../../overworld/repository/event-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { EventDialogView } from "./event-dialog-view";
import { campaignOnDay } from "./mission-fixtures.test-helper";

const CATALOGUE = new DataEventTypeCatalogue(
  EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
);

const withEvents = (events: readonly PendingEvent[]): GameState => {
  const state = campaignOnDay(3, []);
  return { ...state, overworld: { ...state.overworld, pendingEvents: events } };
};

const PLEA: PendingEvent = {
  id: "event-1",
  typeId: "city-plea",
  cityId: "berlin",
  createdDay: 3,
  expiresDay: 8,
};

const FUNDING: PendingEvent = {
  id: "event-2",
  typeId: "funding-review",
  createdDay: 3,
  expiresDay: 8,
};

describe("EventDialogView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const dialog = (): HTMLElement | null =>
    root.querySelector<HTMLElement>('[data-role="event-dialog"]');
  const field = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const choices = (): HTMLButtonElement[] => [
    ...root.querySelectorAll<HTMLButtonElement>("[data-choice-id]"),
  ];

  it("is hidden without a pending event", () => {
    const view = new EventDialogView(
      { eventTypes: CATALOGUE },
      { onChoose: vi.fn() },
    );
    view.mount(root);
    view.update(withEvents([]));
    expect(dialog()?.hidden).toBe(true);
  });

  it("marks the choice that happens if the player ignores it, and recommends none", () => {
    const type = EVENT_TYPES["city-plea"];
    const view = new EventDialogView(
      { eventTypes: CATALOGUE },
      { onChoose: vi.fn() },
    );
    view.mount(root);
    view.update(withEvents([PLEA]));

    // No button carries the primary styling. It used to sit on the first
    // choice, which on three of the four event types is *not* the
    // default -- an emphasis saying "do this" beside a line saying
    // something else happens if you do nothing.
    expect(
      choices().filter((b) => b.classList.contains("tut-btn--primary")),
    ).toHaveLength(0);

    // The default is named on the button it belongs to, and it is the
    // one the data declares, not the first.
    const marked = choices().filter((b) =>
      b.querySelector('[data-role="default-choice"]'),
    );
    expect(marked).toHaveLength(1);
    expect(marked[0]?.dataset.choiceId).toBe(type.defaultChoiceId);
    expect(marked[0]?.dataset.choiceId).not.toBe(type.choices[0]?.id);
  });

  it("renders title, city, substituted text, expiry and one button per choice", () => {
    const view = new EventDialogView(
      { eventTypes: CATALOGUE },
      { onChoose: vi.fn() },
    );
    view.mount(root);
    view.update(withEvents([PLEA]));
    expect(dialog()?.hidden).toBe(false);
    expect(field("event-title")?.textContent).toBe(
      EVENT_TYPES["city-plea"].title.replaceAll("{city}", "Berlin"),
    );
    expect(field("event-city")?.hidden).toBe(false);
    expect(field("event-city")?.textContent).toBe("Berlin");
    expect(field("event-text")?.textContent).not.toContain("{city}");
    expect(field("event-text")?.textContent).toContain("Berlin");
    expect(field("event-expiry")?.textContent).toBe(
      "Resolves by default in 5 d",
    );
    expect(choices().map((b) => b.dataset.choiceId)).toEqual(
      EVENT_TYPES["city-plea"].choices.map((c) => c.id),
    );
    expect(choices()[0]?.textContent).toBe(
      EVENT_TYPES["city-plea"].choices[0]?.label,
    );
  });

  it("hides the city line for events without one", () => {
    const view = new EventDialogView(
      { eventTypes: CATALOGUE },
      { onChoose: vi.fn() },
    );
    view.mount(root);
    view.update(withEvents([FUNDING]));
    expect(field("event-city")?.hidden).toBe(true);
    expect(field("event-title")?.textContent).toBe(
      EVENT_TYPES["funding-review"].title,
    );
  });

  it("reports a chosen option with the event id and rebuilds buttons only for a new event", () => {
    const onChoose = vi.fn();
    const view = new EventDialogView({ eventTypes: CATALOGUE }, { onChoose });
    view.mount(root);
    view.update(withEvents([PLEA]));
    const first = choices()[0];
    first?.click();
    expect(onChoose).toHaveBeenCalledWith(
      "event-1",
      EVENT_TYPES["city-plea"].choices[0]?.id,
    );
    view.update(withEvents([PLEA]));
    expect(choices()[0]).toBe(first);
    view.update(withEvents([FUNDING]));
    expect(dialog()?.dataset.eventId).toBe("event-2");
    expect(choices()).toHaveLength(
      EVENT_TYPES["funding-review"].choices.length,
    );
  });

  it("unmount removes the modal and stops reporting", () => {
    const onChoose = vi.fn();
    const view = new EventDialogView({ eventTypes: CATALOGUE }, { onChoose });
    view.mount(root);
    view.update(withEvents([PLEA]));
    const first = choices()[0];
    view.unmount();
    expect(root.children).toHaveLength(0);
    first?.click();
    expect(onChoose).not.toHaveBeenCalled();
  });
});
