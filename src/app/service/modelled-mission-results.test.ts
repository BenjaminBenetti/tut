import { describe, expect, it } from "vitest";

import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { TUNNEL_MOUTH_COUNT } from "../../mapgen/service/missions/tunnel-sabotage-map";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Hive } from "../../overworld/model/hive";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { Mission } from "../../overworld/model/mission";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import { MISSION_OUTCOMES } from "../../overworld/model/mission-result";
import { PLATFORM_FAILURE_INFESTATION } from "../../overworld/model/story-mission-rule";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import type { WreckRecoverySpec } from "../../overworld/model/wreck-recovery-spec";
import {
  EVACUATION_LOST_SOURCE,
  EVACUATION_SAVED_SOURCE,
} from "../../overworld/service/missions/evacuation-consequence";
import { evaluateOutcome } from "../../overworld/service/outcome-service";
import { fixtureStoryRule } from "../../overworld/service/story/story-fixtures.test-helper";
import { stockCount, stockOf } from "../../roster/service/part-stock-service";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import type { GameState } from "../../save/model/game-state";
import { LAST_HOPE_COST } from "../../tech/data/endgame-intel-nodes";
import { LIVE_SPECIMEN_SPECIES } from "../../tactical/service/story/live-specimen-setup";
import {
  composeSweepGame,
  storyWith,
  SWEEP_NOW,
  SWEEP_RESULTS,
} from "./campaign-sweep.test-helper";
import type { GameComposition } from "./game-composition";
import {
  carcassPoints,
  MODELLED_RESULTS,
  modelledResult,
  SPORE_PLATFORM_MODELLED_TURNS,
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

  it("tunnel sabotage: a win seals every mouth and holds the city's spread; an extraction or a loss holds nothing", () => {
    for (const outcome of MISSION_OUTCOMES) {
      const game = composeSweepGame(always(outcome));
      const staged = withOffer(game, "infestation-clearance");
      const offer: Mission = {
        ...staged.offer,
        typeId: "tunnel-sabotage",
        tunnelSabotage: {
          cityId: staged.offer.cityId,
          spreadDueDay: staged.state.overworld.day + 2,
        },
      };
      const state: GameState = {
        ...staged.state,
        overworld: {
          ...staged.state.overworld,
          missions: staged.state.overworld.missions.map((each) =>
            each.id === offer.id ? offer : each,
          ),
          spreadCooldowns: {},
        },
      };
      const after = launch(game, state, offer);
      const result = after.overworld.lastMissionResult;
      expect(result?.tunnelsTotal, outcome).toBe(TUNNEL_MOUTH_COUNT);
      expect(result?.tunnelsSealed, outcome).toBe(
        outcome === "won"
          ? TUNNEL_MOUTH_COUNT
          : outcome === "extracted"
            ? 1
            : 0,
      );
      expect(after.overworld.spreadCooldowns[offer.cityId], outcome).toBe(
        outcome === "won" ? MISSION_TUNING.tunnelSabotage.holdDays : undefined,
      );
    }
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

  it("a won Live Specimen brings the specimen home and ends Act I: the campaign enters Act II", () => {
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
    expect(after.overworld.progress.act).toBe("act-2");
    expect(flagged(after, "campaign-won")).toBe(false);
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

describe("the Spore Platform's modelled result through the real consequence and story rules (arc D1, D7)", () => {
  /**
   * The shipped story with Act II's ending as a fixture (Intact Pod is
   * unbuilt), so the finale exists and the platform is ever pinned.
   */
  const FINALE_STORY = storyWith({
    "intact-pod": fixtureStoryRule("intact-pod", {
      act: "act-2",
      onWon: [{ kind: "advance-act" }],
    }),
  });

  /** The campaign in the finale, the one act the platform pins in. */
  const inFinale = (state: GameState): GameState => ({
    ...state,
    overworld: {
      ...state.overworld,
      progress: { ...state.overworld.progress, act: "finale" },
    },
  });

  /** Every city's infestation in `state`, by id. */
  const infestations = (state: GameState): ReadonlyMap<string, number> =>
    new Map(
      state.overworld.map.cities.map((city) => [city.id, city.infestation]),
    );

  const { hull, core } = SPORE_PLATFORM_MODELLED_TURNS;

  it("a won assault wins both stages and ends the campaign in victory", () => {
    const game = composeSweepGame(always("won"), { story: FINALE_STORY });
    const staged = withOffer(game, "spore-platform", inFinale, true);
    expect(staged.offer.storyId).toBe("spore-platform");
    expect(evaluateOutcome(staged.state)).toBeUndefined();

    const after = launch(game, staged.state, staged.offer);
    expect(after.overworld.lastMissionResult?.stages).toEqual([
      { index: 0, outcome: "won", turns: hull },
      { index: 1, outcome: "won", turns: core },
    ]);
    expect(after.overworld.progress.storyWon).toContain("spore-platform");
    expect(flagged(after, "campaign-won")).toBe(true);
    expect(evaluateOutcome(after)).toMatchObject({
      kind: "victory",
      cause: "story",
    });
  });

  it("a lost assault falls at the core and is D7: +30 in every city, platform-failed, Last Hope; a second loss is defeat", () => {
    const game = composeSweepGame(always("lost"), { story: FINALE_STORY });
    const staged = withOffer(game, "spore-platform", inFinale, true);
    // Last Hope is hidden until the platform has failed once.
    expect(
      game.dispatcher.process(
        {
          ...staged.state,
          economy: { ...staged.state.economy, techPoints: LAST_HOPE_COST },
        },
        unlockTech("tech.last-hope"),
      ).ok,
    ).toBe(false);

    const before = infestations(staged.state);
    const failed = launch(game, staged.state, staged.offer);
    expect(failed.overworld.lastMissionResult?.stages).toEqual([
      { index: 0, outcome: "won", turns: hull },
      { index: 1, outcome: "lost", turns: core },
    ]);
    for (const [cityId, was] of before) {
      expect(infestationOf(failed, cityId), cityId).toBe(
        Math.min(100, was + PLATFORM_FAILURE_INFESTATION),
      );
    }
    expect(flagged(failed, "platform-failed")).toBe(true);
    expect(flagged(failed, "campaign-lost")).toBe(false);
    expect(evaluateOutcome(failed)).toBeUndefined();

    // Held back until Last Hope is researched.
    const waited = dispatch(game, failed, advanceDay());
    expect(
      waited.overworld.missions.some(
        (mission) => mission.storyId === "spore-platform",
      ),
    ).toBe(false);

    // Last Hope, now shown, re-offers the assault.
    const hoped = dispatch(
      game,
      {
        ...waited,
        economy: { ...waited.economy, techPoints: LAST_HOPE_COST },
      },
      unlockTech("tech.last-hope"),
    );
    expect(flagged(hoped, "last-hope")).toBe(true);
    const repinned = dispatch(game, hoped, advanceDay());
    const again = repinned.overworld.missions.find(
      (mission) => mission.storyId === "spore-platform",
    );
    if (again === undefined) throw new Error("Last Hope re-pins the platform");

    const lostTwice = launch(game, repinned, again);
    expect(flagged(lostTwice, "campaign-lost")).toBe(true);
    expect(evaluateOutcome(lostTwice)).toMatchObject({
      kind: "defeat",
      cause: "story",
    });
  });

  it("an extracted assault never boards the core, and the story counts it a loss", () => {
    const game = composeSweepGame(always("extracted"), { story: FINALE_STORY });
    const staged = withOffer(game, "spore-platform", inFinale, true);
    const after = launch(game, staged.state, staged.offer);
    expect(after.overworld.lastMissionResult?.stages).toEqual([
      { index: 0, outcome: "extracted", turns: hull },
    ]);
    expect(flagged(after, "platform-failed")).toBe(true);
    expect(flagged(after, "campaign-won")).toBe(false);
  });
});
