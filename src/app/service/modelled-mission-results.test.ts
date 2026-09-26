import { describe, expect, it } from "vitest";

import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Hive } from "../../overworld/model/hive";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { Mission } from "../../overworld/model/mission";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import { MISSION_OUTCOMES } from "../../overworld/model/mission-result";
import type { WreckRecoverySpec } from "../../overworld/model/wreck-recovery-spec";
import {
  EVACUATION_LOST_SOURCE,
  EVACUATION_SAVED_SOURCE,
} from "../../overworld/service/missions/evacuation-consequence";
import { stockCount, stockOf } from "../../roster/service/part-stock-service";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import type { GameState } from "../../save/model/game-state";
import { LIVE_SPECIMEN_SPECIES } from "../../tactical/service/story/live-specimen-setup";
import {
  composeSweepGame,
  SWEEP_NOW,
  SWEEP_RESULTS,
} from "./campaign-sweep.test-helper";
import type { GameComposition } from "./game-composition";
import {
  carcassPoints,
  MODELLED_RESULTS,
  modelledResult,
} from "./modelled-mission-results.test-helper";
import type { ModelledPlayer } from "./modelled-player.test-helper";
import {
  CAMPAIGN_SWEEP_TUNING,
  deploymentFor,
  resultContextFor,
} from "./modelled-player.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** The campaign seed every staging here starts from. */
const SEED = 7;

/** The Average player, made to end every mission `outcome`. */
function always(outcome: MissionOutcome): ModelledPlayer {
  const outcomes =
    outcome === "won"
      ? { won: 1, extracted: 0 }
      : outcome === "extracted"
        ? { won: 0, extracted: 1 }
        : { won: 0, extracted: 0 };
  return { ...CAMPAIGN_SWEEP_TUNING.players.average, outcomes };
}

/** Applies `command` through the game's dispatcher, or throws. */
function dispatch(
  game: GameComposition,
  state: GameState,
  command: Parameters<GameComposition["dispatcher"]["process"]>[1],
): GameState {
  const applied = game.dispatcher.process(state, command);
  if (!applied.ok) throw new Error(JSON.stringify(applied.error));
  return applied.value.state;
}

/**
 * A fresh campaign five missions in (every Act I type has debuted),
 * its board cleared and `stage` applied, advanced day by day until an
 * offer of `typeId` (story or not, as `story` says) is on the board.
 */
function withOffer(
  game: GameComposition,
  typeId: MissionTypeId,
  stage: (state: GameState) => GameState = (state) => state,
  story = false,
): { readonly state: GameState; readonly offer: Mission } {
  const fresh = game.createCampaign({ seed: SEED, createdAt: SWEEP_NOW });
  let state = stage({
    ...fresh,
    overworld: {
      ...fresh.overworld,
      missions: [],
      progress: { ...fresh.overworld.progress, missionsPlayed: 5 },
    },
  });
  for (let day = 0; day < 30; day += 1) {
    state = dispatch(game, state, advanceDay());
    const offer = state.overworld.missions.find(
      (mission) =>
        mission.typeId === typeId && (mission.storyId !== undefined) === story,
    );
    if (offer !== undefined) return { state, offer };
  }
  throw new Error(`no ${typeId} offer within 30 days`);
}

/** Launches `offer` with the whole roster and returns the state after. */
function launch(
  game: GameComposition,
  state: GameState,
  offer: Mission,
): GameState {
  return dispatch(
    game,
    state,
    launchMission(offer.id, deploymentFor(offer, state.roster)),
  );
}

/** A city's infestation in `state`. */
function infestationOf(state: GameState, cityId: string): number {
  const city = state.overworld.map.cities.find((each) => each.id === cityId);
  if (city === undefined) throw new Error(`no city ${cityId}`);
  return city.infestation;
}

/** Whether `flag` is set in `state`. */
function flagged(state: GameState, flag: string): boolean {
  return (state.overworld.progress.flags as readonly string[]).includes(flag);
}

// ===========================================
// The table
// ===========================================

describe("MODELLED_RESULTS (campaign arc §12)", () => {
  it("has a builder for every mission type", () => {
    expect(Object.keys(MODELLED_RESULTS).sort()).toEqual(
      [...MISSION_TYPE_IDS].sort(),
    );
  });

  it("builds every type's result for every outcome on the shared reward scale", () => {
    const game = composeSweepGame(always("won"));
    const { offer } = withOffer(game, "infestation-clearance");
    const ctx = resultContextFor(always("won"), SWEEP_RESULTS);
    for (const typeId of MISSION_TYPE_IDS) {
      for (const outcome of MISSION_OUTCOMES) {
        const mission: Mission = { ...offer, typeId };
        const result = modelledResult(mission, outcome, ctx);
        expect(result.missionId, `${typeId} ${outcome}`).toBe(mission.id);
        expect(result.outcome).toBe(outcome);
        expect(result.squadCasualties).toEqual([]);
        expect(result.mechsDestroyed).toEqual([]);
        expect(result.creditsAwarded).toBeGreaterThanOrEqual(0);
        expect(result.techPointsAwarded).toBeGreaterThanOrEqual(0);
        if (outcome === "lost") {
          expect(result.techPointsHarvested).toBeUndefined();
        }
      }
    }
  });

  it("brings a harvest home on a win or an extraction and prices Salvage Rich's carcasses", () => {
    const game = composeSweepGame(always("won"));
    const { offer } = withOffer(game, "infestation-clearance");
    const salvaged: Mission = {
      ...offer,
      difficulty: 3,
      mapParams: { ...offer.mapParams, techCarcass: { techPoints: 16 } },
      sitreps: ["salvage-rich"],
    };
    expect(carcassPoints(salvaged, SWEEP_RESULTS)).toBe(16 + 2 * (10 + 2 * 3));
    const harvesting = resultContextFor(always("won"), SWEEP_RESULTS);
    const idle = resultContextFor(
      CAMPAIGN_SWEEP_TUNING.players.idle,
      SWEEP_RESULTS,
    );
    const won = modelledResult(salvaged, "won", harvesting);
    expect(won.techPointsHarvested).toBe(48);
    expect(won.techPointsAwarded).toBe(
      modelledResult(salvaged, "won", idle).techPointsAwarded + 48,
    );
    expect(
      modelledResult(salvaged, "extracted", harvesting).techPointsHarvested,
    ).toBe(48);
    expect(
      modelledResult(salvaged, "lost", harvesting).techPointsHarvested,
    ).toBeUndefined();
  });
});

// ===========================================
// Each builder through the real consequence rule
// ===========================================

describe("each modelled result drives its type's real consequence rule", () => {
  it("infestation clearance: a win cuts the city, a loss adds the penalty", () => {
    const won = composeSweepGame(always("won"));
    const staged = withOffer(won, "infestation-clearance");
    const before = infestationOf(staged.state, staged.offer.cityId);
    const after = launch(won, staged.state, staged.offer);
    expect(infestationOf(after, staged.offer.cityId)).toBeLessThan(before);

    const lost = composeSweepGame(always("lost"));
    const again = withOffer(lost, "infestation-clearance");
    const was = infestationOf(again.state, again.offer.cityId);
    expect(
      infestationOf(launch(lost, again.state, again.offer), again.offer.cityId),
    ).toBe(Math.min(100, was + SWEEP_RESULTS.rewards.lossInfestationPenalty));
  });

  it("crash site: a win wrecks the pod (landing erased) and recovers the spore sample; an extraction lets it take root", () => {
    const won = composeSweepGame(always("won"));
    const staged = withOffer(won, "crash-site");
    const spec = staged.offer.crashSite;
    if (spec === undefined) throw new Error("a crash site carries its landing");
    const after = launch(won, staged.state, staged.offer);
    expect(after.overworld.lastMissionResult?.podDestroyed).toBe(true);
    expect(infestationOf(after, spec.landingCityId)).toBeLessThanOrEqual(
      spec.preLandingInfestation,
    );
    expect(flagged(after, "spore-sample")).toBe(true);

    const pulled = composeSweepGame(always("extracted"));
    const again = withOffer(pulled, "crash-site");
    const out = launch(pulled, again.state, again.offer);
    expect(out.overworld.lastMissionResult?.podDestroyed).toBe(false);
    expect(flagged(out, "spore-sample")).toBe(false);
    expect(
      infestationOf(out, again.offer.crashSite?.landingCityId ?? ""),
    ).toBeGreaterThan(
      infestationOf(again.state, again.offer.crashSite?.landingCityId ?? ""),
    );
  });

  it("evacuation: a win brings every group home (paid per group, saved window); an extraction is the lost window", () => {
    const won = composeSweepGame(always("won"));
    const staged = withOffer(won, "evacuation");
    const spec = staged.offer.evacuation;
    if (spec === undefined) throw new Error("an evacuation carries its groups");
    const after = launch(won, staged.state, staged.offer);
    expect(after.overworld.lastMissionResult?.civiliansRescued).toBe(
      spec.groups,
    );
    expect(after.economy.credits - staged.state.economy.credits).toBe(
      staged.offer.rewards.credits + spec.groups * spec.creditsPerGroup,
    );
    expect(
      after.overworld.stipendModifiers?.map((each) => each.source),
    ).toContain(EVACUATION_SAVED_SOURCE);

    const pulled = composeSweepGame(always("extracted"));
    const again = withOffer(pulled, "evacuation");
    const out = launch(pulled, again.state, again.offer);
    expect(
      out.overworld.stipendModifiers?.map((each) => each.source),
    ).toContain(EVACUATION_LOST_SOURCE);
  });

  it("hive assault: a win brings the core down, liberates the region and recovers the hive core sample", () => {
    const stageHive = (state: GameState): GameState => {
      const worst = [...state.overworld.map.cities]
        .filter((city) => city.infestation > 0)
        .sort((a, b) => b.infestation - a.infestation)[0];
      if (worst === undefined)
        throw new Error("fixture needs an infested city");
      const hive: Hive = {
        id: "hive-1",
        regionId: worst.regionId,
        formedDay: state.overworld.day,
      };
      return { ...state, overworld: { ...state.overworld, hives: [hive] } };
    };
    const won = composeSweepGame(always("won"));
    const staged = withOffer(won, "hive-assault", stageHive);
    const after = launch(won, staged.state, staged.offer);
    expect(after.overworld.lastMissionResult?.hiveCoreDestroyed).toBe(true);
    expect(after.overworld.lastMissionResult?.speciesKilled).toContain(
      "hive-guard",
    );
    expect(after.overworld.hives).toEqual([]);
    expect(flagged(after, "hive-core-sample")).toBe(true);

    const lost = composeSweepGame(always("lost"));
    const again = withOffer(lost, "hive-assault", stageHive);
    const out = launch(lost, again.state, again.offer);
    expect(out.overworld.hives).toHaveLength(1);
    expect(flagged(out, "hive-core-sample")).toBe(false);
  });

  it("wreck recovery: a win strips the wreck and stocks its parts; either way the record is spent", () => {
    const stageWreck = (state: GameState): GameState => {
      const mech = state.roster.mechs[0];
      const city = state.overworld.map.cities.find(
        (each) => each.infestation > 0,
      );
      if (mech === undefined || city === undefined)
        throw new Error("fixture needs a mech and a city");
      const wreck: WreckRecoverySpec = {
        mechId: mech.id,
        mechName: mech.name,
        chassisId: mech.loadout.chassisId,
        parts: loadoutPartIds(mech.loadout).filter(
          (id) => id !== mech.loadout.chassisId,
        ),
        loadout: mech.loadout,
        cityId: city.id,
        missionId: "mission-lost",
        lostDay: state.overworld.day,
        stripTurns: MISSION_TUNING.wreck.stripTurns,
      };
      return { ...state, overworld: { ...state.overworld, wrecks: [wreck] } };
    };
    const won = composeSweepGame(always("won"));
    const staged = withOffer(won, "wreck-recovery", stageWreck);
    const parts = staged.offer.rewards.parts ?? [];
    expect(parts.length).toBeGreaterThan(0);
    const after = launch(won, staged.state, staged.offer);
    expect(after.overworld.lastMissionResult?.wreck?.stripped).toBe(true);
    const first = parts[0] ?? "";
    expect(stockCount(stockOf(after.roster), first)).toBeGreaterThan(
      stockCount(stockOf(staged.state.roster), first),
    );
    expect(after.overworld.wrecks ?? []).toEqual([]);

    const lost = composeSweepGame(always("lost"));
    const again = withOffer(lost, "wreck-recovery", stageWreck);
    const out = launch(lost, again.state, again.offer);
    expect(out.overworld.lastMissionResult?.wreck?.stripped).toBe(false);
    expect(stockOf(out.roster)).toEqual(stockOf(again.state.roster));
    expect(out.overworld.wrecks ?? []).toEqual([]);
  });

  it("defend installation: the result says whether it held and moves the city by its delta", () => {
    for (const outcome of ["won", "lost"] as const) {
      const game = composeSweepGame(always(outcome));
      const staged = withOffer(game, "infestation-clearance");
      const offer: Mission = {
        ...staged.offer,
        typeId: "defend-installation",
        defence: { installation: "sensor-array", generators: 2, waves: 2 },
      };
      const state: GameState = {
        ...staged.state,
        overworld: {
          ...staged.state.overworld,
          missions: staged.state.overworld.missions.map((each) =>
            each.id === offer.id ? offer : each,
          ),
        },
      };
      const before = infestationOf(state, offer.cityId);
      const after = launch(game, state, offer);
      const result = after.overworld.lastMissionResult;
      expect(result?.defence, outcome).toEqual({
        installation: "sensor-array",
        held: outcome === "won",
      });
      expect(infestationOf(after, offer.cityId)).toBe(
        Math.max(0, Math.min(100, before + (result?.infestationDelta ?? 0))),
      );
    }
  });
});

describe("MODELLED_STORY_RESULTS", () => {
  /** A campaign with the capture net researched, so Live Specimen pins. */
  const netResearched = (state: GameState): GameState => ({
    ...state,
    tech: { ...state.tech, unlocked: ["tech.pheromone-analysis"] },
    overworld: {
      ...state.overworld,
      progress: {
        ...state.overworld.progress,
        flags: ["spore-sample", "capture-net"],
      },
    },
  });

  it("a won Live Specimen brings the specimen home, and the story ends Act I (today: the campaign is won)", () => {
    const game = composeSweepGame(always("won"));
    const staged = withOffer(
      game,
      "infestation-clearance",
      netResearched,
      true,
    );
    expect(staged.offer.storyId).toBe("live-specimen");
    const after = launch(game, staged.state, staged.offer);
    expect(after.overworld.lastMissionResult?.specimenCaptured).toBe(
      LIVE_SPECIMEN_SPECIES,
    );
    expect(after.overworld.progress.storyWon).toContain("live-specimen");
    expect(flagged(after, "campaign-won")).toBe(true);
  });

  it("an extracted Live Specimen brings nothing home and is pinned again later", () => {
    const game = composeSweepGame(always("extracted"));
    const staged = withOffer(
      game,
      "infestation-clearance",
      netResearched,
      true,
    );
    const after = launch(game, staged.state, staged.offer);
    expect(after.overworld.lastMissionResult?.specimenCaptured).toBeUndefined();
    expect(after.overworld.progress.storyWon ?? []).not.toContain(
      "live-specimen",
    );
    expect(
      after.overworld.progress.storyRetryDay?.["live-specimen"],
    ).toBeGreaterThan(after.overworld.day);
  });
});
