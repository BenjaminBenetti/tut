import { describe, expect, it } from "vitest";

import type { SitrepId } from "../../../content/model/sitrep-id";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { ACTS } from "../../data/acts";
import { SITREPS } from "../../data/sitreps";
import type { ActDefinition } from "../../model/act-definition";
import type { Mission } from "../../model/mission";
import type { SitrepCatalogue } from "../../model/sitrep-definition";
import { missionAt, progressIn } from "./mission-fixtures.test-helper";
import {
  debutedSitreps,
  offeredMissionNumber,
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
      ).sitreps,
    );
  }
  return rolled;
}

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

  it("leaves a slot empty when every debuted sitrep is already drawn", () => {
    const one: SitrepCatalogue = {
      ...SITREPS,
      nightfall: { ...SITREPS.nightfall, debutMission: 99 },
      "spore-fog": { ...SITREPS["spore-fog"], debutMission: 99 },
      "city-ablaze": { ...SITREPS["city-ablaze"], debutMission: 99 },
      "local-guides": { ...SITREPS["local-guides"], debutMission: 99 },
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
