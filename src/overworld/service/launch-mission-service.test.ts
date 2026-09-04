import { describe, expect, it } from "vitest";

import type { Rng } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
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
import { buildEarthMap } from "./earth-map-builder";
import type { LaunchMissionDeps } from "./launch-mission-service";
import { MAX_DEPLOYED_UNITS } from "../model/deployment";
import {
  createLaunchMissionHandler,
  DEPLOYMENT_MISMATCH,
  DUPLICATE_UNIT,
  EMPTY_DEPLOYMENT,
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
  rewards: { credits: 900 },
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
      ...overrides,
    },
    roster: {
      squads: [squad("squad-1"), squad("squad-2", 3)],
      mechs: [mech("mech-1", 20)],
      savedLoadouts: [],
      graveyard: [],
    },
    economy: { credits: 1000, ledger: [] },
  };
}

const DEPLOYMENT: Deployment = {
  missionId: "mission-1",
  squadIds: ["squad-1"],
  mechIds: ["mech-1"],
};

const WIN: MissionResult = {
  missionId: "mission-1",
  outcome: "won",
  squadCasualties: [{ squadId: "squad-1", losses: 1, kills: 4 }],
  squadsWiped: [],
  mechsDestroyed: [],
  mechDamage: [{ mechId: "mech-1", damage: 30, kills: 2 }],
  creditsAwarded: 900,
  infestationDelta: -20,
};

const LOSS: MissionResult = {
  missionId: "mission-1",
  outcome: "lost",
  squadCasualties: [{ squadId: "squad-1", losses: 5 }],
  squadsWiped: ["squad-1"],
  mechsDestroyed: ["mech-1"],
  mechDamage: [{ mechId: "mech-1", damage: 80 }],
  creditsAwarded: 0,
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

function deps(resolver: MissionResolver): LaunchMissionDeps {
  return {
    resolver,
    rosterTuning: ROSTER_TUNING,
    transactionsFor: (ids) => new LedgerTransactionService(ids),
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

    expect(result.value.events.map((e) => e.type)).toEqual([
      MISSION_RESOLVED,
      UNIT_DAMAGED,
      UNIT_DAMAGED,
      CREDITS_CHANGED,
      CITY_INFESTATION_CHANGED,
    ]);
    expect(result.value.events[0]).toEqual({
      type: MISSION_RESOLVED,
      payload: { result: WIN },
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
