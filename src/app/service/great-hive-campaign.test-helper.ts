import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { Deployment } from "../../overworld/model/deployment";
import type { GreatHive } from "../../overworld/model/great-hive";
import type { Mission } from "../../overworld/model/mission";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { StarterRosterSpec } from "../../roster/model/starter-roster-spec";
import { createInitialRosterState } from "../../roster/service/roster-state-factory";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameState } from "../../save/model/game-state";
import type {
  Spawner,
  TacticalState,
} from "../../tactical/model/tactical-state";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// A campaign at the Great Hives (#1179, campaign arc §6.9)
// ===========================================

/** The clock every Great Hive run reads. */
const NOW = "2026-09-26T00:00:00.000Z";

/**
 * What a basic Act III force adds to the starting roster: a full
 * deployment (`MAX_DEPLOYED_UNITS`, 8) on the starting gear, with no
 * research. The starter's four squads and one Vanguard plus a heavy
 * weapons squad and two more Vanguards.
 */
export const ACT_THREE_REINFORCEMENTS: StarterRosterSpec = {
  squads: [{ typeId: "heavy-weapons", name: "Echo" }],
  mechs: [
    { name: "Warden", loadout: STARTER_LOADOUT },
    { name: "Bulwark", loadout: STARTER_LOADOUT },
  ],
};

/** The shipped composition over an in-memory store, seeded `seed`. */
export function composeGreatHiveGame(seed: number): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => seed,
    onAutosaveFailure: () => undefined,
  });
}

/**
 * A fresh `seed` campaign put in Act III just after Uplink was won, with
 * `flags` besides and `reinforcements` added to the starting roster,
 * started in the session: the next day's tick reveals the Great Hives
 * and pins their assaults.
 *
 * ```
 *   createCampaign(seed) ──► act-3, storyWon ⊇ uplink,
 *                            flags ⊇ uplink-won + flags, no offers
 * ```
 */
export function startAfterUplink(
  game: GameComposition,
  seed: number,
  flags: readonly CampaignFlagId[] = [],
  reinforcements?: StarterRosterSpec,
): GameState {
  const created = game.createCampaign({ seed, createdAt: NOW });
  const fresh =
    reinforcements === undefined
      ? created
      : reinforced(game, created, reinforcements);
  const state: GameState = {
    ...fresh,
    overworld: {
      ...fresh.overworld,
      missions: [],
      progress: {
        ...fresh.overworld.progress,
        act: "act-3",
        actStartedAt: 32,
        missionsPlayed: 34,
        missionsWon: 26,
        flags: ["spore-sample", "hive-core-sample", "uplink-won", ...flags],
        storyWon: ["first-skyfall", "live-specimen", "intact-pod", "uplink"],
      },
    },
  };
  game.session.start(state);
  return state;
}

/** `state` with `spec`'s squads and mechs added to its roster, fresh ids drawn. */
function reinforced(
  game: GameComposition,
  state: GameState,
  spec: StarterRosterSpec,
): GameState {
  const ids = new SequentialIdGenerator(state.meta.ids);
  const extra = createInitialRosterState(spec, {
    ids,
    squadTypes: game.content.squadTypes,
  });
  return {
    ...state,
    meta: { ...state.meta, ids: ids.getState() },
    roster: {
      ...state.roster,
      squads: [...state.roster.squads, ...extra.squads],
      mechs: [...state.roster.mechs, ...extra.mechs],
    },
  };
}

/** The Great Hives of the session's campaign; empty before the reveal. */
export function greatHivesOf(game: GameComposition): readonly GreatHive[] {
  return game.session.state?.overworld.greatHives ?? [];
}

/** The Great Hive assaults on the session's board, in board order. */
export function greatHiveOffers(game: GameComposition): readonly Mission[] {
  return (game.session.state?.overworld.missions ?? []).filter(
    (mission) => mission.storyId === "great-hive",
  );
}

/** Every squad and mech of the session's roster sent on `missionId`. */
export function everyoneOn(
  game: GameComposition,
  missionId: string,
): Deployment {
  const roster = game.session.state?.roster;
  return {
    missionId,
    squadIds: roster?.squads.map((squad) => squad.id) ?? [],
    mechIds: roster?.mechs.map((mech) => mech.id) ?? [],
  };
}

/** The live mission, or a thrown error: a run has no business without one. */
export function liveMission(game: GameComposition): TacticalState {
  const mission = game.session.state?.activeMission;
  if (mission === undefined) {
    throw new Error("no mission in progress");
  }
  return mission;
}

/** The mission's hive core. */
export function hiveCoreOf(mission: TacticalState): Spawner {
  const core = mission.spawners.find((s) => s.variant === "hive-core");
  if (core === undefined) {
    throw new Error("the cavern has no hive core");
  }
  return core;
}
