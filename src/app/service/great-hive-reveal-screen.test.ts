// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type {
  ScreenRouter,
  ScreenRouterEvents,
} from "../../ui/model/screen-router";
import { OverworldScreen } from "../../ui/screen/overworld-screen";
import { OverworldSelectionState } from "../../ui/service/overworld-selection-state";
import type { GameComposition } from "./game-composition";
import {
  composeGreatHiveGame,
  greatHivesOf,
  startAfterUplink,
} from "./great-hive-campaign.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** The overworld screen over `game`'s session, wired as the app wires it. */
function overworldOver(game: GameComposition): OverworldScreen {
  const router: ScreenRouter = {
    current: "overworld",
    navigate: () => undefined,
    events: new SimpleEventBus<ScreenRouterEvents>(),
  };
  return new OverworldScreen({
    router,
    session: game.session,
    selection: new OverworldSelectionState((cityId) => {
      const state = game.session.state;
      return state
        ? findCity(state.overworld.map, cityId)?.regionId
        : undefined;
    }),
    missionTypes: game.content.missionTypes,
    eventTypes: game.content.eventTypes,
    hiveTuning: game.content.hiveTuning,
    deployableTypes: new DataDeployableTypeCatalogue(
      DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
    ),
  });
}

// ===========================================
// The beat through the shipped composition
// ===========================================

describe("the Great Hives' reveal on the overworld (#1179)", () => {
  it("opens the story beat on the day after Uplink, names the continents, and counts them in the bar", () => {
    const game = composeGreatHiveGame(11);
    startAfterUplink(game, 11);
    const root = document.createElement("div");
    document.body.appendChild(root);
    overworldOver(game).mount(root);
    const modal = root.querySelector<HTMLElement>(
      '[data-role="great-hive-reveal"]',
    );
    const tracker = root.querySelector<HTMLElement>(
      '[data-role="great-hives"]',
    );
    expect(modal?.hidden).toBe(true);
    expect(tracker?.hidden).toBe(true);

    root
      .querySelector<HTMLButtonElement>('[data-action="advance-day"]')
      ?.click();

    const hives = greatHivesOf(game);
    expect(hives).toHaveLength(3);
    expect(modal?.hidden).toBe(false);
    const text =
      modal?.querySelector('[data-field="great-hive-reveal-text"]')
        ?.textContent ?? "";
    for (const hive of hives) {
      expect(text).toContain(hive.name);
    }
    expect(tracker?.hidden).toBe(false);
    expect(root.querySelector('[data-field="great-hives"]')?.textContent).toBe(
      "0 / 3",
    );

    // Dismissed, it stays shut through the next day.
    modal
      ?.querySelector<HTMLButtonElement>(
        '[data-action="dismiss-great-hive-reveal"]',
      )
      ?.click();
    expect(modal?.hidden).toBe(true);
    root
      .querySelector<HTMLButtonElement>('[data-action="advance-day"]')
      ?.click();
    expect(game.session.state?.overworld.day).toBeGreaterThan(
      hives[0]?.revealedDay ?? 0,
    );
    expect(modal?.hidden).toBe(true);
  }, 60_000);
});
