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
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { FINISH_MISSION } from "../../tactical/model/finish-mission-command";
import { MISSION_ENDED } from "../../tactical/model/mission-ended-event";
import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
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
      spawnTuning: SPAWN_TUNING,
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
  /** Notifies as if a command produced `events`. */
  command(state: GameState, events: CampaignEvent[]): void {
    this.state = state;
    for (const listener of [...this.listeners]) {
      listener({
        kind: "command",
        command: {
          type: "tactical:end-turn",
          payload: { early: false },
        } as OverworldCommand,
        state,
        events,
      });
    }
  }
  readonly dispatched: OverworldCommand[] = [];
  /** Makes `FinishMission` refuse, standing in for a mission that is not over. */
  refuseFinish = false;
  dispatch(command: OverworldCommand) {
    this.dispatched.push(command);
    if (command.type === ATTACK) {
      return err(commandError("no-line-of-sight", "No line of sight"));
    }
    if (this.refuseFinish && command.type === FINISH_MISSION) {
      return err(
        commandError("mission-not-over", 'Mission "m" is still being fought'),
      );
    }
    return ok({ state: this.state, events: [] });
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
  update(
    mission: TacticalState,
    events: readonly { type: string }[] = [],
  ): Promise<void> {
    this.calls.push(
      `update:${mission.missionId}:${mission.turn}:${events.map((e) => e.type).join(",")}`,
    );
    return Promise.resolve();
  }
  select(unitId: string | undefined): void {
    this.calls.push(`select:${unitId ?? "none"}`);
  }
  release(): void {
    this.calls.push("release");
  }
}

/** The same campaign with its mission decided, as the rules leave it. */
function ended(state: GameState): GameState {
  const mission = state.activeMission;
  if (!mission) throw new Error("fixture needs a mission");
  return { ...state, activeMission: { ...mission, outcome: "won" } };
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
    root.querySelector(`#turn-banner [data-field="${name}"]`)?.textContent ??
    "";

  it("mounts the banner and viewport from the active mission and attaches the scene host", () => {
    const state = inMission();
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(state)),
      combatTuning: COMBAT_TUNING,
      sceneHost: host,
    }).mount(root);
    expect(root.querySelector('[data-screen="tactical"]')).not.toBeNull();
    expect(root.querySelector("#tactical-viewport")).not.toBeNull();
    expect(field("mission-id")).toBe("mission-2");
    expect(field("turn")).toBe("1");
    expect(field("phase")).toBe("player phase");
    expect(field("tdf-units")).toBe(
      String(state.roster.squads.length + state.roster.mechs.length),
    );
    expect(host.calls).toEqual(["attach:mission-2:1"]);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-mission"]')?.hidden,
    ).toBe(true);
  });

  it("updates the host and the banner on store changes, attaching only once per mission", () => {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: host,
    }).mount(root);
    const mission = state.activeMission!;
    store.replace({
      ...state,
      activeMission: { ...mission, turn: 2, phase: "bugs" },
    });
    expect(field("turn")).toBe("2");
    expect(field("phase")).toBe("bug phase");
    expect(host.calls).toEqual(["attach:mission-2:1", "update:mission-2:2:"]);
  });

  it("forwards intents from the host to the sink and mirrors them on the body", () => {
    const state = inMission();
    const host = new FakeHost();
    const seen: TacticalIntent[] = [];
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(state)),
      combatTuning: COMBAT_TUNING,
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
      combatTuning: COMBAT_TUNING,
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
      combatTuning: COMBAT_TUNING,
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

  it("hands only the tactical events of a store change to the host, in order (#338)", () => {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: host,
    }).mount(root);
    const mission = state.activeMission!;
    store.command({ ...state, activeMission: { ...mission, turn: 2 } }, [
      {
        type: "economy:credits-changed",
        payload: {
          before: 1,
          after: 2,
          transaction: { id: "t", day: 1, amount: 1, kind: "reward", ref: "r" },
        },
      },
      {
        type: "tactical:unit-moved",
        payload: {
          unitId: "unit-1",
          from: { x: 0, y: 0, z: 0 },
          to: { x: 1, y: 0, z: 0 },
          path: [{ x: 1, y: 0, z: 0 }],
        },
      },
      { type: "tactical:turn-started", payload: { turn: 2, phase: "player" } },
    ] as CampaignEvent[]);
    expect(host.calls.at(-1)).toBe(
      "update:mission-2:2:tactical:unit-moved,tactical:turn-started",
    );
  });

  it("drives the overlays from the HUD's selection, so an attack-mode target click keeps the shooter selected (#338)", () => {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: host,
    }).mount(root);
    const started = state.activeMission!;
    const squad = started.units.find((u) => u.kind === "squad");
    if (!squad) throw new Error("fixture needs a squad");
    const bug = {
      ...squad,
      id: "bug-test",
      kind: "bug" as const,
      team: "bugs" as const,
      sourceId: "swarmer",
      pos: { x: squad.pos.x + 1, y: squad.pos.y, z: squad.pos.z },
    };
    store.replace({
      ...state,
      activeMission: { ...started, units: [...started.units, bug] },
    });
    host.intents?.emit({ kind: "select-unit", unitId: squad.id });
    host.intents?.emit({ kind: "action", action: "attack" });
    host.intents?.emit({ kind: "select-unit", unitId: bug.id });
    const selects = host.calls.filter((c) => c.startsWith("select:"));
    expect(selects[0]).toBe(`select:${squad.id}`);
    expect(selects.at(-1)).toBe(`select:${squad.id}`);
    host.intents?.emit({ kind: "action", action: "cancel" });
    expect(host.calls.at(-1)).toBe(`select:${squad.id}`);
  });

  it("mounts the HUD over the viewport and previews then dispatches an attack from the scene's intents", () => {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: host,
    }).mount(root);
    expect(
      root.querySelector("#tactical-viewport #mission-hud"),
    ).not.toBeNull();
    expect(root.querySelector("#tactical-bar")).toBeNull();
    expect(root.querySelectorAll('[data-action="overworld"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-field="turn"]')).toHaveLength(1);
    expect(
      root.querySelector('#turn-banner [data-field="turn"]')?.textContent,
    ).toBe("1");
    const started = state.activeMission!;
    const squad = started.units.find((u) => u.kind === "squad");
    if (!squad) throw new Error("fixture needs a squad");
    // Bugs hatch later in a real mission; drop one next to the squad so
    // the HUD has an enemy to preview against.
    const bug = {
      ...squad,
      id: "bug-test",
      kind: "bug" as const,
      team: "bugs" as const,
      sourceId: "swarmer",
      pos: { x: squad.pos.x + 1, y: squad.pos.y, z: squad.pos.z },
    };
    const mission = { ...started, units: [...started.units, bug] };
    store.replace({ ...state, activeMission: mission });

    host.intents?.emit({ kind: "select-unit", unitId: squad.id });
    expect(
      root.querySelector('#unit-card [data-field="unit-name"]')?.textContent,
    ).toBe(mission.templates[squad.templateId]?.name);
    host.intents?.emit({ kind: "action", action: "attack" });
    host.intents?.emit({ kind: "select-unit", unitId: bug.id });
    expect(root.querySelector<HTMLElement>("#hit-preview")?.hidden).toBe(false);
    const fire = root.querySelector<HTMLButtonElement>(
      '[data-action="confirm-attack"]',
    );
    if (fire && !fire.disabled) {
      fire.click();
      expect(store.dispatched.map((c) => c.type)).toEqual([ATTACK]);
      expect(
        root.querySelector('#turn-banner [data-role="status"]')?.textContent,
      ).toBe("No line of sight");
    } else {
      expect(
        root.querySelector<HTMLElement>('[data-role="preview-error"]')?.hidden,
      ).toBe(false);
    }
  });

  it("End turn from the HUD goes through the store", () => {
    const store = new FakeStore(inMission());
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: new FakeHost(),
    }).mount(root);
    root
      .querySelector<HTMLButtonElement>('#action-bar [data-action="end-turn"]')
      ?.click();
    expect(store.dispatched.map((c) => c.type)).toEqual(["tactical:end-turn"]);
  });

  // ===========================================
  // Finishing the mission (#341)
  // ===========================================

  it("finishes a mission that reports an outcome and opens the debrief", () => {
    const state = inMission();
    const store = new FakeStore(state);
    const { router, navigate } = fakeRouter();
    new TacticalScreen({
      router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: new FakeHost(),
    }).mount(root);
    expect(store.dispatched).toEqual([]);

    store.command(ended(state), [
      { type: MISSION_ENDED, payload: { outcome: "won", turn: 3 } } as never,
    ]);

    expect(store.dispatched.map((c) => c.type)).toEqual([FINISH_MISSION]);
    expect(store.dispatched[0]?.payload).toEqual({ missionId: "mission-2" });
    expect(navigate).toHaveBeenCalledWith("mission-results");
  });

  it("asks once, however many changes the finished mission goes through", () => {
    const state = inMission();
    const store = new FakeStore(state);
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: new FakeHost(),
    }).mount(root);
    store.replace(ended(state));
    store.replace(ended(state));
    expect(
      store.dispatched.filter((c) => c.type === FINISH_MISSION),
    ).toHaveLength(1);
  });

  it("finishes a mission that was already over when the screen mounted", () => {
    const state = ended(inMission());
    const store = new FakeStore(state);
    const { router, navigate } = fakeRouter();
    new TacticalScreen({
      router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: new FakeHost(),
    }).mount(root);
    expect(store.dispatched.map((c) => c.type)).toEqual([FINISH_MISSION]);
    expect(navigate).toHaveBeenCalledWith("mission-results");
  });

  it("stays on the mission with the reason in the banner when the debrief is refused", () => {
    const state = inMission();
    const store = new FakeStore(state);
    store.refuseFinish = true;
    const { router, navigate } = fakeRouter();
    new TacticalScreen({
      router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      sceneHost: new FakeHost(),
    }).mount(root);
    store.replace(ended(state));

    expect(navigate).not.toHaveBeenCalled();
    expect(
      root.querySelector<HTMLElement>('#turn-banner [data-role="status"]')
        ?.textContent,
    ).toContain("still being fought");
  });
});
