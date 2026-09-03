import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import type { Mech } from "../../roster/model/mech";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MechRater } from "../../roster/model/mech-rater";
import type { Squad } from "../../roster/model/squad";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { AUTO_RESOLVE_TUNING } from "../data/auto-resolve-tuning";
import type { AutoResolveTuning } from "../model/auto-resolve-tuning";
import type { Deployment } from "../model/deployment";
import type { Mission } from "../model/mission";
import type { MissionResolutionState } from "../model/mission-resolution-state";
import type { MissionResult } from "../model/mission-result";
import {
  AutoResolveMissionResolver,
  winProbability,
} from "./auto-resolve-mission-resolver";

// ===========================================
// Fixtures
// ===========================================

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
const TUNING = AUTO_RESOLVE_TUNING;

/** Every mech rates like the starter mech. */
const RATER: MechRater = { rateMech: () => 129 };

function squad(id: string, strength = 5, typeId = "rifle"): Squad {
  return {
    id,
    name: id,
    typeId,
    strength,
    maxStrength: 5,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

function mech(id: string, damage = 0): Mech {
  return {
    id,
    name: id,
    loadout: {
      name: "l",
      chassisId: "c",
      legsId: "l",
      armsId: "a",
      armWeaponId: "aw",
      backWeaponId: "bw",
      utilityIds: [],
    },
    damage,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

function mission(difficulty: number): Mission {
  return {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: "c",
    difficulty,
    mapParams: {
      biome: "temperate",
      settlement: "city",
      size: "medium",
      seed: "s",
    },
    rewards: { credits: 1000 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
  };
}

/** Roster of four full squads and three fresh mechs, plus a damaged one. */
const STATE: MissionResolutionState = {
  squads: [squad("s1"), squad("s2"), squad("s3", 5, "rocket"), squad("s4", 2)],
  mechs: [mech("m1"), mech("m2"), mech("m3"), mech("m4", 90)],
  city: {
    id: "c",
    name: "C",
    regionId: "r",
    infestation: 40,
    neighbourIds: [],
    layout: { x: 0, y: 0 },
  },
};

const STRONG: Deployment = {
  missionId: "mission-1",
  squadIds: ["s1", "s2", "s3", "s4"],
  mechIds: ["m1", "m2", "m3"],
};
const STARTER: Deployment = {
  missionId: "mission-1",
  squadIds: ["s1", "s2"],
  mechIds: ["m1"],
};
const WEAK: Deployment = {
  missionId: "mission-1",
  squadIds: ["s4"],
  mechIds: [],
};

function resolver(
  tuning: AutoResolveTuning = TUNING,
): AutoResolveMissionResolver {
  return new AutoResolveMissionResolver({
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    mechRater: RATER,
    tuning,
  });
}

/** Resolves once per seed. */
function sweep(
  deployment: Deployment,
  difficulty: number,
  tuning: AutoResolveTuning = TUNING,
): MissionResult[] {
  const r = resolver(tuning);
  return SEEDS.map((seed) =>
    r.resolve(mission(difficulty), deployment, STATE, new Mulberry32Rng(seed)),
  );
}

function winRate(results: readonly MissionResult[]): number {
  return results.filter((r) => r.outcome === "won").length / results.length;
}

function strengthOf(squadId: string): number {
  return STATE.squads.find((s) => s.id === squadId)?.strength ?? 0;
}

function damageOf(mechId: string): number {
  return STATE.mechs.find((m) => m.id === mechId)?.damage ?? 0;
}

// ===========================================
// Formula
// ===========================================

describe("winProbability", () => {
  it("is even when force matches the difficulty's demand", () => {
    expect(winProbability(150, 5, TUNING)).toBeCloseTo(0.5);
  });

  it("rises with force and falls with difficulty, staying in (0, 1)", () => {
    let previous = 0;
    for (let force = 0; force <= 400; force += 25) {
      const p = winProbability(force, 5, TUNING);
      expect(p).toBeGreaterThan(previous);
      expect(p).toBeLessThan(1);
      previous = p;
    }
    expect(winProbability(150, 1, TUNING)).toBeGreaterThan(
      winProbability(150, 9, TUNING),
    );
  });
});

// ===========================================
// Statistics over seeds
// ===========================================

describe("AutoResolveMissionResolver over 300 seeds", () => {
  it("lets a stronger force win more often", () => {
    const strong = winRate(sweep(STRONG, 5));
    const starter = winRate(sweep(STARTER, 5));
    const weak = winRate(sweep(WEAK, 5));
    expect(strong).toBeGreaterThan(starter);
    expect(starter).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.9);
    expect(weak).toBeLessThan(0.1);
  });

  it("makes harder missions harder for the same force", () => {
    expect(winRate(sweep(STARTER, 1))).toBeGreaterThan(
      winRate(sweep(STARTER, 5)),
    );
    expect(winRate(sweep(STARTER, 5))).toBeGreaterThan(
      winRate(sweep(STARTER, 10)),
    );
  });

  it("never loses more soldiers than a squad has or more damage than a mech can take", () => {
    for (const result of [...sweep(STRONG, 8), ...sweep(WEAK, 10)]) {
      for (const { squadId, losses } of result.squadCasualties) {
        expect(Number.isInteger(losses)).toBe(true);
        expect(losses).toBeGreaterThan(0);
        expect(losses).toBeLessThanOrEqual(strengthOf(squadId));
      }
      for (const { mechId, damage } of result.mechDamage) {
        expect(Number.isInteger(damage)).toBe(true);
        expect(damage).toBeGreaterThan(0);
        expect(damageOf(mechId) + damage).toBeLessThanOrEqual(MECH_MAX_DAMAGE);
      }
    }
  });

  it("keeps wiped and destroyed lists consistent with the reports", () => {
    for (const result of sweep(STRONG, 9)) {
      for (const id of result.squadsWiped) {
        const report = result.squadCasualties.find((c) => c.squadId === id);
        expect(report?.losses).toBe(strengthOf(id));
      }
      for (const c of result.squadCasualties) {
        expect(result.squadsWiped.includes(c.squadId)).toBe(
          c.losses === strengthOf(c.squadId),
        );
      }
      for (const id of result.mechsDestroyed) {
        const report = result.mechDamage.find((d) => d.mechId === id);
        expect((report?.damage ?? 0) + damageOf(id)).toBe(MECH_MAX_DAMAGE);
      }
      for (const d of result.mechDamage) {
        expect(result.mechsDestroyed.includes(d.mechId)).toBe(
          d.damage + damageOf(d.mechId) === MECH_MAX_DAMAGE,
        );
      }
    }
  });

  it("costs more on a loss than on a win", () => {
    const results = sweep(STARTER, 6);
    const won = results.filter((r) => r.outcome === "won");
    const lost = results.filter((r) => r.outcome === "lost");
    expect(won.length).toBeGreaterThan(20);
    expect(lost.length).toBeGreaterThan(20);
    const meanLosses = (rs: MissionResult[]): number =>
      rs.reduce(
        (sum, r) => sum + r.squadCasualties.reduce((s, c) => s + c.losses, 0),
        0,
      ) / rs.length;
    const destroyedRate = (rs: MissionResult[]): number =>
      rs.reduce((sum, r) => sum + r.mechsDestroyed.length, 0) / rs.length;
    expect(meanLosses(lost)).toBeGreaterThan(meanLosses(won));
    expect(destroyedRate(lost)).toBeGreaterThan(destroyedRate(won));
  });

  it("pays and clears by outcome", () => {
    for (const result of sweep(STARTER, 5)) {
      switch (result.outcome) {
        case "won":
          expect(result.creditsAwarded).toBe(1000);
          expect(result.infestationDelta).toBe(
            -(TUNING.clearanceBase + TUNING.clearancePerDifficulty * 5),
          );
          break;
        case "extracted":
          expect(result.creditsAwarded).toBe(
            Math.floor(1000 * TUNING.extractedRewardFraction),
          );
          expect(result.infestationDelta).toBe(0);
          break;
        case "lost":
          expect(result.creditsAwarded).toBe(0);
          expect(result.infestationDelta).toBe(TUNING.lossInfestationPenalty);
          break;
      }
      expect(result.missionId).toBe("mission-1");
      expect(result.intel).toBeUndefined();
    }
  });

  it("produces every outcome across the sweep", () => {
    const outcomes = new Set(sweep(STARTER, 6).map((r) => r.outcome));
    expect(outcomes).toEqual(new Set(["won", "extracted", "lost"]));
  });
});

// ===========================================
// Determinism and purity
// ===========================================

describe("AutoResolveMissionResolver determinism", () => {
  it("is identical for the same seed and differs across seeds", () => {
    const a = resolver().resolve(
      mission(5),
      STRONG,
      STATE,
      new Mulberry32Rng(7),
    );
    const b = resolver().resolve(
      mission(5),
      STRONG,
      STATE,
      new Mulberry32Rng(7),
    );
    expect(b).toEqual(a);
    const distinct = new Set(sweep(STARTER, 6).map((r) => JSON.stringify(r)));
    expect(distinct.size).toBeGreaterThan(10);
  });

  it("never mutates its inputs and returns plain data", () => {
    const before = JSON.parse(JSON.stringify(STATE)) as MissionResolutionState;
    const m = mission(5);
    const result = resolver().resolve(m, STRONG, STATE, new Mulberry32Rng(3));
    expect(STATE).toEqual(before);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("handles an empty deployment as a near-certain loss with nothing to report", () => {
    const empty: Deployment = {
      missionId: "mission-1",
      squadIds: [],
      mechIds: [],
    };
    const results = sweep(empty, 10);
    expect(winRate(results)).toBeLessThan(0.01);
    for (const r of results) {
      expect(r.squadCasualties).toEqual([]);
      expect(r.mechDamage).toEqual([]);
    }
  });

  it("throws on a deployment naming units missing from the state", () => {
    expect(() =>
      resolver().resolve(
        mission(1),
        { missionId: "mission-1", squadIds: ["ghost"], mechIds: [] },
        STATE,
        new Mulberry32Rng(1),
      ),
    ).toThrow(/unknown squad/);
  });
});
