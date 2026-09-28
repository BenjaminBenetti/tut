import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import {
  INCOME_LINES,
  SPENDING_LINES,
  totalOf,
} from "./campaign-ledger.test-helper";
import {
  economyBandRow,
  economyBandsHeader,
  probeEconomy,
  summariseEconomy,
} from "./campaign-economy-probe.test-helper";
import { CAMPAIGN_SWEEP_TUNING } from "./modelled-player.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** The Average player's economy on seeds 1 and 2, played once for every test. */
const ECONOMIES = probeEconomy(CAMPAIGN_SWEEP_TUNING.players.average, [1, 2]);

// ===========================================
// The probe
// ===========================================

describe("the campaign economy probe (#1179)", () => {
  it("accounts every credit: the start, plus every band's income, less every band's spending, is the last day's bank", () => {
    for (const economy of ECONOMIES) {
      const net = ACT_IDS.reduce(
        (sum, band) =>
          sum +
          totalOf(economy.bands[band].account, INCOME_LINES) -
          totalOf(economy.bands[band].account, SPENDING_LINES),
        0,
      );
      expect(ECONOMY_TUNING.startingCredits + net, `seed ${economy.seed}`).toBe(
        economy.end.credits,
      );
    }
  });

  it("finds the Average player's income in rewards and the stipend, and its spending on its battery, its upkeep and its rebuilt mechs", () => {
    const economy = ECONOMIES[0];
    if (economy === undefined) throw new Error("seed 1 was played");
    const act1 = economy.bands["act-1"].account;
    expect(act1.reward).toBeGreaterThan(0);
    expect(act1.stipend).toBeGreaterThan(0);
    expect(act1["deployable-build"]).toBe(1500);
    expect(act1.upkeep).toBeGreaterThan(0);
    expect(economy.record.mechsBuilt * 2850).toBe(
      ACT_IDS.reduce(
        (sum, band) => sum + economy.bands[band].account["mech-build"],
        0,
      ),
    );
  });

  it("reads each band's point on the force probe's day, with the roster and the installation it had", () => {
    const economy = ECONOMIES[0];
    if (economy === undefined) throw new Error("seed 1 was played");
    const point = economy.bands["act-2"].point;
    expect(point?.act).toBe("act-2");
    expect(point?.squads).toBe(4);
    expect(point?.installations).toBe(1);
    expect(point?.upkeepPerDay).toBe(50);
    const began = economy.record.acts["act-2"]?.missions ?? 0;
    const ended = economy.record.acts["act-3"]?.missions ?? 0;
    expect(point?.missions).toBeGreaterThanOrEqual((began + ended) / 2);
  });

  it("counts each act's missions and days so that they add up to the campaign's", () => {
    for (const economy of ECONOMIES) {
      const missions = ACT_IDS.reduce(
        (sum, band) => sum + economy.bands[band].missions,
        0,
      );
      const days = ACT_IDS.reduce(
        (sum, band) => sum + economy.bands[band].days,
        0,
      );
      expect(missions).toBe(economy.record.missions);
      expect(days).toBe(economy.record.days);
    }
  });

  it("writes one row per seed and band, in the header's order, and summarises every band and the campaign", () => {
    const economy = ECONOMIES[0];
    if (economy === undefined) throw new Error("seed 1 was played");
    expect(economyBandRow("average", economy, "act-1")).toHaveLength(
      economyBandsHeader().length,
    );
    const lines = summariseEconomy("average", ECONOMIES);
    const bank = lines.find(
      (line) => line.band === "act-1" && line.metric === "point.bank",
    );
    expect(bank?.n).toBe(2);
    expect(lines.some((line) => line.band === "campaign")).toBe(true);
  });
});
