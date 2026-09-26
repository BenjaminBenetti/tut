/// <reference types="node" />
import { writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { MissionTypeId } from "../../content/model/mission-type-id";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { Mission } from "../../overworld/model/mission";
import type { StoryMissionRule } from "../../overworld/model/story-mission-rule";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import type { TechNode, TechNodeKind } from "../../tech/model/tech-node";
import type {
  CampaignMark,
  CampaignRecord,
  StoryTrack,
  SummaryLine,
} from "./campaign-sweep.test-helper";
import {
  campaignHeader,
  campaignRow,
  composeSweepGame,
  endlessStory,
  intelNodesOf,
  lastActOf,
  playCampaign,
  quantile,
  SHIPPED_STORY,
  storyWith,
  SUMMARY_HEADER,
  summarise,
  summaryRows,
  toTsv,
  treeCost,
} from "./campaign-sweep.test-helper";
import type { ModelledPlayerId } from "./modelled-player.test-helper";
import {
  CAMPAIGN_SWEEP_TUNING,
  MODELLED_PLAYER_IDS,
} from "./modelled-player.test-helper";

// ===========================================
// The sweep (campaign arc §12)
// ===========================================

/**
 * The committed campaign sweep: every modelled player plays
 * `CAMPAIGN_SWEEP_TUNING.seeds` campaigns through the real composition,
 * AdvanceDay by AdvanceDay, to victory, defeat or the day cap.
 *
 * ```
 *   player × seed ──► composeGame({ resolver: modelled }) ──► playCampaign
 *        research ─► UnlockTech   play ─► LaunchMission   advance ─► AdvanceDay
 *   ──► one TSV row per campaign, a summary per player, the pins below
 * ```
 *
 * Alongside the shipped campaign it plays a **projection**: the same
 * players with the last built act's ending stripped of its effects
 * (`endlessStory`), so the campaign runs on until threat ends it. The
 * projection is not the game and pins nothing; it shows where today's
 * threat and income would stand at the mission counts the arc wants the
 * later acts at, for the threat retune.
 *
 * Reports are written when `SIM_CAMPAIGN_OUT` (a path prefix) or
 * `SIM_REPORT_DIR` (a directory) is set:
 *
 * ```
 *   <prefix>.tsv              one row per shipped campaign
 *   <prefix>-projection.tsv   one row per projected campaign
 *   <prefix>-summary.tsv      quartiles per player and metric, the tree's cost by kind,
 *                             and the sweep's wall time and load average
 * ```
 */
const TUNING = CAMPAIGN_SWEEP_TUNING;

/** Campaign seeds, `firstSeed` onwards. */
const SEEDS = Array.from(
  { length: TUNING.seeds },
  (_, index) => TUNING.firstSeed + index,
);

/** The players the projection runs; Idle plays nothing, so it has nothing to project. */
const PROJECTED: readonly ModelledPlayerId[] = [
  "average",
  "strong",
  "story-only",
];

/**
 * The Idle player's defeat window in days, pinned from the measurement:
 * seeds 1–60 fell between day 67 and day 99 (median 77), rounded out
 * to the nearest five. A change to threat, growth or spread that moves
 * an untouched Earth's collapse outside it must move this on purpose.
 * (Before the campaign retune halved the growth rate: day 50–79.)
 */
const IDLE_DEFEAT_DAYS = { min: 65, max: 100 } as const;

/**
 * The story mission that ends Act III (Launch Window): winning it is
 * reaching the finale (arc §3).
 */
const FINALE_GATE = SHIPPED_STORY.spine["act-3"].endedBy;

/** The Average campaigns' finale arrival pins (arc §12, D7). */
const AVERAGE_FINALE = {
  /** Median missions played on reaching the finale. */
  missions: { min: 45, max: 55 },
  /** Median threat on reaching the finale. */
  threat: { min: 40, max: 55 },
  /**
   * Share of campaigns that reach it at all. §12 pins the median; a
   * 70 / 10 / 20 player whose losses cluster can be overrun first, and
   * that is a loss the player saw coming (arc §1), so it is not zero.
   */
  arrived: 0.9,
  /**
   * Share of campaigns whose first platform assault failed that bought
   * Last Hope before threat ended them (arc §12: "in most runs").
   */
  lastHopeInTime: 0.5,
} as const;

/** Earliest median finale arrival for the Story-only player (arc §4, §12). */
const STORY_ONLY_FINALE_MISSIONS = 30;

/**
 * The tech budget (arc §10, #1171): the whole tree against an Average
 * campaign's income, and the part nodes against what it has earned by
 * `partsByMission`.
 */
const TECH_BUDGET = {
  treeToIncome: { min: 1.3, max: 1.6 },
  partsByMission: 35,
  incomeToParts: { min: 0.9, max: 1.1 },
} as const;

/**
 * Mission types the director never draws and only the story pins (their
 * offer rule is a trigger that offers nothing), with the story mission
 * that pins each. The sweep counts ordinary offers per type and story
 * offers per story mission, so the model meets these through the story
 * mission's track.
 */
const PINNED_ONLY_TYPES: Readonly<
  Partial<Record<MissionTypeId, StoryMissionId>>
> = {
  "spore-platform": "spore-platform",
};

/**
 * Days from a flag-gated story mission's gate opening to its pin (arc
 * D2): the research is bought during a day, and the next AdvanceDay's
 * director pins the mission, so the pin lands on the day after.
 */
const GATE_LAG_DAYS = 1;

/** What the sweep played, per player, and what it cost. */
interface Sweep {
  readonly shipped: Readonly<
    Record<ModelledPlayerId, readonly CampaignRecord[]>
  >;
  readonly projection: Readonly<
    Partial<Record<ModelledPlayerId, readonly CampaignRecord[]>>
  >;
  readonly nodes: readonly TechNode[];
  readonly wallMs: number;
  readonly load: readonly number[];
}

let SWEEP: Sweep;

beforeAll(() => {
  const loadBefore = loadavg();
  const started = performance.now();
  const shipped = Object.fromEntries(
    MODELLED_PLAYER_IDS.map((id) => [id, playAll(id)]),
  ) as Record<ModelledPlayerId, readonly CampaignRecord[]>;
  const projection = Object.fromEntries(
    PROJECTED.map((id) => [id, playAll(id, true)]),
  ) as Partial<Record<ModelledPlayerId, readonly CampaignRecord[]>>;
  const wallMs = performance.now() - started;
  const nodes = composeSweepGame(TUNING.players.idle).content.tech.listNodes();
  SWEEP = { shipped, projection, nodes, wallMs, load: loadBefore };
  writeReports(SWEEP);
});

// ===========================================
// Pins that hold today
// ===========================================

describe("campaign sweep (campaign arc §12)", () => {
  it("plays the whole sweep in under 60 s", () => {
    expect(SWEEP.wallMs).toBeLessThan(60_000);
  });

  it("the Idle player is defeated by threat, inside the measured day window", () => {
    for (const record of SWEEP.shipped.idle) {
      expect(record.end, `idle seed ${record.seed}`).toBe("defeat");
      expect(record.cause, `idle seed ${record.seed}`).toBe("threat");
      expect(record.days, `idle seed ${record.seed}`).toBeGreaterThanOrEqual(
        IDLE_DEFEAT_DAYS.min,
      );
      expect(record.days, `idle seed ${record.seed}`).toBeLessThanOrEqual(
        IDLE_DEFEAT_DAYS.max,
      );
    }
  });

  it("every campaign reaches victory or defeat inside the day cap: no stalled story offer, no endless act", () => {
    const open = MODELLED_PLAYER_IDS.flatMap((id) =>
      SWEEP.shipped[id]
        .filter((record) => record.end === "open")
        .map((record) => `${id} seed ${record.seed}`),
    );
    expect(open).toEqual([]);
  });

  it("every flag-gated story mission is pinned the day after its gate opens: research is the only gate (D2)", () => {
    const records = MODELLED_PLAYER_IDS.flatMap((id) => SWEEP.shipped[id]);
    expect(gatedCampaigns(records)).toBeGreaterThan(0);
    expect(gateViolations(records)).toEqual([]);
  });

  it("the model meets the whole campaign: the Average player is offered and plays every mission type (the Spore Platform through its story pin), hives form past the scripted first, and autopsies are bought", () => {
    const average = SWEEP.shipped.average;
    const total = (pick: (record: CampaignRecord) => number): number =>
      average.reduce((sum, record) => sum + pick(record), 0);
    for (const id of MISSION_TYPE_IDS) {
      const story = PINNED_ONLY_TYPES[id];
      if (story !== undefined) {
        const played = (track: StoryTrack): number =>
          track.losses + (track.won === undefined ? 0 : 1);
        expect(
          total((record) =>
            record.stories[story].pinnedDays === undefined ? 0 : 1,
          ),
          id,
        ).toBeGreaterThan(0);
        expect(
          total((record) => played(record.stories[story])),
          id,
        ).toBeGreaterThan(0);
        continue;
      }
      expect(
        total((record) => record.types[id].offered),
        id,
      ).toBeGreaterThan(0);
      expect(
        total((record) => record.types[id].played),
        id,
      ).toBeGreaterThan(0);
    }
    const formed = average.filter((record) => record.hivesFormed > 1);
    expect(formed.length).toBeGreaterThan(average.length / 2);
    const dissected = average.filter((record) => record.nodes.autopsy > 0);
    expect(dissected.length).toBe(average.length);
  });

  it("the D2 pin catches a story mission that also waits on missions played", () => {
    const player = TUNING.players.strong;
    const rules = storyWith({
      "live-specimen": afterMissions(STORY_MISSION_RULES["live-specimen"], 20),
    });
    const game = composeSweepGame(player, { story: rules });
    const records = SEEDS.slice(0, 10).map((seed) =>
      playCampaign(game, player, seed, TUNING, rules.rules),
    );
    expect(gateViolations(records).length).toBeGreaterThan(0);
  });
});

// ===========================================
// The campaign's length and tech budget (arc §3, §10, §12)
// ===========================================

describe("the campaign's pace (campaign arc §12)", () => {
  it("the Average player reaches the finale at a median of 45–55 missions", () => {
    const average = SWEEP.shipped.average;
    const arrivals = sortedValues(
      average,
      (record) => finaleReached(record)?.missions,
    );
    expect(arrivals.length / average.length).toBeGreaterThanOrEqual(
      AVERAGE_FINALE.arrived,
    );
    expect(quantile(arrivals, 0.5)).toBeGreaterThanOrEqual(
      AVERAGE_FINALE.missions.min,
    );
    expect(quantile(arrivals, 0.5)).toBeLessThanOrEqual(
      AVERAGE_FINALE.missions.max,
    );
  });

  it("the Average player arrives at the finale at threat 40–55 (D7)", () => {
    const threats = sortedValues(
      SWEEP.shipped.average,
      (record) => finaleReached(record)?.threat,
    );
    expect(quantile(threats, 0.5)).toBeGreaterThanOrEqual(
      AVERAGE_FINALE.threat.min,
    );
    expect(quantile(threats, 0.5)).toBeLessThanOrEqual(
      AVERAGE_FINALE.threat.max,
    );
  });

  it("the Story-only player reaches the finale in every campaign, and not before about mission 30", () => {
    const storyOnly = SWEEP.shipped["story-only"];
    for (const record of storyOnly) {
      expect(
        finaleReached(record),
        `story-only seed ${record.seed}`,
      ).toBeDefined();
    }
    const arrivals = sortedValues(
      storyOnly,
      (record) => finaleReached(record)?.missions,
    );
    expect(quantile(arrivals, 0.5)).toBeGreaterThanOrEqual(
      STORY_ONLY_FINALE_MISSIONS,
    );
  });

  it("the whole tree costs 1.3–1.6× an Average campaign's income, and that income covers the parts by about mission 35 (#1171)", () => {
    const average = SWEEP.shipped.average;
    const cost = (kind?: TechNodeKind): number =>
      SWEEP.nodes
        .filter((node) => kind === undefined || node.kind === kind)
        .reduce((sum, node) => sum + node.cost, 0);
    const income = quantile(
      sortedValues(average, (record) => record.tpEarned),
      0.5,
    );
    expect(cost() / income).toBeGreaterThanOrEqual(
      TECH_BUDGET.treeToIncome.min,
    );
    expect(cost() / income).toBeLessThanOrEqual(TECH_BUDGET.treeToIncome.max);
    const byThen = quantile(
      sortedValues(
        average,
        (record) => record.series[TECH_BUDGET.partsByMission - 1]?.tpEarned,
      ),
      0.5,
    );
    expect(byThen / cost("part")).toBeGreaterThanOrEqual(
      TECH_BUDGET.incomeToParts.min,
    );
    expect(byThen / cost("part")).toBeLessThanOrEqual(
      TECH_BUDGET.incomeToParts.max,
    );
  });

  it("the Strong player reaches the finale and wins the campaign: the Spore Platform falls", () => {
    const ending = SHIPPED_STORY.spine[lastActOf(SHIPPED_STORY)].endedBy;
    for (const record of SWEEP.shipped.strong) {
      expect(finaleReached(record), `strong seed ${record.seed}`).toBeDefined();
      expect(
        record.stories[ending].won,
        `strong seed ${record.seed}`,
      ).toBeDefined();
      expect(record.end, `strong seed ${record.seed}`).toBe("victory");
    }
  });

  it("after a first platform failure, Last Hope is researched before threat 100 in most runs (D7)", () => {
    // A campaign ends at threat 100, so a Last Hope research mark on a
    // record is one bought before it: the failed platform's +30 left
    // the player time to buy the second assault.
    const failed = SWEEP.shipped.average.filter(
      (record) => record.stories["spore-platform"].losses > 0,
    );
    expect(failed.length).toBeGreaterThan(0);
    const inTime = failed.filter(
      (record) => record.research["tech.last-hope"] !== undefined,
    );
    expect(inTime.length / failed.length).toBeGreaterThan(
      AVERAGE_FINALE.lastHopeInTime,
    );
  });
});

// ===========================================
// Helpers
// ===========================================

/** Every campaign of player `id`, on the shipped story or the endless projection. */
function playAll(
  id: ModelledPlayerId,
  projected = false,
): readonly CampaignRecord[] {
  const player = TUNING.players[id];
  const story = projected ? endlessStory() : SHIPPED_STORY;
  const game = composeSweepGame(player, { story });
  return SEEDS.map((seed) =>
    playCampaign(game, player, seed, TUNING, story.rules),
  );
}

/** The sorted defined values `pick` reads off `records`. */
function sortedValues(
  records: readonly CampaignRecord[],
  pick: (record: CampaignRecord) => number | undefined,
): number[] {
  return records
    .map(pick)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
}

/**
 * When `record` reached the finale: the finale act's start once the
 * finale is built, and until then the win of the mission that ends Act
 * III, which is where the finale starts (arc §3).
 */
function finaleReached(record: CampaignRecord): CampaignMark | undefined {
  return record.acts.finale ?? record.stories[FINALE_GATE].won;
}

/** How many campaigns had a flag-gated story gate open and timed. */
function gatedCampaigns(records: readonly CampaignRecord[]): number {
  return records.filter((record) => Object.keys(record.gateLags).length > 0)
    .length;
}

/** Every campaign and story mission whose pin did not follow its gate by `GATE_LAG_DAYS`. */
function gateViolations(records: readonly CampaignRecord[]): string[] {
  return records.flatMap((record) =>
    (Object.entries(record.gateLags) as [StoryMissionId, number][])
      .filter(([, lag]) => lag !== GATE_LAG_DAYS)
      .map(
        ([id, lag]) =>
          `${record.player} seed ${record.seed}: ${id} pinned ${lag} days after its gate`,
      ),
  );
}

/**
 * `rule` with a missions-played floor added to its pin: the sabotage
 * D2 forbids, for checking that the D2 pin sees it.
 */
function afterMissions(
  rule: StoryMissionRule | undefined,
  missions: number,
): StoryMissionRule {
  if (rule === undefined) {
    throw new Error("the sabotaged story mission is not built");
  }
  return {
    ...rule,
    create: (state, ctx): Mission | undefined =>
      state.progress.missionsPlayed < missions
        ? undefined
        : rule.create(state, ctx),
  };
}

/** Writes the rows, the projection and the summary where the environment asks. */
function writeReports(sweep: Sweep): void {
  const prefix =
    process.env.SIM_CAMPAIGN_OUT ??
    (process.env.SIM_REPORT_DIR === undefined
      ? undefined
      : join(process.env.SIM_REPORT_DIR, "campaign-sweep"));
  if (prefix === undefined) {
    return;
  }
  const intel = intelNodesOf(sweep.nodes);
  const header = campaignHeader(intel);
  const rows = (records: readonly CampaignRecord[]): string[][] =>
    records.map((record) => campaignRow(record, intel));
  writeFileSync(
    `${prefix}.tsv`,
    toTsv(
      header,
      MODELLED_PLAYER_IDS.flatMap((id) => rows(sweep.shipped[id])),
    ),
  );
  writeFileSync(
    `${prefix}-projection.tsv`,
    toTsv(
      header,
      PROJECTED.flatMap((id) => rows(sweep.projection[id] ?? [])),
    ),
  );
  const lines: SummaryLine[] = [
    ...MODELLED_PLAYER_IDS.flatMap((id) =>
      summarise(id, sweep.shipped[id], intel),
    ),
    ...PROJECTED.flatMap((id) =>
      summarise(`${id}@endless`, sweep.projection[id] ?? [], intel),
    ),
    ...treeCost(sweep.nodes),
  ];
  const run = [
    [
      "sweep",
      "wall_ms",
      String(SEEDS.length),
      "",
      sweep.wallMs.toFixed(0),
      "",
      "",
    ],
    [
      "sweep",
      "loadavg_1_5_15",
      "",
      ...sweep.load.map((each) => each.toFixed(2)),
      "",
    ],
  ];
  writeFileSync(
    `${prefix}-summary.tsv`,
    toTsv(SUMMARY_HEADER, [...summaryRows(lines), ...run]),
  );
}
