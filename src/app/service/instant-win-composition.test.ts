import { describe, expect, it } from "vitest";

import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import type { Mission } from "../../overworld/model/mission";
import type { MissionResult } from "../../overworld/model/mission-result";
import { findCity } from "../../overworld/service/earth-map-query-service";
import { EVACUATION_SAVED_SOURCE } from "../../overworld/service/missions/evacuation-consequence";
import { creditsFor } from "../../overworld/service/mission-reward-service";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameState } from "../../save/model/game-state";
import { winMissionInstantly } from "../../tactical/model/win-mission-instantly-command";
import { CALIBRATION_CELLS } from "./calibration-cells.test-helper";
import { prepareRun } from "./calibration-run.test-helper";
import { SWEEP_RESULTS } from "./campaign-sweep.test-helper";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";
import { chooseOffer, nextResearch } from "./modelled-player.test-helper";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-10-03T00:00:00.000Z";

/** The shipped game as a dev build, over memory storage, seeded `seed`. */
function composeDevGame(seed = 1): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => seed,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
    devTools: true,
  });
}

/** `command` applied through the composed dispatcher; a refusal fails the test. */
function apply(
  game: GameComposition,
  state: GameState,
  command: OverworldCommand,
): GameState {
  const applied = game.dispatcher.process(state, command);
  if (!applied.ok) {
    throw new Error(`${command.type} refused: ${applied.error.message}`);
  }
  return applied.value.state;
}

/** What the instant win of one offer changed. */
interface Won {
  readonly offer: Mission;
  readonly before: GameState;
  readonly after: GameState;
  readonly result: MissionResult;
}

/** The infestation of `cityId` in `state`. */
function infestationOf(state: GameState, cityId: string): number {
  const city = findCity(state.overworld.map, cityId);
  if (city === undefined) throw new Error(`no city ${cityId}`);
  return city.infestation;
}

/**
 * What each mission type's consequence rule does with a win and would
 * not do with a loss or an extraction (ADR 0013 §2.3), checked on the
 * state the instant win left: the reading this feature must never get
 * wrong is a "won" result the rule takes for a failure.
 */
const READ_AS_WON: Readonly<Record<string, (won: Won) => void>> = {
  "infestation-clearance": ({ offer, before, after }) => {
    expect(infestationOf(after, offer.cityId)).toBeLessThan(
      infestationOf(before, offer.cityId),
    );
  },
  "defend-installation": ({ offer, result }) => {
    expect(result.defence).toEqual({
      installation: offer.defence?.installation,
      held: true,
    });
  },
  "crash-site": ({ offer, after }) => {
    const spec = offer.crashSite;
    if (spec === undefined) throw new Error("a crash site has a landing");
    // Erased, not taken root: a misread win adds the ignore penalty.
    expect(infestationOf(after, spec.landingCityId)).toBeLessThanOrEqual(
      spec.preLandingInfestation,
    );
    expect(after.overworld.progress.flags).toContain("spore-sample");
  },
  "wreck-recovery": ({ offer, after, result }) => {
    expect(result.wreck?.stripped).toBe(true);
    expect(result.partsAwarded).toEqual(offer.wreck?.parts);
    expect(
      (after.overworld.wrecks ?? []).some(
        (wreck) => wreck.mechId === offer.wreck?.mechId,
      ),
    ).toBe(false);
  },
  evacuation: ({ offer, after, result }) => {
    const spec = offer.evacuation;
    if (spec === undefined) throw new Error("an evacuation has groups");
    expect(result.creditsAwarded).toBe(
      creditsFor("won", offer, AUTO_RESOLVE_TUNING) +
        spec.creditsPerGroup * spec.groups,
    );
    expect(
      (after.overworld.stipendModifiers ?? []).map((m) => m.source),
    ).toContain(EVACUATION_SAVED_SOURCE);
  },
  "hive-assault": ({ after }) => {
    expect(after.overworld.progress.flags).toContain("hive-core-sample");
  },
  "tunnel-sabotage": ({ offer, after }) => {
    const cityId = offer.tunnelSabotage?.cityId ?? offer.cityId;
    expect(after.overworld.spreadCooldowns[cityId]).toBe(
      MISSION_TUNING.tunnelSabotage.holdDays,
    );
  },
  "alpha-hunt": ({ offer, before, after }) => {
    const regionId = findCity(after.overworld.map, offer.cityId)?.regionId;
    if (regionId === undefined) throw new Error("the hunt has a city");
    // Killed, not escaped: her region is held and no nemesis is made.
    expect(after.overworld.growthPausedUntil?.[regionId]).toBeGreaterThan(
      after.overworld.day,
    );
    expect(after.overworld.progress.nemeses).toHaveLength(
      before.overworld.progress.nemeses.length,
    );
    expect(after.overworld.progress.flags).toContain("broodmother-sighted");
    expect(after.overworld.progress.speciesKilled).toContain("broodmother");
  },
  "spore-platform": ({ after }) => {
    expect(after.overworld.progress.flags).toContain("campaign-won");
  },
};

/** Every story mission the spine runs, in the order the campaign meets them. */
const STORY_SPINE_IDS: readonly StoryMissionId[] = [
  "first-skyfall",
  "live-specimen",
  "broodmother-sighting",
  "intact-pod",
  "uplink",
  "great-hive",
  "launch-window",
  "spore-platform",
];

/** The day cap on the walk: far past the arc's 65–70 day campaign. */
const WALK_DAY_CAP = 200;

// ===========================================
// Tests
// ===========================================

describe("the instant win through the shipped composition (#1235)", () => {
  describe.each(
    CALIBRATION_CELLS.map((cell, cellIndex) => ({ cell, cellIndex })),
  )("$cell.id", ({ cellIndex }) => {
    it("is won with nobody lost, and the consequence rule reads it as a win", () => {
      const game = composeDevGame();
      const prepared = prepareRun(game, {
        cellIndex,
        seedIndex: 0,
        player: "new",
        luck: "new",
      });
      const before = prepared.state;
      const offer = before.overworld.missions.find(
        (mission) => mission.id === prepared.missionId,
      );
      if (offer === undefined) throw new Error("the cell made an offer");

      const after = apply(game, before, winMissionInstantly(offer.id));
      const result = after.overworld.lastMissionResult;
      if (result === undefined) throw new Error("the win was recorded");

      expect(result.missionId).toBe(offer.id);
      expect(result.outcome).toBe("won");
      expect(after.overworld.missions.map((m) => m.id)).not.toContain(offer.id);
      expect(after.roster.squads.map((s) => [s.id, s.strength])).toEqual(
        before.roster.squads.map((s) => [s.id, s.strength]),
      );
      expect(after.roster.mechs.map((m) => [m.id, m.damage])).toEqual(
        before.roster.mechs.map((m) => [m.id, m.damage]),
      );
      expect(after.overworld.progress.missionsWon).toBe(
        before.overworld.progress.missionsWon + 1,
      );
      READ_AS_WON[offer.typeId]?.({ offer, before, after, result });
      if (offer.storyId !== undefined) {
        expect(after.overworld.progress.storyWon).toContain(offer.storyId);
      }
    });
  });

  it("covers every mission type with a reading", () => {
    const types = new Set(CALIBRATION_CELLS.map((cell) => cell.mission));
    for (const typeId of Object.keys(READ_AS_WON)) {
      expect(
        types.has(typeId) || types.has(`story:${typeId}`),
        `${typeId} has a cell`,
      ).toBe(true);
    }
  });

  it("walks a new campaign through the whole story spine to victory on instant wins alone", () => {
    const game = composeDevGame(1);
    const nodes = game.content.tech.listNodes();
    const ctx = { ...SWEEP_RESULTS, harvested: false };
    let state = game.createCampaign({ seed: 1, createdAt: NOW });
    const startDay = state.overworld.day;
    const acts: string[] = [state.overworld.progress.act];

    while (
      state.overworld.outcome === undefined &&
      state.overworld.day - startDay < WALK_DAY_CAP
    ) {
      for (;;) {
        const node = nextResearch(
          {
            nodes,
            tech: state.tech,
            economy: state.economy,
            conditions: game.techConditionsOf(state),
          },
          1,
        );
        if (node === undefined) break;
        state = apply(game, state, unlockTech(node.id));
      }
      const offer = chooseOffer(state.overworld.missions, ctx);
      if (offer !== undefined) {
        const before = state;
        state = apply(game, state, winMissionInstantly(offer.id));
        expect(state.overworld.lastMissionResult?.outcome).toBe("won");
        expect(state.roster.squads).toHaveLength(before.roster.squads.length);
        expect(state.roster.mechs).toHaveLength(before.roster.mechs.length);
      }
      state = apply(game, state, advanceDay());
      if (acts[acts.length - 1] !== state.overworld.progress.act) {
        acts.push(state.overworld.progress.act);
      }
    }

    expect(state.overworld.outcome?.kind).toBe("victory");
    expect(state.overworld.outcome?.cause).toBe("story");
    expect(acts).toEqual(["act-1", "act-2", "act-3", "finale"]);
    expect(state.overworld.progress.missionsWon).toBe(
      state.overworld.progress.missionsPlayed,
    );
    const won = state.overworld.progress.storyWon ?? [];
    expect([...won].sort()).toEqual([...STORY_SPINE_IDS].sort());
    const order = (id: StoryMissionId): number => won.indexOf(id);
    for (let i = 1; i < STORY_SPINE_IDS.length; i++) {
      const earlier = STORY_SPINE_IDS[i - 1];
      const later = STORY_SPINE_IDS[i];
      if (earlier === undefined || later === undefined) continue;
      // The sighting and Intact Pod can both stand on the Act II board.
      if (later === "intact-pod") continue;
      expect(order(earlier), `${earlier} before ${later}`).toBeLessThan(
        order(later),
      );
    }
    expect(order("live-specimen")).toBeLessThan(order("intact-pod"));
  });
});
