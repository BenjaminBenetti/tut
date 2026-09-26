import { describe, expect, it } from "vitest";

import { isCampaignFlagId } from "../../content/model/campaign-flag-id";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { UNKNOWN_COMMAND } from "../../overworld/model/command-dispatcher";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { advanceDay } from "../../overworld/model/overworld-command";
import type { CampaignDebugOptions } from "../../overworld/model/campaign-debug";
import type { Deployment } from "../../overworld/model/deployment";
import { launchMission } from "../../overworld/model/launch-mission-command";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { extract } from "../../tactical/model/extract-command";
import { interact } from "../../tactical/model/interact-command";
import { startMission } from "../../tactical/model/start-mission-command";
import { GARRISON_TURRET_SOURCE_ID } from "../../tactical/model/turret";
import type { Mission } from "../../overworld/model/mission";
import { MISSION_RESOLVED } from "../../overworld/model/mission-resolved-event";
import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { SaveError } from "../../save/model/save-error";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { ACID_RESISTANT_PLATING } from "../../roster/data/autopsy-parts";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { buildMech } from "../../overworld/model/build-mech-command";
import { saveLoadout } from "../../overworld/model/save-loadout-command";
import type { Unit } from "../../tactical/model/unit";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import { isTechNodeHidden } from "../../tech/service/tech-status-service";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

const NOW = "2026-09-03T00:00:00.000Z";

const build = (
  debug?: CampaignDebugOptions,
): {
  game: GameComposition;
  failures: SaveError[];
  revealed: string[][];
} => {
  const failures: SaveError[] = [];
  const revealed: string[][] = [];
  const game = composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      failures.push(error);
    },
    onResearchRevealed: (nodes) => {
      revealed.push(nodes.map((node) => node.id));
    },
    ...(debug === undefined ? {} : { debug }),
  });
  return { game, failures, revealed };
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
    rewards: { credits: 300, techPoints: 0 },
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

  it("stands the region's garrison when a mission starts: a level 2 battery is two turrets (#1155)", () => {
    const { game } = build();
    const { mission, deployment } = campaignWithMission(game);
    const before = game.session.state;
    const city = before?.overworld.map.cities.find(
      (c) => c.id === mission.cityId,
    );
    if (!before || !city) throw new Error("fixture needs the mission's city");
    game.session.start({
      ...before,
      overworld: {
        ...before.overworld,
        deployables: [
          {
            id: "deployable-1",
            typeId: "defensive-battery",
            regionId: city.regionId,
            level: 2,
            builtDay: 1,
            online: true,
          },
        ],
      },
    });

    const result = game.session.store?.dispatch(
      startMission(mission.id, deployment),
    );
    expect(result?.ok).toBe(true);
    const garrison = game.session.state?.activeMission?.units.filter(
      (u) => u.sourceId === GARRISON_TURRET_SOURCE_ID,
    );
    expect(garrison).toHaveLength(2);
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

  it("wins a mission by clearing its objectives and boarding the drop ship, and pays the full reward", () => {
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
          .filter(
            (o) => o.kind === "destroy-spawner" && o.targetId === spawner.id,
          )
          .map((o) => ({ ...o, complete: false })),
      },
    });
    const objectiveId = game.session.state?.activeMission?.objectives[0]?.id;
    if (objectiveId === undefined) throw new Error("no objective to work");

    // Plant charges until the spawner is down: 10 a go against 20 hp, so
    // two actions — one unit's whole turn beside it.
    let guard = 0;
    while (
      game.session.state?.activeMission?.objectives.some((o) => !o.complete) &&
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

    const cleared = game.session.state?.activeMission;
    expect(cleared?.spawners[0]?.destroyed).toBe(true);
    expect(cleared?.objectives[0]?.complete).toBe(true);
    // Not over yet: the objectives are done and the force still has to
    // get home. Stand the squad on the ramp and board.
    expect(cleared?.outcome).toBeUndefined();
    const live = game.session.state;
    const ramp = live?.activeMission?.extraction[0];
    if (!live?.activeMission || !ramp) throw new Error("no extraction zone");
    game.session.replace({
      ...live,
      activeMission: {
        ...live.activeMission,
        units: live.activeMission.units.map((u) => ({
          ...u,
          pos: ramp,
          ap: u.maxAp,
        })),
      },
    });
    const boarded = game.session.store?.dispatch(extract(unit.id));
    expect(boarded?.ok).toBe(true);
    const decided = game.session.state?.activeMission;
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
      rewards: { credits: 300, techPoints: 0 },
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
  // Story and tech conditions (ADR 0013 §2.5, §2.7)
  // ===========================================

  it("hands the tech tree the story's flags and a killed:<species> flag per species killed", () => {
    const { game } = build();
    const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
    expect(game.techConditionsOf(fresh).flags.size).toBe(0);
    const state = {
      ...fresh,
      overworld: {
        ...fresh.overworld,
        progress: {
          ...fresh.overworld.progress,
          flags: ["spore-sample" as const],
          speciesKilled: ["spitter" as const],
        },
      },
    };
    expect([...game.techConditionsOf(state).flags].sort()).toEqual([
      "killed:spitter",
      "spore-sample",
    ]);
  });

  it("reveals Pheromone Analysis with the spore sample, and buying it sets capture-net and arms every squad with a net (#1179)", () => {
    const { game } = build();
    const PHEROMONE = "tech.pheromone-analysis";
    const node = game.content.tech.getNode(PHEROMONE);
    if (node === undefined) throw new Error("the tree ships Intel I");
    const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
    const rich = {
      ...fresh,
      economy: { ...fresh.economy, techPoints: node.cost },
    };
    const sampled = {
      ...rich,
      overworld: {
        ...rich.overworld,
        progress: {
          ...rich.overworld.progress,
          flags: ["spore-sample" as const],
        },
      },
    };

    // Hidden, and refused, while the spore sample is missing.
    expect(isTechNodeHidden(node, game.techConditionsOf(rich))).toBe(true);
    game.session.start(rich);
    const refused = game.session.store?.dispatch(unlockTech(PHEROMONE));
    expect(refused?.ok === false && refused.error.code).toBe("tech-hidden");

    // Shown, and bought, once it is in hand.
    expect(isTechNodeHidden(node, game.techConditionsOf(sampled))).toBe(false);
    game.session.start(sampled);
    const bought = game.session.store?.dispatch(unlockTech(PHEROMONE));
    expect(bought?.ok).toBe(true);
    const after = game.session.state;
    if (!after) throw new Error("no campaign");
    expect(after.tech.unlocked).toContain(PHEROMONE);
    expect(after.overworld.progress.flags).toContain("capture-net");

    // The net reaches squads through the one infantry-upgrade path.
    const upgradesOf = (state: typeof after) =>
      game.tactical
        .missionStartDepsFor(new SequentialIdGenerator())
        .infantryUpgradesFor?.(state)
        .map((upgrade) => upgrade.id);
    expect(upgradesOf(sampled)).toEqual([]);
    expect(upgradesOf(after)).toEqual(["capture-net"]);
  });

  // ===========================================
  // Autopsies (campaign arc §8, §10.2)
  // ===========================================

  it("hides the spitter autopsy until a mission kills a spitter, then announces it, sells it and opens its plating", () => {
    const { game, revealed } = build();
    const { mission, deployment } = campaignWithMission(game);
    const store = (): NonNullable<typeof game.session.store> => {
      const live = game.session.store;
      if (!live) throw new Error("no campaign");
      return live;
    };
    const AUTOPSY = "tech.spitter-autopsy";
    const autopsy = game.content.tech.getNode(AUTOPSY);
    if (!autopsy) throw new Error("the shipped tree lost the spitter autopsy");
    const hidden = (): boolean => {
      const state = game.session.state;
      if (!state) throw new Error("no campaign");
      return isTechNodeHidden(autopsy, game.techConditionsOf(state));
    };
    const plated = {
      ...STARTER_LOADOUT,
      name: "Acid Proof",
      utilityIds: [ACID_RESISTANT_PLATING],
    };
    const fund = (): void => {
      const state = game.session.state;
      if (!state) throw new Error("no campaign");
      game.session.replace({
        ...state,
        economy: { ...state.economy, techPoints: 100, credits: 50_000 },
      });
    };

    // A fresh campaign: hidden, refused as hidden, and a template with
    // the plating saves but will not build, the plating being locked.
    fund();
    expect(hidden()).toBe(true);
    const early = store().dispatch(unlockTech(AUTOPSY));
    expect(!early.ok && early.error.code).toBe("tech-hidden");
    expect(store().dispatch(saveLoadout(plated)).ok).toBe(true);
    const locked = store().dispatch(buildMech(plated.name, "Sealed"));
    expect(!locked.ok && locked.error.code).toBe("invalid-loadout");
    expect(!locked.ok && locked.error.message).toContain(
      '"Acid-Resistant Plating" has not been unlocked',
    );

    // A mission in which a spitter dies, finished through the real
    // resolver and launch handler.
    store().dispatch(startMission(mission.id, deployment));
    const started = game.session.state;
    const active = started?.activeMission;
    const first = active?.units[0];
    if (!started || !active || !first) throw new Error("mission did not start");
    const spitter: Unit = {
      ...first,
      id: "unit-spitter",
      kind: "bug",
      team: "bugs",
      sourceId: "spitter",
      hp: 0,
    };
    game.session.replace({
      ...started,
      activeMission: {
        ...active,
        units: [...active.units, spitter],
        objectives: active.objectives.map((o) => ({ ...o, complete: true })),
        outcome: "won",
        log: [
          ...active.log,
          {
            type: UNIT_DIED,
            payload: { unitId: spitter.id, killerId: first.id },
          },
        ],
      },
    });
    expect(revealed).toEqual([]);
    const finished = store().dispatch(finishMission(mission.id));
    expect(finished.ok).toBe(true);

    // Shown, announced once, and nothing else with it.
    expect(game.session.state?.overworld.progress.speciesKilled).toEqual([
      "spitter",
    ]);
    expect(hidden()).toBe(false);
    expect(revealed).toEqual([[AUTOPSY]]);

    // Researched, a mech with the plating can be built.
    fund();
    expect(store().dispatch(unlockTech(AUTOPSY)).ok).toBe(true);
    expect(store().dispatch(buildMech(plated.name, "Sealed")).ok).toBe(true);
    expect(
      game.session.state?.roster.mechs.some((mech) => mech.name === "Sealed"),
    ).toBe(true);
    expect(revealed).toEqual([[AUTOPSY]]);
  });

  it("ships a tree whose every flag effect is a campaign flag the story records", () => {
    const { game } = build();
    const flags = game.content.tech
      .listNodes()
      .flatMap((node) => node.effects)
      .flatMap((effect) => (effect.kind === "flag" ? [effect.flag] : []));
    expect(flags.filter((flag) => !isCampaignFlagId(flag))).toEqual([]);
  });

  it("never ends a campaign for a clean Earth; the story's verdict ends it on the next day", () => {
    const { game } = build();
    const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
    const clean = {
      ...fresh,
      overworld: {
        ...fresh.overworld,
        map: {
          ...fresh.overworld.map,
          cities: fresh.overworld.map.cities.map((city) => ({
            ...city,
            infestation: 0,
          })),
        },
        hives: [],
      },
    };
    game.session.start(clean);
    game.session.store?.dispatch(advanceDay());
    expect(game.session.state?.overworld.outcome).toBeUndefined();

    const current = game.session.state;
    if (!current) throw new Error("no campaign");
    game.session.replace({
      ...current,
      overworld: {
        ...current.overworld,
        progress: { ...current.overworld.progress, flags: ["campaign-won"] },
      },
    });
    game.session.store?.dispatch(advanceDay());
    expect(game.session.state?.overworld.outcome).toMatchObject({
      kind: "victory",
      cause: "story",
    });
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
