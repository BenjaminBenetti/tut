/// <reference types="node" />
import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { PLAYER_IDS } from "./calibration-run.test-helper";
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
import type { MatrixDraw } from "./matrix-losses.test-helper";
import {
  MATRIX_PLAYER_OF,
  MatrixLossTable,
  matrixPlayer,
  readMatrixRuns,
} from "./matrix-losses.test-helper";
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
 * With a calibration matrix's runs, it also plays the realistic spender
 * on each tactical player's losses (`matrix-losses.test-helper.ts`),
 * and writes the loss table it drew from and how the campaign's
 * missions mapped onto it. A new matrix is a new table: point this at
 * the new `runs.tsv` and run it again.
 *
 * ```
 *   SIM_MATRIX_RUNS=/tmp/matrix.runs.tsv SIM_ECONOMY_OUT=/tmp/economy ...
 *
 *   /tmp/economy.losses.tsv           per tactical player, cell and outcome: runs, mean
 *                                     squads and mechs lost, the share abandoned
 *   /tmp/economy.routes.tsv           per matrix player, act, cell, route and pool: the
 *                                     missions of seeds 1–60 that drew from it
 * ```
 *
 * Each band's point is the force probe's (act midpoints, the finale's
 * arrival), so the Average player's point banks are the banks the
 * calibration forces were filled from. It reports; it pins nothing.
 * Skipped unless `SIM_ECONOMY_OUT` is set; it takes seconds.
 */
const OUT = process.env.SIM_ECONOMY_OUT;

/** A calibration matrix's `runs.tsv`, whose losses the matrix players take. */
const MATRIX_RUNS = process.env.SIM_MATRIX_RUNS;

/** Each tactical player's loss table, when the probe has a matrix. */
const TABLES: readonly MatrixLossTable[] =
  MATRIX_RUNS === undefined
    ? []
    : ((): MatrixLossTable[] => {
        const runs = readMatrixRuns(readFileSync(MATRIX_RUNS, "utf8"));
        return PLAYER_IDS.map((id) => MatrixLossTable.of(runs, id));
      })();

/** Every matrix draw, by player, act, cell, route and pool. */
const ROUTES = new Map<string, number>();

/** The matrix players, each counting its draws into `ROUTES`. */
const MATRIX_PLAYERS = TABLES.map((table) =>
  matrixPlayer(table, (draw: MatrixDraw, mission) => {
    const key = [
      MATRIX_PLAYER_OF[table.player],
      mission.act ?? "",
      draw.cell,
      draw.route,
      draw.pool,
    ].join("\t");
    ROUTES.set(key, (ROUTES.get(key) ?? 0) + 1);
  }),
);

/**
 * The players the probe accounts, each under its own id: the Average
 * player, which spends as the sweep does, and the opt-in players, which
 * spend like a player (`realistic-spender.test-helper.ts`), the matrix
 * players among them when the probe has a matrix.
 */
const PLAYERS: readonly {
  readonly player: ModelledPlayer;
  readonly spending?: SpendingRules;
}[] = [
  { player: CAMPAIGN_SWEEP_TUNING.players.average },
  OPT_IN_PLAYERS.spender,
  OPT_IN_PLAYERS.realistic,
  ...MATRIX_PLAYERS,
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
    if (TABLES.length > 0) {
      writeFileSync(
        `${out}.losses.tsv`,
        toTsv(
          [
            "player",
            "cell",
            "outcome",
            "runs",
            "squads_lost_mean",
            "mechs_lost_mean",
            "abandoned_share",
          ],
          TABLES.flatMap((table) =>
            table
              .rows()
              .map((row) => [
                table.player,
                row.cell,
                row.outcome,
                String(row.runs),
                row.squadsLost.toFixed(2),
                row.mechsLost.toFixed(2),
                row.abandoned.toFixed(2),
              ]),
          ),
        ),
      );
      writeFileSync(
        `${out}.routes.tsv`,
        toTsv(
          ["player", "act", "cell", "route", "pool", "missions"],
          [...ROUTES.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, count]) => [...key.split("\t"), String(count)]),
        ),
      );
    }
    for (const [, economies] of played) {
      expect(economies).toHaveLength(ECONOMY_PROBE_SEEDS.length);
    }
  });
});
