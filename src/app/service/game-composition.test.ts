import { describe, expect, it } from "vitest";

import { UNKNOWN_COMMAND } from "../../overworld/model/command-dispatcher";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { advanceDay } from "../../overworld/model/overworld-command";
import type { CampaignDebugOptions } from "../../overworld/model/campaign-debug";
import type { Deployment } from "../../overworld/model/deployment";
import { launchMission } from "../../overworld/model/launch-mission-command";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { interact } from "../../tactical/model/interact-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { Mission } from "../../overworld/model/mission";
import { MISSION_RESOLVED } from "../../overworld/model/mission-resolved-event";
import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { SaveError } from "../../save/model/save-error";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

const NOW = "2026-09-03T00:00:00.000Z";

const build = (
  debug?: CampaignDebugOptions,
): { game: GameComposition; failures: SaveError[] } => {
  const failures: SaveError[] = [];
  const game = composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      failures.push(error);
    },
    ...(debug === undefined ? {} : { debug }),
  });
  return { game, failures };
};

/** A campaign with one small clearance mission on an infested city, ready to launch. */
const campaignWithMission = (
  game: GameComposition,
): { mission: Mission; deployment: Deployment } => {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  const city = fresh.overworld.map.cities.find((c) => c.infestation > 0);
  const squad = fresh.roster.squads[0];
  if (!city || !squad)
    throw new Error("fixture needs an infested city and a squad");
  const mission: Mission = {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: city.id,
    difficulty: 1,
    mapParams: {
      biome: "temperate",
      settlement: city.scale,
      size: "small",
      seed: "1",
    },
    rewards: { credits: 300 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
  };
  game.session.start({
    ...fresh,
    overworld: { ...fresh.overworld, missions: [mission] },
  });
  return {
    mission,
    deployment: { missionId: mission.id, squadIds: [squad.id], mechIds: [] },
  };
};

describe("composeGame", () => {
  it("builds deterministic campaigns from the shipped content", () => {
    const { game } = build();
    const a = game.createCampaign({ seed: 7, createdAt: NOW });
    const b = game.createCampaign({ seed: 7, createdAt: NOW });
    expect(a).toEqual(b);
    expect(a.meta.seed).toBe(7);
    expect(a.roster.squads.length).toBeGreaterThan(0);
    expect(a.economy.credits).toBeGreaterThan(0);
  });

  it("autosaves a campaign as soon as the session starts", () => {
    const { game, failures } = build();
    const state = game.createCampaign({ seed: 7, createdAt: NOW });
    game.session.start(state);
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(loaded.ok && loaded.value).toEqual(state);
    expect(game.saves.listSlots().map((s) => s.id)).toEqual([AUTOSAVE_SLOT_ID]);
    expect(failures).toEqual([]);
  });

  it("rejects a command with no registered handler and leaves the autosave alone", () => {
    const { game } = build();
    const state = game.createCampaign({ seed: 7, createdAt: NOW });
    game.session.start(state);
    const unknown = {
      type: "overworld:not-a-command",
      payload: {},
    } as unknown as OverworldCommand;
    const result = game.session.store?.dispatch(unknown);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.error.code).toBe(UNKNOWN_COMMAND);
    expect(game.session.state).toBe(state);
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(loaded.ok && loaded.value).toEqual(state);
  });

  it("runs AdvanceDay through the store and autosaves the new day", () => {
    const { game } = build();
    game.session.start(game.createCampaign({ seed: 7, createdAt: NOW }));

    const result = game.session.store?.dispatch(advanceDay());
    expect(result?.ok).toBe(true);
    expect(game.session.state?.overworld.day).toBe(2);
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(loaded.ok && loaded.value.overworld.day).toBe(2);
  });

  it("passes the seed source and clock through for the menu", () => {
    const { game } = build();
    expect(game.newSeed()).toBe(7);
    expect(game.clock.now()).toBe(NOW);
  });

  it("launches a mission through the auto-resolver and applies the result", () => {
    const { game } = build({ autoResolve: true });
    const { mission, deployment } = campaignWithMission(game);

    const result = game.session.store?.dispatch(
      launchMission(mission.id, deployment),
    );
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.value.events[0]?.type).toBe(MISSION_RESOLVED);
    const after = game.session.state;
    expect(after?.overworld.missions).toEqual([]);
    expect(after?.overworld.lastMissionResult?.missionId).toBe(mission.id);
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(
      loaded.ok && loaded.value.overworld.lastMissionResult?.missionId,
    ).toBe(mission.id);
    expect(game.autoResolve).toBe(true);
  });

  it("starts a tactical mission and autosaves it, leaving the offer standing", () => {
    const { game } = build();
    const { mission, deployment } = campaignWithMission(game);

    const result = game.session.store?.dispatch(
      startMission(mission.id, deployment),
    );
    expect(result?.ok).toBe(true);
    expect(game.autoResolve).toBe(false);
    const active = game.session.state?.activeMission;
    expect(active?.missionId).toBe(mission.id);
    expect(active?.units.length).toBe(deployment.squadIds.length);
    // The mission is still on offer: nothing is resolved until it ends.
    expect(game.session.state?.overworld.missions).toHaveLength(1);
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(loaded.ok && loaded.value.activeMission?.missionId).toBe(mission.id);
  });

  it("finishes a played mission through the tactical resolver and clears the slot", () => {
    const { game } = build();
    const { mission, deployment } = campaignWithMission(game);
    game.session.store?.dispatch(startMission(mission.id, deployment));
    const started = game.session.state;
    const active = started?.activeMission;
    if (!started || !active) throw new Error("mission did not start");
    // Stand in for playing it out: every objective done, outcome recorded.
    game.session.replace({
      ...started,
      activeMission: {
        ...active,
        objectives: active.objectives.map((o) => ({ ...o, complete: true })),
        outcome: "won",
      },
    });

    const result = game.session.store?.dispatch(finishMission(mission.id));
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.value.events[0]?.type).toBe(MISSION_RESOLVED);
    const after = game.session.state;
    expect(after?.activeMission).toBeUndefined();
    expect(after?.overworld.missions).toEqual([]);
    expect(after?.overworld.lastMissionResult?.outcome).toBe("won");
    expect(after?.overworld.lastMissionResult?.creditsAwarded).toBe(
      mission.rewards.credits,
    );
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(loaded.ok && loaded.value.activeMission).toBeUndefined();
  });

  it("wins a mission by clearing its objectives and pays the full reward", () => {
    const { game } = build();
    const { mission, deployment } = campaignWithMission(game);
    game.session.store?.dispatch(startMission(mission.id, deployment));
    const started = game.session.state;
    const active = started?.activeMission;
    const spawner = active?.spawners[0];
    const unit = active?.units[0];
    if (!started || !active || !spawner || !unit)
      throw new Error("mission did not start with a spawner and a unit");

    // Stand the squad beside one spawner and make it the only objective;
    // the real map puts spawners 12+ tiles from the deploy zone, which is
    // a march, not a rule. Everything after this is the shipped path.
    game.session.replace({
      ...started,
      activeMission: {
        ...active,
        units: [
          { ...unit, pos: { ...spawner.pos, x: spawner.pos.x + 1 }, ap: 2 },
        ],
        spawners: [spawner],
        objectives: active.objectives
          .filter((o) => o.targetId === spawner.id)
          .map((o) => ({ ...o, complete: false })),
      },
    });
    const objectiveId = game.session.state?.activeMission?.objectives[0]?.id;
    if (objectiveId === undefined) throw new Error("no objective to work");

    // Plant charges until the spawner is down: 10 a go against 20 hp, so
    // two actions — one unit's whole turn beside it.
    let guard = 0;
    while (
      game.session.state?.activeMission?.outcome === undefined &&
      guard++ < 10
    ) {
      const before = game.session.state?.activeMission?.units[0];
      if (before !== undefined && before.ap < OBJECTIVE_TUNING.interactApCost) {
        // Refresh the turn the cheap way; the turn engine is not the
        // subject here.
        const live = game.session.state;
        if (!live?.activeMission) break;
        game.session.replace({
          ...live,
          activeMission: {
            ...live.activeMission,
            units: live.activeMission.units.map((u) => ({ ...u, ap: u.maxAp })),
          },
        });
      }
      const outcome = game.session.store?.dispatch(
        interact(unit.id, objectiveId),
      );
      expect(outcome?.ok).toBe(true);
    }

    const decided = game.session.state?.activeMission;
    expect(decided?.spawners[0]?.destroyed).toBe(true);
    expect(decided?.objectives[0]?.complete).toBe(true);
    expect(decided?.outcome).toBe("won");

    const result = game.session.store?.dispatch(finishMission(mission.id));
    expect(result?.ok).toBe(true);
    const after = game.session.state;
    expect(after?.activeMission).toBeUndefined();
    expect(after?.overworld.lastMissionResult?.outcome).toBe("won");
    expect(after?.overworld.lastMissionResult?.creditsAwarded).toBe(
      mission.rewards.credits,
    );
    expect(after?.overworld.lastMissionResult?.infestationDelta).toBeLessThan(
      0,
    );
  });

  it("refuses to finish a mission that is still being fought", () => {
    const { game } = build();
    const { mission, deployment } = campaignWithMission(game);
    game.session.store?.dispatch(startMission(mission.id, deployment));

    const result = game.session.store?.dispatch(finishMission(mission.id));
    expect(result?.ok).toBe(false);
    if (result?.ok) return;
    expect(result?.error.code).toBe("mission-not-over");
    expect(game.session.state?.activeMission).toBeDefined();
  });

  it("exposes a deployment assessor that rates the starter roster above zero", () => {
    const { game } = build();
    const state = game.createCampaign({ seed: 7, createdAt: NOW });
    const city = state.overworld.map.cities[0];
    const squad = state.roster.squads[0];
    if (!city || !squad) throw new Error("fixture needs a city and a squad");
    const mission: Mission = {
      id: "mission-1",
      typeId: "infestation-clearance",
      cityId: city.id,
      difficulty: 1,
      mapParams: {
        biome: "temperate",
        settlement: city.scale,
        size: "small",
        seed: "1",
      },
      rewards: { credits: 300 },
      createdDay: 1,
      expiresDay: 6,
      ignorePenalty: 10,
    };
    const empty = game.assessor.assess(
      mission,
      { missionId: mission.id, squadIds: [], mechIds: [] },
      { squads: state.roster.squads, mechs: state.roster.mechs, city },
    );
    const one = game.assessor.assess(
      mission,
      { missionId: mission.id, squadIds: [squad.id], mechIds: [] },
      { squads: state.roster.squads, mechs: state.roster.mechs, city },
    );
    expect(empty.force).toBe(0);
    expect(one.force).toBeGreaterThan(0);
    expect(one.winProbability).toBeGreaterThan(empty.winProbability);
    expect(one.target).toBeGreaterThan(0);
  });

  // ===========================================
  // Dev switches (#304)
  // ===========================================

  it("applies the debug escalation multiplier from the composition, never from the save", () => {
    const storage = new MemoryKeyValueStore();
    const fast = composeGame({
      storage,
      clock: { now: () => NOW },
      newSeed: () => 7,
      onAutosaveFailure: () => undefined,
      debug: { threatEscalationMultiplier: 50 },
    });
    const slow = composeGame({
      storage: new MemoryKeyValueStore(),
      clock: { now: () => NOW },
      newSeed: () => 7,
      onAutosaveFailure: () => undefined,
    });
    const options = { seed: 7, createdAt: NOW };
    fast.session.start(fast.createCampaign(options));
    slow.session.start(slow.createCampaign(options));
    for (let i = 0; i < 5; i++) {
      fast.session.store?.dispatch(advanceDay());
      slow.session.store?.dispatch(advanceDay());
    }
    const fastThreat = fast.session.state?.overworld.threat ?? 0;
    const slowThreat = slow.session.state?.overworld.threat ?? 0;
    expect(fastThreat).toBeGreaterThan(slowThreat);
    expect("debug" in (fast.session.state?.meta ?? {})).toBe(false);
    const saved = JSON.parse(storage.get("tut:save:autosave") ?? "{}") as {
      state?: { meta?: Record<string, unknown> };
    };
    expect(saved.state?.meta).toBeDefined();
    expect("debug" in (saved.state?.meta ?? {})).toBe(false);
  });

  it("strips a stale meta.debug from an imported save so it plays at the shipped pace", () => {
    const game = composeGame({
      storage: new MemoryKeyValueStore(),
      clock: { now: () => NOW },
      newSeed: () => 7,
      onAutosaveFailure: () => undefined,
    });
    const state = game.createCampaign({ seed: 7, createdAt: NOW });
    const exported = JSON.parse(game.saves.exportGame(state)) as {
      schemaVersion: number;
      state: { meta: Record<string, unknown> };
    };
    exported.schemaVersion = 6;
    exported.state.meta.debug = { threatEscalationMultiplier: 50 };
    const imported = game.saves.importGame(JSON.stringify(exported));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect("debug" in imported.value.meta).toBe(false);
  });
});
