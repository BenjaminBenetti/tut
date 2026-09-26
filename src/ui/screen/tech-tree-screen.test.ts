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
import { BUG_SPECIES } from "../../bugs/data/species";
import { createSpeciesLookup } from "../../bugs/service/species-lookup";
import { campaignTechConditions } from "../../overworld/service/campaign-tech-conditions";
import { ACID_RESISTANT_PLATING } from "../../roster/data/autopsy-parts";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import {
  CAPTURE_NET,
  conditionalTechCatalogue,
  FX_FIELD_NOTES,
  FX_HEAVY_WEAPONS,
  FX_JUMP_JETS,
  FX_PHEROMONE_ANALYSIS,
  FX_POD_TELEMETRY,
  FX_SQUAD_ARMOUR,
  SPORE_SAMPLE,
  withFlags,
} from "../../tech/data/conditional-tech-tree.test-helper";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechConditions } from "../../tech/model/tech-conditions";
import { NO_TECH_CONDITIONS } from "../../tech/model/tech-conditions";
import type { TechNodeId } from "../../tech/model/tech-node";
import { TECH_FAMILY_IDS } from "../../tech/model/tech-node";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { TechNodeStatus } from "../../tech/service/tech-status-service";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import type {
  TechGraphHost,
  TechGraphListener,
} from "../model/tech-graph-host";
import { TECH_EFFECT_LABELS } from "../data/tech-effect-labels";
import type { TechEffectLabels } from "../model/tech-effect-labels";
import type { TechGraphLayout } from "../model/tech-graph-layout";
import { TechTreeScreen } from "./tech-tree-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);
const TECH = new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES));
/** The shipped nodes a fresh campaign sees: every one no flag hides. */
const SHOWN_AT_START = TECH_NODES.filter(
  (node) => (node.requiresFlags ?? []).length === 0,
);

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

/** What a test may swap in a store: the tree and where its conditions come from. */
interface TreeOptions {
  readonly tech?: TechCatalogue;
  readonly conditionsOf?: (state: GameState) => TechConditions;
}

/** No flags, whatever the state. */
const noConditions = (): TechConditions => NO_TECH_CONDITIONS;

/** A campaign store over the real dispatcher with the tech commands registered. */
class RealStore implements CampaignStore {
  private state: GameState;
  private readonly dispatcher = createOverworldCommandDispatcher<GameState>();
  private readonly listeners = new Set<
    StoreListener<GameState, OverworldCommand, CampaignEvent>
  >();
  constructor(state: GameState, tree: TreeOptions = {}) {
    this.state = state;
    registerTechCommands(this.dispatcher, {
      catalogue: tree.tech ?? TECH,
      techPoints: new TechPointTreasury(),
      conditionsOf: tree.conditionsOf ?? noConditions,
      devTools: true,
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

/** Records what the screen asks of a graph host, drawing nothing, and can speak back. */
class FakeGraphHost implements TechGraphHost {
  container: HTMLElement | undefined;
  layout: TechGraphLayout | undefined;
  listener: TechGraphListener | undefined;
  statuses: ReadonlyMap<TechNodeId, TechNodeStatus> = new Map();
  readonly selections: (TechNodeId | undefined)[] = [];
  readonly focused: TechNodeId[] = [];
  released = 0;
  attaches = 0;

  attach(
    container: HTMLElement,
    layout: TechGraphLayout,
    listener: TechGraphListener,
  ): void {
    this.attaches += 1;
    this.container = container;
    this.layout = layout;
    this.listener = listener;
  }

  setStatuses(statuses: ReadonlyMap<TechNodeId, TechNodeStatus>): void {
    this.statuses = statuses;
  }

  setSelected(nodeId: TechNodeId | undefined): void {
    this.selections.push(nodeId);
  }

  focus(nodeId: TechNodeId): void {
    this.focused.push(nodeId);
  }

  release(): void {
    this.released += 1;
  }
}

/** Mounts the screen over `store`. */
function mountWith(
  store: CampaignStore | undefined,
  root: HTMLElement,
  extras: {
    graph?: TechGraphHost;
    devTools?: { grantPoints: number };
    tech?: TechCatalogue;
    conditionsOf?: (state: GameState) => TechConditions;
    effectLabels?: TechEffectLabels;
    squadTypes?: SquadTypeCatalogue;
    speciesOf?: (speciesId: string) => { readonly name: string } | undefined;
  } = {},
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
    conditionsOf: noConditions,
    ...extras,
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
  const label = (nodeId: string): HTMLElement => q(`[data-node="${nodeId}"]`);
  const detail = (): HTMLElement => q("#tech-tree-detail");
  const unlockButton = (): HTMLButtonElement =>
    q('#tech-tree-detail [data-action="unlock"]');
  const reason = (): HTMLElement =>
    q('#tech-tree-detail [data-field="reason"]');
  const balance = (): string =>
    q('#tech-tree-bar [data-field="techPoints"]').textContent ?? "";
  const status = (): HTMLElement => q('#tech-tree-bar [data-role="status"]');

  it("floats a label per family in tree order and one per node over the stage", () => {
    mountWith(new RealStore(fixture()), root);
    expect(q('[data-screen="tech-tree"]')).toBeDefined();
    const stage = q('[data-role="tech-graph"]');
    const families = [
      ...stage.querySelectorAll<HTMLElement>("[data-family]"),
    ].map((column) => column.dataset.family);
    // Every family but xenobiology, whose autopsies wait on a kill.
    expect(families).toEqual(
      TECH_FAMILY_IDS.filter((id) =>
        SHOWN_AT_START.some((node) => node.family === id),
      ),
    );
    expect(families).not.toContain("xenobiology");
    expect(q('[data-family="mobility"]').textContent).toBe(
      TECH_FAMILIES.mobility.name,
    );
    expect(stage.querySelectorAll("[data-node]")).toHaveLength(
      SHOWN_AT_START.length,
    );
    const jump = label("tech.jump-jets");
    expect(jump.querySelector('[data-field="name"]')?.textContent).toBe(
      "Jump Jets",
    );
    expect(jump.querySelector('[data-field="cost"]')?.textContent).toBe(
      "18 TP",
    );
    expect(q('[data-role="controls-hint"]').textContent).toContain(
      "wheel zoom",
    );
  });

  it("attaches the graph to the stage with the layout, tints it from the state and releases it on unmount", () => {
    const graph = new FakeGraphHost();
    const { screen } = mountWith(new RealStore(fixture()), root, { graph });
    expect(graph.container?.dataset.role).toBe("tech-graph");
    expect(graph.layout?.nodes).toHaveLength(SHOWN_AT_START.length);
    expect(graph.statuses.get("tech.all-terrain")).toBe("unlocked");
    expect(graph.statuses.get("tech.jump-jets")).toBe("available");
    expect(graph.statuses.get("tech.sprint-frame")).toBe("unaffordable");
    expect(graph.statuses.get("tech.siege-railgun")).toBe("locked");
    screen.unmount();
    expect(graph.released).toBe(1);
  });

  it("moves the labels where the host says the pedestals and plinths are", () => {
    const graph = new FakeGraphHost();
    mountWith(new RealStore(fixture()), root, { graph });
    graph.listener?.framed({
      nodes: [{ id: "tech.jump-jets", x: 120.25, y: 80 }],
      families: [{ id: "mobility", x: 40, y: 20 }],
      zoom: 64,
    });
    expect(label("tech.jump-jets").style.transform).toContain(
      "120.3px, 80.0px",
    );
    expect(label("tech.jump-jets").style.transform).toContain("scale(1.000)");
    expect(q('[data-family="mobility"]').style.transform).toContain(
      "40.0px, 20.0px",
    );
    // Pulled back, the labels shrink with the graph, but never below 70 %.
    graph.listener?.framed({
      nodes: [{ id: "tech.jump-jets", x: 0, y: 0 }],
      families: [],
      zoom: 48,
    });
    expect(label("tech.jump-jets").style.transform).toContain("scale(0.750)");
    graph.listener?.framed({
      nodes: [{ id: "tech.jump-jets", x: 0, y: 0 }],
      families: [],
      zoom: 10,
    });
    expect(label("tech.jump-jets").style.transform).toContain("scale(0.700)");
  });

  it("classifies every label against the pool and the tree, and shows the balance", () => {
    mountWith(new RealStore(fixture()), root);
    expect(balance()).toBe("20 TP");
    expect(label("tech.all-terrain").dataset.status).toBe("unlocked");
    expect(label("tech.jump-jets").dataset.status).toBe("available");
    expect(label("tech.sprint-frame").dataset.status).toBe("unaffordable");
    expect(label("tech.siege-railgun").dataset.status).toBe("locked");
    for (const nodeId of ["tech.all-terrain", "tech.siege-railgun"]) {
      expect(
        label(nodeId).querySelector('[data-role="status"]')?.textContent,
      ).toBe(nodeId === "tech.all-terrain" ? "Unlocked" : "Locked");
    }
  });

  it("the detail panel is empty until a pick, then shows the node, its parts and why it cannot be bought", () => {
    const graph = new FakeGraphHost();
    mountWith(new RealStore(fixture()), root, { graph });
    expect(detail().dataset.selectedNode).toBeUndefined();
    expect(q('#tech-tree-detail [data-role="empty"]').hidden).toBe(false);

    graph.listener?.picked("tech.sprint-frame");
    expect(detail().dataset.selectedNode).toBe("tech.sprint-frame");
    expect(detail().dataset.status).toBe("unaffordable");
    expect(q('#tech-tree-detail [data-field="family"]').textContent).toBe(
      "Mobility",
    );
    expect(q('#tech-tree-detail [data-field="name"]').textContent).toBe(
      "Sprint Frame",
    );
    expect(q('#tech-tree-detail [data-field="cost"]').textContent).toBe(
      "40 TP",
    );
    expect(q('#tech-tree-detail [data-field="description"]').textContent).toBe(
      TECH.getNode("tech.sprint-frame")?.description,
    );
    const unlocks = [
      ...root.querySelectorAll<HTMLElement>(
        '#tech-tree-detail [data-field="unlocks"] li',
      ),
    ];
    expect(unlocks.map((item) => item.dataset.partId)).toEqual(["legs-sprint"]);
    expect(unlocks.map((item) => item.textContent)).toEqual(["Sprint Legs"]);
    expect(reason().textContent).toBe("Need 20 more TP");
    expect(unlockButton().disabled).toBe(true);
    expect(graph.selections).toEqual(["tech.sprint-frame"]);
    expect(label("tech.sprint-frame").dataset.selected).toBe("true");

    graph.listener?.picked("tech.siege-railgun");
    expect(reason().textContent).toBe("Requires Railgun");
    expect(label("tech.sprint-frame").dataset.selected).toBe("false");

    // A click on empty ground clears the selection.
    graph.listener?.picked(undefined);
    expect(detail().dataset.selectedNode).toBeUndefined();
    expect(graph.selections.at(-1)).toBeUndefined();
  });

  it("a label click selects its node too", () => {
    const graph = new FakeGraphHost();
    mountWith(new RealStore(fixture()), root, { graph });
    label("tech.all-terrain").click();
    expect(detail().dataset.selectedNode).toBe("tech.all-terrain");
    expect(detail().dataset.status).toBe("unlocked");
    expect(unlockButton().hidden).toBe(true);
    expect(graph.selections).toEqual(["tech.all-terrain"]);
  });

  it("Unlock dispatches the command: the balance drops, the label and the graph flip to unlocked", () => {
    const store = new RealStore(fixture());
    const graph = new FakeGraphHost();
    mountWith(store, root, { graph });
    label("tech.jump-jets").click();
    expect(unlockButton().disabled).toBe(false);
    unlockButton().click();
    expect(store.getState().tech.unlocked).toContain("tech.jump-jets");
    expect(store.getState().economy.techPoints).toBe(2);
    expect(balance()).toBe("2 TP");
    expect(label("tech.jump-jets").dataset.status).toBe("unlocked");
    expect(graph.statuses.get("tech.jump-jets")).toBe("unlocked");
    expect(unlockButton().hidden).toBe(true);
    // The pool is now too small for the other tier 2 rungs.
    expect(label("tech.railgun").dataset.status).toBe("unaffordable");
    label("tech.railgun").click();
    expect(reason().textContent).toBe("Need 16 more TP");
    expect(status().hidden).toBe(true);
  });

  it("a rejected command lands in the status line", () => {
    mountWith(new RejectingStore(fixture()), root);
    label("tech.jump-jets").click();
    unlockButton().click();
    expect(status().hidden).toBe(false);
    expect(status().textContent).toBe("Not enough TP");
  });

  it("without a campaign shows dashes, locks every label and disables Unlock", () => {
    mountWith(undefined, root);
    expect(balance()).toBe("—");
    for (const node of root.querySelectorAll<HTMLElement>("[data-node]")) {
      expect(node.dataset.status).toBe("locked");
    }
    label("tech.jump-jets").click();
    expect(unlockButton().disabled).toBe(true);
    expect(reason().textContent).toBe("No active campaign.");
  });

  it("builds no Free TP button unless the dev tools are given, and then grants the pool", () => {
    mountWith(new RealStore(fixture()), root);
    expect(root.querySelector('[data-action="free-tech-points"]')).toBeNull();

    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    const store = new RealStore(fixture());
    mountWith(store, root, { devTools: { grantPoints: 10 } });
    const free = q<HTMLButtonElement>('[data-action="free-tech-points"]');
    expect(free.textContent).toBe("Free TP (+10)");
    free.click();
    expect(store.getState().economy.techPoints).toBe(30);
    expect(balance()).toBe("30 TP");
    // Sprint Frame (40) is now within reach of one more press.
    expect(label("tech.sprint-frame").dataset.status).toBe("unaffordable");
    free.click();
    expect(label("tech.sprint-frame").dataset.status).toBe("available");
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

// ===========================================
// Hidden and conditional nodes (ADR 0013 §2.7)
// ===========================================

describe("TechTreeScreen with hidden and conditional nodes", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const CONDITIONAL = conditionalTechCatalogue();

  /** A fresh campaign with a pool large enough for any fixture node. */
  const funded = (): GameState => {
    const base = newGame();
    return {
      ...base,
      economy: { ...base.economy, techPoints: 200 },
      tech: { unlocked: [] },
    };
  };

  /**
   * Stands in for the story spine: buying Field Notes is what sets the
   * spore sample flag, so the conditions follow the unlocked set.
   */
  const notesRevealSpores = (state: GameState): TechConditions =>
    state.tech.unlocked.includes(FX_FIELD_NOTES)
      ? withFlags(SPORE_SAMPLE)
      : NO_TECH_CONDITIONS;

  const q = <T extends HTMLElement>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`missing ${selector}`);
    return el;
  };
  const labelIds = (): string[] =>
    [...root.querySelectorAll<HTMLElement>("[data-node]")].map(
      (el) => el.dataset.node ?? "",
    );
  const familyIds = (): string[] =>
    [...root.querySelectorAll<HTMLElement>("[data-family]")].map(
      (el) => el.dataset.family ?? "",
    );
  const effectItems = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>(
      '#tech-tree-detail [data-field="unlocks"] li',
    ),
  ];

  it("draws no label, pedestal or spoke for a hidden node or a family with nothing to show", () => {
    const graph = new FakeGraphHost();
    mountWith(new RealStore(funded(), { tech: CONDITIONAL }), root, {
      graph,
      tech: CONDITIONAL,
    });
    expect(labelIds()).not.toContain(FX_PHEROMONE_ANALYSIS);
    expect(labelIds()).not.toContain(FX_POD_TELEMETRY);
    expect(labelIds()).toContain(FX_FIELD_NOTES);
    expect(familyIds()).toEqual(["mobility", "protection", "support"]);
    expect(graph.layout?.nodes.map((n) => n.id)).not.toContain(
      FX_PHEROMONE_ANALYSIS,
    );
    expect(graph.statuses.has(FX_PHEROMONE_ANALYSIS)).toBe(false);
    expect(graph.statuses.get(FX_FIELD_NOTES)).toBe("available");
  });

  it("draws a hidden node once the conditions carry its flag", () => {
    const graph = new FakeGraphHost();
    const conditionsOf = () => withFlags(SPORE_SAMPLE);
    mountWith(
      new RealStore(funded(), { tech: CONDITIONAL, conditionsOf }),
      root,
      { graph, tech: CONDITIONAL, conditionsOf },
    );
    expect(labelIds()).toContain(FX_PHEROMONE_ANALYSIS);
    expect(labelIds()).not.toContain(FX_POD_TELEMETRY);
    expect(familyIds()).toContain("energy");
    // 200 TP covers its 180.
    expect(q(`[data-node="${FX_PHEROMONE_ANALYSIS}"]`).dataset.status).toBe(
      "available",
    );
  });

  it("refuses to select a node it does not draw", () => {
    const graph = new FakeGraphHost();
    mountWith(new RealStore(funded(), { tech: CONDITIONAL }), root, {
      graph,
      tech: CONDITIONAL,
    });
    graph.listener?.picked(FX_PHEROMONE_ANALYSIS);
    expect(q("#tech-tree-detail").dataset.selectedNode).toBeUndefined();
    expect(graph.selections).toEqual([undefined]);
  });

  it("lists a node's effects in words: labelled flags, unlabelled upgrades, squad types and parts", () => {
    const graph = new FakeGraphHost();
    mountWith(new RealStore(funded(), { tech: CONDITIONAL }), root, {
      graph,
      tech: CONDITIONAL,
      conditionsOf: () => withFlags(SPORE_SAMPLE),
      effectLabels: {
        flags: { [CAPTURE_NET]: "The capture net" },
        infantryUpgrades: {},
      },
    });
    graph.listener?.picked(FX_PHEROMONE_ANALYSIS);
    expect(
      effectItems().map((li) => [li.dataset.effectKind, li.dataset.flag]),
    ).toEqual([["flag", CAPTURE_NET]]);
    expect(effectItems().map((li) => li.textContent)).toEqual([
      "The capture net",
    ]);

    graph.listener?.picked(FX_FIELD_NOTES);
    expect(effectItems().map((li) => li.textContent)).toEqual(["Field notes"]);

    graph.listener?.picked(FX_SQUAD_ARMOUR);
    expect(effectItems().map((li) => li.dataset.upgradeId)).toEqual([
      "squad-armour-1",
    ]);
    expect(effectItems().map((li) => li.textContent)).toEqual([
      "Squad armour 1",
    ]);

    graph.listener?.picked(FX_HEAVY_WEAPONS);
    expect(effectItems().map((li) => li.dataset.squadTypeId)).toEqual([
      "heavy-weapons",
    ]);
    expect(effectItems().map((li) => li.textContent)).toEqual([
      "Heavy weapons",
    ]);

    graph.listener?.picked(FX_JUMP_JETS);
    expect(effectItems().map((li) => li.dataset.partId)).toEqual([
      "legs-jumper",
    ]);
    expect(effectItems().map((li) => li.textContent)).toEqual([
      PARTS.getPart("legs-jumper")?.name,
    ]);
  });

  it("draws the shipped infantry family and says what each of its nodes does, with the shipped labels (campaign arc §10.3)", () => {
    const graph = new FakeGraphHost();
    mountWith(new RealStore(funded()), root, {
      graph,
      effectLabels: TECH_EFFECT_LABELS,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    });
    expect(familyIds()).toContain("infantry");
    expect(q('[data-family="infantry"]').textContent).toBe("Infantry");
    const infantry = TECH_NODES.filter((n) => n.family === "infantry");
    expect(infantry).toHaveLength(6);
    for (const node of infantry) {
      expect(labelIds()).toContain(node.id);
    }
    const said = (nodeId: string): (string | null)[] => {
      graph.listener?.picked(nodeId);
      return effectItems().map((li) => li.textContent);
    };
    expect(said("tech.squad-armour-1")).toEqual([
      "Squad armour I (+1 armour on every squad)",
    ]);
    expect(said("tech.squad-armour-2")).toEqual([
      "Squad armour II (+1 more armour on every squad, +2 in all)",
    ]);
    expect(said("tech.frag-grenades")).toEqual([
      "Frag grenades (grenades hit for 8 and lose less to the edge)",
    ]);
    expect(said("tech.incendiary-grenades")).toEqual([
      "Incendiary grenades (frag grenades that leave the blast burning)",
    ]);
    expect(said("tech.field-medic-training")).toEqual([
      "Field medic training (the medic squad's medkit mends 15, not 10)",
    ]);
    expect(said("tech.heavy-weapons")).toEqual(["Heavy Weapons Squad"]);
  });

  it("draws the spitter autopsy once a spitter is killed, and says whose autopsy it is and what it unlocks (campaign arc §10.2)", () => {
    const killed = (): GameState => {
      const base = funded();
      return {
        ...base,
        overworld: {
          ...base.overworld,
          progress: {
            ...base.overworld.progress,
            speciesKilled: ["spitter"],
          },
        },
      };
    };
    const conditionsOf = (state: GameState): TechConditions =>
      campaignTechConditions(state.overworld.progress);

    // Before the kill: no label, no xenobiology spoke.
    const before = new FakeGraphHost();
    mountWith(new RealStore(funded(), { conditionsOf }), root, {
      graph: before,
      conditionsOf,
    });
    expect(labelIds()).not.toContain("tech.spitter-autopsy");
    expect(familyIds()).not.toContain("xenobiology");

    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    const graph = new FakeGraphHost();
    mountWith(new RealStore(killed(), { conditionsOf }), root, {
      graph,
      conditionsOf,
      speciesOf: createSpeciesLookup(BUG_SPECIES),
    });
    expect(labelIds()).toContain("tech.spitter-autopsy");
    // Only the species killed: the Hive Guard's autopsy stays hidden.
    expect(labelIds()).not.toContain("tech.hive-guard-autopsy");
    expect(familyIds()).toContain("xenobiology");
    expect(q('[data-family="xenobiology"]').textContent).toBe("Xenobiology");

    graph.listener?.picked("tech.spitter-autopsy");
    const kind = q('#tech-tree-detail [data-field="kind"]');
    expect(kind.hidden).toBe(false);
    expect(kind.textContent).toBe("Autopsy: Spitter");
    expect(
      effectItems().map((li) => [li.dataset.partId, li.textContent]),
    ).toEqual([
      [ACID_RESISTANT_PLATING, "Acid-Resistant Plating (acid resist 3)"],
    ]);
    expect(q("#tech-tree-detail").dataset.status).toBe("available");

    // A part node has no kind line.
    graph.listener?.picked("tech.jump-jets");
    expect(q('#tech-tree-detail [data-field="kind"]').hidden).toBe(true);
  });

  it("re-lays the graph out when an unlock reveals a node, keeping the selection", () => {
    const store = new RealStore(funded(), {
      tech: CONDITIONAL,
      conditionsOf: notesRevealSpores,
    });
    const graph = new FakeGraphHost();
    mountWith(store, root, {
      graph,
      tech: CONDITIONAL,
      conditionsOf: notesRevealSpores,
    });
    expect(graph.attaches).toBe(1);
    expect(labelIds()).not.toContain(FX_PHEROMONE_ANALYSIS);

    q(`[data-node="${FX_FIELD_NOTES}"]`).click();
    q('#tech-tree-detail [data-action="unlock"]').click();

    expect(store.getState().tech.unlocked).toEqual([FX_FIELD_NOTES]);
    expect(graph.attaches).toBe(2);
    expect(graph.layout?.nodes.map((n) => n.id)).toContain(
      FX_PHEROMONE_ANALYSIS,
    );
    expect(labelIds()).toContain(FX_PHEROMONE_ANALYSIS);
    expect(familyIds()).toContain("energy");
    // The new label works: its status is live (175 TP left of its 180)
    // and a click selects it.
    const pheromone = q(`[data-node="${FX_PHEROMONE_ANALYSIS}"]`);
    expect(pheromone.dataset.status).toBe("unaffordable");
    expect(graph.statuses.get(FX_PHEROMONE_ANALYSIS)).toBe("unaffordable");
    // The selection survived the rebuild, on the label and in the graph.
    expect(q("#tech-tree-detail").dataset.selectedNode).toBe(FX_FIELD_NOTES);
    expect(q(`[data-node="${FX_FIELD_NOTES}"]`).dataset.selected).toBe("true");
    expect(graph.selections.at(-1)).toBe(FX_FIELD_NOTES);
    pheromone.click();
    expect(q("#tech-tree-detail").dataset.selectedNode).toBe(
      FX_PHEROMONE_ANALYSIS,
    );
  });

  it("does not re-lay the graph out for a change that reveals nothing", () => {
    const store = new RealStore(funded(), {
      tech: CONDITIONAL,
      conditionsOf: notesRevealSpores,
    });
    const graph = new FakeGraphHost();
    mountWith(store, root, {
      graph,
      tech: CONDITIONAL,
      conditionsOf: notesRevealSpores,
      devTools: { grantPoints: 10 },
    });
    q('[data-action="free-tech-points"]').click();
    q(`[data-node="${FX_JUMP_JETS}"]`).click();
    q('#tech-tree-detail [data-action="unlock"]').click();
    expect(store.getState().tech.unlocked).toEqual([FX_JUMP_JETS]);
    expect(graph.attaches).toBe(1);
  });
});
