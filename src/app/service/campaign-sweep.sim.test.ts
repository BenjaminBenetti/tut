/// <reference types="node" />
import { writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { Mission } from "../../overworld/model/mission";
import type { StoryMissionRule } from "../../overworld/model/story-mission-rule";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import type { TechNode } from "../../tech/model/tech-node";
import type { CampaignRecord, SummaryLine } from "./campaign-sweep.test-helper";
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
 * seeds 1–60 fell between day 50 and day 79 (median 58.5), rounded out
 * to the nearest five. A change to threat, growth or spread that moves
 * an untouched Earth's collapse outside it must move this on purpose.
 */
const IDLE_DEFEAT_DAYS = { min: 45, max: 80 } as const;

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

  it("the Strong player reaches the last act that is built today and wins it", () => {
    const ending = SHIPPED_STORY.spine[lastActOf(SHIPPED_STORY)].endedBy;
    for (const record of SWEEP.shipped.strong) {
      expect(
        record.stories[ending].won,
        `strong seed ${record.seed}`,
      ).toBeDefined();
      expect(record.end, `strong seed ${record.seed}`).toBe("victory");
    }
  });
});

// ===========================================
// Pins the arc wants, owned by packages still in flight
// ===========================================

describe("campaign arc §12 targets not reachable in today's build", () => {
  // Owner: W6-spore-platform (the finale must exist), then the threat retune.
  it.skip("the Average player reaches the finale at a median of 45–55 missions", () => {
    const arrivals = missionsAt(
      SWEEP.shipped.average,
      (record) => record.acts.finale?.missions,
    );
    expect(arrivals.length).toBe(SWEEP.shipped.average.length);
    expect(quantile(arrivals, 0.5)).toBeGreaterThanOrEqual(45);
    expect(quantile(arrivals, 0.5)).toBeLessThanOrEqual(55);
  });

  // Owner: the threat retune, once W6-spore-platform builds the finale.
  it.skip("the Average player arrives at the finale at threat 40–55", () => {
    const threats = missionsAt(
      SWEEP.shipped.average,
      (record) => record.acts.finale?.threat,
    );
    expect(threats.length).toBe(SWEEP.shipped.average.length);
    expect(quantile(threats, 0.5)).toBeGreaterThanOrEqual(40);
    expect(quantile(threats, 0.5)).toBeLessThanOrEqual(55);
  });

  // Owner: W6-spore-platform (the platform, its failure and Last Hope).
  it.skip("after a first platform failure, Last Hope is researched before threat 100 in most runs", () => {
    const failed = SWEEP.shipped.average.filter(
      (record) => record.stories["spore-platform"].losses > 0,
    );
    expect(failed.length).toBeGreaterThan(0);
    const inTime = failed.filter(
      (record) => record.research["tech.last-hope"] !== undefined,
    );
    expect(inTime.length / failed.length).toBeGreaterThan(0.5);
  });

  // Owners: W5-intact-pod, W6-great-hives and W6-spore-platform (the acts between).
  it.skip("the Story-only player does not reach the finale before about mission 30", () => {
    for (const record of SWEEP.shipped["story-only"]) {
      expect(
        record.acts.finale,
        `story-only seed ${record.seed}`,
      ).toBeDefined();
      expect(record.acts.finale?.missions ?? 0).toBeGreaterThanOrEqual(30);
    }
  });

  // Owner: the threat retune (Phase 0), after W6-spore-platform (#1171's whole-tree pin).
  it.skip("the whole tree costs 1.3–1.6× an Average campaign's income, and that income covers the parts by about mission 35", () => {
    const income = quantile(
      missionsAt(SWEEP.shipped.average, (record) => record.tpEarned),
      0.5,
    );
    const tree = SWEEP.nodes.reduce((sum, node) => sum + node.cost, 0);
    expect(tree / income).toBeGreaterThanOrEqual(1.3);
    expect(tree / income).toBeLessThanOrEqual(1.6);
    const parts = SWEEP.nodes
      .filter((node) => node.kind === "part")
      .reduce((sum, node) => sum + node.cost, 0);
    const by35 = quantile(
      missionsAt(
        SWEEP.shipped.average,
        (record) => record.series[34]?.tpEarned,
      ),
      0.5,
    );
    expect(by35 / parts).toBeGreaterThanOrEqual(0.9);
    expect(by35 / parts).toBeLessThanOrEqual(1.1);
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
function missionsAt(
  records: readonly CampaignRecord[],
  pick: (record: CampaignRecord) => number | undefined,
): number[] {
  return records
    .map(pick)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
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
