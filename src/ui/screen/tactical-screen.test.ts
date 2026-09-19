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
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { GARRISON_TUNING } from "../../tactical/data/garrison-tuning";
import { GENERATOR_TUNING } from "../../tactical/data/generator-tuning";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import { ABANDON_MISSION } from "../../tactical/model/abandon-mission-command";
import { ATTACK } from "../../tactical/model/attack-command";
import { END_TURN } from "../../tactical/model/end-turn-command";
import { FINISH_MISSION } from "../../tactical/model/finish-mission-command";
import { MISSION_ENDED } from "../../tactical/model/mission-ended-event";
import { placeUnit } from "../../tactical/model/place-unit-command";
import { TURN_STARTED } from "../../tactical/model/turn-started-event";
import type { CommandError } from "../../core/model/command-error";
import { commandError } from "../../core/model/command-error";
import type { ReloadCommand } from "../../tactical/model/reload-command";
import type { RELOAD } from "../../tactical/model/reload-command";
import { reloadHandler } from "../../tactical/service/reload-handler";
import { liftTacticalHandler } from "../../tactical/service/tactical-command-handlers";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { err, ok } from "../../core/model/result";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
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
import type { LayerFocus } from "../../graphics/model/layer-focus";
import type {
  TacticalSceneHost,
  TacticalUpdateHooks,
} from "../model/tactical-scene-host";
import { campaignOnDay, missionAt } from "../view/mission-fixtures.test-helper";
import { TacticalScreen } from "./tactical-screen";
import { describeTacticalError } from "../../tactical/model/tactical-error";

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
      garrison: GARRISON_TUNING,
      generator: GENERATOR_TUNING,
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

/**
 * A store that runs a refused command through the **real** lifted
 * handler (#1035).
 *
 * `FakeStore` above hands back a refusal someone typed by hand, so a
 * status-line test built on it can never see the message the simulation
 * actually produces -- and the id leak lives in exactly that message.
 * This one dispatches for real, so the test's subject is the sentence
 * the player was getting.
 */
class RealDispatchStore implements CampaignStore {
  /** The refusal the screen was handed, so a test can check the fixture leaks before asserting the screen hides it. */
  lastError: CommandError | undefined;
  constructor(private readonly state: GameState) {}
  getState(): GameState {
    return this.state;
  }
  subscribe(): Unsubscribe {
    return () => undefined;
  }
  dispatch(command: OverworldCommand) {
    const result = liftTacticalHandler<GameState, typeof RELOAD>(reloadHandler)(
      this.state,
      command as ReloadCommand,
      { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() },
    );
    if (!result.ok) {
      this.lastError = result.error;
    }
    return result;
  }
  onError(): Unsubscribe {
    return () => undefined;
  }
}

/** Records what the screen asks of the scene host. */
class FakeHost implements TacticalSceneHost {
  readonly calls: string[] = [];
  intents: TacticalIntentSink | undefined;
  /** Every delta the screen asked for (#961). */
  readonly layerSteps: number[] = [];
  /** A three-storey map, so a step has somewhere to go and an end to clamp at. */
  focus: LayerFocus = { storey: 2, storeyCount: 3 };
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
    events: readonly TacticalEvent[] = [],
    hooks: TacticalUpdateHooks = {},
  ): Promise<void> {
    this.calls.push(
      `update:${mission.missionId}:${mission.turn}:${events.map((e) => e.type).join(",")}`,
    );
    // The fake plays instantly: every event, then settled, synchronously,
    // so the tests below can assert straight after a store change.
    for (const event of events) {
      hooks.onEvent?.(event);
    }
    if (this.deferSettle) {
      return new Promise((resolve) => {
        this.pendingSettle = () => {
          hooks.onSettled?.();
          resolve();
        };
      });
    }
    hooks.onSettled?.();
    return Promise.resolve();
  }
  /** When set, `update` holds its settle until `settle()`, like a scene still animating (#1130). */
  deferSettle = false;
  private pendingSettle: (() => void) | undefined;
  /** Lets a deferred update settle, as the scene does after its last event. */
  settle(): void {
    const settle = this.pendingSettle;
    this.pendingSettle = undefined;
    settle?.();
  }
  /** What the screen last told the map's input (#1130); undefined until told. */
  locked: boolean | undefined;
  /** Every lock the screen pushed, in order; kept out of `calls` so the older assertions hold. */
  readonly lockCalls: boolean[] = [];
  setInputLocked(locked: boolean): void {
    this.locked = locked;
    this.lockCalls.push(locked);
  }
  /** Every tile the screen asked to frame, undefined for a clear. */
  readonly marked: (string | undefined)[] = [];
  markTile(tile: { x: number; y: number; z: number } | undefined): void {
    this.marked.push(
      tile === undefined
        ? undefined
        : `${String(tile.x)},${String(tile.y)},${String(tile.z)}`,
    );
  }
  /** Blast footprints the screen asked to paint (#1121), by tile count. */
  readonly blasts: number[] = [];
  markBlast(tiles: readonly { x: number; y: number; z: number }[]): void {
    this.blasts.push(tiles.length);
  }
  /** Weapon reaches the screen asked to paint (#1132), by tile count. */
  readonly ranges: number[] = [];
  markWeaponRange(tiles: readonly { x: number; y: number; z: number }[]): void {
    this.ranges.push(tiles.length);
  }
  /** Units the screen asked to centre on (#1041). */
  readonly lookedAt: string[] = [];
  lookAtUnit(unitId: string): void {
    this.lookedAt.push(unitId);
  }
  select(unitId: string | undefined): void {
    this.calls.push(`select:${unitId ?? "none"}`);
  }
  readonly notices: string[] = [];
  notice(unitId: string, text: string): void {
    this.notices.push(`${unitId}: ${text}`);
  }
  setWeaponRangeVisible(visible: boolean): void {
    this.calls.push(`weapon-range:${String(visible)}`);
  }
  screenPositionOf(): { x: number; y: number } | undefined {
    // The fake draws nothing, so nothing has a screen position.
    return undefined;
  }
  unitHeadScreenPosition(): { x: number; y: number } | undefined {
    return undefined;
  }

  stepLayerFocus(delta: number): LayerFocus | undefined {
    this.layerSteps.push(delta);
    this.focus = {
      storey: Math.min(2, Math.max(0, this.focus.storey + delta)),
      storeyCount: 3,
    };
    return this.focus;
  }

  layerFocus(): LayerFocus | undefined {
    return this.focus;
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

  // #961: a layer step is a view change. It reaches the scene, the
  // readout follows what the scene clamped to, and nothing about the
  // mission moves.
  it("steps the storey through the scene and shows where it landed", () => {
    const state = inMission();
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(state)),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    }).mount(root);
    // Opens on the top storey without anyone pressing a key.
    expect(field("floor")).toBe("All");

    host.intents?.emit({ kind: "layer-step", delta: -1 });
    expect(host.layerSteps).toEqual([-1]);
    expect(field("floor")).toBe("2 / 2");
    expect(document.body.dataset.lastIntent).toBe("layer-step");

    // Clamped by the scene, and the readout follows the scene rather
    // than the request: three presses down from storey 2 is one move.
    host.intents?.emit({ kind: "layer-step", delta: -1 });
    host.intents?.emit({ kind: "layer-step", delta: -1 });
    host.intents?.emit({ kind: "layer-step", delta: -1 });
    expect(field("floor")).toBe("1 / 2");

    // The mission is untouched throughout.
    expect(field("turn")).toBe("1");
    expect(host.calls).toEqual(["attach:mission-2:1"]);
  });

  it("steps the storey from the banner buttons as well as the keys", () => {
    const state = inMission();
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(state)),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    }).mount(root);
    root
      .querySelector<HTMLButtonElement>('[data-action="layer-down"]')
      ?.click();
    expect(host.layerSteps).toEqual([-1]);
    expect(field("floor")).toBe("2 / 2");
    root.querySelector<HTMLButtonElement>('[data-action="layer-up"]')?.click();
    expect(host.layerSteps).toEqual([-1, 1]);
    expect(field("floor")).toBe("All");
  });

  /**
   * The scene host builds asynchronously, so a failure arrives as a
   * rejected promise long after `mount` returns. The catch that reports
   * it had never fired in any suite (#735): a scene that failed to build
   * left the screen up and said nothing anywhere.
   */
  it("reports a scene that fails to build instead of dropping the rejection", async () => {
    const failing = new FakeHost();
    const boom = new Error("no webgl");
    failing.attach = () => Promise.reject(boom);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Swallow it: the assertion below is what this test is about.
    });
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(inMission())),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: failing,
    }).mount(root);
    await Promise.resolve();
    await Promise.resolve();
    expect(logged).toHaveBeenCalledWith("Tactical scene failed", boom);
    logged.mockRestore();
  });

  /**
   * Anything worth a line in the log is worth showing where it happened
   * (#1029) — with movement the one exception, because the unit walking
   * is already the indicator.
   *
   * The words are the log's own, from `event-vocabulary`, so the record
   * at the edge of the screen and the notification above the unit can
   * never say different things about the same event.
   */
  it("indicates every logged action above the unit that did it, except a move", () => {
    const state = inMission();
    const host = new FakeHost();
    const store = new FakeStore(state);
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    }).mount(root);
    host.notices.length = 0;

    store.command(state, [
      {
        type: "tactical:unit-reloaded",
        payload: { unitId: "unit-1" },
      },
      {
        type: "tactical:unit-status-changed",
        payload: { unitId: "unit-2", status: ["overwatch"] },
      },
      // Excluded: the unit walking is already the indicator.
      {
        type: "tactical:unit-moved",
        payload: {
          unitId: "unit-1",
          from: { x: 0, y: 0, z: 0 },
          to: { x: 1, y: 0, z: 0 },
          path: [{ x: 1, y: 0, z: 0 }],
        },
      },
      // Belongs to the log, not to any unit.
      { type: "tactical:turn-started", payload: { turn: 2, phase: "player" } },
    ] as never);

    // Two units acting in succession, each above its own unit.
    expect(host.notices).toHaveLength(2);
    expect(host.notices[0]).toContain("unit-1");
    expect(host.notices[1]).toContain("unit-2");
    // No move, no turn-start.
    expect(host.notices.join(" ")).not.toContain("moved");
    expect(host.notices.join(" ")).not.toContain("Turn");

    // The property that matters, and the reason the vocabulary was
    // lifted into one module: the words above the unit are the words in
    // the log. Asserted against the log's *rendered* lines rather than
    // against the same function that produced them, so this cannot pass
    // by both readers being wrong together.
    const logged = [
      ...root.querySelectorAll<HTMLElement>('[data-role="event-log-list"] li'),
    ].map((line) => line.textContent ?? "");
    for (const notice of host.notices) {
      const words = notice.slice(notice.indexOf(": ") + 2);
      expect(
        logged.some((line) => line.includes(words)),
        `the log does not say what the indicator says: ${words}`,
      ).toBe(true);
    }
  });

  it("mounts the banner and viewport from the active mission and attaches the scene host", () => {
    const state = inMission();
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(state)),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    }).mount(root);
    expect(root.querySelector('[data-screen="tactical"]')).not.toBeNull();
    expect(root.querySelector("#tactical-viewport")).not.toBeNull();
    // The banner names the city the mission list named, not the id
    // (#753). `missionAt` puts this one in Lagos.
    expect(field("mission-name")).toBe("Lagos");
    expect(root.textContent).not.toContain("mission-2");
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
      objectiveTuning: OBJECTIVE_TUNING,
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
      objectiveTuning: OBJECTIVE_TUNING,
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
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    }).mount(root);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-mission"]')?.hidden,
    ).toBe(false);
    expect(field("mission-name")).toBe("—");
    expect(host.calls).toEqual([]);
  });

  it("unmount releases the host and unsubscribes", () => {
    const store = new FakeStore(inMission());
    const host = new FakeHost();
    const { router } = fakeRouter();
    const screen = new TacticalScreen({
      router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    });
    screen.mount(root);
    expect(store.listenerCount).toBe(1);
    screen.unmount();
    expect(store.listenerCount).toBe(0);
    expect(host.calls.at(-1)).toBe("release");
    expect(root.childElementCount).toBe(0);
  });

  describe("Leave (#1132)", () => {
    const dialog = (): HTMLElement | null =>
      root.querySelector<HTMLElement>('[data-role="leave-dialog"]');
    const leaveButton = (): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>(
        '#turn-banner [data-action="leave-mission"]',
      );

    /** A mounted screen in a live mission, with the whole force on the map. */
    function mountedInMission(state = inMission()) {
      const store = new FakeStore(state);
      const host = new FakeHost();
      const { router, navigate } = fakeRouter();
      const screen = new TacticalScreen({
        router,
        session: sessionWith(store),
        combatTuning: COMBAT_TUNING,
        objectiveTuning: OBJECTIVE_TUNING,
        sceneHost: host,
      });
      screen.mount(root);
      return { screen, store, host, navigate, state };
    }

    it("offers Leave in the banner and no longer offers the overworld", () => {
      mountedInMission();
      expect(leaveButton()?.textContent).toBe("Leave");
      expect(root.querySelector('[data-action="overworld"]')).toBeNull();
      expect(dialog()?.hidden).toBe(true);
    });

    it("asks before stranding the force, naming the units and the failed outcome, and Stay keeps the mission", () => {
      const { store, navigate, state } = mountedInMission();
      leaveButton()?.click();
      expect(dialog()?.hidden).toBe(false);
      const text = dialog()?.textContent ?? "";
      for (const squad of state.roster.squads) {
        expect(text).toContain(squad.name);
      }
      for (const mech of state.roster.mechs) {
        expect(text).toContain(mech.name);
      }
      expect(text).toContain("recorded as failed");
      expect(text).not.toContain("unit-1");
      root
        .querySelector<HTMLButtonElement>('[data-action="leave-cancel"]')
        ?.click();
      expect(dialog()?.hidden).toBe(true);
      expect(store.dispatched.map((c) => c.type)).not.toContain(
        ABANDON_MISSION,
      );
      expect(navigate).not.toHaveBeenCalled();
    });

    it("dispatches AbandonMission on confirm", () => {
      const { store } = mountedInMission();
      leaveButton()?.click();
      root
        .querySelector<HTMLButtonElement>('[data-action="leave-confirm"]')
        ?.click();
      expect(dialog()?.hidden).toBe(true);
      expect(store.dispatched.map((c) => c.type)).toEqual([ABANDON_MISSION]);
    });

    it("says the mission will be won when the objectives are done, and leaves at once when nothing is at stake", () => {
      const started = inMission();
      const mission = started.activeMission!;
      const done = {
        ...started,
        activeMission: {
          ...mission,
          objectives: mission.objectives.map((o) => ({ ...o, complete: true })),
        },
      };
      const { store } = mountedInMission(done);
      leaveButton()?.click();
      // The job is done but nobody is aboard yet: the rules record that
      // as lost, and the dialog says so rather than promising a win.
      expect(dialog()?.textContent).toContain("nobody has boarded");
      expect(dialog()?.textContent).toContain("recorded as failed");
      root
        .querySelector<HTMLButtonElement>('[data-action="leave-cancel"]')
        ?.click();
      // One unit out and the rest still on the map: recorded as won,
      // with the stragglers lost.
      const [first, ...rest] = mission.units.filter((u) => u.team === "tdf");
      store.replace({
        ...done,
        activeMission: {
          ...done.activeMission,
          units: [...rest, ...mission.units.filter((u) => u.team !== "tdf")],
          extracted: [first!],
        },
      });
      leaveButton()?.click();
      expect(dialog()?.textContent).toContain("recorded as won");
      root
        .querySelector<HTMLButtonElement>('[data-action="leave-cancel"]')
        ?.click();
      // Everyone aboard and the job done: no question to ask.
      const aboard = {
        ...done,
        activeMission: {
          ...done.activeMission,
          units: mission.units.filter((u) => u.team !== "tdf"),
          extracted: mission.units.filter((u) => u.team === "tdf"),
        },
      };
      store.replace(aboard);
      leaveButton()?.click();
      expect(dialog()?.hidden).toBe(true);
      expect(store.dispatched.map((c) => c.type)).toEqual([ABANDON_MISSION]);
    });

    it("is the way back to the overworld when no mission is in progress", () => {
      const store = new FakeStore(campaignOnDay(4, []));
      const { router, navigate } = fakeRouter();
      new TacticalScreen({
        router,
        session: sessionWith(store),
        combatTuning: COMBAT_TUNING,
        objectiveTuning: OBJECTIVE_TUNING,
      }).mount(root);
      leaveButton()?.click();
      expect(navigate).toHaveBeenCalledWith("overworld");
      expect(store.dispatched).toEqual([]);
    });
  });

  it("hands only the tactical events of a store change to the host, in order (#338)", () => {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
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
      objectiveTuning: OBJECTIVE_TUNING,
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
    // Every intent also pushes the weapon-range toggle (#522), so ask the
    // selection calls rather than the last call of any kind.
    expect(host.calls.filter((c) => c.startsWith("select:")).at(-1)).toBe(
      `select:${squad.id}`,
    );
  });

  it("mounts the HUD over the viewport and previews then dispatches an attack from the scene's intents", () => {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    }).mount(root);
    expect(
      root.querySelector("#tactical-viewport #mission-hud"),
    ).not.toBeNull();
    expect(root.querySelector("#tactical-bar")).toBeNull();
    expect(root.querySelectorAll('[data-action="leave-mission"]')).toHaveLength(
      1,
    );
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
    // The squad's roster identity, not its type (#1040): two squads of
    // one type share a template name, so the card used to call both of
    // them "Rifle Squad" while the debrief said Alpha and Bravo.
    expect(
      root.querySelector('#unit-card [data-field="unit-name"]')?.textContent,
    ).toBe(
      state.roster.squads.find((s) => s.id === squad.sourceId)?.name ??
        mission.templates[squad.templateId]?.name,
    );
    // The readiness rail beside it agrees. It arrived in #1041 wired to
    // the log's old resolver, which answers with the template name, so
    // without this the same defect would live on in a second surface
    // while the card beside it read "Alpha".
    const railNames = [
      ...root.querySelectorAll('[data-role="squad-list"] li .tut-squad__name'),
    ].map((el) => el.textContent);
    const rosterNames = state.roster.squads.map((sq) => sq.name);
    expect(railNames.length).toBeGreaterThan(0);
    for (const name of rosterNames) {
      expect(railNames, `the rail must name ${name}`).toContain(name);
    }
    // And no row falls back to a template name or a raw id.
    for (const name of railNames) {
      expect(name).not.toMatch(/^unit-/);
    }

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

  it("a refused command names the unit in the banner, never its id (#1035)", () => {
    // The whole path a player takes: select a squad that has not fired,
    // press Reload, read the banner. Nothing is stubbed between the
    // keypress and the sentence.
    const state = inMission();
    const squad = state.activeMission?.units.find((u) => u.kind === "squad");
    if (!squad) throw new Error("fixture needs a squad");
    const store = new RealDispatchStore(state);
    const host = new FakeHost();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    }).mount(root);

    host.intents?.emit({ kind: "select-unit", unitId: squad.id });
    host.intents?.emit({ kind: "action", action: "reload" });

    // The fixture exhibits the defect. Without this the test could pass
    // on a build where the simulation never puts an id in the message,
    // and would then be asserting nothing at all.
    //
    // Against the rules' own wording rather than `store.lastError`,
    // because #1062 stopped the bar offering Reload to a squad that has
    // nothing to reload — so this press is refused *before* dispatch and
    // the store never sees it. The guarantee under test is unchanged
    // (the id exists, and the player is not shown it); what moved is
    // which layer refuses. **The dispatch boundary itself needs a case
    // that still dispatches** — an attack refused for range or line of
    // sight is one — and that is worth its own test rather than this
    // one quietly covering less than its name says.
    expect(
      describeTacticalError({ kind: "charges-full", unitId: squad.id }),
      "the rules' own message must carry the id, or there is nothing to hide",
    ).toContain(squad.id);

    const status = root.querySelector(
      '#turn-banner [data-role="status"]',
    )?.textContent;
    expect(status).not.toContain(squad.id);
    // And it is the same name the card beside it is showing, so the two
    // lines on screen agree about which unit refused.
    const name = root.querySelector(
      '#unit-card [data-field="unit-name"]',
    )?.textContent;
    expect(name).toBeTruthy();
    expect(status).toBe(`${String(name)} is already fully loaded`);
  });

  it("End turn from the HUD goes through the store", () => {
    const store = new FakeStore(inMission());
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
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
      objectiveTuning: OBJECTIVE_TUNING,
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
      objectiveTuning: OBJECTIVE_TUNING,
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
      objectiveTuning: OBJECTIVE_TUNING,
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
      objectiveTuning: OBJECTIVE_TUNING,
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

// ===========================================
// Phase banners (#523)
// ===========================================

/** Timers a test fires by hand, so no banner or watchdog waits on a wall clock. */
function manualTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    options: {
      holdMs: 1000,
      setTimer: (run: () => void) => {
        const handle = next++;
        pending.set(handle, run);
        return handle;
      },
      clearTimer: (handle: number) => {
        pending.delete(handle);
      },
    },
    /** How many timers are waiting. */
    pending: () => pending.size,
    fire: () => {
      for (const [handle, run] of [...pending]) {
        pending.delete(handle);
        run();
      }
    },
  };
}

describe("TacticalScreen phase banners", () => {
  // The suite above keeps its own root in the document; clear it, or a
  // stale `#turn-banner` shadows this one when an id selector is
  // resolved document-wide.
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("announces the bug phase and then the player's turn from one EndTurn", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const state = inMission();
    const store = new FakeStore(state);
    const timers = manualTimers();
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: new FakeHost(),
      phaseBanner: timers.options,
    }).mount(root);

    const banner = () =>
      root.querySelector<HTMLElement>('[data-role="phase-banner"]');
    expect(banner()?.hidden).toBe(true);

    // The shipped EndTurn plays the whole bug phase and hands the turn
    // back, so both TurnStarted events arrive in one store change.
    const mission = state.activeMission!;
    store.command(
      {
        ...state,
        activeMission: { ...mission, phase: "player", turn: 2 },
      },
      [
        { type: TURN_STARTED, payload: { turn: 1, phase: "bugs" } },
        { type: TURN_STARTED, payload: { turn: 2, phase: "player" } },
      ] as CampaignEvent[],
    );

    expect(banner()?.hidden).toBe(false);
    expect(banner()?.dataset.phase).toBe("bugs");
    timers.fire();
    expect(banner()?.dataset.phase).toBe("player");
    expect(
      banner()?.querySelector('[data-field="detail"]')?.textContent,
    ).toContain("The bugs have finished");
    timers.fire();
    expect(banner()?.hidden).toBe(true);

    // The persistent readout is untouched by any of this.
    const readout = root.querySelector<HTMLElement>(
      '#turn-banner [data-field="phase"]',
    );
    expect(readout?.dataset.phase).toBe("player");
    expect(readout?.textContent).toBe("player phase");
    root.remove();
  });

  it("leaves the banner alone for a change that carried no phase", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const state = inMission();
    const store = new FakeStore(state);
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: new FakeHost(),
      phaseBanner: manualTimers().options,
    }).mount(root);
    store.replace(state);
    expect(
      root.querySelector<HTMLElement>('[data-role="phase-banner"]')?.hidden,
    ).toBe(true);
    root.remove();
  });
});

// ===========================================
// Playback lock (#1130)
// ===========================================

describe("TacticalScreen playback lock (#1130)", () => {
  it("holds Leave while the bug phase is still playing (#1132)", () => {
    const { store, host, endTurn, banner } = playing();
    const leave = (): void => {
      root
        .querySelector<HTMLButtonElement>(
          '#turn-banner [data-action="leave-mission"]',
        )
        ?.click();
    };
    const dialog = (): HTMLElement | null =>
      root.querySelector<HTMLElement>('[data-role="leave-dialog"]');
    endTurn();
    leave();
    expect(dialog()?.hidden).toBe(true);
    expect(store.dispatched.map((c) => c.type)).not.toContain(ABANDON_MISSION);
    host.settle();
    // The scene is done but "Bug phase" is still up: Leave stays held
    // until the banner has passed, like every other control (#1132).
    leave();
    expect(dialog()?.hidden).toBe(true);
    banner.fire();
    leave();
    expect(dialog()?.hidden).toBe(false);
  });

  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete document.body.dataset.lastIntent;
    delete document.body.dataset.selectedUnit;
    delete document.body.dataset.phasePlaying;
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const field = (name: string): string =>
    root.querySelector(`#turn-banner [data-field="${name}"]`)?.textContent ??
    "";
  const endTurnButton = (): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>(
      '#action-bar [data-action="end-turn"]',
    );
  const hudPlaying = (): string | undefined =>
    root.querySelector<HTMLElement>("#mission-hud")?.dataset.phasePlaying;

  /** A mounted screen over a scene that holds its settle until told. */
  function playing() {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    host.deferSettle = true;
    // The banner and the watchdog on hand-fired clocks: the lock waits
    // on both the scene and the banner (#1132), and the tests below
    // say which moved when.
    const banner = manualTimers();
    const watchdog = manualTimers();
    const screen = new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
      phaseBanner: banner.options,
      playbackWatchdog: {
        setTimer: watchdog.options.setTimer,
        clearTimer: watchdog.options.clearTimer,
      },
    });
    screen.mount(root);
    const mission = state.activeMission!;
    /** Ends the turn as the shipped EndTurn does: the whole bug phase and the handover in one batch. */
    const endTurn = (): void => {
      store.command(
        {
          ...state,
          activeMission: {
            ...mission,
            phase: "player",
            turn: mission.turn + 1,
          },
        },
        [
          {
            type: TURN_STARTED,
            payload: { turn: mission.turn, phase: "bugs" },
          },
          {
            type: TURN_STARTED,
            payload: { turn: mission.turn + 1, phase: "player" },
          },
        ] as CampaignEvent[],
      );
    };
    return { screen, store, host, state, mission, endTurn, banner, watchdog };
  }

  it("holds End turn, the map and the body while a phase plays, and releases them once the scene has settled and the bug phase banner has passed", () => {
    const { host, store, endTurn, banner } = playing();
    expect(document.body.dataset.phasePlaying).toBe("false");
    expect(hudPlaying()).toBe("false");
    expect(endTurnButton()?.disabled).toBe(false);
    endTurn();
    // The board is already the player's next turn...
    expect(field("turn")).toBe("2");
    expect(field("phase")).toBe("player phase");
    // ...but nothing is offered until the map has caught up.
    expect(document.body.dataset.phasePlaying).toBe("true");
    expect(hudPlaying()).toBe("true");
    expect(endTurnButton()?.disabled).toBe(true);
    expect(host.locked).toBe(true);
    endTurnButton()?.click();
    expect(store.dispatched.map((c) => c.type)).not.toContain(END_TURN);
    host.settle();
    // The map is done, but "Bug phase" is still up: to the player the
    // bugs are not finished, so nothing is offered yet (#1132).
    expect(document.body.dataset.phasePlaying).toBe("true");
    expect(endTurnButton()?.disabled).toBe(true);
    banner.fire();
    expect(document.body.dataset.phasePlaying).toBe("false");
    expect(hudPlaying()).toBe("false");
    expect(endTurnButton()?.disabled).toBe(false);
    expect(host.locked).toBe(false);
    endTurnButton()?.click();
    expect(store.dispatched.map((c) => c.type)).toContain(END_TURN);
  });

  it("drops the player's intents while the phase plays and takes them once it has settled", () => {
    const { host, store, endTurn, banner } = playing();
    endTurn();
    host.intents?.emit({ kind: "select-unit", unitId: "unit-1" });
    host.intents?.emit({ kind: "action", action: "overwatch" });
    host.intents?.emit({ kind: "end-turn" });
    expect(document.body.dataset.selectedUnit).toBeUndefined();
    expect(document.body.dataset.lastIntent).toBeUndefined();
    expect(store.dispatched.map((c) => c.type)).not.toContain(END_TURN);
    host.settle();
    banner.fire();
    host.intents?.emit({ kind: "select-unit", unitId: "unit-1" });
    expect(document.body.dataset.selectedUnit).toBe("unit-1");
    host.intents?.emit({ kind: "end-turn" });
    expect(store.dispatched.map((c) => c.type)).toContain(END_TURN);
  });

  it("holds the controls through an instant bug phase until 'Bug phase' has passed (#1132)", () => {
    const { host, endTurn, banner } = playing();
    endTurn();
    // Nothing to draw: the scene settles on the spot, before the player
    // has read the banner. This is the window End turn was pressed
    // twice in.
    host.settle();
    expect(document.body.dataset.phasePlaying).toBe("true");
    expect(endTurnButton()?.disabled).toBe(true);
    expect(host.locked).toBe(true);
    // "Bug phase" gives way to "Your turn": released as it appears, not
    // when it is dismissed.
    banner.fire();
    expect(document.body.dataset.phasePlaying).toBe("false");
    expect(endTurnButton()?.disabled).toBe(false);
    expect(host.locked).toBe(false);
    banner.fire();
    expect(document.body.dataset.phasePlaying).toBe("false");
  });

  it("releases at the settle when the banner has already moved on (#1132)", () => {
    const { host, endTurn, banner } = playing();
    endTurn();
    banner.fire();
    // The banner says "Your turn" while the last bug is still walking.
    expect(document.body.dataset.phasePlaying).toBe("true");
    expect(endTurnButton()?.disabled).toBe(true);
    host.settle();
    expect(document.body.dataset.phasePlaying).toBe("false");
    expect(endTurnButton()?.disabled).toBe(false);
  });

  it("dispatches one EndTurn for two presses in a row, the button disabled from the first (#1132)", () => {
    const { store, state, mission } = playing();
    // The real store applies the command and notifies before `dispatch`
    // returns; the fake only records, so it is taught the one command
    // this test is about.
    const original = store.dispatch.bind(store);
    store.dispatch = (command) => {
      const result = original(command);
      if (command.type === END_TURN) {
        store.command(
          {
            ...state,
            activeMission: {
              ...mission,
              phase: "player",
              turn: mission.turn + 1,
            },
          },
          [
            {
              type: TURN_STARTED,
              payload: { turn: mission.turn, phase: "bugs" },
            },
            {
              type: TURN_STARTED,
              payload: { turn: mission.turn + 1, phase: "player" },
            },
          ] as CampaignEvent[],
        );
      }
      return result;
    };
    const button = endTurnButton();
    expect(button?.disabled).toBe(false);
    button?.click();
    expect(button?.disabled).toBe(true);
    expect(document.body.dataset.phasePlaying).toBe("true");
    // A second press by every route: a browser click, a synthetic one
    // that ignores `disabled`, and the key.
    button?.click();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(store.dispatched.filter((c) => c.type === END_TURN)).toHaveLength(1);
    expect(field("turn")).toBe("2");
  });

  it("frees the controls with a warning when the scene stops making progress (#1132)", () => {
    const { host, endTurn, watchdog, banner } = playing();
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {
      // The assertion below is what this test is about.
    });
    endTurn();
    expect(document.body.dataset.phasePlaying).toBe("true");
    expect(watchdog.pending()).toBe(1);
    // A banner change is a sign of life: the clock restarts.
    banner.fire();
    expect(watchdog.pending()).toBe(1);
    // Then nothing: no settle, no banner, no event.
    watchdog.fire();
    expect(warned).toHaveBeenCalledTimes(1);
    expect(document.body.dataset.phasePlaying).toBe("false");
    expect(endTurnButton()?.disabled).toBe(false);
    expect(host.locked).toBe(false);
    // The settle arriving late changes nothing.
    host.settle();
    expect(document.body.dataset.phasePlaying).toBe("false");
    warned.mockRestore();
  });

  it("stops the watchdog once the batch has released (#1132)", () => {
    const { host, endTurn, watchdog, banner } = playing();
    endTurn();
    host.settle();
    banner.fire();
    expect(document.body.dataset.phasePlaying).toBe("false");
    expect(watchdog.pending()).toBe(0);
  });

  it("keeps the storey keys and Shift working while the phase plays", () => {
    const { host, endTurn } = playing();
    endTurn();
    host.intents?.emit({ kind: "layer-step", delta: -1 });
    expect(host.layerSteps).toEqual([-1]);
    expect(field("floor")).toBe("2 / 2");
    host.intents?.emit({ kind: "inspect", held: true });
    expect(document.body.dataset.lastIntent).toBe("inspect");
    host.intents?.emit({ kind: "inspect", held: false });
  });

  it("does not hold the controls for a batch of the player's own", () => {
    const { host, store, state } = playing();
    // No phase change: the scene may still be walking the unit, and the
    // player is looking at it. The fake never settles this one.
    store.replace(state);
    expect(host.calls.at(-1)).toBe("update:mission-2:1:");
    host.intents?.emit({ kind: "select-unit", unitId: "unit-1" });
    expect(document.body.dataset.selectedUnit).toBe("unit-1");
    expect(document.body.dataset.phasePlaying).toBe("false");
    expect(endTurnButton()?.disabled).toBe(false);
    expect(host.locked).toBeUndefined();
  });

  it("releases the controls when the screen unmounts mid-phase, and a late settle changes nothing", () => {
    const { screen, host, endTurn } = playing();
    endTurn();
    expect(host.locked).toBe(true);
    screen.unmount();
    expect(host.locked).toBe(false);
    expect(document.body.dataset.phasePlaying).toBeUndefined();
    host.settle();
    expect(document.body.dataset.phasePlaying).toBeUndefined();
    expect(host.lockCalls).toEqual([true, false]);
  });

  it("a mission arriving whole clears a lock the old scene never released", () => {
    const { store, host, state, mission, endTurn } = playing();
    endTurn();
    expect(host.locked).toBe(true);
    // Another mission arrives whole: an attach, not an update, and the
    // old batch's settle never comes.
    store.replace({
      ...state,
      activeMission: { ...mission, missionId: "mission-3" },
    });
    expect(host.calls.at(-1)).toBe("attach:mission-3:1");
    expect(host.locked).toBe(false);
    expect(document.body.dataset.phasePlaying).toBe("false");
    host.settle();
    expect(host.locked).toBe(false);
  });

  it("releases the controls when the scene fails mid-phase", async () => {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    const boom = new Error("lost context");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Swallow it: the assertion below is what this test is about.
    });
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
    }).mount(root);
    host.update = () => Promise.reject(boom);
    const mission = state.activeMission!;
    store.command(
      { ...state, activeMission: { ...mission, phase: "player", turn: 2 } },
      [
        { type: TURN_STARTED, payload: { turn: 1, phase: "bugs" } },
        { type: TURN_STARTED, payload: { turn: 2, phase: "player" } },
      ] as CampaignEvent[],
    );
    expect(document.body.dataset.phasePlaying).toBe("true");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logged).toHaveBeenCalledWith("Tactical scene failed", boom);
    expect(document.body.dataset.phasePlaying).toBe("false");
    expect(host.locked).toBe(false);
    logged.mockRestore();
  });
});

// ===========================================
// Development tools (#1136)
// ===========================================

describe("TacticalScreen development tools (#1136)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const PLACEABLE = [{ kind: "bug", id: "swarmer", name: "Swarmer" }] as const;

  /** A mounted screen in a live mission, with or without the tools. */
  function mounted(devTools: boolean) {
    const state = inMission();
    const store = new FakeStore(state);
    const host = new FakeHost();
    const screen = new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      sceneHost: host,
      ...(devTools ? { devTools: { placeable: PLACEABLE } } : {}),
    });
    screen.mount(root);
    return { screen, store, host, state };
  }

  it("renders nothing of the tools when the composition gave none", () => {
    mounted(false);
    expect(root.querySelector('[data-testid="debug-menu-toggle"]')).toBeNull();
    expect(root.querySelector('[data-testid="debug-menu"]')).toBeNull();
  });

  it("hands the tools to the HUD, and an armed placement reaches the store as PlaceUnit for the live mission", () => {
    const { store, host, state } = mounted(true);
    root
      .querySelector<HTMLButtonElement>('[data-testid="debug-menu-toggle"]')
      ?.click();
    // The menu opens on the tool list; the entries are on Spawn's page (#1138).
    root
      .querySelector<HTMLButtonElement>('[data-testid="debug-tool-spawn"]')
      ?.click();
    root
      .querySelector<HTMLButtonElement>(
        '[data-testid="debug-place-bug-swarmer"]',
      )
      ?.click();
    host.intents?.emit({ kind: "select-tile", tile: { x: 4, y: 0, z: 4 } });
    expect(store.dispatched).toEqual([
      placeUnit(state.activeMission!.missionId, "bug", "swarmer", {
        x: 4,
        y: 0,
        z: 4,
      }),
    ]);
  });
});
