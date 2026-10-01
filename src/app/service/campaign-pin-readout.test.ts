import { describe, expect, it } from "vitest";

import {
  pinReadingRows,
  PIN_READING_HEADER,
  readAveragePins,
} from "./campaign-pin-readout.test-helper";
import {
  composeSweepGame,
  playCampaign,
  quantile,
  SHIPPED_STORY,
} from "./campaign-sweep.test-helper";
import { CAMPAIGN_SWEEP_TUNING } from "./modelled-player.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** The Average player's campaigns on seeds 1–4, played once for every test. */
const AVERAGE = CAMPAIGN_SWEEP_TUNING.players.average;
const GAME = composeSweepGame(AVERAGE);
const RECORDS = [1, 2, 3, 4].map((seed) =>
  playCampaign(GAME, AVERAGE, seed, CAMPAIGN_SWEEP_TUNING),
);
const NODES = GAME.content.tech.listNodes();

/** The reading named `pin`. */
function read(pin: string, records = RECORDS) {
  const found = readAveragePins(records, NODES).find(
    (each) => each.pin === pin,
  );
  if (found === undefined) throw new Error(`no ${pin} reading`);
  return found;
}

// ===========================================
// Readings
// ===========================================

describe("readAveragePins (#1179)", () => {
  it("reads the finale's median arrival, in missions and threat, as the sweep does", () => {
    const arrivals = RECORDS.flatMap((record) => {
      const mark =
        record.acts.finale ??
        record.stories[SHIPPED_STORY.spine["act-3"].endedBy].won;
      return mark === undefined ? [] : [mark];
    });
    const median = (values: number[]): number =>
      quantile(
        values.sort((a, b) => a - b),
        0.5,
      );
    expect(read("finale.arrived").value).toBe(arrivals.length / RECORDS.length);
    expect(read("finale.missions").value).toBe(
      median(arrivals.map((mark) => mark.missions)),
    );
    expect(read("finale.threat").value).toBe(
      median(arrivals.map((mark) => mark.threat)),
    );
  });

  it("takes the median of the arrivals in order, not as the campaigns came", () => {
    const [first] = RECORDS;
    if (first === undefined) throw new Error("no campaign");
    const arriving = (missions: number, threat: number) => ({
      ...first,
      acts: { ...first.acts, finale: { missions, days: 70, threat } },
    });
    const records = [arriving(60, 30), arriving(40, 50), arriving(50, 70)];
    expect(read("finale.missions", records).value).toBe(50);
    expect(read("finale.threat", records).value).toBe(50);
  });

  it("counts a campaign that won Launch Window as arrived before the finale act is marked", () => {
    const [first] = RECORDS;
    if (first === undefined) throw new Error("no campaign");
    const won = first.stories[SHIPPED_STORY.spine["act-3"].endedBy].won;
    if (won === undefined) throw new Error("seed 1 never won Launch Window");
    const { finale: _marked, ...unmarked } = first.acts;
    const records = [{ ...first, acts: unmarked }];
    expect(read("finale.arrived", records).value).toBe(1);
    expect(read("finale.missions", records).value).toBe(won.missions);
  });

  it("judges each reading by the sweep's range", () => {
    const missions = read("finale.missions");
    expect(missions.holds).toBe(missions.value >= 45 && missions.value <= 55);
    expect(read("open").value).toBe(0);
    expect(read("open").holds).toBe(true);
    expect(read("autopsy.bought").holds).toBe(true);
    expect(read("gate.late").value).toBe(0);
  });

  it("fails a pin the campaigns break", () => {
    const [first] = RECORDS;
    if (first === undefined) throw new Error("no campaign");
    const broken = [
      ...RECORDS,
      {
        ...first,
        end: "open" as const,
        nodes: { ...first.nodes, autopsy: 0 },
        gateLags: { "live-specimen": 3 },
      },
    ];
    expect(read("open", broken)).toMatchObject({ value: 1, holds: false });
    expect(read("autopsy.bought", broken)).toMatchObject({
      value: 4 / 5,
      holds: false,
    });
    expect(read("gate.late", broken).holds).toBe(false);
  });

  it("fails a share it cannot read rather than pass it", () => {
    const none = read("finale.arrived", []);
    expect(Number.isNaN(none.value)).toBe(true);
    expect(none.holds).toBe(false);
  });

  it("writes one row per reading in the header's order", () => {
    const rows = pinReadingRows("average", readAveragePins(RECORDS, NODES));
    expect(rows).toHaveLength(12);
    for (const row of rows) {
      expect(row).toHaveLength(PIN_READING_HEADER.length);
    }
  });
});
