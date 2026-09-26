import { describe, expect, it } from "vitest";

import type { CampaignRecord } from "./campaign-sweep.test-helper";
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
  toTsv,
} from "./campaign-sweep.test-helper";
import {
  CAMPAIGN_SWEEP_TUNING,
  MODELLED_PLAYER_IDS,
} from "./modelled-player.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** The seeds the determinism check replays. */
const SEEDS = [1, 2, 3];

/** Every player's campaigns on `seeds`, each player on a freshly composed game. */
function sweepTsv(seeds: readonly number[]): string {
  const intel = intelNodesOf(
    composeSweepGame(
      CAMPAIGN_SWEEP_TUNING.players.idle,
    ).content.tech.listNodes(),
  );
  const rows = MODELLED_PLAYER_IDS.flatMap((id) => {
    const player = CAMPAIGN_SWEEP_TUNING.players[id];
    const game = composeSweepGame(player);
    return seeds.map((seed) =>
      campaignRow(
        playCampaign(game, player, seed, CAMPAIGN_SWEEP_TUNING),
        intel,
      ),
    );
  });
  return toTsv(campaignHeader(intel), rows);
}

// ===========================================
// Determinism
// ===========================================

describe("the campaign sweep is deterministic per seed (campaign arc §12)", () => {
  it("replays the same TSV for the same seeds, player by player", () => {
    expect(sweepTsv(SEEDS)).toBe(sweepTsv(SEEDS));
  });

  it("plays different campaigns on different seeds", () => {
    const player = CAMPAIGN_SWEEP_TUNING.players.average;
    const game = composeSweepGame(player);
    const rows = SEEDS.map((seed) =>
      campaignRow(playCampaign(game, player, seed, CAMPAIGN_SWEEP_TUNING), [])
        .slice(2)
        .join("\t"),
    );
    expect(new Set(rows).size).toBe(SEEDS.length);
  });

  it("does not carry one campaign into the next on a shared composition", () => {
    const player = CAMPAIGN_SWEEP_TUNING.players.average;
    const shared = composeSweepGame(player);
    playCampaign(shared, player, 9, CAMPAIGN_SWEEP_TUNING);
    const after: CampaignRecord = playCampaign(
      shared,
      player,
      1,
      CAMPAIGN_SWEEP_TUNING,
    );
    const alone = playCampaign(
      composeSweepGame(player),
      player,
      1,
      CAMPAIGN_SWEEP_TUNING,
    );
    expect(after).toEqual(alone);
  });
});

// ===========================================
// Harness pieces
// ===========================================

describe("campaign sweep harness", () => {
  it("names today's last built act and its ending", () => {
    expect(lastActOf(SHIPPED_STORY)).toBe("act-1");
    expect(SHIPPED_STORY.spine[lastActOf(SHIPPED_STORY)].endedBy).toBe(
      "live-specimen",
    );
  });

  it("the endless projection keeps playing past the last act's ending", () => {
    const player = CAMPAIGN_SWEEP_TUNING.players.strong;
    const record = playCampaign(
      composeSweepGame(player, { story: endlessStory() }),
      player,
      1,
      CAMPAIGN_SWEEP_TUNING,
    );
    expect(record.stories["live-specimen"].won).toBeDefined();
    expect(record.end).not.toBe("victory");
    expect(record.missions).toBeGreaterThan(
      record.stories["live-specimen"].won?.missions ?? 0,
    );
  });

  it("interpolates quartiles between order statistics (type 7)", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile([5], 0.75)).toBe(5);
    expect(quantile([], 0.5)).toBeNaN();
  });
});
