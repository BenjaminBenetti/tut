// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Unsubscribe } from "../../core/model/event-bus";
import { err, ok } from "../../core/model/result";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { TechPointTreasury } from "../../economy/service/tech-point-service";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { registerTechCommands } from "../../overworld/service/tech-command-handlers";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { TECH_FAMILY_IDS } from "../../tech/model/tech-node";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { TechTreeScreen } from "./tech-tree-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);
const TECH = new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES));

const newGame = (): GameState =>
  createNewGame(
    { seed: 1234, createdAt: "2026-09-02T12:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

/**
 * A campaign that exercises every status at once: 20 TP in the pool,
 * All-Terrain Actuators bought. Jump Jets (18) is available, Sprint
 * Frame (40, needs All-Terrain) is unaffordable, Siege Railgun (needs
 * Railgun) is locked, All-Terrain is unlocked.
 */
const fixture = (): GameState => {
  const base = newGame();
  return {
    ...base,
    economy: { ...base.economy, techPoints: 20 },
    tech: { unlocked: ["tech.all-terrain"] },
  };
};

/** A campaign store over the real dispatcher with the tech commands registered. */
class RealStore implements CampaignStore {
  private state: GameState;
  private readonly dispatcher = createOverworldCommandDispatcher<GameState>();
  private readonly listeners = new Set<
    StoreListener<GameState, OverworldCommand, CampaignEvent>
  >();
  constructor(state: GameState) {
    this.state = state;
    registerTechCommands(this.dispatcher, {
      catalogue: TECH,
      techPoints: new TechPointTreasury(),
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

/** A store that refuses every command with one message. */
class RejectingStore implements CampaignStore {
  constructor(private readonly state: GameState) {}
  getState(): GameState {
    return this.state;
  }
  subscribe(): Unsubscribe {
    return () => undefined;
  }
  dispatch() {
    return err({ code: "insufficient-tech-points", message: "Not enough TP" });
  }
  onError(): Unsubscribe {
    return () => undefined;
  }
}

const sessionWith = (store: CampaignStore | undefined): GameSession => ({
  store,
  get state() {
    return store?.getState();
  },
  start: () => undefined,
  replace: () => undefined,
  clear: () => undefined,
});

/** Mounts the screen over `store`. */
function mountWith(
  store: CampaignStore | undefined,
  root: HTMLElement,
): { navigate: NavigateMock; screen: TechTreeScreen } {
  const navigate: NavigateMock = vi.fn();
  const router: ScreenRouter = {
    current: "tech-tree",
    navigate,
    events: new SimpleEventBus<ScreenRouterEvents>(),
  };
  const screen = new TechTreeScreen({
    router,
    session: sessionWith(store),
    tech: TECH,
    parts: PARTS,
  });
  screen.mount(root);
  return { navigate, screen };
}

// ===========================================
// Tests
// ===========================================

describe("TechTreeScreen", () => {
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
  const card = (nodeId: string): HTMLElement => q(`[data-node="${nodeId}"]`);
  const unlockButton = (nodeId: string): HTMLButtonElement =>
    q(`[data-node="${nodeId}"] [data-action="unlock"]`);
  const reason = (nodeId: string): HTMLElement =>
    q(`[data-node="${nodeId}"] [data-field="reason"]`);
  const balance = (): string =>
    q('#tech-tree-bar [data-field="techPoints"]').textContent ?? "";
  const status = (): HTMLElement => q('#tech-tree-bar [data-role="status"]');

  it("draws one column per family in tree order with every node under its tier", () => {
    mountWith(new RealStore(fixture()), root);
    expect(q('[data-screen="tech-tree"]')).toBeDefined();
    const families = [
      ...root.querySelectorAll<HTMLElement>("[data-family]"),
    ].map((column) => column.dataset.family);
    expect(families).toEqual([...TECH_FAMILY_IDS]);
    expect(root.querySelectorAll("[data-node]")).toHaveLength(
      TECH_NODES.length,
    );
    // Each card sits in its family's column, in the row of its tier.
    for (const node of TECH_NODES) {
      const column = card(node.id).closest<HTMLElement>("[data-family]");
      expect(column?.dataset.family).toBe(node.family);
      const row = card(node.id).closest<HTMLElement>("[data-tier]");
      expect(row?.dataset.tier).toBe(String(node.tier));
    }
    // The family's name and description head the column.
    const mobility = q('[data-family="mobility"]');
    expect(mobility.textContent).toContain(TECH_FAMILIES.mobility.name);
    expect(mobility.textContent).toContain(TECH_FAMILIES.mobility.description);
  });

  it("shows each card's name, cost, description and the parts it unlocks", () => {
    mountWith(new RealStore(fixture()), root);
    const jump = card("tech.jump-jets");
    expect(jump.querySelector('[data-field="name"]')?.textContent).toBe(
      "Jump Jets",
    );
    expect(jump.querySelector('[data-field="cost"]')?.textContent).toBe(
      "18 TP",
    );
    expect(jump.querySelector('[data-field="description"]')?.textContent).toBe(
      TECH.getNode("tech.jump-jets")?.description,
    );
    const unlocks = [
      ...jump.querySelectorAll<HTMLElement>('[data-field="unlocks"] li'),
    ];
    expect(unlocks.map((item) => item.dataset.partId)).toEqual(["legs-jumper"]);
    expect(unlocks.map((item) => item.textContent)).toEqual(["Jumper Legs"]);
  });

  it("classifies every card against the pool and the tree, and shows the balance", () => {
    mountWith(new RealStore(fixture()), root);
    expect(balance()).toBe("20 TP");
    expect(card("tech.all-terrain").dataset.status).toBe("unlocked");
    expect(unlockButton("tech.all-terrain").hidden).toBe(true);

    expect(card("tech.jump-jets").dataset.status).toBe("available");
    expect(unlockButton("tech.jump-jets").disabled).toBe(false);
    expect(reason("tech.jump-jets").hidden).toBe(true);

    expect(card("tech.sprint-frame").dataset.status).toBe("unaffordable");
    expect(unlockButton("tech.sprint-frame").disabled).toBe(true);
    expect(reason("tech.sprint-frame").textContent).toBe("Need 20 more TP");

    expect(card("tech.siege-railgun").dataset.status).toBe("locked");
    expect(unlockButton("tech.siege-railgun").disabled).toBe(true);
    expect(reason("tech.siege-railgun").textContent).toBe("Requires Railgun");
  });

  it("Unlock dispatches the command: the balance drops and the card flips to unlocked", () => {
    const store = new RealStore(fixture());
    mountWith(store, root);
    unlockButton("tech.jump-jets").click();
    expect(store.getState().tech.unlocked).toContain("tech.jump-jets");
    expect(store.getState().economy.techPoints).toBe(2);
    expect(balance()).toBe("2 TP");
    expect(card("tech.jump-jets").dataset.status).toBe("unlocked");
    expect(unlockButton("tech.jump-jets").hidden).toBe(true);
    // The pool is now too small for the other tier 2 rungs.
    expect(card("tech.railgun").dataset.status).toBe("unaffordable");
    expect(reason("tech.railgun").textContent).toBe("Need 16 more TP");
    expect(status().hidden).toBe(true);
  });

  it("a rejected command lands in the status line", () => {
    mountWith(new RejectingStore(fixture()), root);
    unlockButton("tech.jump-jets").click();
    expect(status().hidden).toBe(false);
    expect(status().textContent).toBe("Not enough TP");
  });

  it("without a campaign shows dashes and disables every Unlock", () => {
    mountWith(undefined, root);
    expect(balance()).toBe("—");
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-action="unlock"]',
    )) {
      expect(button.disabled).toBe(true);
    }
  });

  it("navigates to the mech bay and the overworld, and unmount detaches everything", () => {
    const store = new RealStore(fixture());
    const { navigate, screen } = mountWith(store, root);
    q('[data-action="mech-bay"]').click();
    expect(navigate).toHaveBeenCalledWith("mech-bay");
    q('[data-action="overworld"]').click();
    expect(navigate).toHaveBeenCalledWith("overworld");
    expect(store.listenerCount).toBe(1);
    screen.unmount();
    expect(root.children).toHaveLength(0);
    expect(store.listenerCount).toBe(0);
  });
});
