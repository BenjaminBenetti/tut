// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { commandError } from "../../core/model/command-error";
import type { Unsubscribe } from "../../core/model/event-bus";
import { err, ok } from "../../core/model/result";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ADVANCE_DAY } from "../../overworld/model/advance-day-command";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { MissionResult } from "../../overworld/model/mission-result";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import type { GameState } from "../../save/model/game-state";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { campaignOnDay } from "../view/mission-fixtures.test-helper";
import { MissionResultsScreen } from "./mission-results-screen";

// ===========================================
// Fixtures
// ===========================================

/** A store whose only command bumps the day, refusing once `fail` is set. */
class FakeStore implements CampaignStore {
  private state: GameState;
  fail = false;
  readonly dispatched: string[] = [];
  private readonly listeners = new Set<
    StoreListener<GameState, OverworldCommand, CampaignEvent>
  >();
  constructor(state: GameState) {
    this.state = state;
  }
  getState(): GameState {
    return this.state;
  }
  subscribe(
    listener: StoreListener<GameState, OverworldCommand, CampaignEvent>,
  ): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispatch(command: OverworldCommand) {
    this.dispatched.push(command.type);
    if (this.fail || command.type !== ADVANCE_DAY) {
      return err(commandError("campaign-over", "The campaign has ended"));
    }
    this.state = {
      ...this.state,
      overworld: { ...this.state.overworld, day: this.state.overworld.day + 1 },
    };
    return ok({ state: this.state, events: [] });
  }
  onError(): Unsubscribe {
    return () => undefined;
  }
}

const sessionWith = (store: FakeStore | undefined): GameSession => ({
  store,
  get state() {
    return store?.getState();
  },
  start: () => undefined,
  replace: () => undefined,
  clear: () => undefined,
});

const fakeRouter = (): {
  router: ScreenRouter;
  navigate: Mock<(id: ScreenId) => void>;
} => {
  const navigate: Mock<(id: ScreenId) => void> = vi.fn();
  return {
    router: {
      current: "mission-results",
      navigate,
      events: new SimpleEventBus<ScreenRouterEvents>(),
    },
    navigate,
  };
};

const RESULT: MissionResult = {
  missionId: "mission-1",
  // A real city from EARTH_MAP, so the lookup resolves a name rather
  // than falling back — "city-1" would have passed a weaker assertion
  // while proving nothing (#739).
  cityId: "vancouver",
  outcome: "extracted",
  squadCasualties: [
    { squadId: "squad-1", losses: 2 },
    { squadId: "squad-2", losses: 5 },
    { squadId: "squad-3", losses: 0 },
  ],
  squadsWiped: ["squad-2"],
  mechsDestroyed: ["mech-1"],
  mechDamage: [
    { mechId: "mech-1", damage: 100 },
    { mechId: "mech-2", damage: 35 },
  ],
  creditsAwarded: 900,
  infestationDelta: -20,
};

/**
 * A campaign after the casualties of `RESULT` were applied: squad-2 and
 * mech-1 are gone and in the graveyard, squad-1 is down to 3, mech-2 is
 * at 35 damage, and a second mech survives unhurt.
 */
function afterMission(): GameState {
  const base = campaignOnDay(5, []);
  const [alpha, bravo] = base.roster.squads;
  const [hammerhead] = base.roster.mechs;
  if (!alpha || !bravo || !hammerhead)
    throw new Error("fixture roster too small");
  return {
    ...base,
    roster: {
      ...base.roster,
      squads: [
        { ...alpha, id: "squad-1", strength: 3 },
        { ...bravo, id: "squad-3", name: "Charlie", strength: 5 },
      ],
      mechs: [{ ...hammerhead, id: "mech-2", name: "Anvil", damage: 35 }],
      graveyard: [
        { kind: "squad", name: "Old Guard", day: 2, missionId: "mission-0" },
        { kind: "squad", name: bravo.name, day: 5, missionId: "mission-1" },
        { kind: "mech", name: hammerhead.name, day: 5, missionId: "mission-1" },
      ],
    },
    overworld: { ...base.overworld, lastMissionResult: RESULT },
  };
}

// ===========================================
// Tests
// ===========================================

describe("MissionResultsScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const field = (name: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`[data-field="${name}"]`);
    if (!el) throw new Error(`missing field ${name}`);
    return el;
  };
  const items = (name: string): string[] =>
    [...field(name).querySelectorAll("li")].map((li) => li.textContent ?? "");

  it("renders the banner, top-bills destroyed mechs, and names every loss from the graveyard and roster", () => {
    const store = new FakeStore(afterMission());
    new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);

    expect(field("outcome").textContent).toBe("Force extracted");
    expect(field("outcome").dataset.tone).toBe("warn");
    // The debrief names what the mission list named, not the internal
    // id it happens to carry (#739).
    expect(field("mission-city").textContent).toBe("Vancouver");
    // And no id reaches the player through any route on this screen —
    // the heading is where `mission-1` used to appear, but asserting the
    // city alone would not notice one arriving somewhere else.
    expect(root.textContent).not.toContain("mission-1");

    const sections = [
      ...root.querySelectorAll<HTMLElement>(".tut-mission-results__section"),
    ].map((s) => s.dataset.field);
    expect(sections).toEqual([
      "mechs-destroyed",
      "squads-wiped",
      "casualties",
      "mech-damage",
    ]);
    expect(
      field("mechs-destroyed").classList.contains(
        "tut-mission-results__section--prominent",
      ),
    ).toBe(true);
    expect(items("mechs-destroyed")).toEqual(["Hammerhead"]);
    expect(items("squads-wiped")).toEqual(["Bravo"]);
    expect(items("casualties")).toEqual(["Alpha −2 (3/5)"]);
    expect(items("mech-damage")).toEqual(["Anvil +35 (35/100)"]);
    expect(field("credits").textContent).toBe("¢900");
    expect(field("infestation-delta").textContent).toBe("-20");
  });

  it("does not raise the alarm on a debrief with nothing to mourn", () => {
    // "Mechs destroyed" earns top billing when a mech is destroyed. It
    // was applied whatever the content, so a clean extraction opened
    // with a red bar, a red heading and 1.15em type reading "No mechs
    // lost." -- the loudest thing on the screen announcing the worst,
    // then denying it.
    const clean = afterMission();
    const store = new FakeStore({
      ...clean,
      overworld: {
        ...clean.overworld,
        lastMissionResult: { ...RESULT, mechsDestroyed: [] },
      },
    });
    new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    const section = field("mechs-destroyed");
    expect(section.dataset.count).toBe("0");
    expect(
      section.classList.contains("tut-mission-results__section--prominent"),
    ).toBe(false);
    expect(section.querySelector(".tut-mission-results__loss")).toBeNull();
    expect(section.textContent).toContain("No mechs lost.");
  });

  it("does not say there were no casualties on a mission that wiped the force (#480)", () => {
    const state = afterMission();
    // Everything died: both squads wiped, the mech destroyed. Each is
    // listed in its own row, so the casualty and damage rows are empty —
    // and their empty note has to say so rather than deny the losses.
    const store = new FakeStore({
      ...state,
      overworld: {
        ...state.overworld,
        lastMissionResult: {
          ...RESULT,
          outcome: "lost",
          squadCasualties: [
            { squadId: "squad-1", losses: 5 },
            { squadId: "squad-2", losses: 5 },
          ],
          squadsWiped: ["squad-1", "squad-2"],
          mechsDestroyed: ["mech-1"],
          mechDamage: [{ mechId: "mech-1", damage: 100 }],
        },
      },
    });
    new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);

    expect(items("squads-wiped")).toHaveLength(2);
    expect(items("mechs-destroyed")).toHaveLength(1);
    // The rows are empty because their losses are listed above, not
    // because nothing was lost.
    expect(field("casualties").querySelector(".tut-dim")?.textContent).toBe(
      "No further casualties.",
    );
    expect(field("mech-damage").querySelector(".tut-dim")?.textContent).toBe(
      "No damage among surviving mechs.",
    );
    expect(field("casualties").querySelector(".tut-dim")?.textContent).not.toBe(
      "No casualties.",
    );
  });

  it("says whose casualties a row covers when some squads are not among them (#480)", () => {
    const state = afterMission();
    // Bravo was wiped, Alpha took two losses. Seven soldiers are gone,
    // and an unqualified "Casualties: Alpha −2" reads as two.
    const store = new FakeStore({
      ...state,
      overworld: { ...state.overworld, lastMissionResult: RESULT },
    });
    new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    expect(field("casualties").querySelector(".tut-label")?.textContent).toBe(
      "Casualties (surviving squads)",
    );
    expect(field("mech-damage").querySelector(".tut-label")?.textContent).toBe(
      "Mech damage (surviving mechs)",
    );
  });

  it("still says plainly that nothing was lost when nothing was", () => {
    const state = afterMission();
    const store = new FakeStore({
      ...state,
      overworld: {
        ...state.overworld,
        lastMissionResult: {
          ...RESULT,
          outcome: "won",
          squadCasualties: [],
          squadsWiped: [],
          mechsDestroyed: [],
          mechDamage: [],
        },
      },
    });
    new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    expect(field("casualties").querySelector(".tut-dim")?.textContent).toBe(
      "No casualties.",
    );
    expect(field("mech-damage").querySelector(".tut-dim")?.textContent).toBe(
      "No damage taken.",
    );
    // Nothing was lost, so nothing needs qualifying.
    expect(field("casualties").querySelector(".tut-label")?.textContent).toBe(
      "Casualties",
    );
    expect(field("mech-damage").querySelector(".tut-label")?.textContent).toBe(
      "Mech damage",
    );
  });

  it("shows empty notes for a clean win and a positive infestation sign", () => {
    const state = afterMission();
    const store = new FakeStore({
      ...state,
      overworld: {
        ...state.overworld,
        lastMissionResult: {
          ...RESULT,
          outcome: "won",
          squadCasualties: [],
          squadsWiped: [],
          mechsDestroyed: [],
          mechDamage: [],
          infestationDelta: 5,
        },
      },
    });
    new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    expect(field("outcome").textContent).toBe("Mission accomplished");
    expect(field("outcome").dataset.tone).toBe("ok");
    for (const name of [
      "mechs-destroyed",
      "squads-wiped",
      "casualties",
      "mech-damage",
    ]) {
      expect(field(name).dataset.count).toBe("0");
      expect(field(name).querySelector("ul")).toBeNull();
      expect(field(name).querySelector(".tut-dim")).not.toBeNull();
    }
    expect(field("infestation-delta").textContent).toBe("+5");
  });

  it("falls back to ids when neither the roster nor the graveyard names a loss", () => {
    const state = afterMission();
    const store = new FakeStore({
      ...state,
      roster: { ...state.roster, graveyard: [] },
    });
    new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    expect(items("mechs-destroyed")).toEqual(["mech-1"]);
    expect(items("squads-wiped")).toEqual(["squad-2"]);
  });

  it("Continue advances the day through the store, then routes to the overworld", () => {
    const store = new FakeStore(afterMission());
    const { router, navigate } = fakeRouter();
    new MissionResultsScreen({ router, session: sessionWith(store) }).mount(
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-action="continue"]')?.click();
    expect(store.dispatched).toEqual([ADVANCE_DAY]);
    expect(store.getState().overworld.day).toBe(6);
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("still returns to the overworld when the tick is refused, showing why", () => {
    const store = new FakeStore(afterMission());
    store.fail = true;
    const { router, navigate } = fakeRouter();
    new MissionResultsScreen({ router, session: sessionWith(store) }).mount(
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-action="continue"]')?.click();
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("ended");
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("says so when nothing has been resolved and unmounts cleanly", () => {
    const screen = new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(campaignOnDay(1, []))),
    });
    screen.mount(root);
    expect(field("outcome").textContent).toBe("No result");
    screen.unmount();
    expect(root.children).toHaveLength(0);
  });
});

// ===========================================
// Reward prominence (#740)
// ===========================================

describe("MissionResultsScreen payout prominence", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  /** Mounts the screen over a result and returns the panel's field order. */
  function mountWith(overrides: Partial<MissionResult>): HTMLElement {
    const state = afterMission();
    const store = new FakeStore({
      ...state,
      overworld: {
        ...state.overworld,
        lastMissionResult: { ...RESULT, outcome: "won", ...overrides },
      },
    });
    new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    return root;
  }

  /** Index of a `data-field` block among the panel's children, in reading order. */
  function orderOf(container: HTMLElement, field: string): number {
    const blocks = [...container.querySelectorAll("[data-field]")];
    return blocks.findIndex(
      (block) => (block as HTMLElement).dataset.field === field,
    );
  }

  // The reward is what the mission was for. On a mission that cost
  // nothing it used to sit under four sections all reporting that
  // nothing bad happened.
  it("reads the payout before the loss sections when nothing was lost", () => {
    const panel = mountWith({
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
    });
    const rewards = panel.querySelector<HTMLElement>('[data-field="rewards"]');
    expect(rewards?.dataset.promoted).toBe("true");
    expect(orderOf(panel, "rewards")).toBeLessThan(
      orderOf(panel, "mechs-destroyed"),
    );
    expect(orderOf(panel, "rewards")).toBeLessThan(
      orderOf(panel, "casualties"),
    );
  });

  // The case GDD §5.8 cares about, and the one a promotion could
  // regress. Asserted rather than assumed, as the ticket asks.
  it("keeps a destroyed mech ahead of the payout", () => {
    const panel = mountWith({
      squadsWiped: [],
      mechsDestroyed: ["mech-1"],
    });
    const rewards = panel.querySelector<HTMLElement>('[data-field="rewards"]');
    expect(rewards?.dataset.promoted).toBe("false");
    expect(orderOf(panel, "mechs-destroyed")).toBeLessThan(
      orderOf(panel, "rewards"),
    );
    // And the loss keeps its alarm.
    expect(
      panel
        .querySelector('[data-field="mechs-destroyed"]')
        ?.className.includes("--prominent"),
    ).toBe(true);
  });

  // A wiped squad is a loss too. Promoting a payout over it would be
  // the same inversion, smaller only because a squad is cheaper.
  it("keeps a wiped squad ahead of the payout, with no mech lost", () => {
    const panel = mountWith({
      squadsWiped: ["squad-2"],
      mechsDestroyed: [],
    });
    const rewards = panel.querySelector<HTMLElement>('[data-field="rewards"]');
    expect(rewards?.dataset.promoted).toBe("false");
    expect(orderOf(panel, "squads-wiped")).toBeLessThan(
      orderOf(panel, "rewards"),
    );
  });

  // Size says "this matters", colour says whether it is good news. A
  // mission can cost nothing and still leave the city worse, and a rise
  // shouted in the winning green would be the screen lying pleasantly.
  it("colours a promoted infestation rise as bad news, not good", () => {
    const worse = mountWith({
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
      infestationDelta: 5,
    });
    expect(
      worse
        .querySelector('[data-field="infestation-delta"]')
        ?.className.includes("payout-value--bad"),
    ).toBe(true);
    // The payment beside it is still good news.
    expect(
      worse
        .querySelector('[data-field="credits"]')
        ?.className.includes("payout-value--good"),
    ).toBe(true);
    root.innerHTML = "";

    const better = mountWith({
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
      infestationDelta: -16,
    });
    expect(
      better
        .querySelector('[data-field="infestation-delta"]')
        ?.className.includes("payout-value--good"),
    ).toBe(true);
  });

  it("shows the same numbers either way", () => {
    const clean = mountWith({
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
    });
    const cleanCredits = clean.querySelector<HTMLElement>(
      '[data-field="credits"]',
    )?.textContent;
    root.innerHTML = "";
    const costly = mountWith({ mechsDestroyed: ["mech-1"] });
    expect(
      costly.querySelector<HTMLElement>('[data-field="credits"]')?.textContent,
    ).toBe(cleanCredits);
  });
});
