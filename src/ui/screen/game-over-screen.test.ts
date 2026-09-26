// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { GameOutcome } from "../../overworld/model/game-outcome";
import type { CampaignState } from "../../overworld/model/campaign-state";
import {
  firstAttemptVictory,
  lastHopeVictory,
  storyDefeat,
  threatDefeatInActTwo,
} from "../../overworld/service/outcome-chronicle-fixtures.test-helper";
import { applyOutcome } from "../../overworld/service/outcome-service";
import { computeThreat } from "../../overworld/service/threat-service";
import { RANKS } from "../../roster/data/ranks";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import { VICTORY_ART } from "../service/outcome-copy";
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

/**
 * A new game ended the way `campaign` ends: the outcome the real
 * outcome service freezes for that campaign, chronicle and all.
 */
const endedAs = (campaign: CampaignState): GameState => {
  const outcome = applyOutcome(campaign).state.overworld.outcome;
  if (outcome === undefined) {
    throw new Error("the fixture campaign did not end");
  }
  const base = newGame();
  return {
    ...base,
    overworld: { ...base.overworld, day: outcome.day, outcome },
  };
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
    // The key art shows the platform, which this spine never met.
    expect(root.querySelector('[data-role="outcome-art"]')).toBeNull();
  });

  it("words a story defeat as the failed platform, not the threat limit", () => {
    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(ended("defeat", "story")),
    }).mount(root);
    expect(field("outcome-kind")?.textContent).toBe("Assault failed");
    expect(field("outcome-tagline")?.textContent).toBe(
      "The Spore Platform assault failed a second time. There is no third: the Earth is lost.",
    );
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

// ===========================================
// The chronicle
// ===========================================

describe("GameOverScreen: the chronicle", () => {
  let root: HTMLElement;
  const field = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const acts = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>(".tut-chronicle__act"),
  ];
  const actText = (row: HTMLElement, name: string): string =>
    row.querySelector<HTMLElement>(`[data-field="${name}"]`)?.textContent ?? "";
  const mount = (state: GameState): void => {
    new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(state),
      baseUrl: "/tut/",
      ranks: RANKS,
    }).mount(root);
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("tells a first-attempt victory over the key art", () => {
    mount(endedAs(firstAttemptVictory()));
    expect(field("outcome-kind")?.textContent).toBe("Victory");
    expect(field("outcome-tagline")?.textContent).toBe(
      "The platform burns in orbit. Earth holds.",
    );
    const panel = root.querySelector<HTMLElement>('[data-screen="game-over"]');
    expect(panel?.dataset.variant).toBe("platform");
    expect(panel?.dataset.art).toBe("key-art");
    expect(
      root
        .querySelector<HTMLImageElement>('[data-role="outcome-art"]')
        ?.getAttribute("src"),
    ).toBe(`/tut/${VICTORY_ART}`);
  });

  it("tells a finale victory frozen without its attempts as the platform's, over the art", () => {
    const base = newGame();
    const won = applyOutcome({
      ...base,
      overworld: {
        ...base.overworld,
        progress: {
          ...base.overworld.progress,
          act: "finale",
          flags: ["campaign-won"],
        },
      },
    }).state;
    expect(won.overworld.outcome?.summary).not.toHaveProperty(
      "platformAttempts",
    );
    mount(won);
    expect(field("outcome-tagline")?.textContent).toBe(
      "The platform burns in orbit. Earth holds.",
    );
    expect(root.querySelector('[data-role="outcome-art"]')).not.toBeNull();
  });

  it("tells a Last Hope victory as the last chance holding", () => {
    mount(endedAs(lastHopeVictory()));
    expect(field("outcome-kind")?.textContent).toBe("Victory");
    expect(field("outcome-tagline")?.textContent).toBe(
      "The last chance held. Earth holds.",
    );
    expect(
      root.querySelector<HTMLElement>('[data-screen="game-over"]')?.dataset
        .variant,
    ).toBe("last-hope");
    expect(root.querySelector('[data-role="outcome-art"]')).not.toBeNull();
  });

  it("lists every act in order with its span in days and missions, and what ended it", () => {
    mount(endedAs(firstAttemptVictory()));
    expect(acts().map((row) => row.dataset.act)).toEqual([
      "act-1",
      "act-2",
      "act-3",
      "finale",
    ]);
    expect(acts().map((row) => actText(row, "act-span"))).toEqual([
      "Days 1–14 · Missions 1–12",
      "Days 14–38 · Missions 13–32",
      "Days 38–60 · Missions 33–47",
      "Days 60–67 · Missions 48–50",
    ]);
    expect(acts().map((row) => actText(row, "act-end"))).toEqual([
      "Ended by Live Specimen · day 14",
      "Ended by Intact Pod · day 38",
      "Ended by Launch Window · day 60",
      "Ended by Spore Platform · day 66",
    ]);
  });

  it("gives the final numbers from the campaign's own count", () => {
    const state = endedAs(firstAttemptVictory());
    mount(state);
    // The fixture's map: four cities, one lost.
    expect(state.overworld.outcome?.summary).toMatchObject({
      citiesTotal: 4,
      citiesLost: 1,
      missionsRun: 0,
    });
    expect(field("day")?.textContent).toBe("67");
    expect(field("missions-run")?.textContent).toBe("50");
    expect(field("missions-won")?.textContent).toBe("41 won");
    expect(field("final-threat")?.textContent).toBe("52");
    expect(field("cities-lost")?.textContent).toBe("1 / 4");
    expect(field("cities-saved")?.textContent).toBe("3 / 4");
  });

  it("rolls the squad with ranks, and says what became of each nemesis", () => {
    mount(endedAs(firstAttemptVictory()));
    const roll = [
      ...root.querySelectorAll<HTMLElement>(".tut-roll__entry"),
    ].map((entry) => [
      actText(entry, "roll-name"),
      actText(entry, "roll-role"),
      actText(entry, "roll-record"),
    ]);
    expect(roll).toEqual([
      ["Hammerhead", "Mech · Sergeant Major", "64 kills · 44 missions"],
      ["Lantern", "Mech · Sergeant First Class", "19 kills · 15 missions"],
      ["Alpha", "Squad · Master Sergeant", "23 kills · 31 missions"],
    ]);
    expect(
      [...root.querySelectorAll<HTMLElement>(".tut-nemeses__fate")].map(
        (fate) => fate.textContent,
      ),
    ).toEqual(["Old Scald: killed on day 52", "Grey Widow: still out there"]);
  });

  it("gives a threat defeat the same chronicle, the act it stopped marked", () => {
    mount(endedAs(threatDefeatInActTwo()));
    expect(field("outcome-kind")?.textContent).toBe("Threat limit reached");
    expect(root.querySelector('[data-role="outcome-art"]')).toBeNull();
    expect(
      root.querySelector<HTMLElement>(".tut-game-over__scrim")?.dataset.tone,
    ).toBe("danger");
    expect(acts().map((row) => row.dataset.act)).toEqual(["act-1", "act-2"]);
    expect(acts().map((row) => row.dataset.ended)).toEqual(["won", "defeat"]);
    const last = acts().at(-1);
    expect(last && actText(last, "act-span")).toBe(
      "Days 14–29 · Missions 13–24",
    );
    expect(last && actText(last, "act-end")).toBe("The campaign ended here.");
    expect(field("missions-run")?.textContent).toBe("24");
    expect(
      root.querySelector<HTMLElement>(".tut-nemeses__fate")?.textContent,
    ).toBe("Old Scald: still out there");
  });

  it("reads a story defeat as the platform holding, over the whole chronicle", () => {
    mount(endedAs(storyDefeat()));
    expect(field("outcome-kind")?.textContent).toBe("Assault failed");
    expect(field("outcome-tagline")?.textContent).toBe(
      "The Spore Platform assault failed a second time. There is no third: the Earth is lost.",
    );
    expect(root.querySelector('[data-role="outcome-art"]')).toBeNull();
    expect(acts().map((row) => row.dataset.act)).toEqual([
      "act-1",
      "act-2",
      "act-3",
      "finale",
    ]);
    expect(acts().at(-1)?.dataset.ended).toBe("defeat");
  });

  it("renders an outcome saved before the chronicle with its numbers alone", () => {
    mount(ended("victory"));
    expect(field("outcome-kind")?.textContent).toBe("Victory");
    expect(field("outcome-tagline")?.textContent).toBe(
      "The last story mission is won. Earth holds.",
    );
    expect(field("missions-run")?.textContent).toBe("5");
    expect(field("missions-won")).toBeNull();
    expect(field("cities-saved")?.textContent).toBe(
      `${String(EARTH_MAP.cities.length - 3)} / ${String(EARTH_MAP.cities.length)}`,
    );
    expect(root.querySelector('[data-role="chronicle"]')).toBeNull();
    expect(root.querySelector('[data-role="squad-roll"]')).toBeNull();
    expect(root.querySelector('[data-role="nemeses"]')).toBeNull();
    expect(root.querySelector('[data-role="outcome-art"]')).toBeNull();
    expect(root.querySelector('[data-action="main-menu"]')).not.toBeNull();
  });

  it("keeps one way out, and unmount removes the art and the chronicle", () => {
    const screen = new GameOverScreen({
      router: fakeRouter().router,
      session: sessionWith(endedAs(firstAttemptVictory())),
    });
    screen.mount(root);
    expect(root.querySelectorAll("button")).toHaveLength(1);
    expect(
      root
        .querySelector<HTMLImageElement>('[data-role="outcome-art"]')
        ?.getAttribute("src"),
    ).toBe(`/${VICTORY_ART}`);
    screen.unmount();
    expect(root.children).toHaveLength(0);
  });
});
