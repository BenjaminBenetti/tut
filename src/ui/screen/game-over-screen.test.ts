// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { GameOutcome } from "../../overworld/model/game-outcome";
import { applyOutcome } from "../../overworld/service/outcome-service";
import { computeThreat } from "../../overworld/service/threat-service";
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

const ended = (
  kind: GameOutcome["kind"],
  cause?: GameOutcome["cause"],
): GameState => {
  const base = newGame();
  const outcome: GameOutcome = {
    kind,
    ...(cause === undefined ? {} : { cause }),
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
    expect(field("outcome-kind")?.textContent).toBe("Threat limit reached");
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

  it("explains a real threat-limit defeat with no cities lost", () => {
    const base = newGame();
    const map = {
      ...base.overworld.map,
      cities: base.overworld.map.cities.map((city) => ({
        ...city,
        infestation: 70,
      })),
    };
    /** Default tuning reaches 100 at day 300 while every city is below 100. */
    const atDay = (day: number): GameState => ({
      ...base,
      overworld: {
        ...base.overworld,
        map,
        day,
        threat: computeThreat(map, day, THREAT_TUNING),
      },
    });
    expect(applyOutcome(atDay(299)).state.overworld.outcome).toBeUndefined();
    const ended = applyOutcome(atDay(300)).state;
    expect(ended.overworld.outcome).toMatchObject({
      kind: "defeat",
      summary: { citiesLost: 0, finalThreat: 100 },
    });

    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(ended),
    }).mount(root);
    expect(field("outcome-kind")?.textContent).toBe("Threat limit reached");
    expect(field("outcome-tagline")?.textContent).toBe(
      "Global threat reached 100, ending the campaign.",
    );
    expect(field("cities-lost")?.textContent).toBe("0 / 51");
    expect(field("cities-infested")?.textContent).toBe("51 / 51");
    expect(field("final-threat")?.textContent).toBe("100");
  });

  it("shows plain victory text for a story victory", () => {
    const base = newGame();
    const won = applyOutcome({
      ...base,
      overworld: {
        ...base.overworld,
        progress: { ...base.overworld.progress, flags: ["campaign-won"] },
      },
    }).state;
    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(won),
    }).mount(root);
    expect(field("outcome-kind")?.textContent).toBe("Victory");
    expect(field("outcome-kind")?.dataset.kind).toBe("victory");
    expect(field("outcome-tagline")?.textContent).toBe(
      "The last story mission is won. Earth holds.",
    );
    expect(
      root.querySelector<HTMLElement>(".tut-game-over__scrim")?.dataset.tone,
    ).toBe("ok");
  });

  it("words a story defeat as the failed platform, not the threat limit", () => {
    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(ended("defeat", "story")),
    }).mount(root);
    expect(field("outcome-kind")?.textContent).toBe("Assault failed");
    expect(field("outcome-tagline")?.textContent).toContain("spore platform");
    expect(
      root.querySelector<HTMLElement>(".tut-game-over__scrim")?.dataset.tone,
    ).toBe("danger");
  });

  it("still reads an old save that ended on the retired victory stub", () => {
    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(ended("victory-stub")),
    }).mount(root);
    expect(field("outcome-kind")?.textContent).toBe("Earth secured");
    expect(field("outcome-kind")?.dataset.kind).toBe("victory-stub");
    expect(field("outcome-tagline")?.textContent).toContain("old victory rule");
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
