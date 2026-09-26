import { describe, expect, it } from "vitest";

import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import { SITREP_TUNING } from "../data/sitrep-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import type { BugsSpawnedEvent } from "../model/bugs-spawned-event";
import { BUGS_SPAWNED } from "../model/bugs-spawned-event";
import { DROP_SHIP_DEPARTED } from "../model/drop-ship-departed-event";
import { extract } from "../model/extract-command";
import { MISSION_ENDED } from "../model/mission-ended-event";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import { UNIT_ABANDONED } from "../model/unit-abandoned-event";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { standingForce } from "./left-behind-service";
import {
  runUntil,
  sitrepCampaign,
  started,
} from "./mission-start-sitreps.test-helper";
import { createExtractHandler } from "./objective-service";
import { surgedSize, waveInterval, waveSize } from "./spawn-service";
import { tacticalMissionResult } from "./tactical-mission-resolver";

// ===========================================
// Fixtures
// ===========================================

/** A defence of the sensor array with five waves, at difficulty 2. */
const DEFENCE = {
  typeId: "defend-installation",
  defence: {
    installation: "sensor-array",
    deployableId: "deployable-1",
    generators: 2,
    waves: 5,
  },
} as const;

/** The `BugsSpawned` events of one source, in order. */
function spawnsFrom(
  events: readonly TacticalEvent[],
  source: "spawner" | "edge",
): BugsSpawnedEvent[] {
  return events.filter(
    (event): event is BugsSpawnedEvent =>
      event.type === BUGS_SPAWNED && event.payload.source === source,
  );
}

/** The turn each event happened on, read off the `TurnStarted` events before it. */
function turnsOf(
  mission: TacticalState,
  events: readonly TacticalEvent[],
): number[] {
  let turn = mission.turn;
  return events.map((event) => {
    if (event.type === "tactical:turn-started") {
      turn = event.payload.turn;
    }
    return turn;
  });
}

// ===========================================
// Hardened Clutches
// ===========================================

describe("Hardened Clutches through a live start (campaign arc §11)", () => {
  const plain = started();
  const hardened = started(["hardened-clutches"]);

  it("starts every egg spawner with 50% more hit points, rounded up, and moves nothing else", () => {
    expect(plain.spawners.length).toBeGreaterThan(0);
    expect(hardened.spawners.map((s) => s.hp)).toEqual(
      plain.spawners.map((s) =>
        Math.ceil(s.hp * SITREP_TUNING.hardenedClutches.hpScale),
      ),
    );
    expect(hardened.spawners.map((s) => s.hp)).toEqual(
      plain.spawners.map(() => 30),
    );
    expect(
      hardened.spawners.map(({ hp: _hp, hatchBonus: _bonus, ...rest }) => rest),
    ).toEqual(plain.spawners.map(({ hp: _hp, ...rest }) => rest));
    expect(hardened.units).toEqual(plain.units);
    expect(hardened.map).toEqual(plain.map);
  });

  it("hatches one bug more from each spawner on a live EndTurn", () => {
    const hardHatches = spawnsFrom(runUntil(hardened, 10).events, "spawner");
    const plainHatches = spawnsFrom(runUntil(plain, 10).events, "spawner");
    expect(hardHatches.length).toBeGreaterThan(0);
    expect(hardHatches.length).toBe(plainHatches.length);
    for (const [i, event] of hardHatches.entries()) {
      expect(event.payload.unitIds).toHaveLength(SPAWN_TUNING.hatchCount + 1);
      expect(plainHatches[i]?.payload.unitIds).toHaveLength(
        SPAWN_TUNING.hatchCount,
      );
    }
  });

  it("does nothing on a defence, which has no egg spawners", () => {
    const defence = started([], 11, DEFENCE);
    expect(defence.spawners).toEqual([]);
    expect(started(["hardened-clutches"], 11, DEFENCE)).toEqual({
      ...defence,
      sitreps: ["hardened-clutches"],
    });
  });
});

// ===========================================
// Swarm Tide
// ===========================================

describe("Swarm Tide through a live start (campaign arc §11)", () => {
  const plain = started();
  const tide = started(["swarm-tide"]);

  it("brings the first wave a turn sooner and puts the surge on the schedule", () => {
    expect(plain.edgeSpawn).toEqual({
      nextTurn: SPAWN_TUNING.firstWaveTurn,
      wave: 0,
    });
    expect(tide.edgeSpawn).toEqual({
      nextTurn: SPAWN_TUNING.firstWaveTurn - 1,
      wave: 0,
      surge: { sizeScale: 1.5, spillRadius: 2 },
    });
    expect(tide.units).toEqual(plain.units);
    expect(tide.spawners).toEqual(plain.spawners);
  });

  it("lands every wave 50% larger, rounded up, the first a turn early, on a live EndTurn", () => {
    const tideRun = runUntil(tide, 12);
    const plainRun = runUntil(plain, 12);
    const tideWaves = spawnsFrom(tideRun.events, "edge");
    const plainWaves = spawnsFrom(plainRun.events, "edge");
    expect(tideWaves.length).toBeGreaterThanOrEqual(2);
    const tideTurns = turnsOf(tide, tideRun.events);
    const plainTurns = turnsOf(plain, plainRun.events);
    const firstTide = tideTurns[tideRun.events.indexOf(tideWaves[0]!)];
    const firstPlain = plainTurns[plainRun.events.indexOf(plainWaves[0]!)];
    expect(firstPlain).toBe(SPAWN_TUNING.firstWaveTurn);
    expect(firstTide).toBe(SPAWN_TUNING.firstWaveTurn - 1);
    // The first wave lands on clear ground and draws the surged size.
    // A 2×2 species whose draw finds no block is skipped, as in any
    // wave (#1130), so it lands up to that many, and more than a plain
    // wave's; the exact count is spawn-service's test, on 1×1 species.
    const size = waveSize(0, tide.difficulty, tide.threat, SPAWN_TUNING);
    const surged = surgedSize(size, tide.edgeSpawn.surge);
    expect(surged).toBe(Math.ceil(size * 1.5));
    expect(plainWaves[0]?.payload.unitIds).toHaveLength(size);
    const first = tideWaves[0]!.payload.unitIds.length;
    expect(first).toBeLessThanOrEqual(surged);
    expect(first).toBeGreaterThan(size);
    // Later ones land where earlier bugs still stand (nobody moves in
    // this run), so they are held to the room left; they still bring
    // more between them than the plain waves do.
    const bugsIn = (waves: readonly BugsSpawnedEvent[]) =>
      waves.reduce((sum, event) => sum + event.payload.unitIds.length, 0);
    expect(bugsIn(tideWaves)).toBeGreaterThan(bugsIn(plainWaves));
  });

  it("keeps a defence's wave count and brings its waves a turn sooner", () => {
    const defence = started(["swarm-tide"], 11, DEFENCE);
    expect(defence.edgeSpawn.totalWaves).toBe(5);
    expect(defence.edgeSpawn.nextTurn).toBe(SPAWN_TUNING.firstWaveTurn - 1);
  });
});

// ===========================================
// Dust-off Window
// ===========================================

describe("Dust-off Window through a live start (campaign arc §11)", () => {
  const plain = started();
  const window = started(["dust-off-window"]);

  it("sets the ship's last turn from the map: 16 on a small map, 20 on a medium one", () => {
    expect(plain.dustOffTurn).toBeUndefined();
    expect(window.map.width + window.map.depth).toBe(96);
    expect(window.dustOffTurn).toBe(16);
    expect(
      started(["dust-off-window"], 11, { size: "medium" }).dustOffTurn,
    ).toBe(20);
    expect({ ...window, dustOffTurn: undefined, sitreps: undefined }).toEqual({
      ...plain,
      dustOffTurn: undefined,
      sitreps: undefined,
    });
  });

  it("keeps twelve turns after a defence's last wave, counted after Swarm Tide moved it", () => {
    const defence = started(["dust-off-window"], 11, DEFENCE);
    const interval = waveInterval(
      defence.difficulty,
      defence.threat,
      SPAWN_TUNING,
    );
    expect(defence.dustOffTurn).toBe(
      SPAWN_TUNING.firstWaveTurn + 4 * interval + 12,
    );
    const both = started(["swarm-tide", "dust-off-window"], 11, DEFENCE);
    expect(both.dustOffTurn).toBe(
      SPAWN_TUNING.firstWaveTurn - 1 + 4 * interval + 12,
    );
  });

  it("waits through its last turn, then leaves on a live EndTurn and strands everyone still out", () => {
    const inside = runUntil(window, 16);
    expect(inside.state.outcome).toBeUndefined();
    expect(inside.state.turn).toBe(16);
    expect(inside.events.map((e) => e.type)).not.toContain(DROP_SHIP_DEPARTED);

    const out = standingForce(inside.state).map((unit) => unit.id);
    expect(out.length).toBeGreaterThan(0);
    const past = runUntil(inside.state, 17);
    const types = past.events.map((event) => event.type);
    const departed = past.events.find((e) => e.type === DROP_SHIP_DEPARTED);
    expect(departed?.payload).toEqual({ turn: 16, leftBehind: out.length });
    expect(
      past.events
        .filter((e) => e.type === UNIT_ABANDONED)
        .map((e) => (e.type === UNIT_ABANDONED ? e.payload.unitId : "")),
    ).toEqual(out);
    expect(types.indexOf(DROP_SHIP_DEPARTED)).toBeLessThan(
      types.indexOf(UNIT_ABANDONED),
    );
    expect(types.at(-1)).toBe(MISSION_ENDED);
    expect(past.state.outcome).toBe("lost");
    expect(past.state.turn).toBe(17);
    expect(standingForce(past.state)).toEqual([]);
  });

  it("brings home whoever boarded, and the debrief lists the rest as left behind", () => {
    const { state: campaign, deployment } = sitrepCampaign(["dust-off-window"]);
    // One squad walks onto the pad and boards on turn 1.
    const squadUnit = window.units.find(
      (unit) => unit.team === "tdf" && unit.kind === "squad",
    );
    if (squadUnit === undefined) throw new Error("fixture needs a squad");
    const onPad: TacticalState = {
      ...window,
      units: window.units.map((unit) =>
        unit.id === squadUnit.id
          ? { ...unit, pos: window.extraction[0]! }
          : unit,
      ),
    };
    const boarded = createExtractHandler(OBJECTIVE_TUNING)(
      onPad,
      extract(squadUnit.id),
      { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() },
    );
    if (!boarded.ok) throw new Error(JSON.stringify(boarded.error));
    const past = runUntil(boarded.value.state, 17);
    expect(past.state.outcome).toBe("extracted");
    expect(past.state.extracted.map((unit) => unit.id)).toEqual([squadUnit.id]);
    expect(past.state.extracted[0]?.hp).toBeGreaterThan(0);
    const abandoned = past.events.filter((e) => e.type === UNIT_ABANDONED);
    expect(abandoned.length).toBe(standingForce(boarded.value.state).length);

    const mission = campaign.overworld.missions[0]!;
    const city = campaign.overworld.map.cities.find(
      (c) => c.id === mission.cityId,
    )!;
    const result = tacticalMissionResult(
      {
        tactical: { ...past.state, log: past.events },
        mission,
        deployment,
        state: {
          squads: campaign.roster.squads,
          mechs: campaign.roster.mechs,
          city,
        },
      },
      {
        hpPerSoldier: UNIT_TUNING.infantry.hpPerSoldier,
        tuning: AUTO_RESOLVE_TUNING,
      },
    );
    // Exactly what abandoning would have listed: every stranded unit's
    // roster entry, turrets' included, once each.
    const strandedRoster = [
      ...new Set(
        standingForce(boarded.value.state).map((unit) => unit.sourceId),
      ),
    ];
    expect(result.leftBehind).toEqual(strandedRoster);
    expect(result.squadsWiped.length).toBeGreaterThan(0);
    expect(result.leftBehind).not.toContain(squadUnit.sourceId);
    expect(result.outcome).toBe("extracted");
  });

  it("never leaves on a mission without the sitrep", () => {
    const run = runUntil(plain, 20);
    expect(run.events.map((e) => e.type)).not.toContain(DROP_SHIP_DEPARTED);
    expect(run.state.outcome).toBeUndefined();
  });
});

// ===========================================
// Together
// ===========================================

describe("the later sitreps together", () => {
  it("are deterministic, and never move an Act I sitrep's draws or the map", () => {
    const all = ["hardened-clutches", "swarm-tide", "dust-off-window"] as const;
    expect(started([...all])).toEqual(started([...all]));
    const fog = started(["spore-fog"]);
    const fogAndAll = started(["spore-fog", ...all]);
    expect(fogAndAll.effects).toEqual(fog.effects);
    expect(fogAndAll.map).toEqual(fog.map);
    expect(fogAndAll.units).toEqual(fog.units);
    expect(fogAndAll.carcasses).toEqual(fog.carcasses);
  });
});
