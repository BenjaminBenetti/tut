import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { buildDeployable } from "../../overworld/model/build-deployable-command";
import type { Deployable } from "../../overworld/model/deployable";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import type { GameState } from "../../save/model/game-state";
import { probeEconomy } from "./campaign-economy-probe.test-helper";
import { composeSweepGame, SWEEP_NOW } from "./campaign-sweep.test-helper";
import {
  nextInstallation,
  OPT_IN_PLAYERS,
  REALISTIC_SPENDING,
  refitOf,
  SHIPPED_DEPLOYABLES,
  spendingMarketOf,
  spendLikeAPlayer,
  targetMechs,
  targetSquads,
  upkeepPerDay,
} from "./realistic-spender.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** The game every test spends in: the sweep's, for the opt-in spender. */
const GAME = composeSweepGame(OPT_IN_PLAYERS.spender.player);

/** What the spender prices from. */
const MARKET = spendingMarketOf(GAME.content);

/** A fresh campaign: 5,000 credits, two rifles, a radio, a rocket and one mech. */
const FIRST = GAME.createCampaign({ seed: 1, createdAt: SWEEP_NOW });

/** Dispatches `command`; a refusal fails the test. */
function apply(state: GameState, command: OverworldCommand): GameState {
  const applied = GAME.dispatcher.process(state, command);
  if (!applied.ok) {
    throw new Error(
      `${command.type} refused: ${JSON.stringify(applied.error)}`,
    );
  }
  return applied.value.state;
}

/** One day of the realistic spending, on `state`. */
function spend(state: GameState): GameState {
  return spendLikeAPlayer(
    state,
    { apply, first: FIRST },
    REALISTIC_SPENDING,
    MARKET,
  );
}

/** `state` holding `credits`. */
function withCredits(state: GameState, credits: number): GameState {
  return { ...state, economy: { ...state.economy, credits } };
}

/**
 * `state` with every city of each region in `levels` at that region's
 * level, and every other city clean, so no region but those is infested.
 */
function infested(
  state: GameState,
  levels: Readonly<Record<string, number>> = {},
): GameState {
  const map = state.overworld.map;
  return {
    ...state,
    overworld: {
      ...state.overworld,
      map: {
        ...map,
        cities: map.cities.map((city) => ({
          ...city,
          infestation: levels[city.regionId] ?? 0,
        })),
      },
    },
  };
}

/** A calm campaign whose drop ship the spender has already filled, with `credits` left. */
function filled(credits: number): GameState {
  return withCredits(spend(withCredits(infested(FIRST), 100_000)), credits);
}

/** The installations of `state`, as `type@region` in build order. */
function sites(state: GameState): string[] {
  return state.overworld.deployables.map(
    (each: Deployable) => `${each.typeId}@${each.regionId}`,
  );
}

// ===========================================
// Filling the drop ship
// ===========================================

describe("the realistic spender fills the drop ship", () => {
  it("to MAX_DEPLOYED_UNITS: the starting four and a medic, the starting mech and two built from the bay's refit", () => {
    expect(targetSquads(FIRST, REALISTIC_SPENDING)).toEqual([
      "rifle",
      "rifle",
      "radio",
      "rocket",
      "medic",
    ]);
    expect(targetMechs(FIRST, REALISTIC_SPENDING)).toBe(3);
    const after = spend(withCredits(infested(FIRST), 20_000));
    const { squads, mechs, savedLoadouts } = after.roster;
    expect(squads.map((squad) => squad.typeId)).toEqual([
      "rifle",
      "rifle",
      "radio",
      "rocket",
      "medic",
    ]);
    expect(squads.length + mechs.length).toBe(MAX_DEPLOYED_UNITS);
    const template = savedLoadouts.find(
      (each) => each.name === REALISTIC_SPENDING.templateName,
    );
    expect(template).toEqual(refitOf(FIRST, FIRST, REALISTIC_SPENDING, MARKET));
    expect(mechs.slice(1).map((mech) => mech.loadout)).toEqual([
      template,
      template,
    ]);
    expect(after.economy.credits).toBe(20_000 - 600 - 2 * 2850);
  });

  it("saves for a mech it cannot afford rather than building an installation it could", () => {
    const start = withCredits(
      infested(FIRST, { "north-america-west": 60 }),
      600 + 2850 + 2000,
    );
    const after = spend(start);
    expect(after.roster.squads).toHaveLength(5);
    expect(after.roster.mechs).toHaveLength(2);
    expect(after.economy.credits).toBe(2000);
    expect(after.overworld.deployables).toHaveLength(0);
  });

  it("keeps a day of every installation's upkeep when it buys a unit", () => {
    const withBattery = apply(
      withCredits(filled(0), 1500),
      buildDeployable("defensive-battery", "north-america-west"),
    );
    const short = {
      ...withBattery,
      roster: {
        ...withBattery.roster,
        mechs: withBattery.roster.mechs.slice(0, 2),
      },
    };
    expect(spend(withCredits(short, 2850 + 49)).roster.mechs).toHaveLength(2);
    expect(spend(withCredits(short, 2850 + 50)).roster.mechs).toHaveLength(3);
  });
});

// ===========================================
// Replacing losses
// ===========================================

describe("the realistic spender replaces losses", () => {
  it("repairs every damaged mech at its full repair cost", () => {
    const full = filled(1000);
    const damaged = {
      ...full,
      roster: {
        ...full.roster,
        mechs: full.roster.mechs.map((mech, index) =>
          index === 0 ? { ...mech, damage: 30 } : mech,
        ),
      },
    };
    const after = spend(damaged);
    expect(after.roster.mechs.map((mech) => mech.damage)).toEqual([0, 0, 0]);
    expect(after.economy.credits).toBe(1000 - 30 * 10);
  });

  it("reinforces a depleted squad to full at its type's price per soldier", () => {
    const full = filled(1000);
    const depleted = {
      ...full,
      roster: {
        ...full.roster,
        squads: full.roster.squads.map((squad, index) =>
          index === 3 ? { ...squad, strength: 2 } : squad,
        ),
      },
    };
    const after = spend(depleted);
    expect(after.roster.squads[3]?.strength).toBe(5);
    expect(after.economy.credits).toBe(1000 - 3 * 120);
  });

  it("re-hires each wiped squad as its own type at its hire price, as many as were lost", () => {
    const full = filled(2000);
    const wiped = {
      ...full,
      roster: {
        ...full.roster,
        squads: full.roster.squads.filter(
          (squad) => squad.id !== "squad-1" && squad.typeId !== "rocket",
        ),
      },
    };
    const after = spend(wiped);
    expect(after.roster.squads.map((squad) => squad.typeId).sort()).toEqual(
      ["medic", "radio", "rifle", "rifle", "rocket"].sort(),
    );
    expect(after.economy.credits).toBe(2000 - 500 - 750);
  });

  it("rebuilds a lost mech from the refit of the day's research", () => {
    const full = filled(5000);
    const lost = {
      ...full,
      roster: { ...full.roster, mechs: full.roster.mechs.slice(0, 2) },
    };
    const after = spend(lost);
    expect(after.roster.mechs).toHaveLength(3);
    expect(after.roster.mechs[2]?.loadout.name).toBe(
      REALISTIC_SPENDING.templateName,
    );
    expect(after.economy.credits).toBe(5000 - 2850);
  });
});

// ===========================================
// Defending the map
// ===========================================

describe("the realistic spender defends the map with installations", () => {
  /** Four regions: three infested (at and above 15), one just below. */
  const LEVELS = {
    "western-europe": 60,
    "east-asia": 40,
    oceania: 15,
    "latin-america": 14,
  };

  it("builds repellent then a battery in the most infested region first, while the bank keeps 30 days of upkeep", () => {
    // repellent@WE 1000 + 30×30; battery@WE 1500 + 30×80;
    // repellent@EA 1000 + 30×110; battery@EA 1500 + 30×160
    const fourth = 1000 + 1500 + 1000 + 1500 + 30 * 160;
    expect(sites(spend(infested(filled(fourth - 1), LEVELS)))).toEqual([
      "repellent-dispersal@western-europe",
      "defensive-battery@western-europe",
      "repellent-dispersal@east-asia",
    ]);
    const after = spend(infested(filled(fourth), LEVELS));
    expect(sites(after)).toHaveLength(4);
    expect(after.economy.credits).toBe(30 * 160);
  });

  it("builds in every infested region and in none below the threshold", () => {
    const after = spend(infested(filled(1_000_000), LEVELS));
    expect(sites(after)).toEqual([
      "repellent-dispersal@western-europe",
      "defensive-battery@western-europe",
      "repellent-dispersal@east-asia",
      "defensive-battery@east-asia",
      "repellent-dispersal@oceania",
      "defensive-battery@oceania",
    ]);
    expect(
      nextInstallation(after, REALISTIC_SPENDING, SHIPPED_DEPLOYABLES),
    ).toBeUndefined();
  });

  it("prices the upkeep it keeps from every installation's level", () => {
    const at = (
      typeId: Deployable["typeId"],
      level: Deployable["level"],
    ): Deployable => ({
      id: `deployable-${typeId}`,
      typeId,
      regionId: "oceania",
      level,
      builtDay: 1,
      online: true,
    });
    expect(
      upkeepPerDay(
        [at("defensive-battery", 1), at("repellent-dispersal", 2)],
        SHIPPED_DEPLOYABLES,
      ),
    ).toBe(50 + 50);
    expect(upkeepPerDay([], SHIPPED_DEPLOYABLES)).toBe(0);
  });
});

// ===========================================
// A whole campaign
// ===========================================

describe("the opt-in players", () => {
  it("play a whole campaign through the dispatcher, never refused, and field eight once the bank allows", () => {
    for (const { player, spending } of Object.values(OPT_IN_PLAYERS)) {
      const [economy] = probeEconomy(player, [1], { spending });
      if (economy === undefined) throw new Error("seed 1 was played");
      expect(economy.record.end, player.id).toBe("victory");
      const act2 = economy.bands["act-2"].point;
      expect((act2?.squads ?? 0) + (act2?.mechs ?? 0), player.id).toBe(
        MAX_DEPLOYED_UNITS,
      );
      const bought = ACT_IDS.reduce(
        (sum, band) => sum + economy.bands[band].account["squad-hire"],
        0,
      );
      expect(bought, player.id).toBeGreaterThanOrEqual(600);
    }
  });

  it("lose soldiers and repair mechs only when they take the auto-resolver's casualties", () => {
    const [spender] = probeEconomy(OPT_IN_PLAYERS.spender.player, [1], {
      spending: REALISTIC_SPENDING,
    });
    const [realistic] = probeEconomy(OPT_IN_PLAYERS.realistic.player, [1], {
      spending: REALISTIC_SPENDING,
    });
    const soldiers = (economy: typeof spender): number =>
      ACT_IDS.reduce(
        (sum, band) => sum + (economy?.bands[band].losses.soldiersLost ?? 0),
        0,
      );
    expect(soldiers(spender)).toBe(0);
    expect(soldiers(realistic)).toBeGreaterThan(0);
    expect(realistic?.bands["act-1"].account.repair).toBeGreaterThan(0);
  });
});
