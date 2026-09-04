// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { commandError } from "../../core/model/command-error";
import type { Unsubscribe } from "../../core/model/event-bus";
import { err, ok } from "../../core/model/result";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { DeploymentAssessor } from "../../overworld/model/deployment-assessment";
import { LAUNCH_MISSION } from "../../overworld/model/launch-mission-command";
import { START_MISSION } from "../../tactical/model/start-mission-command";
import type { Mission } from "../../overworld/model/mission";
import type { MissionResult } from "../../overworld/model/mission-result";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { OverworldSelectionState } from "../service/overworld-selection-state";
import { campaignOnDay, missionAt } from "../view/mission-fixtures.test-helper";
import { DeploymentScreen } from "./deployment-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

/** Resolves LaunchMission by removing the mission and storing a canned result. */
class FakeStore implements CampaignStore {
  private state: GameState;
  private readonly listeners = new Set<
    StoreListener<GameState, OverworldCommand, CampaignEvent>
  >();
  fail = false;
  readonly launched: OverworldCommand[] = [];
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
    const launching =
      command.type === LAUNCH_MISSION || command.type === START_MISSION;
    if (this.fail || !launching) {
      return err(commandError("mission-expired", "Mission expired on day 6"));
    }
    this.launched.push(command);
    if (command.type === START_MISSION) {
      // Starting a mission only fills `activeMission`; the offer stays
      // until `FinishMission` resolves it.
      for (const listener of [...this.listeners]) {
        listener({ kind: "command", command, state: this.state, events: [] });
      }
      return ok({ state: this.state, events: [] });
    }
    const result: MissionResult = {
      missionId: command.payload.missionId,
      outcome: "won",
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
      creditsAwarded: 600,
      infestationDelta: -20,
    };
    this.state = {
      ...this.state,
      overworld: {
        ...this.state.overworld,
        missions: this.state.overworld.missions.filter(
          (m) => m.id !== command.payload.missionId,
        ),
        lastMissionResult: result,
      },
    };
    for (const listener of [...this.listeners]) {
      listener({ kind: "command", command, state: this.state, events: [] });
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

/** Ten force per unit, an even fight at 30, odds a quarter per unit. */
const ASSESSOR: DeploymentAssessor = {
  assess: (_mission, deployment) => {
    const units = deployment.squadIds.length + deployment.mechIds.length;
    return {
      force: units * 10,
      target: 30,
      winProbability: Math.min(1, units / 4),
    };
  },
};

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
  const router: ScreenRouter = {
    current: "deployment",
    navigate,
    events: new SimpleEventBus<ScreenRouterEvents>(),
  };
  return { router, navigate };
};

const MISSION: Mission = missionAt("mission-1", "cairo", 7, 2);

describe("DeploymentScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const field = (name: string): string =>
    root.querySelector(`[data-field="${name}"]`)?.textContent ?? "";
  const button = (action: string): HTMLButtonElement => {
    const el = root.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    );
    if (!el) throw new Error(`missing button ${action}`);
    return el;
  };
  const squadBoxes = (): HTMLInputElement[] => [
    ...root.querySelectorAll<HTMLInputElement>(
      '#deploy-squads input[type="checkbox"]',
    ),
  ];
  const tick = (box: HTMLInputElement): void => {
    box.checked = !box.checked;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const mountWith = (
    store: CampaignStore | undefined,
    missionId?: string,
    autoResolve = false,
  ) => {
    const { router, navigate } = fakeRouter();
    const selection = new OverworldSelectionState();
    if (missionId !== undefined) {
      selection.selectMission(missionId, "cairo");
    }
    const screen = new DeploymentScreen({
      router,
      session: sessionWith(store),
      selection,
      assessor: ASSESSOR,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      missionTypes: MISSION_TYPES,
      autoResolve,
    });
    screen.mount(root);
    return { screen, navigate };
  };

  it("shows the briefing and lists the roster's squads and mechs unchecked, Launch disabled", () => {
    const state = campaignOnDay(4, [MISSION]);
    mountWith(new FakeStore(state), "mission-1");
    expect(root.querySelector('[data-screen="deployment"]')).not.toBeNull();
    expect(field("mission-title")).toBe("Infestation Clearance · Cairo");
    expect(field("mission-id")).toBe("mission-1");
    expect(field("difficulty")).toBe("D2");
    expect(field("reward")).toBe("¢600");
    expect(field("days-left")).toBe("3 d");
    expect(squadBoxes()).toHaveLength(state.roster.squads.length);
    expect(root.querySelectorAll("#deploy-mechs tbody tr")).toHaveLength(
      state.roster.mechs.length,
    );
    expect(squadBoxes().every((box) => !box.checked)).toBe(true);
    expect(button("launch").disabled).toBe(true);
    expect(field("force")).toBe("0");
    expect(field("target")).toBe("30");
  });

  it("ticking units updates the resolver-side assessment and enables Launch", () => {
    mountWith(new FakeStore(campaignOnDay(4, [MISSION])), "mission-1");
    tick(squadBoxes()[0]!);
    expect(field("force")).toBe("10");
    expect(field("win-chance")).toBe("25 %");
    expect(
      root.querySelector<HTMLElement>('[data-field="win-chance"]')?.dataset
        .tone,
    ).toBe("danger");
    expect(button("launch").disabled).toBe(false);
    tick(squadBoxes()[1]!);
    expect(field("force")).toBe("20");
    tick(squadBoxes()[0]!);
    expect(field("force")).toBe("10");
  });

  it("Launch starts the tactical mission with the picked units and opens the tactical screen", () => {
    const store = new FakeStore(campaignOnDay(4, [MISSION]));
    const { navigate } = mountWith(store, "mission-1");
    const [first, second] = squadBoxes();
    tick(first!);
    tick(second!);
    button("launch").click();
    expect(store.launched).toHaveLength(1);
    const command = store.launched[0];
    expect(command?.type).toBe(START_MISSION);
    if (command?.type === START_MISSION) {
      expect(command.payload.missionId).toBe("mission-1");
      expect(command.payload.deployment.missionId).toBe("mission-1");
      expect(command.payload.deployment.squadIds).toHaveLength(2);
      expect(command.payload.deployment.mechIds).toEqual([]);
    }
    expect(navigate).toHaveBeenCalledWith("tactical");
  });

  it("under auto-resolve Launch settles the mission and opens the results screen", () => {
    const store = new FakeStore(campaignOnDay(4, [MISSION]));
    const { navigate } = mountWith(store, "mission-1", true);
    tick(squadBoxes()[0]!);
    button("launch").click();
    expect(store.launched).toHaveLength(1);
    const command = store.launched[0];
    expect(command?.type).toBe(LAUNCH_MISSION);
    if (command?.type === LAUNCH_MISSION) {
      expect(command.payload.missionId).toBe("mission-1");
      expect(command.payload.deployment.squadIds).toHaveLength(1);
    }
    expect(navigate).toHaveBeenCalledWith("mission-results");
  });

  it("shows a rejected launch in the bar and stays", () => {
    const store = new FakeStore(campaignOnDay(4, [MISSION]));
    store.fail = true;
    const { navigate } = mountWith(store, "mission-1");
    tick(squadBoxes()[0]!);
    button("launch").click();
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("expired");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("with no selected mission shows the note and keeps Launch disabled", () => {
    mountWith(new FakeStore(campaignOnDay(4, [MISSION])));
    expect(
      root.querySelector<HTMLElement>('[data-role="no-mission"]')?.hidden,
    ).toBe(false);
    expect(field("mission-title")).toBe("No mission selected");
    tick(squadBoxes()[0]!);
    expect(button("launch").disabled).toBe(true);
    expect(field("force")).toBe("—");
  });

  it("Back navigates to the overworld and unmount unsubscribes", () => {
    const store = new FakeStore(campaignOnDay(4, [MISSION]));
    const { screen, navigate } = mountWith(store, "mission-1");
    button("back-to-overworld").click();
    expect(navigate).toHaveBeenCalledWith("overworld");
    expect(store.listenerCount).toBe(1);
    screen.unmount();
    expect(store.listenerCount).toBe(0);
    expect(root.children).toHaveLength(0);
  });
});
