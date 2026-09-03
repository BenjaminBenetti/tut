// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Unsubscribe } from "../../core/model/event-bus";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import {
  STARTER_LOADOUT,
  STARTER_ROSTER,
} from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { MechBayScreen } from "./mech-bay-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

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

const sessionWith = (store: CampaignStore | undefined): GameSession => ({
  store,
  state: store?.getState(),
  start: () => undefined,
  replace: () => undefined,
  clear: () => undefined,
});

/** Mounts the screen over `state`. */
function mountWith(
  state: GameState | undefined,
  root: HTMLElement,
): {
  store: ReadStore | undefined;
  navigate: NavigateMock;
  screen: MechBayScreen;
} {
  const store = state ? new ReadStore(state) : undefined;
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
    rating: MECH_RATING_TUNING,
    upgrades: UPGRADE_TUNING,
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
  const picker = (key: string): HTMLSelectElement =>
    q<HTMLSelectElement>(`select[data-field="${key}"]`);
  const choose = (key: string, value: string): void => {
    const el = picker(key);
    el.value = value;
    el.dispatchEvent(new Event("change"));
  };
  const sheetField = (name: string): string =>
    q(`#stat-sheet [data-field="${name}"]`).textContent ?? "";
  const errorCodes = (): string[] =>
    [
      ...root.querySelectorAll<HTMLElement>(
        '#stat-sheet [data-role="errors"] li',
      ),
    ].map((li) => li.dataset.code ?? "");

  it("seeds the editor from the first saved template and shows its validated sheet", () => {
    mountWith(newGame(), root);
    expect(root.querySelector('[data-screen="mech-bay"]')).not.toBeNull();
    expect(q('#mech-bay-bar [data-field="credits"]').textContent).toBe(
      "¢5,000",
    );
    expect(q<HTMLInputElement>('[data-field="loadout-name"]').value).toBe(
      STARTER_LOADOUT.name,
    );
    expect(picker("chassis").value).toBe(STARTER_LOADOUT.chassisId);
    expect(picker("arm-weapon").value).toBe(STARTER_LOADOUT.armWeaponId);
    // Vanguard carries two utilities: one filled from the template, one empty.
    expect(picker("utility-0").value).toBe(STARTER_LOADOUT.utilityIds[0]);
    expect(picker("utility-1").value).toBe("");
    expect(root.querySelector('select[data-field="utility-2"]')).toBeNull();
    expect(q('#stat-sheet [data-field="verdict"]').dataset.tone).toBe("ok");
    expect(sheetField("combatRating")).toBe("129");
    expect(sheetField("totalCost")).toBe("¢3,250");
    expect(sheetField("weight")).toBe("60");
  });

  it("lists every catalogue part for a slot priced, and only that slot's parts", () => {
    mountWith(newGame(), root);
    const options = [...picker("arm-weapon").options].map((o) => o.value);
    expect(options).toEqual(PARTS.partsForSlot("arm-weapon").map((p) => p.id));
    expect(picker("arm-weapon").options[0]?.textContent).toMatch(/· ¢[\d,]+$/);
    expect([...picker("utility-0").options][0]?.value).toBe("");
  });

  it("re-validates on every change: a heavy gun shows an overweight error inline and in the sheet", () => {
    mountWith(newGame(), root);
    choose("arm-weapon", "arm-weapon-railgun");
    expect(errorCodes()).toEqual(["overweight"]);
    expect(q('#stat-sheet [data-field="verdict"]').dataset.tone).toBe("danger");
    expect(sheetField("combatRating")).toBe("—");
    const inline = q('[data-row="chassis"] [data-role="slot-error"]');
    expect(inline.hidden).toBe(false);
    expect(inline.textContent).toContain("carries at most");

    choose("arm-weapon", STARTER_LOADOUT.armWeaponId);
    expect(errorCodes()).toEqual([]);
    expect(inline.hidden).toBe(true);
    expect(sheetField("combatRating")).toBe("129");
  });

  it("changing the chassis rebuilds the utility pickers to its slot count and keeps the rest", () => {
    mountWith(newGame(), root);
    choose("chassis", "chassis-atlas");
    expect(picker("chassis").value).toBe("chassis-atlas");
    expect(picker("arm-weapon").value).toBe(STARTER_LOADOUT.armWeaponId);
    expect(root.querySelectorAll('select[data-slot="utility"]')).toHaveLength(
      4,
    );
    expect(picker("utility-0").value).toBe(STARTER_LOADOUT.utilityIds[0]);
    expect(sheetField("totalCost")).toBe("¢5,250");
  });

  it("starts from the first catalogue part per slot when no template is saved", () => {
    const state = newGame();
    mountWith(
      { ...state, roster: { ...state.roster, savedLoadouts: [] } },
      root,
    );
    expect(q<HTMLInputElement>('[data-field="loadout-name"]').value).toBe(
      "New loadout",
    );
    expect(picker("chassis").value).toBe(PARTS.partsForSlot("chassis")[0]?.id);
    expect(picker("utility-0").value).toBe("");
    expect(q('#stat-sheet [data-field="verdict"]').dataset.tone).toBe("ok");
  });

  it("shows dashes for credits with no campaign and still edits a draft", () => {
    mountWith(undefined, root);
    expect(q('#mech-bay-bar [data-field="credits"]').textContent).toBe("—");
    expect(picker("chassis").value).not.toBe("");
  });

  it("Roster navigates back and unmount unsubscribes and clears the DOM", () => {
    const { store, navigate, screen } = mountWith(newGame(), root);
    q<HTMLButtonElement>('[data-action="roster"]').click();
    expect(navigate).toHaveBeenCalledWith("roster");
    expect(store?.listenerCount).toBe(1);
    screen.unmount();
    expect(store?.listenerCount).toBe(0);
    expect(root.childElementCount).toBe(0);
  });
});
