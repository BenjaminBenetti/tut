// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Unsubscribe } from "../../core/model/event-bus";
import { ok } from "../../core/model/result";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { ALL_PARTS_AVAILABLE } from "../../roster/model/part-availability";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { registerRosterCommands } from "../../overworld/service/roster-command-handlers";
import { registerTechCommands } from "../../overworld/service/tech-command-handlers";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import { TechPointTreasury } from "../../economy/service/tech-point-service";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { ROSTER_TUNING } from "../../roster/data/roster-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import {
  STARTER_LOADOUT,
  STARTER_ROSTER,
} from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { CampaignStore, GameSession } from "../model/game-session";
import type {
  MechPreviewHost,
  MechPreviewListener,
  SlotAnchor,
} from "../model/mech-preview-host";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { MechBayScreen } from "./mech-bay-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** The real tree, so a tier 2 part is locked until its node is bought. */
const TECH = new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES));

/**
 * The campaign with every node bought (#1171), for the tests about
 * weight, chips and prices: they fit tier 2 parts and are not about
 * the tree.
 */
const researched = (): GameState => {
  const base = newGame();
  return { ...base, tech: { unlocked: TECH_NODES.map((node) => node.id) } };
};

/** Every part the palette lists. */
const PARTS_TOTAL = STARTER_PARTS.length;

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

/** A read-only store; the mech bay never dispatches. */
class ReadStore implements CampaignStore {
  private readonly listeners = new Set<
    StoreListener<GameState, OverworldCommand, CampaignEvent>
  >();
  constructor(private readonly state: GameState) {}
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
  dispatch(): never {
    throw new Error("the mech bay editor never dispatches");
  }
  onError(): Unsubscribe {
    return () => undefined;
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
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
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      parts: PARTS,
      rating: MECH_RATING_TUNING,
      rosterTuning: ROSTER_TUNING,
      upgrades: UPGRADE_TUNING,
      transactionsFor: (ids) => new LedgerTransactionService(ids),
      availabilityFor: () => ALL_PARTS_AVAILABLE,
    });
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
}

/** Records what the screen asks of a preview host, drawing nothing. */
class FakePreviewHost implements MechPreviewHost {
  readonly attached: HTMLElement[] = [];
  readonly shown: MechLoadout[] = [];
  listener: MechPreviewListener | undefined;
  releases = 0;
  attach(container: HTMLElement, listener?: MechPreviewListener): void {
    this.attached.push(container);
    this.listener = listener;
  }
  /** Pretends a frame was drawn with the parts at `anchors`. */
  frame(anchors: readonly SlotAnchor[]): void {
    this.listener?.framed(anchors);
  }
  show(loadout: MechLoadout): Promise<void> {
    this.shown.push(loadout);
    return Promise.resolve();
  }
  release(): void {
    this.releases += 1;
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

/** Mounts the screen over `state`. */
function mountWith(
  state: GameState | undefined,
  root: HTMLElement,
  live = false,
  preview?: MechPreviewHost,
): {
  store: CampaignStore | undefined;
  navigate: NavigateMock;
  screen: MechBayScreen;
} {
  const store = state
    ? live
      ? new RealStore(state)
      : new ReadStore(state)
    : undefined;
  const navigate: NavigateMock = vi.fn();
  const router: ScreenRouter = {
    current: "mech-bay",
    navigate,
    events: new SimpleEventBus<ScreenRouterEvents>(),
  };
  const screen = new MechBayScreen({
    router,
    session: sessionWith(store),
    parts: PARTS,
    tech: TECH,
    rating: MECH_RATING_TUNING,
    unitTuning: UNIT_TUNING,
    upgrades: UPGRADE_TUNING,
    preview,
  });
  screen.mount(root);
  return { store, navigate, screen };
}

// ===========================================
// Tests
// ===========================================

describe("MechBayScreen", () => {
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
  /** The palette card for a part. */
  const card = (partId: string): HTMLElement =>
    q(`#part-palette [data-part-id="${partId}"]`);
  /** The name shown on the stage badge for a slot key (`legs`, `utility-0`). */
  const fitted = (key: string): string =>
    q(`#mech-stage [data-role="part-name"][data-field="${key}"]`).textContent ??
    "";
  /** The part id a stage badge carries. */
  const fittedId = (key: string): string | undefined =>
    q(`#mech-stage [data-row="${key}"]`).dataset.partId;
  /** Drags a palette card onto the stage, or onto one utility chip. */
  const drop = (partId: string, utilityIndex?: number): void => {
    card(partId).dispatchEvent(new Event("dragstart", { bubbles: true }));
    const target =
      utilityIndex === undefined
        ? q("#mech-stage")
        : q(`#mech-stage [data-index="${String(utilityIndex)}"]`);
    target.dispatchEvent(new Event("dragover", { bubbles: true }));
    target.dispatchEvent(new Event("drop", { bubbles: true }));
    card(partId).dispatchEvent(new Event("dragend", { bubbles: true }));
  };
  /** Rests the pointer on a palette card, or on nothing. */
  const hover = (partId: string | undefined): void => {
    const list = q('[data-role="part-list"]');
    if (partId === undefined) {
      list.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      return;
    }
    card(partId).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  };
  const sheetField = (name: string): string =>
    q(`#stat-sheet [data-field="${name}"]:not([data-role="delta"])`)
      .textContent ?? "";
  const delta = (name: string): HTMLElement =>
    q(`#stat-sheet [data-role="delta"][data-field="${name}"]`);
  const errorCodes = (): string[] =>
    [
      ...root.querySelectorAll<HTMLElement>(
        '#stat-sheet [data-role="errors"] li',
      ),
    ].map((li) => li.dataset.code ?? "");
  const button = (action: string): HTMLButtonElement =>
    q<HTMLButtonElement>(`[data-action="${action}"]`);
  const status = (): HTMLElement => q('[data-role="status"]');

  // ===========================================
  // Layout and seeding
  // ===========================================

  it("seeds the stage from the first saved template and shows its validated sheet", () => {
    mountWith(newGame(), root);
    expect(root.querySelector('[data-screen="mech-bay"]')).not.toBeNull();
    expect(q('#mech-bay-bar [data-field="credits"]').textContent).toBe(
      "¢5,000",
    );
    expect(q<HTMLInputElement>('[data-field="loadout-name"]').value).toBe(
      STARTER_LOADOUT.name,
    );
    expect(fittedId("chassis")).toBe(STARTER_LOADOUT.chassisId);
    expect(fittedId("arm-weapon")).toBe(STARTER_LOADOUT.armWeaponId);
    expect(fitted("arm-weapon")).toBe("Autocannon");
    // Vanguard carries two utilities: one filled from the template, one empty.
    expect(fittedId("utility-0")).toBe(STARTER_LOADOUT.utilityIds[0]);
    expect(q('#mech-stage [data-row="utility-1"]').dataset.empty).toBe("true");
    expect(root.querySelector('#mech-stage [data-row="utility-2"]')).toBeNull();
    expect(q('#stat-sheet [data-field="verdict"]').dataset.tone).toBe("ok");
    expect(sheetField("combatRating")).toBe("113");
    expect(sheetField("totalCost")).toBe("¢2,850");
    expect(sheetField("weight")).toBe("40 / 40 t");
    // The Combat block is the field's own numbers (#1132): the starter's
    // sheet armor of 20 is 6 per hit and 45 hit points on the ground.
    expect(sheetField("combat-hp")).toBe("45");
    expect(sheetField("combat-armor")).toBe("6");
    expect(sheetField("combat-move")).toBe("8");
    expect(root.querySelector('#stat-sheet [data-field="armor"]')).toBeNull();
  });

  it("lays the bay out as palette, stage and sheet with the loadouts on the bottom bar", () => {
    mountWith(newGame(), root);
    const body = q(".tut-mech-bay__body");
    expect([...body.children].map((el) => el.id)).toEqual([
      "part-palette",
      "mech-stage",
      "stat-sheet",
    ]);
    expect(q(".tut-mech-bay__footer #saved-loadouts")).toBeTruthy();
    expect(root.querySelector("select")).toBeNull();
  });

  // ===========================================
  // Palette
  // ===========================================

  it("lists every catalogue part as a draggable card with its picture, slot, tier and price", () => {
    mountWith(newGame(), root);
    const cards = [
      ...root.querySelectorAll<HTMLElement>("#part-palette [data-part-id]"),
    ];
    const all = [
      "chassis",
      "legs",
      "arms",
      "arm-weapon",
      "back-weapon",
      "utility",
    ].flatMap((slot) => PARTS.partsForSlot(slot as "chassis").map((p) => p.id));
    expect(cards.map((c) => c.dataset.partId)).toEqual(all);
    const railgun = card("arm-weapon-railgun");
    expect(railgun.draggable).toBe(true);
    expect(railgun.tabIndex).toBe(0);
    expect(railgun.textContent).toContain("Railgun");
    expect(railgun.textContent).toMatch(/Arm weapon · T2 · ¢[\d,]+/);
    const picture = railgun.querySelector<HTMLImageElement>(
      '[data-role="part-thumb"]',
    );
    expect(picture?.getAttribute("src")).toContain("assets/ui/thumbs/");
    expect(picture?.alt).toBe("");
    // A utility has no picture and says so with the ability glyph (#594).
    const glyph = card("utility-radiator").querySelector<HTMLElement>(
      '[data-role="part-thumb-none"]',
    );
    expect(glyph?.dataset.icon).toBe("ability");
  });

  it("marks the cards whose part the draft carries", () => {
    mountWith(newGame(), root);
    expect(card(STARTER_LOADOUT.armWeaponId).dataset.fitted).toBe("true");
    expect(card("arm-weapon-railgun").dataset.fitted).toBe("false");
    drop("arm-weapon-flamer");
    expect(card("arm-weapon-flamer").dataset.fitted).toBe("true");
    expect(card(STARTER_LOADOUT.armWeaponId).dataset.fitted).toBe("false");
  });

  it("filters the palette by slot chip and by search text", () => {
    mountWith(newGame(), root);
    const visible = (): string[] =>
      [...root.querySelectorAll<HTMLElement>("#part-palette [data-part-id]")]
        .filter((c) => !c.hidden)
        .map((c) => c.dataset.partId ?? "");
    expect(visible()).toHaveLength(PARTS_TOTAL);

    q<HTMLButtonElement>('[data-filter="legs"]').click();
    expect(visible()).toEqual(PARTS.partsForSlot("legs").map((p) => p.id));
    expect(q('[data-filter="legs"]').getAttribute("aria-pressed")).toBe("true");
    expect(q('[data-filter="all"]').getAttribute("aria-pressed")).toBe("false");

    q<HTMLButtonElement>('[data-filter="all"]').click();
    const search = q<HTMLInputElement>('[data-field="part-search"]');
    search.value = "rail";
    search.dispatchEvent(new Event("input"));
    expect(visible()).toEqual([
      "arm-weapon-railgun",
      "arm-weapon-siege-railgun",
    ]);
    expect(q('[data-role="no-parts"]').hidden).toBe(true);

    search.value = "zzz";
    search.dispatchEvent(new Event("input"));
    expect(visible()).toEqual([]);
    expect(q('[data-role="no-parts"]').hidden).toBe(false);
  });

  // ===========================================
  // Drag and drop
  // ===========================================

  it("fits a part dropped on the stage into its slot and re-validates", () => {
    const preview = new FakePreviewHost();
    mountWith(newGame(), root, false, preview);
    const before = preview.shown.length;
    drop("legs-jumper");
    expect(fittedId("legs")).toBe("legs-jumper");
    expect(fitted("legs")).toBe("Jumper Legs");
    expect(preview.shown).toHaveLength(before + 1);
    expect(preview.shown.at(-1)?.legsId).toBe("legs-jumper");
    expect(sheetField("totalCost")).not.toBe("¢2,850");
  });

  it("lights the slot a dragged part is made for while the drag lasts", () => {
    mountWith(newGame(), root);
    const stage = q("#mech-stage");
    card("legs-jumper").dispatchEvent(
      new Event("dragstart", { bubbles: true }),
    );
    expect(stage.dataset.dragging).toBe("legs");
    expect(q('#mech-stage [data-slot="legs"]').dataset.target).toBe("true");
    expect(q('#mech-stage [data-slot="chassis"]').dataset.target).toBe("false");
    card("legs-jumper").dispatchEvent(new Event("dragend", { bubbles: true }));
    expect(stage.dataset.dragging).toBeUndefined();
    expect(q('#mech-stage [data-slot="legs"]').dataset.target).toBe("false");
  });

  it("re-validates on every drop: a heavy gun shows an overweight error on the chassis badge and in the sheet", () => {
    mountWith(researched(), root);
    drop("arm-weapon-railgun");
    expect(errorCodes()).toEqual(["overweight"]);
    expect(sheetField("weight")).toBe("44 / 40 t");
    expect(q('#stat-sheet [data-field="verdict"]').dataset.tone).toBe("danger");
    expect(sheetField("combatRating")).toBe("—");
    const inline = q('[data-row="chassis"] [data-role="slot-error"]');
    expect(inline.hidden).toBe(false);
    expect(inline.textContent).toContain("carries at most");
    expect(q('[data-row="chassis"]').dataset.tone).toBe("danger");

    drop(STARTER_LOADOUT.armWeaponId);
    expect(errorCodes()).toEqual([]);
    expect(inline.hidden).toBe(true);
    expect(sheetField("combatRating")).toBe("113");
  });

  it("drops a utility into the first free slot, onto a named slot, and removes one from its chip", () => {
    mountWith(newGame(), root);
    drop("utility-armor-plating");
    expect(fittedId("utility-0")).toBe(STARTER_LOADOUT.utilityIds[0]);
    expect(fittedId("utility-1")).toBe("utility-armor-plating");

    drop("utility-targeting-computer", 0);
    expect(fittedId("utility-0")).toBe("utility-targeting-computer");
    expect(fittedId("utility-1")).toBe("utility-armor-plating");

    q<HTMLButtonElement>(
      '[data-row="utility-0"] [data-action="remove-utility"]',
    ).click();
    expect(fittedId("utility-0")).toBe("utility-armor-plating");
    expect(q('[data-row="utility-1"]').dataset.empty).toBe("true");
  });

  it("changing the chassis rebuilds the utility chips to its slot count and keeps the rest", () => {
    mountWith(researched(), root);
    drop("chassis-atlas");
    expect(fittedId("chassis")).toBe("chassis-atlas");
    expect(fittedId("arm-weapon")).toBe(STARTER_LOADOUT.armWeaponId);
    expect(
      root.querySelectorAll('#mech-stage [data-slot="utility"]'),
    ).toHaveLength(5);
    expect(fittedId("utility-0")).toBe(STARTER_LOADOUT.utilityIds[0]);
    expect(sheetField("totalCost")).toBe("¢5,250");
  });

  it("fits a card on Enter and on a double-click, for the keyboard and the impatient", () => {
    mountWith(newGame(), root);
    card("legs-bastion").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(fittedId("legs")).toBe("legs-bastion");
    card("legs-jumper").dispatchEvent(new Event("dblclick", { bubbles: true }));
    expect(fittedId("legs")).toBe("legs-jumper");
  });

  // ===========================================
  // Hover deltas
  // ===========================================

  it("shows +X / −Y beside every stat a rested-on part would move, and clears on leave", () => {
    mountWith(newGame(), root);
    hover("utility-armor-plating");
    expect(q("#stat-sheet").dataset.previewing).toBe("true");
    const armor = delta("combat-armor");
    expect(armor.hidden).toBe(false);
    expect(armor.textContent).toMatch(/^\+\d+$/);
    expect(armor.dataset.tone).toBe("better");
    const cost = delta("totalCost");
    expect(cost.hidden).toBe(false);
    expect(cost.textContent).toMatch(/^\+\d+$/);
    expect(cost.dataset.tone).toBe("neutral");
    // The value itself is unchanged: the part is not fitted yet.
    expect(sheetField("combat-armor")).toBe("6");
    expect(fittedId("utility-1")).toBeUndefined();

    hover(undefined);
    expect(q("#stat-sheet").dataset.previewing).toBe("false");
    expect(armor.hidden).toBe(true);
    expect(cost.hidden).toBe(true);
  });

  it("previews the incoming weapon's line and warns when the swap would break the build", () => {
    mountWith(newGame(), root);
    hover("arm-weapon-railgun");
    const line = q(
      '[data-role="combat-weapon-preview"][data-weapon="arm-weapon"]',
    );
    expect(line.textContent).toContain("Railgun");
    expect(line.textContent).toMatch(/range \d+ · acc \d+/);
    const warning = q('[data-role="preview-warning"]');
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain("carries at most");
    expect(delta("weight").dataset.tone).toBe("neutral");
    // Nothing was fitted, and the sheet's verdict is untouched.
    expect(q('#stat-sheet [data-field="verdict"]').dataset.tone).toBe("ok");
    hover(undefined);
    expect(
      root.querySelector('[data-role="combat-weapon-preview"]'),
    ).toBeNull();
    expect(warning.hidden).toBe(true);
  });

  it("shows no delta for the part already fitted", () => {
    mountWith(newGame(), root);
    hover(STARTER_LOADOUT.armWeaponId);
    expect(
      [...root.querySelectorAll<HTMLElement>('[data-role="delta"]')].every(
        (el) => el.hidden,
      ),
    ).toBe(true);
  });

  // ===========================================
  // Seeding without a template, no campaign, navigation
  // ===========================================

  it("starts from the first catalogue part per slot when no template is saved", () => {
    const state = newGame();
    mountWith(
      { ...state, roster: { ...state.roster, savedLoadouts: [] } },
      root,
    );
    expect(q<HTMLInputElement>('[data-field="loadout-name"]').value).toBe(
      "New loadout",
    );
    expect(fittedId("chassis")).toBe(PARTS.partsForSlot("chassis")[0]?.id);
    expect(q('[data-row="utility-0"]').dataset.empty).toBe("true");
    expect(q('#stat-sheet [data-field="verdict"]').dataset.tone).toBe("ok");
  });

  it("shows dashes for credits with no campaign and still edits a draft", () => {
    mountWith(undefined, root);
    expect(q('#mech-bay-bar [data-field="credits"]').textContent).toBe("—");
    expect(fittedId("chassis")).not.toBe("");
    drop("legs-jumper");
    expect(fittedId("legs")).toBe("legs-jumper");
  });

  it("Roster navigates back and unmount unsubscribes and clears the DOM", () => {
    const { store, navigate, screen } = mountWith(newGame(), root);
    q<HTMLButtonElement>('[data-action="roster"]').click();
    expect(navigate).toHaveBeenCalledWith("roster");
    expect((store as ReadStore).listenerCount).toBe(1);
    screen.unmount();
    expect((store as ReadStore).listenerCount).toBe(0);
    expect(root.childElementCount).toBe(0);
  });

  // ===========================================
  // Save, load, delete, build
  // ===========================================

  const savedNames = (): string[] =>
    [...root.querySelectorAll<HTMLElement>("#saved-loadouts li")].map(
      (li) => li.dataset.loadoutName ?? "",
    );
  const openLoadouts = (): void => {
    button("toggle-loadouts").click();
  };

  it("lists the saved templates in the popover and shows the build cost on the button", () => {
    mountWith(newGame(), root, true);
    expect(q('[data-role="loadout-popover"]').hidden).toBe(true);
    openLoadouts();
    expect(q('[data-role="loadout-popover"]').hidden).toBe(false);
    expect(savedNames()).toEqual([STARTER_LOADOUT.name]);
    expect(button("toggle-loadouts").textContent).toContain(
      STARTER_LOADOUT.name,
    );
    expect(button("build-mech").textContent).toBe("Build ¢2,850");
    expect(button("build-mech").disabled).toBe(false);
    expect(button("save-loadout").disabled).toBe(false);
  });

  it("Save stores the draft under the popover's name and the list follows", () => {
    const { store } = mountWith(newGame(), root, true);
    openLoadouts();
    const name = q<HTMLInputElement>('[data-field="loadout-name"]');
    name.value = "Brawler";
    name.dispatchEvent(new Event("input"));
    drop("arm-weapon-flamer");
    // The name typed in the popover survives the drop.
    expect(name.value).toBe("Brawler");
    button("save-loadout").click();
    expect(savedNames()).toEqual([STARTER_LOADOUT.name, "Brawler"]);
    expect(store?.getState().roster.savedLoadouts[1]).toMatchObject({
      name: "Brawler",
      armWeaponId: "arm-weapon-flamer",
    });
    expect(status().hidden).toBe(true);
  });

  it("Load replaces the draft and closes the popover; Delete removes the template", () => {
    const state = newGame();
    const brawler = {
      ...STARTER_LOADOUT,
      name: "Brawler",
      armWeaponId: "arm-weapon-flamer",
    };
    mountWith(
      {
        ...state,
        roster: { ...state.roster, savedLoadouts: [STARTER_LOADOUT, brawler] },
      },
      root,
      true,
    );
    openLoadouts();
    const row = q<HTMLElement>(
      '#saved-loadouts li[data-loadout-name="Brawler"]',
    );
    row.querySelector<HTMLButtonElement>('[data-action="load"]')!.click();
    expect(q<HTMLInputElement>('[data-field="loadout-name"]').value).toBe(
      "Brawler",
    );
    expect(fittedId("arm-weapon")).toBe("arm-weapon-flamer");
    expect(q('[data-role="loadout-popover"]').hidden).toBe(true);

    openLoadouts();
    row.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    expect(savedNames()).toEqual([STARTER_LOADOUT.name]);
  });

  it("Build saves the draft, builds the mech for the sheet cost and reports it", () => {
    const { store } = mountWith(newGame(), root, true);
    q<HTMLInputElement>('[data-field="mech-name"]').value = "Anvil";
    const mechsBefore = store!.getState().roster.mechs.length;
    button("build-mech").click();
    const after = store!.getState();
    expect(after.roster.mechs).toHaveLength(mechsBefore + 1);
    expect(after.roster.mechs.at(-1)?.name).toBe("Anvil");
    expect(after.economy.credits).toBe(5000 - 2850);
    expect(q('#mech-bay-bar [data-field="credits"]').textContent).toBe(
      "¢2,150",
    );
    expect(status().textContent).toBe("Built Anvil.");
    // A second build is now unaffordable.
    expect(button("build-mech").disabled).toBe(true);
    expect(button("build-mech").title).toBe("Not enough credits");
  });

  it("Build falls back to a default mech name when the field is blank", () => {
    const { store } = mountWith(newGame(), root, true);
    button("build-mech").click();
    expect(store!.getState().roster.mechs.at(-1)?.name).toBe("Mech");
  });

  it("disables Save and Build while the draft is invalid", () => {
    mountWith(newGame(), root, true);
    drop("arm-weapon-railgun");
    expect(button("save-loadout").disabled).toBe(true);
    expect(button("build-mech").disabled).toBe(true);
    expect(button("build-mech").textContent).toBe("Build");
    drop(STARTER_LOADOUT.armWeaponId);
    expect(button("build-mech").disabled).toBe(false);
  });

  it("shows a rejected command in the status line", () => {
    const state = newGame();
    mountWith(
      { ...state, roster: { ...state.roster, savedLoadouts: [] } },
      root,
      true,
    );
    // Nothing is saved, so Delete on a stale name cannot come from the list; drive the
    // store-facing path through Save with an empty name instead.
    openLoadouts();
    const name = q<HTMLInputElement>('[data-field="loadout-name"]');
    name.value = "   ";
    name.dispatchEvent(new Event("input"));
    button("save-loadout").disabled = false;
    button("save-loadout").click();
    expect(status().hidden).toBe(false);
    expect(status().textContent).toContain("not a valid name");
  });

  // ===========================================
  // Assembly preview (#694) and slot anchors (#1145)
  // ===========================================

  describe("assembly preview", () => {
    const viewport = (): HTMLElement =>
      q('#mech-stage [data-role="preview-viewport"]');
    const emptyNote = (): HTMLElement =>
      q('#mech-stage [data-role="preview-empty"]');

    it("mounts the stage with no host, and says so", () => {
      // The bay works without a preview host: the jsdom specs and any
      // headless caller get the stage and its note, not a broken screen.
      mountWith(newGame(), root);
      expect(viewport()).toBeTruthy();
      expect(emptyNote().hidden).toBe(false);
    });

    it("hands the viewport to a host and hides the note", () => {
      const preview = new FakePreviewHost();
      mountWith(newGame(), root, false, preview);
      expect(preview.attached).toEqual([viewport()]);
      expect(emptyNote().hidden).toBe(true);
    });

    it("shows the seeded draft on mount", () => {
      const preview = new FakePreviewHost();
      const state = newGame();
      mountWith(state, root, false, preview);
      expect(preview.shown).toHaveLength(1);
      expect(preview.shown[0]?.chassisId).toBe(
        state.roster.savedLoadouts[0]?.chassisId,
      );
    });

    it("still draws a draft the validator rejects", () => {
      // An over-weight mech is still the mech the player is looking at,
      // and the frame it goes invalid is the one they need to see it on.
      const preview = new FakePreviewHost();
      mountWith(researched(), root, false, preview);
      drop("arm-weapon-railgun");
      expect(errorCodes()).toEqual(["overweight"]);
      expect(preview.shown.at(-1)?.armWeaponId).toBe("arm-weapon-railgun");
    });

    it("hangs each slot badge where the host says its part landed", () => {
      const preview = new FakePreviewHost();
      mountWith(newGame(), root, false, preview);
      const layer = q('[data-role="slot-anchors"]');
      expect(layer.classList.contains("is-anchored")).toBe(false);
      preview.frame([
        { slot: "legs", x: 100.4, y: 200.6 },
        { slot: "arm-weapon", x: 150, y: 120 },
      ]);
      expect(layer.classList.contains("is-anchored")).toBe(true);
      const legs = q('#mech-stage [data-slot="legs"]');
      expect(legs.dataset.anchored).toBe("true");
      expect(legs.style.left).toBe("100px");
      expect(legs.style.top).toBe("201px");
      // A part the host did not report keeps stacking with the others.
      expect(q('#mech-stage [data-slot="chassis"]').dataset.anchored).toBe(
        undefined,
      );
      preview.frame([]);
      expect(layer.classList.contains("is-anchored")).toBe(false);
      expect(legs.style.left).toBe("");
    });

    it("releases the host on unmount", () => {
      const preview = new FakePreviewHost();
      const { screen } = mountWith(newGame(), root, false, preview);
      screen.unmount();
      expect(preview.releases).toBe(1);
      expect(root.querySelector("#mech-stage")).toBeNull();
    });
  });
  // ===========================================
  // Tech lock (#1171)
  // ===========================================

  describe("tech lock", () => {
    it("marks every part above tier 1 locked until its node is bought, naming the node", () => {
      mountWith(newGame(), root);
      const jumper = card("legs-jumper");
      expect(jumper.dataset.locked).toBe("true");
      const lock = jumper.querySelector<HTMLElement>('[data-role="lock"]');
      expect(lock?.hidden).toBe(false);
      expect(lock?.title).toBe("Unlock Jump Jets on the tech tree");
      expect(jumper.title).toBe("Unlock Jump Jets on the tech tree");
      // Tier 1 needs no node.
      const starter = card(STARTER_LOADOUT.legsId);
      expect(starter.dataset.locked).toBe("false");
      expect(
        starter.querySelector<HTMLElement>('[data-role="lock"]')?.hidden,
      ).toBe(true);
      // Every locked card is a part the tree names, and vice versa.
      const locked = [
        ...root.querySelectorAll<HTMLElement>(
          '#part-palette [data-locked="true"]',
        ),
      ].map((el) => el.dataset.partId);
      const named = TECH_NODES.flatMap((node) => [...node.unlocks]);
      expect(locked.sort()).toEqual([...named].sort());
    });

    it("a locked part still fits the draft, but the sheet lists part-locked and Build is disabled", () => {
      mountWith(newGame(), root);
      drop("legs-jumper");
      expect(fittedId("legs")).toBe("legs-jumper");
      expect(errorCodes()).toContain("part-locked");
      const line = q('#stat-sheet [data-code="part-locked"]');
      expect(line.dataset.slot).toBe("legs");
      expect(line.textContent).toContain("Jumper Legs");
      expect(q('#stat-sheet [data-field="verdict"]').dataset.tone).toBe(
        "danger",
      );
      expect(button("build-mech").disabled).toBe(true);
      expect(button("build-mech").title).toBe("Fix the loadout first");
    });

    it("buying the node through the store clears the lock and the error", () => {
      const base = newGame();
      const state = { ...base, economy: { ...base.economy, techPoints: 18 } };
      const { store } = mountWith(state, root, true);
      drop("legs-jumper");
      // The starter Vanguard is full to the tonne, so the heavier legs
      // are overweight too; only the lock is under test here.
      expect(errorCodes()).toContain("part-locked");
      expect(card("legs-jumper").dataset.locked).toBe("true");
      const outcome = store?.dispatch(unlockTech("tech.jump-jets"));
      expect(outcome?.ok).toBe(true);
      expect(card("legs-jumper").dataset.locked).toBe("false");
      expect(card("legs-jumper").title).toBe(
        PARTS.getPart("legs-jumper")?.description,
      );
      expect(errorCodes()).not.toContain("part-locked");
      expect(fittedId("legs")).toBe("legs-jumper");
    });

    it("without a campaign nothing is locked", () => {
      mountWith(undefined, root);
      expect(
        root.querySelectorAll('#part-palette [data-locked="true"]'),
      ).toHaveLength(0);
    });

    it("the bar offers the tech tree", () => {
      const { navigate } = mountWith(newGame(), root);
      button("tech-tree").click();
      expect(navigate).toHaveBeenCalledWith("tech-tree");
    });
  });
});
