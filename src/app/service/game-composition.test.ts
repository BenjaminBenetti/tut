import { describe, expect, it } from "vitest";

import { UNKNOWN_COMMAND } from "../../overworld/model/command-dispatcher";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { advanceDay } from "../../overworld/model/overworld-command";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { Mission } from "../../overworld/model/mission";
import { MISSION_RESOLVED } from "../../overworld/model/mission-resolved-event";
import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { SaveError } from "../../save/model/save-error";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

const NOW = "2026-09-03T00:00:00.000Z";

const build = (): { game: GameComposition; failures: SaveError[] } => {
  const failures: SaveError[] = [];
  const game = composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      failures.push(error);
    },
  });
  return { game, failures };
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
    const { game } = build();
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

    const result = game.session.store?.dispatch(
      launchMission(mission.id, {
        missionId: mission.id,
        squadIds: [squad.id],
        mechIds: [],
      }),
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
});
