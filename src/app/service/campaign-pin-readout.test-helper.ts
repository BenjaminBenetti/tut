import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { TechNode } from "../../tech/model/tech-node";
import type {
  CampaignMark,
  CampaignRecord,
} from "./campaign-sweep.test-helper";
import {
  quantile,
  SHIPPED_STORY,
  storyPlays,
} from "./campaign-sweep.test-helper";

// ===========================================
// Reading the Average player's pins off any player (#1179, C7)
// ===========================================
//
// The campaign sweep pins the Average player's pace and model coverage
// (`campaign-sweep.sim.test.ts`, C1). A probe that asks what would move
// if the Average player spent differently reads the same numbers off an
// opt-in player's campaigns. The ranges are the sweep's, restated here
// so a probe can say which would fail; the sweep's file stays the
// record, and a pin moved there must be moved here.
//
//   pin                         the sweep's range
//   finale.arrived              ≥ 0.9 of campaigns
//   finale.missions (median)    45–55
//   finale.threat (median)      40–55
//   tree / TP earned (median)   1.3–1.6
//   TP by mission 35 / parts    0.9–1.1
//   last-hope.in-time           > 0.5 of campaigns whose first platform assault failed
//   sighting.played             ≥ 0.9 of campaigns
//   hives.formed-past-first     > 0.5 of campaigns
//   autopsy.bought              every campaign
//   types.unmet                 0 mission types never offered or never played
//   open                        0 campaigns open at the day cap
//   gate.late                   0 flag-gated story pins not the day after their gate (D2)

/** One pin read off a player's campaigns. */
export interface PinReading {
  readonly pin: string;
  /** The value the sweep's assertion compares. */
  readonly value: number;
  /** The sweep's range, as text. */
  readonly range: string;
  /** Whether the value is inside it. */
  readonly holds: boolean;
}

/** The story mission whose win is reaching the finale (Launch Window). */
const FINALE_GATE = SHIPPED_STORY.spine["act-3"].endedBy;

/** Days from a flag-gated story mission's gate opening to its pin (D2). */
const GATE_LAG_DAYS = 1;

// ===========================================
// Reading
// ===========================================

/**
 * Every Average pin of the table above, read off `records`.
 *
 * @param records - One player's campaigns on the sweep's seeds.
 * @param nodes - The tech tree, for the budget pins.
 * @returns One reading per pin, in the table's order.
 */
export function readAveragePins(
  records: readonly CampaignRecord[],
  nodes: readonly TechNode[],
): PinReading[] {
  const arrivals = records
    .map(finaleReached)
    .filter((mark): mark is CampaignMark => mark !== undefined);
  const median = (values: readonly number[]): number =>
    quantile(
      [...values].sort((a, b) => a - b),
      0.5,
    );
  const cost = (kind?: TechNode["kind"]): number =>
    nodes
      .filter((node) => kind === undefined || node.kind === kind)
      .reduce((sum, node) => sum + node.cost, 0);
  const byMission35 = records.flatMap((record) => {
    const point = record.series[34];
    return point === undefined ? [] : [point.tpEarned];
  });
  const failed = records.filter(
    (record) => record.stories["spore-platform"].losses > 0,
  );
  const share = (count: number, of: number): number =>
    of === 0 ? Number.NaN : count / of;
  return [
    reading(
      "finale.arrived",
      share(arrivals.length, records.length),
      ">= 0.9",
      (v) => v >= 0.9,
    ),
    reading(
      "finale.missions",
      median(arrivals.map((mark) => mark.missions)),
      "45-55",
      (v) => v >= 45 && v <= 55,
    ),
    reading(
      "finale.threat",
      median(arrivals.map((mark) => mark.threat)),
      "40-55",
      (v) => v >= 40 && v <= 55,
    ),
    reading(
      "tree/tp-earned",
      cost() / median(records.map((record) => record.tpEarned)),
      "1.3-1.6",
      (v) => v >= 1.3 && v <= 1.6,
    ),
    reading(
      "tp-by-m35/parts",
      median(byMission35) / cost("part"),
      "0.9-1.1",
      (v) => v >= 0.9 && v <= 1.1,
    ),
    reading(
      "last-hope.in-time",
      share(
        failed.filter(
          (record) => record.research["tech.last-hope"] !== undefined,
        ).length,
        failed.length,
      ),
      "> 0.5",
      (v) => v > 0.5,
    ),
    reading(
      "sighting.played",
      share(
        records.filter(
          (record) => storyPlays(record.stories["broodmother-sighting"]) > 0,
        ).length,
        records.length,
      ),
      ">= 0.9",
      (v) => v >= 0.9,
    ),
    reading(
      "hives.formed-past-first",
      share(
        records.filter((record) => record.hivesFormed > 1).length,
        records.length,
      ),
      "> 0.5",
      (v) => v > 0.5,
    ),
    reading(
      "autopsy.bought",
      share(
        records.filter((record) => record.nodes.autopsy > 0).length,
        records.length,
      ),
      "= 1",
      (v) => v === 1,
    ),
    reading("types.unmet", unmetTypes(records), "= 0", (v) => v === 0),
    reading(
      "open",
      records.filter((record) => record.end === "open").length,
      "= 0",
      (v) => v === 0,
    ),
    reading(
      "gate.late",
      records.reduce(
        (sum, record) =>
          sum +
          Object.values(record.gateLags).filter((lag) => lag !== GATE_LAG_DAYS)
            .length,
        0,
      ),
      "= 0",
      (v) => v === 0,
    ),
  ];
}

/** Readings as TSV rows under `PIN_READING_HEADER`, for `player`. */
export function pinReadingRows(
  player: string,
  readings: readonly PinReading[],
): string[][] {
  return readings.map((each) => [
    player,
    each.pin,
    Number.isNaN(each.value) ? "" : each.value.toFixed(3),
    each.range,
    each.holds ? "holds" : "fails",
  ]);
}

/** The pin readout TSV's header. */
export const PIN_READING_HEADER: readonly string[] = [
  "player",
  "pin",
  "value",
  "sweep_range",
  "verdict",
];

// ===========================================
// Helpers
// ===========================================

/** One reading, judged by `holds`. */
function reading(
  pin: string,
  value: number,
  range: string,
  holds: (value: number) => boolean,
): PinReading {
  return { pin, value, range, holds: !Number.isNaN(value) && holds(value) };
}

/**
 * When `record` reached the finale: the finale act's start, or else the
 * win of the mission that ends Act III (the sweep's `finaleReached`).
 */
function finaleReached(record: CampaignRecord): CampaignMark | undefined {
  return record.acts.finale ?? record.stories[FINALE_GATE].won;
}

/**
 * How many mission types the campaigns never offered or never played,
 * the Spore Platform counted through its story pin as the sweep counts it.
 */
function unmetTypes(records: readonly CampaignRecord[]): number {
  const total = (pick: (record: CampaignRecord) => number): number =>
    records.reduce((sum, record) => sum + pick(record), 0);
  return MISSION_TYPE_IDS.filter((id) => {
    if (id === "spore-platform") {
      return (
        total((record) =>
          record.stories["spore-platform"].pinnedDays === undefined ? 0 : 1,
        ) === 0 ||
        total((record) => storyPlays(record.stories["spore-platform"])) === 0
      );
    }
    return (
      total((record) => record.types[id].offered) === 0 ||
      total((record) => record.types[id].played) === 0
    );
  }).length;
}
