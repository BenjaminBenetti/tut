// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Unsubscribe } from "../../core/model/event-bus";
import { ok } from "../../core/model/result";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { registerRosterCommands } from "../../overworld/service/roster-command-handlers";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { ROSTER_TUNING } from "../../roster/data/roster-tuning";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { RosterScreen } from "./roster-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

// ===========================================
// Fixtures
// ===========================================

const SQUAD_TYPE_CATALOGUE = new DataSquadTypeCatalogue(SQUAD_TYPES);
const PART_CATALOGUE = new StaticPartCatalogue(STARTER_PARTS);
const RIFLE_HIRE = SQUAD_TYPES.find((t) => t.id === "rifle")!.hireCost;

const newGame = (): GameState =>
  createNewGame(
    { seed: 1234, createdAt: "2026-09-02T12:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: SQUAD_TYPE_CATALOGUE,
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

/** Puts the first squad at `strength` and the first mech at `damage`, with `credits`. */
function scenario(
  state: GameState,
  edits: { strength?: number; damage?: number; credits?: number },
): GameState {
  return {
    ...state,
    roster: {
      ...state.roster,
      squads: state.roster.squads.map((s, i) =>
        i === 0 && edits.strength !== undefined
          ? { ...s, strength: edits.strength }
          : s,
      ),
      mechs: state.roster.mechs.map((m, i) =>
        i === 0 && edits.damage !== undefined
          ? { ...m, damage: edits.damage }
          : m,
      ),
      graveyard: [
        { kind: "squad", name: "Zulu", day: 3, missionId: "mission-1" },
        { kind: "mech", name: "Rust", day: 5, missionId: "mission-2" },
      ],
    },
    economy: {
      ...state.economy,
      credits: edits.credits ?? state.economy.credits,
    },
  };
}

/** A campaign store over the real dispatcher with the roster commands registered. */
class RealStore implements CampaignStore {
  private state: GameState;
  private readonly dispatcher = createOverworldCommandDispatcher<GameState>();
  private readonly listeners = new Set<
    StoreListener<GameState, OverworldCommand, CampaignEvent>
  >();
  constructor(state: GameState) {
    this.state = state;
    registerRosterCommands(this.dispatcher, {
      squadTypes: SQUAD_TYPE_CATALOGUE,
      parts: PART_CATALOGUE,
      rating: MECH_RATING_TUNING,
      rosterTuning: ROSTER_TUNING,
      upgrades: UPGRADE_TUNING,
      transactionsFor: (ids) => new LedgerTransactionService(ids),
    });
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
    const outcome = this.dispatcher.process(this.state, command);
    if (!outcome.ok) {
      return outcome;
    }
    this.state = outcome.value.state;
    for (const listener of [...this.listeners]) {
      listener({
        kind: "command",
        command,
        state: this.state,
        events: outcome.value.events,
      });
    }
    return ok(outcome.value);
  }
  onError(): Unsubscribe {
    return () => undefined;
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

const sessionWith = (store: CampaignStore | undefined): GameSession => ({
  store,
  state: store?.getState(),
  start: () => undefined,
  replace: () => undefined,
  clear: () => undefined,
});

const fakeRouter = (): { router: ScreenRouter; navigate: NavigateMock } => {
  const navigate: NavigateMock = vi.fn();
  return {
    router: {
      current: "roster",
      navigate,
      events: new SimpleEventBus<ScreenRouterEvents>(),
    },
    navigate,
  };
};

/** Mounts a screen over `state` and returns the store and root. */
function mountWith(
  state: GameState | undefined,
  root: HTMLElement,
): {
  store: RealStore | undefined;
  navigate: NavigateMock;
  screen: RosterScreen;
} {
  const store = state ? new RealStore(state) : undefined;
  const { router, navigate } = fakeRouter();
  const screen = new RosterScreen({
    router,
    session: sessionWith(store),
    squadTypes: SQUAD_TYPE_CATALOGUE,
    parts: PART_CATALOGUE,
    rosterTuning: ROSTER_TUNING,
  });
  screen.mount(root);
  return { store, navigate, screen };
}

// ===========================================
// Tests
// ===========================================

describe("RosterScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const q = <T extends HTMLElement>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`missing ${selector}`);
    return el;
  };
  const squadRows = (): HTMLTableRowElement[] => [
    ...root.querySelectorAll<HTMLTableRowElement>("#squad-list tbody tr"),
  ];
  const mechRows = (): HTMLTableRowElement[] => [
    ...root.querySelectorAll<HTMLTableRowElement>("#mech-list tbody tr"),
  ];
  const status = (): HTMLElement => q('[data-role="status"]');

  it("lays out the bar and the three panels from the campaign", () => {
    const state = scenario(newGame(), { strength: 3, damage: 40 });
    mountWith(state, root);
    expect(root.querySelector('[data-screen="roster"]')).not.toBeNull();
    expect(q('#roster-bar [data-field="credits"]').textContent).toBe("¢5,000");
    expect(squadRows()).toHaveLength(state.roster.squads.length);
    expect(mechRows()).toHaveLength(state.roster.mechs.length);

    const first = squadRows()[0]!;
    expect(first.querySelector('[data-field="type"]')?.textContent).toBe(
      "Rifle Squad",
    );
    expect(first.querySelector('[data-field="strength"]')?.textContent).toBe(
      "3 / 5",
    );
    expect(
      first.querySelector<HTMLButtonElement>('[data-action="reinforce"]')
        ?.textContent,
    ).toBe("Reinforce ¢160");

    const mech = mechRows()[0]!;
    expect(mech.querySelector('[data-field="loadout"]')?.textContent).toContain(
      "Vanguard",
    );
    expect(mech.querySelector('[data-field="damage"]')?.textContent).toContain(
      "40",
    );
    expect(
      mech.querySelector<HTMLButtonElement>('[data-action="repair"]')
        ?.textContent,
    ).toBe("Repair ¢400");

    const graves = [...root.querySelectorAll("#graveyard li")];
    expect(graves.map((g) => g.textContent)).toEqual([
      "Rust · mech · day 5 · mission-2",
      "Zulu · squad · day 3 · mission-1",
    ]);
    expect(q('[data-role="no-losses"]').hidden).toBe(true);
    expect(q<HTMLButtonElement>('[data-action="mech-bay"]').disabled).toBe(
      false,
    );
  });

  it("hires a squad through the store: one more row and credits drop by the hire cost", () => {
    const { store } = mountWith(newGame(), root);
    const before = squadRows().length;
    q<HTMLInputElement>('[data-field="hire-name"]').value = "Echo";
    q<HTMLButtonElement>('[data-action="hire"]').click();
    expect(squadRows()).toHaveLength(before + 1);
    expect(
      squadRows().at(-1)?.querySelector('[data-field="name"]')?.textContent,
    ).toBe("Echo");
    expect(store?.getState().economy.credits).toBe(5000 - RIFLE_HIRE);
    expect(q('#roster-bar [data-field="credits"]').textContent).toBe(
      `¢${(5000 - RIFLE_HIRE).toLocaleString("en-US")}`,
    );
    expect(status().hidden).toBe(true);
  });

  it("names a hired squad after its type, numbered per type, when the field is blank", () => {
    mountWith(newGame(), root);
    q<HTMLButtonElement>('[data-action="hire"]').click();
    expect(
      squadRows().at(-1)?.querySelector('[data-field="name"]')?.textContent,
    ).toBe("Rifle Squad 3");
  });

  it("reinforces a depleted squad to full for the shown price", () => {
    const { store } = mountWith(scenario(newGame(), { strength: 3 }), root);
    squadRows()[0]!
      .querySelector<HTMLButtonElement>('[data-action="reinforce"]')!
      .click();
    expect(
      squadRows()[0]?.querySelector('[data-field="strength"]')?.textContent,
    ).toBe("5 / 5");
    expect(
      squadRows()[0]?.querySelector<HTMLButtonElement>(
        '[data-action="reinforce"]',
      )?.disabled,
    ).toBe(true);
    expect(store?.getState().economy.credits).toBe(5000 - 160);
  });

  it("repairs a damaged mech and renames it", () => {
    const { store } = mountWith(scenario(newGame(), { damage: 40 }), root);
    mechRows()[0]!
      .querySelector<HTMLButtonElement>('[data-action="repair"]')!
      .click();
    expect(store?.getState().roster.mechs[0]?.damage).toBe(0);
    expect(store?.getState().economy.credits).toBe(5000 - 400);
    expect(
      mechRows()[0]?.querySelector<HTMLButtonElement>('[data-action="repair"]')
        ?.disabled,
    ).toBe(true);

    const input = mechRows()[0]!.querySelector<HTMLInputElement>(
      '[data-field="rename"]',
    )!;
    const rename = mechRows()[0]!.querySelector<HTMLButtonElement>(
      '[data-action="rename"]',
    )!;
    expect(rename.disabled).toBe(true);
    input.value = "Hammerfall";
    input.dispatchEvent(new Event("input"));
    expect(rename.disabled).toBe(false);
    rename.click();
    expect(store?.getState().roster.mechs[0]?.name).toBe("Hammerfall");
    expect(
      mechRows()[0]?.querySelector<HTMLInputElement>('[data-field="rename"]')
        ?.value,
    ).toBe("Hammerfall");
  });

  it("disables hire, reinforce and repair when unaffordable", () => {
    mountWith(
      scenario(newGame(), { strength: 3, damage: 40, credits: 100 }),
      root,
    );
    expect(q<HTMLButtonElement>('[data-action="hire"]').disabled).toBe(true);
    expect(
      squadRows()[0]?.querySelector<HTMLButtonElement>(
        '[data-action="reinforce"]',
      )?.disabled,
    ).toBe(true);
    expect(
      mechRows()[0]?.querySelector<HTMLButtonElement>('[data-action="repair"]')
        ?.disabled,
    ).toBe(true);
  });

  it("shows a rejected command in the status line instead of throwing", () => {
    const { store } = mountWith(newGame(), root);
    // Drain the treasury behind the screen's back, then force the stale button.
    while (store!.getState().economy.credits >= RIFLE_HIRE) {
      store!.dispatch({
        type: "roster:hire-squad",
        payload: { typeId: "rifle", name: "Filler" },
      });
    }
    const hire = q<HTMLButtonElement>('[data-action="hire"]');
    expect(hire.disabled).toBe(true);
    hire.disabled = false;
    hire.click();
    expect(status().hidden).toBe(false);
    expect(status().textContent).toContain("credits");
  });

  it("Overworld navigates back and unmount unsubscribes and clears the DOM", () => {
    const { store, navigate, screen } = mountWith(newGame(), root);
    q<HTMLButtonElement>('[data-action="mech-bay"]').click();
    expect(navigate).toHaveBeenCalledWith("mech-bay");
    q<HTMLButtonElement>('[data-action="overworld"]').click();
    expect(navigate).toHaveBeenCalledWith("overworld");
    expect(store?.listenerCount).toBe(1);
    screen.unmount();
    expect(store?.listenerCount).toBe(0);
    expect(root.childElementCount).toBe(0);
  });

  it("notes when no campaign is active", () => {
    mountWith(undefined, root);
    expect(status().hidden).toBe(false);
    expect(status().textContent).toBe("No active campaign.");
    expect(q('#roster-bar [data-field="credits"]').textContent).toBe("—");
  });
});
