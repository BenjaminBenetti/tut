import { describe, expect, it } from "vitest";

import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import { partIdsOf } from "../../tech/model/tech-effect";
import type { ActId } from "../../content/model/act-id";
import type {
  CampaignDay,
  ForceSnapshot,
} from "./calibration-force-probe.test-helper";
import {
  actStartsOf,
  deriveForce,
  heldBy,
  rankName,
  ratingOf,
  refitLoadout,
  sampleAt,
} from "./calibration-force-probe.test-helper";
import { CALIBRATION_FORCES } from "./calibration-forces.test-helper";
import { composeSweepGame } from "./campaign-sweep.test-helper";
import { CAMPAIGN_SWEEP_TUNING } from "./modelled-player.test-helper";

describe("the calibration force probe", () => {
  const game = composeSweepGame(CAMPAIGN_SWEEP_TUNING.players.average);
  const nodes = game.content.tech.listNodes();
  const [first, second, third] = nodes.map((node) => node.id);

  /** An Act II snapshot at mission 15 holding `unlocked`, with the given xp. */
  const snap = (
    unlocked: readonly string[],
    squadXp: readonly number[] = [75],
    credits = 0,
  ): ForceSnapshot => ({
    seed: 1,
    band: "act-2",
    actStart: 13,
    actEnd: 30,
    missions: 15,
    act: "act-2",
    days: 20,
    threat: 0,
    credits,
    techPoints: 0,
    squadXp,
    mechXp: [75],
    unlocked,
  });

  /** A day of one campaign with `missions` played, in `act`. */
  const day = (missions: number, act: ActId): CampaignDay => ({
    seed: 1,
    missions,
    act,
    days: missions,
    threat: 0,
    credits: 0,
    techPoints: 0,
    squadXp: [5 * missions],
    mechXp: [5 * missions],
    unlocked: [],
  });

  // Act I from mission 0, Act II from 4, Act III from 10; never the finale.
  // Mission 7 has two days, as a rest day repeats the count.
  const campaign: readonly CampaignDay[] = [
    day(0, "act-1"),
    day(1, "act-1"),
    day(2, "act-1"),
    day(3, "act-1"),
    day(4, "act-2"),
    day(5, "act-2"),
    day(6, "act-2"),
    day(7, "act-2"),
    day(7, "act-2"),
    day(8, "act-2"),
    day(9, "act-2"),
    day(10, "act-3"),
    day(11, "act-3"),
  ];

  it("finds the mission each act began at", () => {
    expect(actStartsOf(campaign)).toEqual({
      "act-1": 0,
      "act-2": 4,
      "act-3": 10,
    });
  });

  it("reads an act at the first day halfway, in missions, to the next act", () => {
    expect(sampleAt(campaign, { kind: "midpoint", act: "act-2" })).toEqual({
      ...day(7, "act-2"),
      actStart: 4,
      actEnd: 10,
    });
    expect(
      sampleAt(campaign, { kind: "midpoint", act: "act-1" })?.missions,
    ).toBe(2);
    const shorter = campaign.filter(
      (d) => d.missions !== 9 && d.missions !== 10,
    );
    const moved = [...shorter.slice(0, -1), day(9, "act-3"), day(11, "act-3")];
    expect(sampleAt(moved, { kind: "midpoint", act: "act-2" })?.missions).toBe(
      7,
    );
  });

  it("reads the finale on arrival, and no act a seed never finished or reached", () => {
    expect(sampleAt(campaign, { kind: "arrival", act: "act-3" })).toEqual({
      ...day(10, "act-3"),
      actStart: 10,
    });
    expect(sampleAt(campaign, { kind: "midpoint", act: "act-3" })).toBe(
      undefined,
    );
    expect(sampleAt(campaign, { kind: "arrival", act: "finale" })).toBe(
      undefined,
    );
  });

  it("holds a node that at least half the seeds held, and no other", () => {
    const four = [
      snap([first ?? "", second ?? ""]),
      snap([first ?? "", second ?? ""]),
      snap([first ?? "", third ?? ""]),
      snap([first ?? ""]),
    ];
    expect(heldBy(four, nodes)).toEqual([first, second]);
    expect(heldBy([], nodes)).toEqual([]);
  });

  it("refits nothing without research", () => {
    const refit = refitLoadout(STARTER_LOADOUT, [], nodes, game.content);
    expect(refit.loadout).toEqual(STARTER_LOADOUT);
    expect(refit.rating).toBe(ratingOf(STARTER_LOADOUT, game.content));
  });

  it("fits only parts the research unlocks, and only ones that raise the rating", () => {
    const research = CALIBRATION_FORCES["act-3"].tech;
    const gated = new Set(nodes.flatMap((node) => partIdsOf(node)));
    const unlocked = new Set(
      nodes
        .filter((node) => research.includes(node.id))
        .flatMap((node) => partIdsOf(node)),
    );
    const refit = refitLoadout(STARTER_LOADOUT, research, nodes, game.content);
    for (const part of loadoutPartIds(refit.loadout)) {
      expect(!gated.has(part) || unlocked.has(part), part).toBe(true);
    }
    expect(refit.rating).toBeGreaterThan(
      ratingOf(STARTER_LOADOUT, game.content),
    );
  });

  it("gives each committed band the loadout the bay advises for its research", () => {
    /** A loadout's parts, its utilities in any order. */
    const parts = (loadout: MechLoadout) => ({
      ...loadout,
      name: "",
      utilityIds: [...loadout.utilityIds].sort(),
    });
    for (const band of ["act-2", "act-3", "finale"] as const) {
      const force = CALIBRATION_FORCES[band];
      const refit = refitLoadout(
        STARTER_LOADOUT,
        force.tech,
        nodes,
        game.content,
      );
      expect(parts(refit.loadout), band).toEqual(parts(force.loadout));
    }
  });

  it("never rates a band's refit below the one before it, as research only grows", () => {
    const rated = (["act-1", "act-2", "act-3", "finale"] as const).map(
      (band) =>
        refitLoadout(
          STARTER_LOADOUT,
          CALIBRATION_FORCES[band].tech,
          nodes,
          game.content,
        ).rating,
    );
    expect(rated).toEqual([...rated].sort((a, b) => a - b));
  });

  it("takes the median seed's ranks, bank and roster size, the lower middle on an even count", () => {
    const at15 = [
      snap([], [60, 60, 60], 1000),
      snap([], [100, 100, 100], 5000),
      snap([], [70, 80, 90, 90], 3000),
    ];
    const force = deriveForce(
      at15,
      "act-2",
      STARTER_LOADOUT,
      nodes,
      game.content,
    );
    expect(force).toMatchObject({
      seeds: 3,
      missions: 15,
      squadXp: 80,
      mechXp: 75,
      credits: 3000,
      units: 4,
    });
    expect(
      deriveForce(at15, "act-3", STARTER_LOADOUT, nodes, game.content).seeds,
    ).toBe(0);
  });

  it("names the rank an xp total reaches", () => {
    expect(rankName(0)).not.toBe(rankName(60));
    expect(rankName(60)).toBe(rankName(99));
  });
});
