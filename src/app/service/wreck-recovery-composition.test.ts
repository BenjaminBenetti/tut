import { describe, expect, it } from "vitest";

import type { Mission } from "../../overworld/model/mission";
import { advanceDay } from "../../overworld/model/overworld-command";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { MissionResult } from "../../overworld/model/mission-result";
import type { WreckRecoverySpec } from "../../overworld/model/wreck-recovery-spec";
import { stockOf } from "../../roster/service/part-stock-service";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

/** Campaign seeds searched for one whose dice lose the mech and then win it back. */
const SEEDS = Array.from({ length: 60 }, (_, index) => index + 1);

/** The shipped game with missions on the debug auto-resolver (`?autoResolve=1`). */
function autoResolved(seed: number): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => seed,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
    debug: { autoResolve: true },
  });
}

/** What one run of the whole chain saw, step by step. */
interface Chain {
  readonly loss: MissionResult;
  readonly wreckRecord: WreckRecoverySpec | undefined;
  readonly offer: Mission | undefined;
  readonly recovery?: MissionResult;
  readonly before?: GameState;
  readonly after?: GameState;
}

/**
 * Runs the chain on `seed`: a lone mech sent into a hopeless clearance,
 * the day advanced, and, if a recovery is offered, the first `squads`
 * squads and every mech sent to it. Nothing is forced: each step is
 * the shipped command through the shipped store.
 */
function runChain(seed: number, squads: number): Chain | undefined {
  const game = autoResolved(seed);
  const fresh = game.createCampaign({ seed, createdAt: NOW });
  const city = fresh.overworld.map.cities.find((c) => c.infestation > 0);
  const mech = fresh.roster.mechs[0];
  if (city === undefined || mech === undefined) {
    throw new Error("fixture needs an infested city and a mech");
  }
  const hopeless: Mission = {
    id: "mission-hopeless",
    typeId: "infestation-clearance",
    cityId: city.id,
    difficulty: 10,
    mapParams: {
      biome: "temperate",
      settlement: city.scale,
      size: "small",
      seed: "1",
    },
    rewards: { credits: 300, techPoints: 0 },
    createdDay: fresh.overworld.day,
    expiresDay: fresh.overworld.day + 5,
    ignorePenalty: 10,
  };
  game.session.start({
    ...fresh,
    overworld: { ...fresh.overworld, missions: [hopeless] },
  });
  const store = game.session.store;
  if (store === undefined) return undefined;
  const lost = store.dispatch(
    launchMission(hopeless.id, {
      missionId: hopeless.id,
      squadIds: [],
      mechIds: [mech.id],
    }),
  );
  const loss = game.session.state?.overworld.lastMissionResult;
  if (!lost.ok || loss === undefined) return undefined;
  const wreckRecord = game.session.state?.overworld.wrecks?.find(
    (record) => record.mechId === mech.id,
  );
  const advanced = store.dispatch(advanceDay());
  if (!advanced.ok) return { loss, wreckRecord, offer: undefined };
  const offer = game.session.state?.overworld.missions.find(
    (mission) =>
      mission.typeId === "wreck-recovery" && mission.wreck?.mechId === mech.id,
  );
  if (offer === undefined) return { loss, wreckRecord, offer };
  const before = game.session.state;
  const recovered = store.dispatch(
    launchMission(offer.id, {
      missionId: offer.id,
      squadIds: (before?.roster.squads ?? [])
        .slice(0, squads)
        .map((squad) => squad.id),
      mechIds: (before?.roster.mechs ?? []).map((each) => each.id),
    }),
  );
  if (!recovered.ok) return { loss, wreckRecord, offer };
  return {
    loss,
    wreckRecord,
    offer,
    recovery: game.session.state?.overworld.lastMissionResult,
    before,
    after: game.session.state,
  };
}

/** Every chain over the seeds with the whole force sent, run once for the file. */
const CHAINS = SEEDS.map((seed) => ({
  seed,
  chain: runChain(seed, Number.POSITIVE_INFINITY),
}));

/** The same seeds with one squad sent to the recovery, so some fail. */
const THIN_CHAINS = SEEDS.map((seed) => ({ seed, chain: runChain(seed, 1) }));

// ===========================================
// The live composition, end to end
// ===========================================

describe("wreck recovery through the live composition (debug auto-resolve)", () => {
  it("offers a recovery after every loss that destroyed the mech, and after nothing else", () => {
    let losses = 0;
    for (const { seed, chain } of CHAINS) {
      expect(chain, `seed ${seed}`).toBeDefined();
      if (chain === undefined) continue;
      const destroyed =
        chain.loss.outcome === "lost" && chain.loss.mechsDestroyed.length > 0;
      if (destroyed) losses += 1;
      expect(chain.wreckRecord !== undefined, `seed ${seed} record`).toBe(
        destroyed,
      );
      expect(chain.offer !== undefined, `seed ${seed} offer`).toBe(destroyed);
    }
    // The fixture must exhibit both cases for the equality above to mean anything.
    expect(losses).toBeGreaterThan(0);
    expect(losses).toBeLessThan(CHAINS.length);
  });

  it("pays exactly the wreck's parts into the stock on a win, and spends the one attempt", () => {
    const won = CHAINS.find(
      ({ chain }) => chain?.recovery?.outcome === "won",
    )?.chain;
    expect(won).toBeDefined();
    if (won?.offer?.wreck === undefined || won.after === undefined) return;
    const parts = won.offer.wreck.parts;
    expect(parts.length).toBeGreaterThan(0);
    expect(won.offer.expiresDay - won.offer.createdDay).toBe(3);
    expect(won.recovery?.partsAwarded).toEqual(parts);
    const expected: Record<string, number> = {};
    for (const part of parts) expected[part] = (expected[part] ?? 0) + 1;
    expect(stockOf(won.before?.roster ?? won.after.roster)).toEqual({});
    expect(stockOf(won.after.roster)).toEqual(expected);
    // The chassis and the pilot stay lost; the record and offer are spent.
    expect(
      won.after.roster.mechs.some((m) => m.id === won.offer?.wreck?.mechId),
    ).toBe(false);
    expect(won.after.overworld.wrecks ?? []).toEqual([]);
    expect(
      won.after.overworld.missions.some((m) => m.typeId === "wreck-recovery"),
    ).toBe(false);
  });

  it("pays nothing when the recovery is not won", () => {
    const failed = THIN_CHAINS.find(
      ({ chain }) =>
        chain?.recovery !== undefined && chain.recovery.outcome !== "won",
    )?.chain;
    expect(failed).toBeDefined();
    if (failed?.after === undefined) return;
    expect(failed.recovery?.partsAwarded).toBeUndefined();
    expect(stockOf(failed.after.roster)).toEqual({});
    expect(failed.after.overworld.wrecks ?? []).toEqual([]);
  });
});
