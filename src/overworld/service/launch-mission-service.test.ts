import { describe, expect, it } from "vitest";

import type { Rng } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import {
  CREDITS_CHANGED,
  TECH_POINTS_CHANGED,
} from "../../economy/model/economy-event";
import { TechPointTreasury } from "../../economy/service/tech-point-service";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { ROSTER_TUNING } from "../../roster/data/roster-tuning";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { Mech } from "../../roster/model/mech";
import {
  MECH_DESTROYED,
  SQUAD_WIPED,
  UNIT_DAMAGED,
} from "../../roster/model/roster-event";
import type { Squad } from "../../roster/model/squad";
import type { CampaignState } from "../model/campaign-state";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import type { CommandContext } from "../model/command-handler";
import type { Deployment } from "../model/deployment";
import { launchMission } from "../model/launch-mission-command";
import type { Mission } from "../model/mission";
import type { MissionResolutionState } from "../model/mission-resolution-state";
import type { MissionResolver } from "../model/mission-resolver";
import type { MissionResult } from "../model/mission-result";
import { MISSION_RESOLVED } from "../model/mission-resolved-event";
import { MISSION_TUNING } from "../data/mission-tuning";
import { STORY_SPINE } from "../data/story-spine";
import { CAMPAIGN_FLAG_SET } from "../model/campaign-flag-set-event";
import type { StoryMissionRules } from "../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../model/story-mission-rule";
import {
  fixtureStoryRule,
  storyRulesOf,
} from "./story/story-fixtures.test-helper";
import type {
  MissionConsequenceRule,
  MissionConsequenceRules,
} from "../model/mission-consequence-rule";
import type { OverworldState } from "../model/overworld-state";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import { buildEarthMap } from "./earth-map-builder";
import type { LaunchMissionDeps } from "./launch-mission-service";
import { MISSION_CONSEQUENCE_RULES } from "./missions/mission-consequence-rules";
import { MAX_DEPLOYED_UNITS } from "../model/deployment";
import {
  createLaunchMissionHandler,
  DEPLOYMENT_MISMATCH,
  DUPLICATE_UNIT,
  EMPTY_DEPLOYMENT,
  MISSION_CITY_MISSING,
  MISSION_EXPIRED,
  MISSION_NOT_FOUND,
  OVERSIZED_DEPLOYMENT,
  UNKNOWN_UNIT,
  validateLaunch,
} from "./launch-mission-service";

// ===========================================
// Fixtures
// ===========================================

const DAY = 5;

const MISSION: Mission = {
  id: "mission-1",
  typeId: "infestation-clearance",
  cityId: "hub",
  difficulty: 3,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "small",
    seed: "1",
  },
  rewards: { credits: 900, techPoints: 0 },
  createdDay: 3,
  expiresDay: 8,
  ignorePenalty: 10,
};

function squad(id: string, strength = 5): Squad {
  return {
    id,
    name: id,
    typeId: "rifle",
    strength,
    maxStrength: 5,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

function mech(id: string, damage = 0): Mech {
  return {
    id,
    name: id,
    loadout: STARTER_LOADOUT,
    damage,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

function campaign(
  overrides: Partial<CampaignState["overworld"]> = {},
): CampaignState {
  return {
    meta: {
      rng: new Mulberry32Rng(1).getState(),
      ids: { counters: {} },
    },
    overworld: {
      day: DAY,
      map: buildEarthMap({
        regions: [
          {
            id: "west",
            name: "West",
            biome: "temperate",
            cities: [
              {
                id: "hub",
                name: "Hub",
                layout: { x: 0.5, y: 0.5 },
                infestation: 50,
              },
              {
                id: "far",
                name: "Far",
                layout: { x: 0.9, y: 0.5 },
                infestation: 20,
              },
            ],
          },
        ],
        links: [["hub", "far"]],
      }),
      threat: 30,
      threatOffset: 0,
      spreadCooldowns: {},
      missions: [MISSION],
      pendingEvents: [],
      deployables: [],
      hives: [],
      progress: createInitialCampaignProgress(),
      ...overrides,
    },
    roster: {
      squads: [squad("squad-1"), squad("squad-2", 3)],
      mechs: [mech("mech-1", 20)],
      savedLoadouts: [],
      graveyard: [],
    },
    economy: { credits: 1000, ledger: [], techPoints: 0 },
    tech: { unlocked: [] },
  };
}

const DEPLOYMENT: Deployment = {
  missionId: "mission-1",
  squadIds: ["squad-1"],
  mechIds: ["mech-1"],
};

const WIN: MissionResult = {
  missionId: "mission-1",
  cityId: "city-1",
  outcome: "won",
  squadCasualties: [{ squadId: "squad-1", losses: 1, kills: 4 }],
  squadsWiped: [],
  mechsDestroyed: [],
  mechDamage: [{ mechId: "mech-1", damage: 30, kills: 2 }],
  creditsAwarded: 900,
  techPointsAwarded: 17,
  techPointsHarvested: 5,
  infestationDelta: -20,
};

const LOSS: MissionResult = {
  missionId: "mission-1",
  cityId: "city-1",
  outcome: "lost",
  squadCasualties: [{ squadId: "squad-1", losses: 5 }],
  squadsWiped: ["squad-1"],
  mechsDestroyed: ["mech-1"],
  mechDamage: [{ mechId: "mech-1", damage: 80 }],
  creditsAwarded: 0,
  techPointsAwarded: 0,
  infestationDelta: 5,
};

/** Returns a fixed result and records what it was asked. */
class StubResolver implements MissionResolver {
  readonly calls: {
    mission: Mission;
    deployment: Deployment;
    state: MissionResolutionState;
    draw: number;
  }[] = [];
  constructor(private readonly result: MissionResult) {}
  resolve(
    mission: Mission,
    deployment: Deployment,
    state: MissionResolutionState,
    rng: Rng,
  ): MissionResult {
    this.calls.push({ mission, deployment, state, draw: rng.nextInt(0, 1e6) });
    return this.result;
  }
}

function deps(
  resolver: MissionResolver,
  consequences: MissionConsequenceRules = MISSION_CONSEQUENCE_RULES,
  rules: StoryMissionRules = {},
): LaunchMissionDeps {
  return {
    resolver,
    rosterTuning: ROSTER_TUNING,
    transactionsFor: (ids) => new LedgerTransactionService(ids),
    techPoints: new TechPointTreasury(),
    consequences,
    missionTuning: MISSION_TUNING,
    story: { rules, spine: STORY_SPINE },
  };
}

function context(seed = 7): CommandContext {
  return { rng: new Mulberry32Rng(seed), ids: new SequentialIdGenerator() };
}

// ===========================================
// Validation
// ===========================================

describe("validateLaunch", () => {
  const cases: [string, CampaignState, Deployment, string][] = [
    [
      "deployment for another mission",
      campaign(),
      { ...DEPLOYMENT, missionId: "mission-9" },
      DEPLOYMENT_MISMATCH,
    ],
    [
      "unknown mission",
      campaign({ missions: [] }),
      DEPLOYMENT,
      MISSION_NOT_FOUND,
    ],
    [
      "expired mission",
      campaign({ day: MISSION.expiresDay }),
      DEPLOYMENT,
      MISSION_EXPIRED,
    ],
    [
      "empty deployment",
      campaign(),
      { missionId: "mission-1", squadIds: [], mechIds: [] },
      EMPTY_DEPLOYMENT,
    ],
    [
      "squad committed twice",
      campaign(),
      { ...DEPLOYMENT, squadIds: ["squad-1", "squad-1"] },
      DUPLICATE_UNIT,
    ],
    [
      "mech committed twice",
      campaign(),
      { ...DEPLOYMENT, mechIds: ["mech-1", "mech-1"] },
      DUPLICATE_UNIT,
    ],
    [
      "squad not in the roster",
      campaign(),
      { ...DEPLOYMENT, squadIds: ["squad-9"] },
      UNKNOWN_UNIT,
    ],
    [
      "mech not in the roster",
      campaign(),
      { ...DEPLOYMENT, mechIds: ["mech-9"] },
      UNKNOWN_UNIT,
    ],
  ];

  it.each(cases)(
    "rejects %s with a typed error",
    (_label, state, deployment, code) => {
      const result = validateLaunch(state, "mission-1", deployment);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(code);
    },
  );

  /**
   * The last check in `validateLaunch`, and the one #735 found had never
   * fired: a mission whose host city is not on the map. Every other
   * refusal returns before it, so nothing had ever reached it.
   */
  it("refuses a mission attached to a city the map does not have", () => {
    const state = campaign();
    const orphaned = {
      ...state,
      overworld: {
        ...state.overworld,
        missions: [{ ...MISSION, cityId: "atlantis" }],
      },
    };
    const result = validateLaunch(orphaned, "mission-1", DEPLOYMENT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(MISSION_CITY_MISSING);
    expect(result.error.message).toContain("atlantis");
  });

  it("accepts a pinned mission past its expiry day (ADR 0013 §2.2)", () => {
    const pinned: Mission = { ...MISSION, pinned: true };
    const result = validateLaunch(
      campaign({ day: MISSION.expiresDay + 3, missions: [pinned] }),
      "mission-1",
      DEPLOYMENT,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a launch the day before expiry with the host city resolved", () => {
    const result = validateLaunch(
      campaign({ day: MISSION.expiresDay - 1 }),
      "mission-1",
      DEPLOYMENT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mission).toBe(MISSION);
    expect(result.value.city.id).toBe("hub");
  });
});

// ===========================================
// Handler
// ===========================================

describe("createLaunchMissionHandler", () => {
  it("does not touch the resolver or the state when validation fails", () => {
    const resolver = new StubResolver(WIN);
    const handler = createLaunchMissionHandler<CampaignState>(deps(resolver));
    const state = campaign();
    const result = handler(
      state,
      launchMission("mission-1", { ...DEPLOYMENT, squadIds: ["squad-9"] }),
      context(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(UNKNOWN_UNIT);
    expect(resolver.calls).toHaveLength(0);
  });

  it("hands the resolver the mission, the deployment, the roster and the host city", () => {
    const resolver = new StubResolver(WIN);
    const handler = createLaunchMissionHandler<CampaignState>(deps(resolver));
    const state = campaign();
    handler(state, launchMission("mission-1", DEPLOYMENT), context());
    const [call] = resolver.calls;
    expect(call?.mission).toBe(MISSION);
    expect(call?.deployment).toBe(DEPLOYMENT);
    expect(call?.state.city.id).toBe("hub");
    expect(call?.state.squads).toBe(state.roster.squads);
    expect(call?.state.mechs).toBe(state.roster.mechs);
  });

  it("resolves on a per-mission stream: same seed replays, another seed differs", () => {
    const first = new StubResolver(WIN);
    const second = new StubResolver(WIN);
    const other = new StubResolver(WIN);
    createLaunchMissionHandler<CampaignState>(deps(first))(
      campaign(),
      launchMission("mission-1", DEPLOYMENT),
      context(7),
    );
    createLaunchMissionHandler<CampaignState>(deps(second))(
      campaign(),
      launchMission("mission-1", DEPLOYMENT),
      context(7),
    );
    createLaunchMissionHandler<CampaignState>(deps(other))(
      campaign(),
      launchMission("mission-1", DEPLOYMENT),
      context(8),
    );
    expect(first.calls[0]?.draw).toBe(second.calls[0]?.draw);
    expect(first.calls[0]?.draw).not.toBe(other.calls[0]?.draw);
  });

  it("applies a win: casualties, xp, reward, infestation drop, mission removed, result stored", () => {
    const handler = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver(WIN)),
    );
    const state = campaign();
    const result = handler(
      state,
      launchMission("mission-1", DEPLOYMENT),
      context(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.value.state;

    const alpha = next.roster.squads.find((s) => s.id === "squad-1");
    expect(alpha).toMatchObject({
      strength: 4,
      kills: 4,
      missionsSurvived: 1,
      xp: ROSTER_TUNING.xpPerMissionSurvived,
    });
    expect(next.roster.squads.find((s) => s.id === "squad-2")).toBe(
      state.roster.squads[1],
    );
    expect(next.roster.mechs[0]).toMatchObject({ damage: 50, kills: 2 });
    expect(next.roster.graveyard).toEqual([]);

    expect(next.economy.credits).toBe(1900);
    expect(next.economy.techPoints).toBe(17);
    expect(next.economy.ledger).toHaveLength(1);
    expect(next.economy.ledger[0]).toMatchObject({
      kind: "reward",
      ref: "mission-1",
      amount: 900,
      day: DAY,
    });

    expect(
      next.overworld.map.cities.find((c) => c.id === "hub")?.infestation,
    ).toBe(30);
    expect(next.overworld.map.cities.find((c) => c.id === "far")).toBe(
      state.overworld.map.cities[1],
    );
    expect(next.overworld.missions).toEqual([]);
    expect(next.overworld.lastMissionResult).toBe(WIN);
    expect(next.overworld.day).toBe(DAY);

    // Coming home from a first mission is worth half a swarmer, short
    // of the first rung of the ladder: nobody is promoted for surviving
    // alone, and the first rung waits for a kill (#1130).
    expect(result.value.events.map((e) => e.type)).toEqual([
      MISSION_RESOLVED,
      UNIT_DAMAGED,
      UNIT_DAMAGED,
      CREDITS_CHANGED,
      TECH_POINTS_CHANGED,
      CITY_INFESTATION_CHANGED,
    ]);
    expect(result.value.events[0]).toEqual({
      type: MISSION_RESOLVED,
      payload: { result: WIN },
    });
    expect(result.value.events[4]).toEqual({
      type: TECH_POINTS_CHANGED,
      payload: { before: 0, after: 17, amount: 17, ref: "mission-1", day: DAY },
    });
    expect(state.roster.squads[0]?.strength).toBe(5);
    expect(state.economy.credits).toBe(1000);
  });

  it("applies a loss: wipes, graveyard, no reward, infestation rise", () => {
    const handler = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver(LOSS)),
    );
    const result = handler(
      campaign(),
      launchMission("mission-1", DEPLOYMENT),
      context(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.value.state;

    expect(next.roster.squads.map((s) => s.id)).toEqual(["squad-2"]);
    expect(next.roster.mechs).toEqual([]);
    expect(
      next.roster.graveyard.map((g) => [g.kind, g.name, g.day, g.missionId]),
    ).toEqual([
      ["squad", "squad-1", DAY, "mission-1"],
      ["mech", "mech-1", DAY, "mission-1"],
    ]);
    expect(next.economy.credits).toBe(1000);
    expect(next.economy.ledger).toEqual([]);
    expect(
      next.overworld.map.cities.find((c) => c.id === "hub")?.infestation,
    ).toBe(55);
    expect(next.overworld.missions).toEqual([]);
    expect(next.overworld.lastMissionResult).toBe(LOSS);

    const types = result.value.events.map((e) => e.type);
    expect(types[0]).toBe(MISSION_RESOLVED);
    expect(types).toContain(SQUAD_WIPED);
    expect(types).toContain(MECH_DESTROYED);
    expect(types).not.toContain(CREDITS_CHANGED);
    expect(types.at(-1)).toBe(CITY_INFESTATION_CHANGED);
  });

  it("counts every resolved mission in the campaign progress, and the wins (ADR 0013 §2.1)", () => {
    const played = (result: MissionResult, before = campaign()) => {
      const launched = createLaunchMissionHandler<CampaignState>(
        deps(new StubResolver(result)),
      )(before, launchMission("mission-1", DEPLOYMENT), context());
      if (!launched.ok) throw new Error(launched.error.message);
      return launched.value.state.overworld.progress;
    };
    const midAct = campaign({
      progress: {
        ...createInitialCampaignProgress(),
        act: "act-2",
        actStartedAt: 12,
        missionsPlayed: 15,
        missionsWon: 10,
      },
    });
    expect(played(WIN, midAct)).toMatchObject({
      act: "act-2",
      actStartedAt: 12,
      missionsPlayed: 16,
      missionsWon: 11,
    });
    expect(played(LOSS, midAct)).toMatchObject({
      missionsPlayed: 16,
      missionsWon: 10,
    });
    expect(
      played({ ...WIN, outcome: "extracted", creditsAwarded: 0 }, midAct),
    ).toMatchObject({ missionsPlayed: 16, missionsWon: 10 });
    expect(midAct.overworld.progress.missionsPlayed).toBe(15);
  });

  it("merges the result's first kills into the campaign's record", () => {
    const before = campaign({
      progress: {
        ...createInitialCampaignProgress(),
        speciesKilled: ["swarmer"],
      },
    });
    const handler = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver({ ...LOSS, speciesKilled: ["brute", "swarmer"] })),
    );
    const result = handler(
      before,
      launchMission("mission-1", DEPLOYMENT),
      context(),
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.state.overworld.progress.speciesKilled).toEqual([
      "swarmer",
      "brute",
    ]);

    // A resolver that cannot say (the auto-resolver) records no kills.
    const silent = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver(WIN)),
    )(before, launchMission("mission-1", DEPLOYMENT), context());
    if (!silent.ok) throw new Error(silent.error.message);
    expect(silent.value.state.overworld.progress.speciesKilled).toEqual([
      "swarmer",
    ]);
  });

  it("hands the city to the mission type's consequence rule once the result is settled (ADR 0013 §2.5)", () => {
    const seen: OverworldState[] = [];
    const recording: MissionConsequenceRule = {
      ...MISSION_CONSEQUENCE_RULES["infestation-clearance"],
      onResolved: (state, mission, result, ctx) => {
        seen.push(state);
        expect(mission).toBe(MISSION);
        expect(result).toBe(WIN);
        expect(ctx.tuning).toBe(MISSION_TUNING);
        return {
          state: { ...state, threat: 99 },
          events: [
            {
              type: CITY_INFESTATION_CHANGED,
              payload: { cityId: "far", from: 20, to: 21 },
            },
          ],
        };
      },
    };
    const result = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver(WIN), {
        ...MISSION_CONSEQUENCE_RULES,
        "infestation-clearance": recording,
      }),
    )(campaign(), launchMission("mission-1", DEPLOYMENT), context());
    if (!result.ok) throw new Error(result.error.message);

    // The rule sees the mission gone, the result stored and the mission
    // counted, and the generic city change is its job alone.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.missions).toEqual([]);
    expect(seen[0]?.lastMissionResult).toBe(WIN);
    expect(seen[0]?.progress.missionsPlayed).toBe(1);
    expect(seen[0]?.map.cities.find((c) => c.id === "hub")?.infestation).toBe(
      50,
    );
    expect(result.value.state.overworld.threat).toBe(99);
    expect(result.value.events.at(-1)).toEqual({
      type: CITY_INFESTATION_CHANGED,
      payload: { cityId: "far", from: 20, to: 21 },
    });
    expect(
      result.value.events.filter((e) => e.type === CITY_INFESTATION_CHANGED),
    ).toHaveLength(1);
  });

  it("hands a story mission to the story layer after its type's consequences (ADR 0013 §2.5)", () => {
    const skyfall: Mission = {
      ...MISSION,
      pinned: true,
      storyId: "first-skyfall",
    };
    const threatRule: MissionConsequenceRule = {
      ...MISSION_CONSEQUENCE_RULES["infestation-clearance"],
      onResolved: (state) => ({ state: { ...state, threat: 99 }, events: [] }),
    };
    const rules = storyRulesOf(
      fixtureStoryRule("first-skyfall", {
        onWon: [{ kind: "flag", flag: "spore-sample" }],
      }),
    );
    const launch = (result: MissionResult) => {
      const applied = createLaunchMissionHandler<CampaignState>(
        deps(
          new StubResolver(result),
          { ...MISSION_CONSEQUENCE_RULES, "infestation-clearance": threatRule },
          rules,
        ),
      )(
        campaign({ missions: [skyfall] }),
        launchMission("mission-1", DEPLOYMENT),
        context(),
      );
      if (!applied.ok) throw new Error(applied.error.message);
      return applied.value;
    };

    // Won: the type's consequence stands and the story records its win.
    const won = launch(WIN);
    expect(won.state.overworld.threat).toBe(99);
    expect(won.state.overworld.progress).toMatchObject({
      flags: ["spore-sample"],
      storyWon: ["first-skyfall"],
    });
    expect(won.events.at(-1)).toEqual({
      type: CAMPAIGN_FLAG_SET,
      payload: { flag: "spore-sample" },
    });

    // Lost: the type's consequence stands and the story waits five days.
    const lost = launch(LOSS);
    expect(lost.state.overworld.threat).toBe(99);
    expect(lost.state.overworld.progress.flags).toEqual([]);
    expect(lost.state.overworld.progress.storyRetryDay).toEqual({
      "first-skyfall": DAY + STORY_RETRY_DAYS,
    });
    expect(lost.state.overworld.missions).toEqual([]);
  });

  it("mops up a won clearance that leaves the city under 15 (arc §5)", () => {
    const won = { ...WIN, infestationDelta: -36 };
    const result = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver(won)),
    )(campaign(), launchMission("mission-1", DEPLOYMENT), context());
    if (!result.ok) throw new Error(result.error.message);
    const hub = result.value.state.overworld.map.cities.find(
      (c) => c.id === "hub",
    );
    expect(hub?.infestation).toBe(0);
    expect(hub?.detected).toBe(false);
    expect(
      result.value.events.filter((e) => e.type === CITY_INFESTATION_CHANGED),
    ).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "hub", from: 50, to: 0 },
      },
    ]);
    // The debrief's result is the resolver's, untouched.
    expect(result.value.state.overworld.lastMissionResult).toBe(won);

    const kept = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver({ ...WIN, infestationDelta: -35 })),
    )(campaign(), launchMission("mission-1", DEPLOYMENT), context());
    if (!kept.ok) throw new Error(kept.error.message);
    expect(
      kept.value.state.overworld.map.cities.find((c) => c.id === "hub")
        ?.infestation,
    ).toBe(15);
  });

  it("clamps the infestation delta and emits no change event when it lands on the same value", () => {
    const handler = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver({ ...WIN, infestationDelta: -500 })),
    );
    const result = handler(
      campaign(),
      launchMission("mission-1", DEPLOYMENT),
      context(),
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.state.overworld.map.cities[0]?.infestation).toBe(0);

    const same = createLaunchMissionHandler<CampaignState>(
      deps(new StubResolver({ ...WIN, infestationDelta: 0 })),
    )(campaign(), launchMission("mission-1", DEPLOYMENT), context());
    if (!same.ok) throw new Error(same.error.message);
    expect(same.value.events.map((e) => e.type)).not.toContain(
      CITY_INFESTATION_CHANGED,
    );
  });
});
describe("validateLaunch deployment size (#487)", () => {
  /** A campaign whose roster holds `count` squads, all deployable. */
  const rosterOf = (count: number): CampaignState => {
    const base = campaign();
    const first = base.roster.squads[0];
    if (!first) throw new Error("fixture needs a squad");
    return {
      ...base,
      roster: {
        ...base.roster,
        squads: Array.from({ length: count }, (_, i) => ({
          ...first,
          id: `squad-${String(i)}`,
        })),
      },
    };
  };
  const idsFor = (count: number): string[] =>
    Array.from({ length: count }, (_, i) => `squad-${String(i)}`);

  it("refuses more units than a deploy zone can hold, naming both numbers", () => {
    const over = MAX_DEPLOYED_UNITS + 1;
    const result = validateLaunch(rosterOf(over), "mission-1", {
      ...DEPLOYMENT,
      squadIds: idsFor(over),
      mechIds: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(OVERSIZED_DEPLOYMENT);
    // Both numbers, so the message says what the limit is and what was
    // sent rather than only that something was wrong.
    expect(result.error.message).toContain(String(MAX_DEPLOYED_UNITS));
    expect(result.error.message).toContain(String(over));
  });

  it("accepts exactly the cap", () => {
    const result = validateLaunch(rosterOf(MAX_DEPLOYED_UNITS), "mission-1", {
      ...DEPLOYMENT,
      squadIds: idsFor(MAX_DEPLOYED_UNITS),
      mechIds: [],
    });
    expect(result.ok).toBe(true);
  });

  it("counts mechs against the same cap as squads", () => {
    const base = rosterOf(MAX_DEPLOYED_UNITS);
    const result = validateLaunch(base, "mission-1", {
      ...DEPLOYMENT,
      squadIds: idsFor(MAX_DEPLOYED_UNITS),
      mechIds: [base.roster.mechs[0]?.id ?? "mech-1"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(OVERSIZED_DEPLOYMENT);
  });
});
