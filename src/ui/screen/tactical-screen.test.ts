// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Unsubscribe } from "../../core/model/event-bus";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { startTacticalMission } from "../../tactical/service/mission-start-service";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import type {
  TacticalIntent,
  TacticalIntentSink,
} from "../model/tactical-intent";
import type { TacticalSceneHost } from "../model/tactical-scene-host";
import { campaignOnDay, missionAt } from "../view/mission-fixtures.test-helper";
import { TacticalScreen } from "./tactical-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

// ===========================================
// Fixtures
// ===========================================

/** A campaign in a live mission with the whole starter roster deployed. */
function inMission(): GameState {
  const state = campaignOnDay(4, [missionAt("mission-2", "lagos", 9, 5)]);
  const parts = new StaticPartCatalogue(STARTER_PARTS);
  const started = startTacticalMission(
    state,
    "mission-2",
    {
      missionId: "mission-2",
      squadIds: state.roster.squads.map((s) => s.id),
      mechIds: state.roster.mechs.map((m) => m.id),
    },
    {
      missionTypes: MISSION_TYPES,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      sheetFor: (mech) => {
        const sheet = validateLoadout(
          mech.loadout,
          parts,
          MECH_RATING_TUNING,
          UPGRADE_TUNING,
        );
        return sheet.ok ? sheet.value : undefined;
      },
      unitTuning: UNIT_TUNING,
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
    },
  );
  if (!started.ok) throw new Error("fixture mission must start");
  return started.value;
}

/** A store that only replaces state on demand. */
class FakeStore implements CampaignStore {
  private state: GameState;
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
  replace(state: GameState): void {
    this.state = state;
    for (const listener of [...this.listeners]) {
      listener({ kind: "replace", state, events: [] });
    }
  }
  dispatch(): never {
    throw new Error("not used");
  }
  onError(): Unsubscribe {
    return () => undefined;
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** Records what the screen asks of the scene host. */
class FakeHost implements TacticalSceneHost {
  readonly calls: string[] = [];
  intents: TacticalIntentSink | undefined;
  attach(
    _c: HTMLElement,
    mission: TacticalState,
    intents: TacticalIntentSink,
  ): Promise<void> {
    this.calls.push(`attach:${mission.missionId}:${mission.turn}`);
    this.intents = intents;
    return Promise.resolve();
  }
  update(mission: TacticalState): Promise<void> {
    this.calls.push(`update:${mission.missionId}:${mission.turn}`);
    return Promise.resolve();
  }
  release(): void {
    this.calls.push("release");
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

const fakeRouter = (): { router: ScreenRouter; navigate: NavigateMock } => {
  const navigate: NavigateMock = vi.fn();
  return {
    router: {
      current: "tactical",
      navigate,
      events: new SimpleEventBus<ScreenRouterEvents>(),
    },
    navigate,
  };
};

// ===========================================
// Tests
// ===========================================

describe("TacticalScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete document.body.dataset.lastIntent;
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const field = (name: string): string =>
    root.querySelector(`#tactical-bar [data-field="${name}"]`)?.textContent ??
    "";

  it("mounts the bar and viewport from the active mission and attaches the scene host", () => {
    const state = inMission();
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(state)),
      sceneHost: host,
    }).mount(root);
    expect(root.querySelector('[data-screen="tactical"]')).not.toBeNull();
    expect(root.querySelector("#tactical-viewport")).not.toBeNull();
    expect(field("mission-id")).toBe("mission-2");
    expect(field("turn")).toBe("1");
    expect(field("phase")).toBe("player");
    expect(field("tdf-units")).toBe(
      String(state.roster.squads.length + state.roster.mechs.length),
    );
    expect(host.calls).toEqual(["attach:mission-2:1"]);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-mission"]')?.hidden,
    ).toBe(true);
  });

  it("updates the host and the bar on store changes, attaching only once per mission", () => {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      sceneHost: host,
    }).mount(root);
    const mission = state.activeMission!;
    store.replace({
      ...state,
      activeMission: { ...mission, turn: 2, phase: "bugs" },
    });
    expect(field("turn")).toBe("2");
    expect(field("phase")).toBe("bugs");
    expect(host.calls).toEqual(["attach:mission-2:1", "update:mission-2:2"]);
  });

  it("forwards intents from the host to the sink and mirrors them on the body", () => {
    const state = inMission();
    const host = new FakeHost();
    const seen: TacticalIntent[] = [];
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(state)),
      sceneHost: host,
      onIntent: (intent) => seen.push(intent),
    }).mount(root);
    host.intents?.emit({ kind: "select-unit", unitId: "unit-1" });
    host.intents?.emit({ kind: "action", action: "move" });
    expect(seen).toHaveLength(2);
    expect(document.body.dataset.selectedUnit).toBe("unit-1");
    expect(document.body.dataset.lastIntent).toBe("move");
  });

  it("says so with dashes when no mission is in progress and never touches the host", () => {
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(campaignOnDay(1, []))),
      sceneHost: host,
    }).mount(root);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-mission"]')?.hidden,
    ).toBe(false);
    expect(field("mission-id")).toBe("—");
    expect(host.calls).toEqual([]);
  });

  it("Overworld navigates and unmount releases the host and unsubscribes", () => {
    const store = new FakeStore(inMission());
    const host = new FakeHost();
    const { router, navigate } = fakeRouter();
    const screen = new TacticalScreen({
      router,
      session: sessionWith(store),
      sceneHost: host,
    });
    screen.mount(root);
    root.querySelector<HTMLButtonElement>('[data-action="overworld"]')?.click();
    expect(navigate).toHaveBeenCalledWith("overworld");
    expect(store.listenerCount).toBe(1);
    screen.unmount();
    expect(store.listenerCount).toBe(0);
    expect(host.calls.at(-1)).toBe("release");
    expect(root.childElementCount).toBe(0);
  });
});
