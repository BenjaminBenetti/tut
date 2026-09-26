import { describe, expect, it } from "vitest";

import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import { MISSION_TYPES } from "../../../content/data/mission-types";
import type { Rng } from "../../../core/model/rng";
import { ECONOMY_TUNING } from "../../../economy/data/economy-tuning";
import { LedgerTransactionService } from "../../../economy/service/transaction-service";
import { TechPointTreasury } from "../../../economy/service/tech-point-service";
import { ROSTER_TUNING } from "../../../roster/data/roster-tuning";
import { SQUAD_TYPES } from "../../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../../save/model/game-state";
import { createNewGame } from "../../../save/service/new-game-service";
import { ACTS } from "../../data/acts";
import { CONTINENTS } from "../../data/continents";
import { DEPLOYABLE_TYPES } from "../../data/deployable-types";
import { EARTH_MAP } from "../../data/earth-map";
import { EVENT_TUNING } from "../../data/event-tuning";
import { EVENT_TYPES } from "../../data/event-types";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { INFESTATION_TUNING } from "../../data/infestation-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { NEW_GAME_TUNING } from "../../data/new-game-tuning";
import { STORY_SPINE } from "../../data/story-spine";
import { THREAT_TUNING } from "../../data/threat-tuning";
import type { CampaignEvent } from "../../model/campaign-event";
import { DEPLOYABLE_TYPE_IDS } from "../../model/deployable-type";
import type { Deployment } from "../../model/deployment";
import { EVENT_TYPE_IDS } from "../../model/event-type";
import type { GreatHive } from "../../model/great-hive";
import { GREAT_HIVE_DESTROYED } from "../../model/great-hive-destroyed-event";
import { GREAT_HIVES_REVEALED } from "../../model/great-hives-revealed-event";
import { launchMission } from "../../model/launch-mission-command";
import type { Mission } from "../../model/mission";
import type { MissionResolver } from "../../model/mission-resolver";
import type { MissionOutcome, MissionResult } from "../../model/mission-result";
import { ADVANCE_DAY, advanceDay } from "../../model/overworld-command";
import { LAUNCH_MISSION } from "../../model/launch-mission-command";
import type { MissionResolutionState } from "../../model/mission-resolution-state";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { DataDeployableTypeCatalogue } from "../../repository/deployable-type-catalogue";
import { DataEventTypeCatalogue } from "../../repository/event-type-catalogue";
import { createAdvanceDayHandler } from "../advance-day-service";
import { createOverworldCommandDispatcher } from "../command-dispatcher";
import type { TickDeps } from "../default-tick-steps";
import { createDefaultTickSteps } from "../default-tick-steps";
import { GREAT_HIVES_DESTROYED_FLAG } from "../great-hive-service";
import { createLaunchMissionHandler } from "../launch-mission-service";
import { MISSION_CONSEQUENCE_RULES } from "../missions/mission-consequence-rules";
import { MISSION_OFFER_DECORATORS } from "../missions/mission-offer-decorators";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import { STORY_MISSION_RULES } from "./story-mission-rules";

// ===========================================
// Fixtures
// ===========================================

const CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);

/** The shipped tick, with the shipped continents. */
const TICK_DEPS: TickDeps = {
  catalogue: CATALOGUE,
  createTransactions: (ids) => new LedgerTransactionService(ids),
  infestationTuning: INFESTATION_TUNING,
  missionTuning: MISSION_TUNING,
  missionTypes: MISSION_TYPES,
  missionOffers: MISSION_OFFER_RULES,
  missionConsequences: MISSION_CONSEQUENCE_RULES,
  offerDecorators: MISSION_OFFER_DECORATORS,
  acts: ACTS,
  threatTuning: THREAT_TUNING,
  economyTuning: ECONOMY_TUNING,
  eventTypes: new DataEventTypeCatalogue(
    EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
  ),
  eventTuning: EVENT_TUNING,
  hiveTuning: HIVE_TUNING,
  storyMissions: STORY_MISSION_RULES,
  continents: CONTINENTS,
};

/** Plays every mission to whatever outcome the test sets next. */
class ScriptedResolver implements MissionResolver {
  outcome: MissionOutcome = "won";

  /** A result for `mission` ending in the scripted outcome, with no casualties. */
  resolve(
    mission: Mission,
    _deployment: Deployment,
    _state: MissionResolutionState,
    _rng: Rng,
  ): MissionResult {
    return {
      missionId: mission.id,
      cityId: mission.cityId,
      outcome: this.outcome,
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
      creditsAwarded: 0,
      techPointsAwarded:
        this.outcome === "won" ? mission.rewards.techPoints : 0,
      infestationDelta: 0,
    };
  }
}

/** A campaign in Act III at its start, Uplink not yet won, with `flags`. */
function actThree(seed: number, flags: readonly CampaignFlagId[]): GameState {
  const game = createNewGame(
    { seed, createdAt: "2026-09-26T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  return {
    ...game,
    overworld: {
      ...game.overworld,
      progress: {
        ...game.overworld.progress,
        act: "act-3",
        actStartedAt: 32,
        missionsPlayed: 32,
        missionsWon: 24,
        flags: ["spore-sample", "hive-core-sample", ...flags],
        storyWon: ["first-skyfall", "live-specimen", "intact-pod"],
      },
    },
  };
}

/** A campaign driven through the real day tick and launch handler. */
class Campaign {
  readonly resolver = new ScriptedResolver();
  readonly events: CampaignEvent[][] = [];
  private readonly dispatcher = createOverworldCommandDispatcher<GameState>();

  /** Starts from `state`. */
  constructor(public state: GameState) {
    this.dispatcher.register(
      ADVANCE_DAY,
      createAdvanceDayHandler(createDefaultTickSteps<GameState>(TICK_DEPS), {
        catalogue: CATALOGUE,
      }),
    );
    this.dispatcher.register(
      LAUNCH_MISSION,
      createLaunchMissionHandler<GameState>({
        resolver: this.resolver,
        rosterTuning: ROSTER_TUNING,
        transactionsFor: (ids) => new LedgerTransactionService(ids),
        techPoints: new TechPointTreasury(),
        consequences: MISSION_CONSEQUENCE_RULES,
        missionTuning: MISSION_TUNING,
        hiveTuning: HIVE_TUNING,
        story: { rules: STORY_MISSION_RULES, spine: STORY_SPINE },
      }),
    );
  }

  /** Ticks `days` days, recording each day's events. */
  advance(days = 1): void {
    for (let i = 0; i < days; i++) {
      this.apply(advanceDay());
    }
  }

  /** Launches `mission` with the first squad, played to `outcome`. */
  play(mission: Mission, outcome: MissionOutcome): readonly CampaignEvent[] {
    this.resolver.outcome = outcome;
    const [squad] = this.state.roster.squads;
    if (squad === undefined) {
      throw new Error("The starter roster has a squad");
    }
    return this.apply(
      launchMission(mission.id, {
        missionId: mission.id,
        squadIds: [squad.id],
        mechIds: [],
      }),
    );
  }

  /** The Great Hive offers on the board, in board order. */
  greatOffers(): Mission[] {
    return this.state.overworld.missions.filter(
      (mission) => mission.storyId === "great-hive",
    );
  }

  /** The story offer `storyId` on the board, if any. */
  story(storyId: string): Mission | undefined {
    return this.state.overworld.missions.find((m) => m.storyId === storyId);
  }

  /** The revealed Great Hives. */
  greatHives(): readonly GreatHive[] {
    return this.state.overworld.greatHives ?? [];
  }

  /** Every event of type `type` recorded so far. */
  eventsOf(type: string): CampaignEvent[] {
    return this.events.flat().filter((event) => event.type === type);
  }

  /** Runs `command`, keeping its state and recording its events. */
  private apply(
    command: Parameters<typeof this.dispatcher.process>[1],
  ): readonly CampaignEvent[] {
    const result = this.dispatcher.process(this.state, command);
    if (!result.ok) {
      throw new Error(`${command.type} failed: ${result.error.message}`);
    }
    this.state = result.value.state;
    this.events.push([...result.value.events]);
    return result.value.events;
  }
}

/** A campaign that has just won Uplink through its pinned offer, not yet ticked. */
function uplinkWon(
  seed: number,
  flags: readonly CampaignFlagId[] = [],
): Campaign {
  const campaign = new Campaign(actThree(seed, flags));
  campaign.advance();
  const uplink = campaign.story("uplink");
  if (uplink === undefined) {
    throw new Error("Uplink pins at the start of Act III");
  }
  campaign.play(uplink, "won");
  return campaign;
}

// ===========================================
// The reveal
// ===========================================

describe("Great Hives through the day tick", () => {
  it("reveals nothing while Uplink stands, then three on the first tick after it is won", () => {
    const campaign = new Campaign(actThree(3, []));
    campaign.advance(5);
    expect(campaign.state.overworld.greatHives).toBeUndefined();
    expect(campaign.eventsOf(GREAT_HIVES_REVEALED)).toEqual([]);

    const uplink = campaign.story("uplink");
    if (uplink === undefined) {
      throw new Error("Uplink pins at the start of Act III");
    }
    campaign.play(uplink, "won");
    expect(campaign.state.overworld.progress.flags).toContain("uplink-won");
    expect(campaign.state.overworld.greatHives).toBeUndefined();

    campaign.advance();
    const hives = campaign.greatHives();
    expect(hives).toHaveLength(3);
    expect(new Set(hives.map((h) => h.continentId)).size).toBe(3);
    expect(campaign.eventsOf(GREAT_HIVES_REVEALED)).toHaveLength(1);
    expect(campaign.greatOffers()).toHaveLength(3);

    campaign.advance(3);
    expect(campaign.eventsOf(GREAT_HIVES_REVEALED)).toHaveLength(1);
    expect(campaign.greatHives()).toEqual(hives);
  });

  it("reveals the same continents for the same seed", () => {
    const continentsFor = (seed: number): string[] => {
      const campaign = uplinkWon(seed);
      campaign.advance();
      return campaign.greatHives().map((h) => h.continentId);
    };
    expect(continentsFor(5)).toEqual(continentsFor(5));
  });

  it("keeps one pinned offer per Great Hive, never duplicated and never lapsing", () => {
    const campaign = uplinkWon(7);
    campaign.advance();
    const offered = campaign.greatOffers();
    expect(offered.map((m) => m.hive?.hiveId)).toEqual(
      campaign.greatHives().map((h) => h.id),
    );
    campaign.advance(40);
    expect(campaign.greatOffers()).toEqual(offered);
    const capped = campaign.state.overworld.missions.filter(
      (m) => m.pinned !== true,
    );
    expect(capped.length).toBeLessThanOrEqual(ACTS["act-3"].boardCap);
  });

  // ===========================================
  // Consequences
  // ===========================================

  it("a won assault destroys its Great Hive and liberates its continent", () => {
    const campaign = uplinkWon(11);
    campaign.advance();
    const [offer] = campaign.greatOffers();
    if (offer === undefined) {
      throw new Error("A Great Hive offer is pinned");
    }
    const events = campaign.play(offer, "won");
    const hive = campaign.greatHives().find((h) => h.id === offer.hive?.hiveId);
    expect(hive?.destroyedDay).toBe(campaign.state.overworld.day);
    for (const regionId of hive?.regionIds ?? []) {
      expect(campaign.state.overworld.growthPausedUntil?.[regionId]).toBe(
        campaign.state.overworld.day +
          HIVE_TUNING.liberationGrowthPauseDays +
          1,
      );
    }
    expect(events.some((e) => e.type === GREAT_HIVE_DESTROYED)).toBe(true);
    expect(campaign.state.economy.techPoints).toBeGreaterThanOrEqual(170);
    campaign.advance(3);
    expect(
      campaign.greatOffers().some((m) => m.hive?.hiveId === offer.hive?.hiveId),
    ).toBe(false);
  });

  it("the third win sets great-hives-destroyed, and Launch Window pins on the next tick", () => {
    const campaign = uplinkWon(13, ["platform-approach"]);
    campaign.advance();
    const offers = campaign.greatOffers();
    expect(offers).toHaveLength(3);
    for (const [n, offer] of offers.entries()) {
      expect(
        campaign.state.overworld.progress.flags.includes(
          GREAT_HIVES_DESTROYED_FLAG,
        ),
      ).toBe(false);
      campaign.play(offer, "won");
      expect(campaign.story("launch-window")).toBeUndefined();
      if (n < 2) {
        campaign.advance();
      }
    }
    expect(campaign.state.overworld.progress.flags).toContain(
      GREAT_HIVES_DESTROYED_FLAG,
    );
    expect(
      campaign
        .eventsOf(GREAT_HIVE_DESTROYED)
        .map((e) =>
          e.type === GREAT_HIVE_DESTROYED ? e.payload.destroyed : -1,
        ),
    ).toEqual([1, 2, 3]);
    campaign.advance();
    expect(campaign.story("launch-window")).toMatchObject({ pinned: true });
    expect(campaign.greatOffers()).toEqual([]);
  });

  it("without platform-approach, the third win does not pin Launch Window", () => {
    const campaign = uplinkWon(13);
    campaign.advance();
    for (const offer of campaign.greatOffers()) {
      campaign.play(offer, "won");
    }
    campaign.advance();
    expect(campaign.state.overworld.progress.flags).toContain(
      GREAT_HIVES_DESTROYED_FLAG,
    );
    expect(campaign.story("launch-window")).toBeUndefined();
  });

  it("a lost assault re-pins after STORY_RETRY_DAYS, a level up", () => {
    const campaign = uplinkWon(17);
    campaign.advance();
    const [offer] = campaign.greatOffers();
    const hiveId = offer?.hive?.hiveId;
    if (offer === undefined || hiveId === undefined) {
      throw new Error("A Great Hive offer is pinned");
    }
    campaign.play(offer, "lost");
    const offeredFor = (): Mission | undefined =>
      campaign.greatOffers().find((m) => m.hive?.hiveId === hiveId);
    for (let day = 1; day < STORY_RETRY_DAYS; day++) {
      campaign.advance();
      expect(offeredFor(), `day ${String(day)}`).toBeUndefined();
    }
    campaign.advance();
    expect(offeredFor()).toMatchObject({
      pinned: true,
      difficulty: 8,
      hive: { hiveId, level: 1, great: true },
    });
    expect(campaign.greatOffers()).toHaveLength(3);
  });
});
