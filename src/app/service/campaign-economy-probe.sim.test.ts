/// <reference types="node" />
import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import type { SeedEconomy } from "./campaign-economy-probe.test-helper";
import {
  ECONOMY_PROBE_SEEDS,
  ECONOMY_SUMMARY_HEADER,
  economyBandRow,
  economyBandsHeader,
  economySummaryRows,
  probeEconomy,
  summariseEconomy,
} from "./campaign-economy-probe.test-helper";
import {
  PIN_READING_HEADER,
  pinReadingRows,
  readAveragePins,
} from "./campaign-pin-readout.test-helper";
import {
  campaignHeader,
  campaignRow,
  composeSweepGame,
  intelNodesOf,
  SUMMARY_HEADER,
  summarise,
  summaryRows,
  toTsv,
} from "./campaign-sweep.test-helper";
import type { ModelledPlayer } from "./modelled-player.test-helper";
import { CAMPAIGN_SWEEP_TUNING } from "./modelled-player.test-helper";
import type { SpendingRules } from "./realistic-spender.test-helper";
import { OPT_IN_PLAYERS } from "./realistic-spender.test-helper";

// ===========================================
// The campaign economy probe (#1179, GDD §5.5)
// ===========================================

/**
 * Accounts the modelled players' credits over seeds 1–24 of the shipped
 * campaign, act band by act band, for the economy's next read, and reads
 * the Average player's sweep pins off every player's campaigns on the
 * sweep's seeds (1–60):
 *
 * ```
 *   SIM_ECONOMY_OUT=/tmp/economy \
 *     node_modules/.bin/vitest run --config vitest.sim.config.ts \
 *     src/app/service/campaign-economy-probe.sim.test.ts
 *
 *   /tmp/economy.bands.tsv            every seed's band: its point's bank, roster and
 *                                     installations, and its act's money lines and losses
 *   /tmp/economy.summary.tsv          each metric's spread per player and band
 *   /tmp/economy.campaigns.tsv        the campaign sweep's row for every campaign
 *   /tmp/economy.pace.tsv             the campaign sweep's summary for every player
 *   /tmp/economy.pins.tsv             the Average's sweep pins, read off every player
 *                                     on seeds 1–60, and whether each would hold
 * ```
 *
 * Each band's point is the force probe's (act midpoints, the finale's
 * arrival), so the Average player's point banks are the banks the
 * calibration forces were filled from. It reports; it pins nothing.
 * Skipped unless `SIM_ECONOMY_OUT` is set; it takes seconds.
 */
const OUT = process.env.SIM_ECONOMY_OUT;

/**
 * The players the probe accounts, each under its own id: the Average
 * player, which spends as the sweep does, and the opt-in players, which
 * spend like a player (`realistic-spender.test-helper.ts`).
 */
const PLAYERS: readonly {
  readonly player: ModelledPlayer;
  readonly spending?: SpendingRules;
}[] = [
  { player: CAMPAIGN_SWEEP_TUNING.players.average },
  OPT_IN_PLAYERS.spender,
  OPT_IN_PLAYERS.realistic,
];

/** The campaign sweep's seeds, which its pins are read on. */
const SWEEP_SEEDS: readonly number[] = Array.from(
  { length: CAMPAIGN_SWEEP_TUNING.seeds },
  (_, index) => CAMPAIGN_SWEEP_TUNING.firstSeed + index,
);

describe.skipIf(OUT === undefined)("the campaign economy probe", () => {
  it("accounts every player's credits, band by band", () => {
    const out = OUT ?? "";
    const swept = PLAYERS.map(
      ({ player, spending }) =>
        [
          player,
          probeEconomy(
            player,
            SWEEP_SEEDS,
            spending === undefined ? {} : { spending },
          ),
        ] as const,
    );
    const played = swept.map(
      ([player, economies]) =>
        [
          player,
          economies.filter((economy) =>
            ECONOMY_PROBE_SEEDS.includes(economy.seed),
          ),
        ] as const,
    );
    const nodes = composeSweepGame(
      CAMPAIGN_SWEEP_TUNING.players.idle,
    ).content.tech.listNodes();
    const intel = intelNodesOf(nodes);
    const bandRows = played.flatMap(([player, economies]) =>
      economies.flatMap((economy: SeedEconomy) =>
        ACT_IDS.map((band) => economyBandRow(player.id, economy, band)),
      ),
    );
    writeFileSync(`${out}.bands.tsv`, toTsv(economyBandsHeader(), bandRows));
    writeFileSync(
      `${out}.summary.tsv`,
      toTsv(
        ECONOMY_SUMMARY_HEADER,
        played.flatMap(([player, economies]) =>
          economySummaryRows(summariseEconomy(player.id, economies)),
        ),
      ),
    );
    writeFileSync(
      `${out}.campaigns.tsv`,
      toTsv(
        campaignHeader(intel),
        played.flatMap(([, economies]) =>
          economies.map((economy) => campaignRow(economy.record, intel)),
        ),
      ),
    );
    writeFileSync(
      `${out}.pace.tsv`,
      toTsv(
        SUMMARY_HEADER,
        played.flatMap(([player, economies]) =>
          summaryRows(
            summarise(
              player.id,
              economies.map((economy) => economy.record),
              intel,
            ),
          ),
        ),
      ),
    );
    writeFileSync(
      `${out}.pins.tsv`,
      toTsv(
        PIN_READING_HEADER,
        swept.flatMap(([player, economies]) =>
          pinReadingRows(
            player.id,
            readAveragePins(
              economies.map((economy) => economy.record),
              nodes,
            ),
          ),
        ),
      ),
    );
    for (const [, economies] of played) {
      expect(economies).toHaveLength(ECONOMY_PROBE_SEEDS.length);
    }
  });
});
