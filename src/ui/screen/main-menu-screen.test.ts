// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashSeed } from "../../core/service/seed-hash";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { GameState } from "../../save/model/game-state";
import type { KeyValueStore } from "../../save/model/key-value-store";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameSaveService } from "../../save/service/game-save-service";
import { createGameSaveService } from "../../save/service/game-save-service";
import type { NewGameOptions } from "../../save/service/game-state-factory";
import { createNewGame } from "../../save/service/new-game-service";
import type { GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import { MainMenuScreen } from "./main-menu-screen";

const NOW = "2026-09-02T12:00:00.000Z";

type NavigateMock = Mock<(id: ScreenId) => void>;

class FakeSession implements GameSession {
  readonly store = undefined;
  state: GameState | undefined;
  start(state: GameState): void {
    this.state = state;
  }
  replace(state: GameState): void {
    this.state = state;
  }
  clear(): void {
    this.state = undefined;
  }
}

/** A campaign from the shipped content. */
const createCampaign = (options: NewGameOptions): GameState =>
  createNewGame(options, {
    map: EARTH_MAP,
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    starterRoster: STARTER_ROSTER,
    newGameTuning: NEW_GAME_TUNING,
    threatTuning: THREAT_TUNING,
    economyTuning: ECONOMY_TUNING,
  });

const savesOver = (store: KeyValueStore): GameSaveService =>
  createGameSaveService(store, { now: () => NOW });

const fakeRouter = (): { router: ScreenRouter; navigate: NavigateMock } => {
  const navigate: NavigateMock = vi.fn();
  const router: ScreenRouter = {
    current: "main-menu",
    navigate,
    events: new SimpleEventBus<ScreenRouterEvents>(),
  };
  return { router, navigate };
};

describe("MainMenuScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const mountWith = (store: KeyValueStore = new MemoryKeyValueStore()) => {
    const { router, navigate } = fakeRouter();
    const session = new FakeSession();
    const saves = savesOver(store);
    const screen = new MainMenuScreen({
      router,
      session,
      saves,
      createCampaign,
      newSeed: () => 42,
      clock: { now: () => NOW },
    });
    screen.mount(root);
    return { navigate, session, saves, screen };
  };

  const button = (action: string): HTMLButtonElement => {
    const element = root.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    );
    if (!element) {
      throw new Error(`Missing button ${action}`);
    }
    return element;
  };

  const field = <T extends HTMLElement>(name: string): T => {
    const element = root.querySelector<T>(`[data-field="${name}"]`);
    if (!element) {
      throw new Error(`Missing field ${name}`);
    }
    return element;
  };

  const status = (): HTMLElement | null =>
    root.querySelector<HTMLElement>('[data-role="status"]');

  const withAutosave = (seed: number) => {
    const store = new MemoryKeyValueStore();
    const existing = createCampaign({ seed, createdAt: NOW });
    savesOver(store).saveGame(AUTOSAVE_SLOT_ID, existing);
    return { store, existing };
  };

  it("renders the controls with Continue and Export disabled when there is no autosave", () => {
    mountWith();
    expect(root.querySelector('[data-screen="main-menu"]')).not.toBeNull();
    expect(button("new-game").disabled).toBe(false);
    expect(button("continue").disabled).toBe(true);
    expect(button("export").disabled).toBe(true);
    expect(button("import").disabled).toBe(false);
  });

  it("pre-fills the seed box from the injected seed source", () => {
    mountWith();
    expect(field<HTMLInputElement>("seed").value).toBe("42");
  });

  it("New game starts a session from the seed box and clock, then navigates", () => {
    const { navigate, session } = mountWith();
    button("new-game").click();
    expect(session.state?.meta.seed).toBe(42);
    expect(session.state?.meta.createdAt).toBe(NOW);
    expect(session.state?.roster.squads.length).toBeGreaterThan(0);
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("New game honours a typed numeric seed and hashes a text seed", () => {
    const first = mountWith();
    field<HTMLInputElement>("seed").value = "12345";
    button("new-game").click();
    expect(first.session.state?.meta.seed).toBe(12345);

    first.screen.unmount();
    const second = mountWith();
    field<HTMLInputElement>("seed").value = "terra-01";
    button("new-game").click();
    expect(second.session.state?.meta.seed).toBe(hashSeed("terra-01"));
  });

  it("does not write a save itself; the session observer owns autosave", () => {
    const { saves } = mountWith();
    button("new-game").click();
    expect(saves.listSlots()).toEqual([]);
  });

  it.each([
    ["corrupt JSON", "{not json"],
    ["an empty value", ""],
    ["a JSON null", "null"],
    ["an array", "[]"],
  ])(
    "disables Continue and Export and explains an autosave that is %s",
    (_label, raw) => {
      const store = new MemoryKeyValueStore();
      store.set(`tut:save:${AUTOSAVE_SLOT_ID}`, raw);
      mountWith(store);
      expect(button("continue").disabled).toBe(true);
      expect(button("export").disabled).toBe(true);
      expect(status()?.hidden).toBe(false);
      expect(status()?.textContent).toContain("cannot be read");
      expect(status()?.textContent).toContain("start a new game");
    },
  );

  it("says an autosave from a newer schema was written by a newer version", () => {
    const { store } = withAutosave(7);
    const key = `tut:save:${AUTOSAVE_SLOT_ID}`;
    const envelope = JSON.parse(store.get(key) ?? "{}") as {
      schemaVersion: number;
    };
    store.set(
      key,
      JSON.stringify({
        ...envelope,
        schemaVersion: envelope.schemaVersion + 1,
      }),
    );
    mountWith(store);
    expect(button("continue").disabled).toBe(true);
    expect(status()?.textContent).toContain("newer version");
    expect(status()?.textContent).toContain("unsupported-version");
  });

  it("treats a decodable envelope whose state is not a campaign the same way", () => {
    const { store } = withAutosave(7);
    const key = `tut:save:${AUTOSAVE_SLOT_ID}`;
    const envelope = JSON.parse(store.get(key) ?? "{}") as object;
    store.set(key, JSON.stringify({ ...envelope, state: 42 }));
    mountWith(store);
    expect(button("continue").disabled).toBe(true);
    expect(status()?.textContent).toContain("not a campaign");
  });

  it("stays quiet when there is simply no autosave", () => {
    mountWith();
    expect(status()?.hidden ?? true).toBe(true);
  });

  it("Continue is enabled with an autosave and loads it into the session", () => {
    const { store, existing } = withAutosave(99);
    const { navigate, session } = mountWith(store);
    expect(button("continue").disabled).toBe(false);
    button("continue").click();
    expect(session.state).toEqual(existing);
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("Export writes the autosave as importable JSON into the text box", () => {
    const { store, existing } = withAutosave(5);
    const { saves } = mountWith(store);
    button("export").click();
    const text = field<HTMLTextAreaElement>("save-json").value;
    expect(JSON.parse(text)).toMatchObject({ savedAt: NOW });
    const imported = saves.importGame(text);
    expect(imported.ok && imported.value).toEqual(existing);
    expect(status()?.hidden).toBe(false);
  });

  it("Import starts a session from pasted JSON and navigates", () => {
    const { existing } = withAutosave(8);
    const { navigate, session, saves } = mountWith();
    field<HTMLTextAreaElement>("save-json").value = saves.exportGame(existing);
    button("import").click();
    expect(session.state).toEqual(existing);
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("Import rejects an empty or malformed document without leaving the menu", () => {
    const { navigate, session } = mountWith();
    button("import").click();
    expect(status()?.textContent).toContain("Paste an exported save");

    field<HTMLTextAreaElement>("save-json").value = '{"not":"a save"}';
    button("import").click();
    expect(status()?.textContent).toContain("Could not import save");
    expect(session.state).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("unmount removes the panel and its listeners", () => {
    const { navigate, screen } = mountWith();
    const newGame = button("new-game");
    screen.unmount();
    expect(root.children).toHaveLength(0);
    newGame.click();
    expect(navigate).not.toHaveBeenCalled();
  });
});
