import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../bugs/data/species";
import {
  INFESTATION_CLEARANCE,
  MISSION_TYPES,
} from "../../content/data/mission-types";
import type { MissionType } from "../../content/model/mission-type";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Deployment } from "../../overworld/model/deployment";
import type { Mission } from "../../overworld/model/mission";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { createGameSaveService } from "../../save/service/game-save-service";
import { createNewGame } from "../../save/service/new-game-service";
import { CIVILIAN_TUNING } from "../data/civilian-tuning";
import { GARRISON_TUNING } from "../data/garrison-tuning";
import { GENERATOR_TUNING } from "../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { finishMission } from "../model/finish-mission-command";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_DIED } from "../model/unit-died-event";
import { TURN_STARTED } from "../model/turn-started-event";
import {
  createFinishMissionHandler,
  deploymentOf,
} from "./finish-mission-handler";
import type { MissionStartDeps } from "./mission-start-service";
import { startTacticalMission } from "./mission-start-service";
import {
  advanceMissionStage,
  missionFinished,
  missionRecord,
  stagePending,
} from "./mission-stage-service";
import { tacticalMissionResult } from "./tactical-mission-resolver";
import { missionOutcome } from "./mission-end-service";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/**
 * The clearance as a two-stage mission: nothing in the engine names
 * the platform, so two clearance maps linked are a linked mission too.
 */
const TWO_STAGE_CLEARANCE: MissionType = {
  ...INFESTATION_CLEARANCE,
  stages: [
    { id: "outskirts", name: "The outskirts" },
    { id: "centre", name: "The centre" },
  ],
};

const TYPES: Readonly<Record<MissionTypeId, MissionType>> = {
  ...MISSION_TYPES,
  "infestation-clearance": TWO_STAGE_CLEARANCE,
};

/** Mission-start deps over `types`, with a fresh id generator. */
function deps(
  types: Readonly<Record<MissionTypeId, MissionType>> = TYPES,
): MissionStartDeps {
  return {
    missionTypes: types,
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    sheetFor: (mech) => {
      const result = validateLoadout(
        mech.loadout,
        PARTS,
        MECH_RATING_TUNING,
        UPGRADE_TUNING,
      );
      return result.ok ? result.value : undefined;
    },
    unitTuning: UNIT_TUNING,
    spawnTuning: SPAWN_TUNING,
    garrison: GARRISON_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
    ids: new SequentialIdGenerator(),
    registries: createDefaultRegistries(),
  };
}

/** A campaign with one small clearance on its first infested city, and the whole roster sent. */
function campaign(): {
  state: GameState;
  mission: Mission;
  deployment: Deployment;
} {
  const base = createNewGame(
    { seed: 7, createdAt: "2026-09-26T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const city = base.overworld.map.cities.find((c) => c.infestation > 0);
  const region = base.overworld.map.regions.find(
    (r) => r.id === city?.regionId,
  );
  if (city === undefined || region === undefined) {
    throw new Error("fixture needs an infested city");
  }
  const mission: Mission = {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: city.id,
    difficulty: 3,
    mapParams: {
      biome: city.biome ?? region.biome,
      settlement: city.scale,
      size: "small",
      seed: "linked-7",
    },
    rewards: { credits: 900, techPoints: 17 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
  };
  return {
    state: { ...base, overworld: { ...base.overworld, missions: [mission] } },
    mission,
    deployment: {
      missionId: mission.id,
      squadIds: base.roster.squads.map((s) => s.id),
      mechIds: base.roster.mechs.map((m) => m.id),
    },
  };
}

/** The value of an ok result; throws on an error. */
function unwrap<T, E>(
  result: { ok: true; value: T } | { ok: false; error: E },
): T {
  if (!result.ok) {
    throw new Error(`unexpected error ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** The active mission; throws when there is none. */
function active(state: GameState): TacticalState {
  if (state.activeMission === undefined) throw new Error("no active mission");
  return state.activeMission;
}

/** Stage 1 of the fixture, started. */
function started(): {
  state: GameState;
  mission: Mission;
  deployment: Deployment;
} {
  const fixture = campaign();
  const state = unwrap(
    startTacticalMission(
      fixture.state,
      fixture.mission.id,
      fixture.deployment,
      deps(),
    ),
  );
  return { ...fixture, state };
}

/**
 * Stage 1 won the hard way: the first squad fell to a bug (credited
 * to the first mech), the first mech boarded hurt with a gun half
 * spent, every other unit of the force boarded with a used medkit
 * record and on overwatch, and a bug died. The outcome is what the
 * mission end reads off that.
 */
function stageOneWon(state: GameState): GameState {
  const mission = active(state);
  const force = mission.units.filter((u) => u.team === "tdf");
  const [mech] = force.filter((u) => u.kind === "mech");
  const [fallen] = force.filter((u) => u.kind === "squad");
  if (mech === undefined || fallen === undefined) {
    throw new Error("fixture needs a mech and a squad");
  }
  const bug: Unit = {
    ...fallen,
    id: "unit-bug-1",
    kind: "bug",
    team: "bugs",
    sourceId: "swarmer",
    templateId: fallen.templateId,
    hp: 0,
  };
  const hurt = (unit: Unit): Unit =>
    unit.id === mech.id
      ? {
          ...unit,
          hp: unit.maxHp - 20,
          ap: 0,
          heat: 3,
          braced: true,
          movedThisTurn: true,
          weaponReadyOnTurn: { gun: 9 },
          status: ["overwatch"],
          charges: Object.fromEntries(
            Object.entries(unit.charges ?? { gun: 4 }).map(([id, left]) => [
              id,
              Math.floor(left / 2),
            ]),
          ),
          ablativeSpent: 2,
        }
      : { ...unit, status: ["suppressed"], equipment: { medkit: 0 } };
  const extracted = force.filter((u) => u.id !== fallen.id).map(hurt);
  const units: Unit[] = [
    { ...fallen, hp: 0 },
    bug,
    ...mission.units.filter((u) => u.team === "bugs"),
  ];
  const ended: TacticalState = {
    ...mission,
    turn: 7,
    units,
    extracted,
    objectives: mission.objectives.map((o) => ({ ...o, complete: true })),
    log: [
      ...mission.log,
      { type: UNIT_DIED, payload: { unitId: fallen.id } },
      { type: UNIT_DIED, payload: { unitId: bug.id, killerId: mech.id } },
      { type: TURN_STARTED, payload: { turn: 7, phase: "player" } },
    ],
  };
  const outcome = missionOutcome(ended);
  return { ...state, activeMission: { ...ended, outcome } };
}

// ===========================================
// Starting a linked mission
// ===========================================

describe("a linked mission's first stage", () => {
  it("starts at stage 0 of 2 with nothing behind it", () => {
    const { state } = started();
    expect(active(state).stage).toEqual({ index: 0, count: 2, earlier: [] });
  });

  it("is exactly a one-map start when the type has no stages", () => {
    const fixture = campaign();
    const linked = active(started().state);
    const plain = unwrap(
      startTacticalMission(
        fixture.state,
        fixture.mission.id,
        fixture.deployment,
        deps(MISSION_TYPES),
      ),
    ).activeMission;
    expect(plain?.stage).toBeUndefined();
    const { stage: _stage, ...rest } = linked;
    expect(rest).toEqual(plain);
  });
});

// ===========================================
// Winning a stage
// ===========================================

describe("winning a stage that is not the last", () => {
  it("is not the end of the mission", () => {
    const won = active(stageOneWon(started().state));
    expect(won.outcome).toBe("won");
    expect(stagePending(won)).toBe(true);
    expect(missionFinished(won)).toBe(false);
  });

  it("carries the survivors straight into the next stage, as they were", () => {
    const { state } = started();
    const won = stageOneWon(state);
    const before = active(won);
    const next = active(unwrap(advanceMissionStage(won, deps())));
    expect(next.stage?.index).toBe(1);
    expect(next.stage?.count).toBe(2);
    expect(next.outcome).toBeUndefined();
    expect(next.turn).toBe(1);
    expect(next.extracted).toEqual([]);
    // Same ids, same hit points, ammunition, equipment and plate: no
    // repairs and no re-arm between the stages.
    const force = next.units.filter((u) => u.team === "tdf");
    expect(force.map((u) => u.id).sort()).toEqual(
      before.extracted.map((u) => u.id).sort(),
    );
    for (const unit of before.extracted) {
      const carried = force.find((u) => u.id === unit.id);
      expect(carried?.hp, unit.id).toBe(unit.hp);
      expect(carried?.charges, unit.id).toEqual(unit.charges);
      expect(carried?.equipment, unit.id).toEqual(unit.equipment);
      expect(carried?.ablativeSpent, unit.id).toEqual(unit.ablativeSpent);
      expect(carried?.templateId).toBe(unit.templateId);
      expect(next.templates[unit.templateId]).toEqual(
        before.templates[unit.templateId],
      );
    }
    // The hurt mech really is hurt, so the equality above means something.
    const mech = force.find((u) => u.kind === "mech");
    expect(mech !== undefined && mech.hp < mech.maxHp).toBe(true);
  });

  it("resets what was measured in the last map's turns", () => {
    const next = active(
      unwrap(advanceMissionStage(stageOneWon(started().state), deps())),
    );
    for (const unit of next.units.filter((u) => u.team === "tdf")) {
      expect(unit.ap).toBe(unit.maxAp);
      expect(unit.status).toEqual([]);
      expect(unit.heat).toBeUndefined();
      expect(unit.braced).toBeUndefined();
      expect(unit.movedThisTurn).toBeUndefined();
      expect(unit.weaponReadyOnTurn).toBeUndefined();
    }
  });

  it("leaves the dead behind, on the stage they fell on", () => {
    const won = active(stageOneWon(started().state));
    const fallen = won.units.find((u) => u.team === "tdf" && u.hp <= 0);
    const next = active(
      unwrap(advanceMissionStage(stageOneWon(started().state), deps())),
    );
    expect(fallen).toBeDefined();
    expect(next.units.some((u) => u.id === fallen?.id)).toBe(false);
    expect(next.stage?.earlier[0]?.units.some((u) => u.id === fallen?.id)).toBe(
      true,
    );
    expect(next.stage?.earlier[0]?.turns).toBe(7);
    // Only the events the result reads are kept.
    expect(next.stage?.earlier[0]?.log.map((e) => e.type)).toEqual([
      UNIT_DIED,
      UNIT_DIED,
    ]);
  });

  it("plays the next stage on a map of its own, and deploys the force on it", () => {
    const won = stageOneWon(started().state);
    const next = active(unwrap(advanceMissionStage(won, deps())));
    expect(next.map.recipe.seed).toBe("linked-7/stage-1");
    const deploy = new Set(
      next.map.hooks.deployZones
        .flatMap((zone) => zone.tiles)
        .map((t) => `${String(t.x)},${String(t.y)},${String(t.z)}`),
    );
    for (const unit of next.units.filter((u) => u.team === "tdf")) {
      expect(
        deploy.has(
          `${String(unit.pos.x)},${String(unit.pos.y)},${String(unit.pos.z)}`,
        ),
      ).toBe(true);
    }
    // The clearance's setup ran again on the new map.
    expect(next.spawners.length).toBeGreaterThan(0);
    expect(next.objectives.every((o) => !o.complete)).toBe(true);
  });

  it("refuses to advance a stage still being fought, lost, or the last", () => {
    const { state } = started();
    expect(advanceMissionStage(state, deps())).toEqual({
      ok: false,
      error: { kind: "no-stage-to-advance", missionId: "mission-1" },
    });
    const lost = {
      ...state,
      activeMission: { ...active(state), outcome: "lost" as const },
    };
    expect(advanceMissionStage(lost, deps()).ok).toBe(false);
    const second = unwrap(advanceMissionStage(stageOneWon(state), deps()));
    const secondWon = {
      ...second,
      activeMission: { ...active(second), outcome: "won" as const },
    };
    expect(stagePending(active(secondWon))).toBe(false);
    expect(advanceMissionStage(secondWon, deps()).ok).toBe(false);
  });
});

// ===========================================
// One result for the whole mission
// ===========================================

describe("the linked mission's one result", () => {
  /** Stage 2 lost: everyone who went on falls there. */
  function lostOnStageTwo(): {
    state: GameState;
    mission: Mission;
    deployment: Deployment;
  } {
    const fixture = started();
    const second = unwrap(
      advanceMissionStage(stageOneWon(fixture.state), deps()),
    );
    const mission = active(second);
    const units = mission.units.map((u) =>
      u.team === "tdf" ? { ...u, hp: 0 } : u,
    );
    const dead = { ...mission, units };
    return {
      ...fixture,
      state: {
        ...second,
        activeMission: { ...dead, outcome: missionOutcome(dead) },
      },
    };
  }

  it("is lost when any stage is lost, and reports every stage", () => {
    const { state, mission, deployment } = lostOnStageTwo();
    const tactical = active(state);
    expect(tactical.outcome).toBe("lost");
    expect(missionFinished(tactical)).toBe(true);
    const city = state.overworld.map.cities.find(
      (c) => c.id === mission.cityId,
    );
    if (city === undefined) throw new Error("fixture needs its city");
    const result = tacticalMissionResult(
      {
        tactical,
        mission,
        deployment,
        state: { squads: state.roster.squads, mechs: state.roster.mechs, city },
      },
      {
        hpPerSoldier: UNIT_TUNING.infantry.hpPerSoldier,
        tuning: AUTO_RESOLVE_TUNING,
      },
    );
    expect(result.outcome).toBe("lost");
    expect(result.stages).toEqual([
      { index: 0, outcome: "won", turns: 7 },
      { index: 1, outcome: "lost", turns: 1 },
    ]);
    // The squad that fell on stage 1 is wiped too, and every mech is lost.
    expect([...result.squadsWiped].sort()).toEqual(
      [...deployment.squadIds].sort(),
    );
    expect([...result.mechsDestroyed].sort()).toEqual(
      [...deployment.mechIds].sort(),
    );
    // Stage 1's kill is still credited, and its species recorded.
    const mechReport = result.mechDamage.find(
      (r) => r.mechId === deployment.mechIds[0],
    );
    expect(mechReport?.kills).toBe(1);
    expect(result.speciesKilled).toEqual(["swarmer"]);
  });

  it("reads back the whole force sent, earlier stages' fallen included", () => {
    const { state, deployment } = lostOnStageTwo();
    const read = deploymentOf(active(state));
    expect([...read.squadIds].sort()).toEqual([...deployment.squadIds].sort());
    expect([...read.mechIds].sort()).toEqual([...deployment.mechIds].sort());
  });

  it("names every unit once across the stages", () => {
    const { state } = lostOnStageTwo();
    const ids = missionRecord(active(state)).roster.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ends the whole mission when the first stage is lost or left", () => {
    const { state } = started();
    for (const outcome of ["lost", "extracted"] as const) {
      const ended = { ...state, activeMission: { ...active(state), outcome } };
      expect(stagePending(active(ended)), outcome).toBe(false);
      expect(missionFinished(active(ended)), outcome).toBe(true);
      let launched = 0;
      const finish = createFinishMissionHandler<GameState>({
        launch: (campaign) => {
          launched += 1;
          return { ok: true, value: { state: campaign, events: [] } };
        },
      });
      expect(finish(ended, finishMission("mission-1"), {} as never).ok).toBe(
        true,
      );
      expect(launched, outcome).toBe(1);
    }
  });

  it("is not resolved while another stage waits", () => {
    const won = stageOneWon(started().state);
    let launched = 0;
    const finish = createFinishMissionHandler<GameState>({
      launch: (state) => {
        launched += 1;
        return { ok: true, value: { state, events: [] } };
      },
    });
    const refused = finish(won, finishMission("mission-1"), {} as never);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("stage-pending");
    expect(launched).toBe(0);
  });
});

// ===========================================
// Save and resume
// ===========================================

describe("a linked mission saved and loaded through the real codec", () => {
  it("resumes into stage 2 with the carried state", () => {
    const second = unwrap(
      advanceMissionStage(stageOneWon(started().state), deps()),
    );
    const saves = createGameSaveService(new MemoryKeyValueStore(), {
      now: () => "2026-09-26T00:00:00.000Z",
    });
    expect(saves.saveGame("slot-1", second).ok).toBe(true);
    const loaded = unwrap(saves.loadGame("slot-1"));
    expect(loaded).toEqual(second);
    expect(active(loaded).stage?.index).toBe(1);
    expect(active(loaded).stage?.earlier).toHaveLength(1);
  });

  it("resumes between the stages into the same stage 2", () => {
    const won = stageOneWon(started().state);
    const saves = createGameSaveService(new MemoryKeyValueStore(), {
      now: () => "2026-09-26T00:00:00.000Z",
    });
    expect(saves.saveGame("slot-1", won).ok).toBe(true);
    const loaded = unwrap(saves.loadGame("slot-1"));
    expect(stagePending(active(loaded))).toBe(true);
    expect(unwrap(advanceMissionStage(loaded, deps()))).toEqual(
      unwrap(advanceMissionStage(won, deps())),
    );
  });
});
