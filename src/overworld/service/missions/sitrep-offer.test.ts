import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import type { SitrepId } from "../../../content/model/sitrep-id";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { ACTS } from "../../data/acts";
import { SITREPS } from "../../data/sitreps";
import type { ActDefinition } from "../../model/act-definition";
import type { Mission } from "../../model/mission";
import type { SitrepCatalogue } from "../../model/sitrep-definition";
import { missionAt, progressIn } from "./mission-fixtures.test-helper";
import type { SitrepHost } from "./sitrep-offer";
import {
  debutedSitreps,
  eligibleSitreps,
  offeredMissionNumber,
  sitrepFits,
  withSitreps,
} from "./sitrep-offer";

// ===========================================
// Fixtures
// ===========================================

/** A clearance offer at "mid". */
const OFFER: Mission = missionAt("mid", 10);

/** Offers rolled over seeds 1..`count` in `act` after `played` missions. */
function rollMany(
  count: number,
  act: ActDefinition,
  played: number,
  mission: Mission = OFFER,
  catalogue: SitrepCatalogue = SITREPS,
  host?: SitrepHost,
): (readonly SitrepId[] | undefined)[] {
  const progress = progressIn(act.id, played);
  const rolled: (readonly SitrepId[] | undefined)[] = [];
  for (let seed = 1; seed <= count; seed++) {
    rolled.push(
      withSitreps(
        mission,
        progress,
        act,
        new Mulberry32Rng(seed).fork(`decorate:sitreps:${mission.id}`),
        catalogue,
        host,
      ).sitreps,
    );
  }
  return rolled;
}

/** A type with every hook the three later sitreps need. */
const EVERYTHING: SitrepHost = {
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "egg-spawner", count: 2 },
    { kind: "edge-spawn", count: 2 },
    { kind: "extraction", count: 1 },
  ],
};

/** `EVERYTHING` without the hook of `kind`. */
function without(kind: string): SitrepHost {
  return {
    requiredHooks: EVERYTHING.requiredHooks.filter(
      (hook) => hook.kind !== kind,
    ),
  };
}

/** The three sitreps that debut after Act I. */
const LATER: readonly SitrepId[] = [
  "hardened-clutches",
  "swarm-tide",
  "dust-off-window",
];

/** An act whose every slot fills. */
function certain(act: ActDefinition): ActDefinition {
  return { ...act, sitrepChance: 1 };
}

// ===========================================
// Debut
// ===========================================

describe("offeredMissionNumber / debutedSitreps", () => {
  it("counts the offer as the next mission to be played, across acts", () => {
    expect(offeredMissionNumber(progressIn("act-1", 0))).toBe(1);
    expect(offeredMissionNumber(progressIn("act-2", 9))).toBe(10);
  });

  it("debuts nothing before mission 10 and all five at it", () => {
    expect(debutedSitreps(progressIn("act-1", 8), SITREPS)).toEqual([]);
    expect(debutedSitreps(progressIn("act-1", 9), SITREPS)).toEqual([
      "nightfall",
      "spore-fog",
      "city-ablaze",
      "salvage-rich",
      "local-guides",
    ]);
  });

  it("leaves out a sitrep whose debut is later or whose weight is zero", () => {
    const catalogue: SitrepCatalogue = {
      ...SITREPS,
      nightfall: { ...SITREPS.nightfall, debutMission: 16 },
      "spore-fog": { ...SITREPS["spore-fog"], weight: 0 },
    };
    expect(debutedSitreps(progressIn("act-2", 12), catalogue)).toEqual([
      "city-ablaze",
      "salvage-rich",
      "local-guides",
    ]);
    expect(debutedSitreps(progressIn("act-2", 15), catalogue)).toContain(
      "nightfall",
    );
  });
});

describe("the later sitreps' debuts (arc §11)", () => {
  it("debuts Hardened Clutches and Swarm Tide at mission 16, Dust-off Window at 20", () => {
    const at = (played: number) =>
      debutedSitreps(progressIn("act-2", played), SITREPS).filter((id) =>
        LATER.includes(id),
      );
    expect(at(14)).toEqual([]);
    expect(at(15)).toEqual(["hardened-clutches", "swarm-tide"]);
    expect(at(18)).toEqual(["hardened-clutches", "swarm-tide"]);
    expect(at(19)).toEqual(LATER);
  });

  it("never rolls one before its mission, even when every slot fills", () => {
    const m15 = rollMany(
      1000,
      certain(ACTS["act-3"]),
      14,
      OFFER,
      SITREPS,
      EVERYTHING,
    );
    expect(m15.flatMap((s) => s ?? []).some((id) => LATER.includes(id))).toBe(
      false,
    );
    const m19 = rollMany(
      1000,
      certain(ACTS["act-3"]),
      18,
      OFFER,
      SITREPS,
      EVERYTHING,
    );
    const drawn19 = m19.flatMap((s) => s ?? []);
    expect(drawn19).not.toContain("dust-off-window");
    // The fixture exhibits the other two by then.
    expect(drawn19).toContain("hardened-clutches");
    expect(drawn19).toContain("swarm-tide");
    const m20 = rollMany(
      1000,
      certain(ACTS["act-3"]),
      19,
      OFFER,
      SITREPS,
      EVERYTHING,
    );
    expect(m20.flatMap((s) => s ?? [])).toContain("dust-off-window");
  });
});

// ===========================================
// Eligibility
// ===========================================

describe("sitrepFits / eligibleSitreps", () => {
  it("fits a sitrep only to a type that requires every hook it needs", () => {
    expect(sitrepFits(SITREPS["dust-off-window"], EVERYTHING)).toBe(true);
    expect(sitrepFits(SITREPS["dust-off-window"], without("extraction"))).toBe(
      false,
    );
    expect(sitrepFits(SITREPS["swarm-tide"], without("edge-spawn"))).toBe(
      false,
    );
    expect(
      sitrepFits(SITREPS["hardened-clutches"], without("egg-spawner")),
    ).toBe(false);
    // A hook the type lists with no hooks at its lowest difficulty is not one it has.
    const none: SitrepHost = {
      requiredHooks: [{ kind: "edge-spawn", count: 0, countPerDifficulty: 1 }],
    };
    expect(sitrepFits(SITREPS["swarm-tide"], none)).toBe(false);
    // Needing nothing fits anything.
    expect(sitrepFits(SITREPS.nightfall, { requiredHooks: [] })).toBe(true);
  });

  it("offers a defence everything but Hardened Clutches, and a clearance all of them", () => {
    const late = progressIn("act-3", 36);
    expect(
      eligibleSitreps(late, SITREPS, MISSION_TYPES["defend-installation"]),
    ).toEqual([
      "nightfall",
      "spore-fog",
      "city-ablaze",
      "salvage-rich",
      "local-guides",
      "swarm-tide",
      "dust-off-window",
    ]);
    expect(
      eligibleSitreps(late, SITREPS, MISSION_TYPES["infestation-clearance"]),
    ).toEqual(debutedSitreps(late, SITREPS));
    expect(eligibleSitreps(late, SITREPS)).toEqual(
      debutedSitreps(late, SITREPS),
    );
  });

  it("only rolls Dust-off Window where there is an extraction, Swarm Tide where there are edge waves", () => {
    const drawn = (host: SitrepHost) =>
      rollMany(1000, certain(ACTS["act-3"]), 36, OFFER, SITREPS, host).flatMap(
        (s) => s ?? [],
      );
    const everything = drawn(EVERYTHING);
    expect(everything).toContain("dust-off-window");
    expect(everything).toContain("swarm-tide");
    expect(everything).toContain("hardened-clutches");
    expect(drawn(without("extraction"))).not.toContain("dust-off-window");
    expect(drawn(without("edge-spawn"))).not.toContain("swarm-tide");
    expect(drawn(without("egg-spawner"))).not.toContain("hardened-clutches");
  });

  it("leaves every Act I roll as it was: before mission 16 the check removes nothing", () => {
    for (const host of [
      EVERYTHING,
      without("egg-spawner"),
      MISSION_TYPES["defend-installation"],
    ]) {
      expect(rollMany(300, ACTS["act-1"], 12, OFFER, SITREPS, host)).toEqual(
        rollMany(300, ACTS["act-1"], 12),
      );
    }
  });
});

// ===========================================
// withSitreps
// ===========================================

describe("withSitreps", () => {
  it("rolls nothing on an offer for mission 9, even when every slot would fill", () => {
    const rolled = rollMany(200, certain(ACTS["act-3"]), 8);
    expect(rolled.every((sitreps) => sitreps === undefined)).toBe(true);
  });

  it("rolls on an offer for mission 10", () => {
    const rolled = rollMany(200, certain(ACTS["act-1"]), 9);
    expect(rolled.every((sitreps) => sitreps?.length === 1)).toBe(true);
  });

  it("puts one on about 40% of Act I offers from mission 10, and never two", () => {
    const rolled = rollMany(1000, ACTS["act-1"], 12);
    const carrying = rolled.filter((sitreps) => sitreps !== undefined);
    expect(carrying.length / rolled.length).toBeGreaterThan(0.36);
    expect(carrying.length / rolled.length).toBeLessThan(0.44);
    expect(carrying.every((sitreps) => sitreps?.length === 1)).toBe(true);
  });

  it("draws every debuted sitrep in Act I, each about a fifth of the time", () => {
    const rolled = rollMany(1000, ACTS["act-1"], 12).flatMap((s) => s ?? []);
    for (const id of debutedSitreps(progressIn("act-1", 12), SITREPS)) {
      const share = rolled.filter((drawn) => drawn === id).length;
      expect(share / rolled.length).toBeGreaterThan(0.14);
      expect(share / rolled.length).toBeLessThan(0.26);
    }
  });

  it("can put two on an Act III offer, never the same sitrep twice", () => {
    const rolled = rollMany(1000, ACTS["act-3"], 36);
    const twos = rolled.filter((sitreps) => sitreps?.length === 2);
    // Two slots at 40%: both fill 16% of the time, at least one 64%.
    expect(twos.length / rolled.length).toBeGreaterThan(0.12);
    expect(twos.length / rolled.length).toBeLessThan(0.2);
    const any = rolled.filter((sitreps) => sitreps !== undefined);
    expect(any.length / rolled.length).toBeGreaterThan(0.59);
    expect(any.length / rolled.length).toBeLessThan(0.69);
    for (const pair of twos) {
      expect(new Set(pair).size).toBe(2);
    }
    expect(rolled.every((s) => s === undefined || s.length <= 2)).toBe(true);
  });

  it("rolls up to two in Act III from the whole pool, the later three included", () => {
    const rolled = rollMany(
      1000,
      ACTS["act-3"],
      36,
      OFFER,
      SITREPS,
      MISSION_TYPES["infestation-clearance"],
    );
    expect(ACTS["act-3"].sitrepSlots).toBe(2);
    expect(rolled.every((s) => s === undefined || s.length <= 2)).toBe(true);
    const twos = rolled.filter((s) => s?.length === 2);
    expect(twos.length).toBeGreaterThan(0);
    expect(twos.every((pair) => new Set(pair).size === 2)).toBe(true);
    const drawn = rolled.flatMap((s) => s ?? []);
    for (const id of LATER) {
      expect(drawn).toContain(id);
    }
    // Two hazards together happen: Dust-off beside a spawn sitrep.
    expect(
      twos.some(
        (pair) =>
          pair?.includes("dust-off-window") === true &&
          (pair.includes("swarm-tide") || pair.includes("hardened-clutches")),
      ),
    ).toBe(true);
  });

  it("leaves a slot empty when every debuted sitrep is already drawn", () => {
    const one: SitrepCatalogue = {
      ...SITREPS,
      nightfall: { ...SITREPS.nightfall, debutMission: 99 },
      "spore-fog": { ...SITREPS["spore-fog"], debutMission: 99 },
      "city-ablaze": { ...SITREPS["city-ablaze"], debutMission: 99 },
      "local-guides": { ...SITREPS["local-guides"], debutMission: 99 },
      "hardened-clutches": {
        ...SITREPS["hardened-clutches"],
        debutMission: 99,
      },
      "swarm-tide": { ...SITREPS["swarm-tide"], debutMission: 99 },
      "dust-off-window": { ...SITREPS["dust-off-window"], debutMission: 99 },
    };
    const rolled = rollMany(50, certain(ACTS["act-3"]), 36, OFFER, one);
    expect(rolled.every((s) => s?.join() === "salvage-rich")).toBe(true);
  });

  it("gives a story offer none", () => {
    const story: Mission = { ...OFFER, storyId: "live-specimen" };
    const rolled = rollMany(100, certain(ACTS["act-3"]), 36, story);
    expect(rolled.every((sitreps) => sitreps === undefined)).toBe(true);
  });

  it("may give a defend offer one", () => {
    const defend = missionAt("mid", 10, 10, "defend-installation");
    const rolled = rollMany(100, certain(ACTS["act-1"]), 12, defend);
    expect(rolled.every((sitreps) => sitreps?.length === 1)).toBe(true);
  });

  it("keeps sitreps an offer already carries", () => {
    const authored: Mission = { ...OFFER, sitreps: ["nightfall"] };
    const out = withSitreps(
      authored,
      progressIn("act-3", 36),
      certain(ACTS["act-3"]),
      new Mulberry32Rng(1),
      SITREPS,
    );
    expect(out).toBe(authored);
  });

  it("is a pure function of its stream, and never mutates the offer", () => {
    const before = structuredClone(OFFER);
    const a = rollMany(300, ACTS["act-3"], 36);
    const b = rollMany(300, ACTS["act-3"], 36);
    expect(a).toEqual(b);
    expect(OFFER).toEqual(before);
    // A different stream rolls a different board.
    const c = rollMany(300, ACTS["act-3"], 36, { ...OFFER, id: "mission-x" });
    expect(c).not.toEqual(a);
  });

  it("adds no field at all when nothing is rolled, so the offer is unchanged", () => {
    const quiet: ActDefinition = { ...ACTS["act-1"], sitrepChance: 0 };
    const out = withSitreps(
      OFFER,
      progressIn("act-1", 12),
      quiet,
      new Mulberry32Rng(3),
      SITREPS,
    );
    expect(out).toBe(OFFER);
    expect("sitreps" in out).toBe(false);
  });
});
