import { describe, expect, it } from "vitest";

import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { regionInfestation } from "../../overworld/service/threat-service";
import type { GameState } from "../../save/model/game-state";
import type { CampaignRecord } from "./campaign-sweep.test-helper";
import {
  campaignHeader,
  campaignRow,
  composeSweepGame,
  endlessStory,
  intelNodesOf,
  lastActOf,
  mostInfestedRegion,
  playCampaign,
  quantile,
  SHIPPED_STORY,
  spendCredits,
  SWEEP_NOW,
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

/** A fresh campaign of the Average player's game, and the purchase attempt it spends through. */
function freshCampaign(): {
  state: GameState;
  attempt: (
    state: GameState,
    command: OverworldCommand,
  ) => GameState | undefined;
} {
  const game = composeSweepGame(CAMPAIGN_SWEEP_TUNING.players.average);
  return {
    state: game.createCampaign({ seed: 4, createdAt: SWEEP_NOW }),
    attempt: (state, command) => {
      const applied = game.dispatcher.process(state, command);
      return applied.ok ? applied.value.state : undefined;
    },
  };
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
    expect(lastActOf(SHIPPED_STORY)).toBe("finale");
    expect(SHIPPED_STORY.spine[lastActOf(SHIPPED_STORY)].endedBy).toBe(
      "spore-platform",
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

  it("builds the player's one installation in the most infested region, and only one", () => {
    const { state, attempt } = freshCampaign();
    const player = CAMPAIGN_SWEEP_TUNING.players.average;
    const spent = spendCredits(player, state, 1, attempt);
    const region = mostInfestedRegion(state);
    expect(spent.overworld.deployables).toHaveLength(1);
    expect(spent.overworld.deployables[0]).toMatchObject({
      typeId: player.installation,
      regionId: region,
    });
    for (const other of state.overworld.map.regions) {
      expect(
        regionInfestation(state.overworld.map, other.id),
      ).toBeLessThanOrEqual(regionInfestation(state.overworld.map, region));
    }
    expect(spent.economy.credits).toBeLessThan(state.economy.credits);
    expect(spendCredits(player, spent, 1, attempt)).toBe(spent);
    const idle = CAMPAIGN_SWEEP_TUNING.players.idle;
    expect(spendCredits(idle, state, 1, attempt)).toBe(state);
  });

  it("rebuilds a lost mech from the first saved template when the credits cover it, and waits when they do not", () => {
    const { state, attempt } = freshCampaign();
    const player = { ...CAMPAIGN_SWEEP_TUNING.players.average };
    const { installation: _none, ...noInstallation } = player;
    const lostMech: GameState = {
      ...state,
      roster: { ...state.roster, mechs: [] },
    };
    const rebuilt = spendCredits(noInstallation, lostMech, 1, attempt);
    expect(rebuilt.roster.mechs).toHaveLength(1);
    expect(rebuilt.roster.mechs[0]?.loadout.chassisId).toBe(
      state.roster.savedLoadouts[0]?.chassisId,
    );
    expect(rebuilt.economy.credits).toBeLessThan(lostMech.economy.credits);
    const broke: GameState = {
      ...lostMech,
      economy: { ...lostMech.economy, credits: 0 },
    };
    expect(spendCredits(noInstallation, broke, 1, attempt)).toBe(broke);
    expect(spendCredits(noInstallation, state, 1, attempt)).toBe(state);
  });

  it("interpolates quartiles between order statistics (type 7)", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile([5], 0.75)).toBe(5);
    expect(quantile([], 0.5)).toBeNaN();
  });
});
