// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { GameOutcome } from "../../overworld/model/game-outcome";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import { GameOverScreen } from "./game-over-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

const newGame = (): GameState =>
  createNewGame(
    { seed: 7, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

const ended = (kind: GameOutcome["kind"]): GameState => {
  const base = newGame();
  const outcome: GameOutcome = {
    kind,
    day: 41,
    summary: {
      citiesLost: 3,
      citiesInfested: 7,
      citiesTotal: EARTH_MAP.cities.length,
      missionsRun: 5,
      daysSurvived: 41,
      finalThreat: kind === "defeat" ? 100 : 12,
    },
  };
  return { ...base, overworld: { ...base.overworld, day: 41, outcome } };
};

const sessionWith = (state: GameState | undefined): GameSession => ({
  store: undefined,
  state,
  start: () => undefined,
  replace: () => undefined,
  clear: () => undefined,
});

const fakeRouter = (): { router: ScreenRouter; navigate: NavigateMock } => {
  const navigate: NavigateMock = vi.fn();
  return {
    router: {
      current: "game-over",
      navigate,
      events: new SimpleEventBus<ScreenRouterEvents>(),
    },
    navigate,
  };
};

describe("GameOverScreen", () => {
  let root: HTMLElement;
  const field = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-field="${name}"]`);

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("shows the defeat banner, day and summary", () => {
    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(ended("defeat")),
    }).mount(root);
    expect(root.querySelector('[data-screen="game-over"]')).not.toBeNull();
    expect(field("outcome-kind")?.textContent).toBe("Earth overrun");
    expect(field("outcome-kind")?.dataset.kind).toBe("defeat");
    expect(field("day")?.textContent).toBe("41");
    expect(field("cities-lost")?.textContent).toBe(
      `3 / ${String(EARTH_MAP.cities.length)}`,
    );
    expect(field("cities-infested")?.textContent).toBe(
      `7 / ${String(EARTH_MAP.cities.length)}`,
    );
    expect(field("missions-run")?.textContent).toBe("5");
    expect(field("final-threat")?.textContent).toBe("100");
  });

  it("shows the victory placeholder banner", () => {
    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(ended("victory-stub")),
    }).mount(root);
    expect(field("outcome-kind")?.textContent).toBe("Earth secured");
    expect(field("outcome-kind")?.dataset.kind).toBe("victory-stub");
    expect(field("outcome-tagline")?.textContent).toContain("M4");
  });

  it("notes when no campaign has ended and still offers the menu", () => {
    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(newGame()),
    }).mount(root);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-outcome"]'),
    ).not.toBeNull();
    expect(root.querySelector('[data-action="main-menu"]')).not.toBeNull();
  });

  it("Return to main menu navigates there", () => {
    const { router, navigate } = fakeRouter();
    new GameOverScreen({ router, session: sessionWith(ended("defeat")) }).mount(
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-action="main-menu"]')?.click();
    expect(navigate).toHaveBeenCalledWith("main-menu");
  });

  it("unmount removes the panel and its listener", () => {
    const { router, navigate } = fakeRouter();
    const screen = new GameOverScreen({
      router,
      session: sessionWith(ended("defeat")),
    });
    screen.mount(root);
    const button = root.querySelector<HTMLButtonElement>(
      '[data-action="main-menu"]',
    );
    screen.unmount();
    expect(root.querySelector('[data-screen="game-over"]')).toBeNull();
    button?.click();
    expect(navigate).not.toHaveBeenCalled();
  });
});
