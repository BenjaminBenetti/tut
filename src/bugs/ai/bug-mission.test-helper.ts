import {
  DEFAULT_WEAPON_NAME,
  PRIMARY_WEAPON_ID,
} from "../../tactical/model/unit-weapon";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Mission } from "../../overworld/model/mission";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import {
  startTacticalMission,
  tileAdmits,
} from "../../tactical/service/mission-start-service";
import type { BugSpecies } from "../model/bug-species";
import type { MissionView } from "../../tactical/model/mission-view";
import { viewFor } from "../../tactical/service/mission-view-service";
import { withVision } from "../../tactical/service/vision-service";

// ===========================================
// Campaign
// ===========================================

/** A day-4 campaign from the shipped content with one mission offered at Lagos. */
export function campaignWithMission(
  seed = 3,
  mapSeed = "mission-2:map",
): GameState {
  const base = createNewGame(
    { seed, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const mission: Mission = {
    id: "mission-2",
    typeId: "infestation-clearance",
    cityId: "lagos",
    difficulty: 5,
    mapParams: {
      biome: "temperate",
      settlement: "city",
      size: "small",
      seed: mapSeed,
    },
    rewards: { credits: 1500 },
    createdDay: 4,
    expiresDay: 9,
    ignorePenalty: 10,
  };
  return {
    ...base,
    overworld: { ...base.overworld, day: 4, missions: [mission] },
  };
}

// ===========================================
// Tiles
// ===========================================

/**
 * The infantry-walkable tile nearest `target` (Manhattan across the
 * ground plane, then level difference), unoccupied by a unit. Deploy
 * zones sit on raised ground on some maps, so a bug dropped at a fixed
 * offset would otherwise land inside a wall.
 */
export function walkableTileNear(
  mission: TacticalState,
  target: TileCoord,
): TileCoord {
  const occupied = new Set(
    mission.units.map((u) => `${u.pos.x},${u.pos.y},${u.pos.z}`),
  );
  let best: TileCoord | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const tile of mission.map.tiles) {
    if (!tileAdmits(tile.pass, "infantry")) {
      continue;
    }
    if (occupied.has(`${tile.x},${tile.y},${tile.z}`)) {
      continue;
    }
    const score =
      Math.abs(tile.x - target.x) +
      Math.abs(tile.z - target.z) +
      Math.abs(tile.y - target.y) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = { x: tile.x, y: tile.y, z: tile.z };
    }
  }
  if (best === undefined) {
    throw new Error("no walkable tile on the map");
  }
  return best;
}

// ===========================================
// Mission
// ===========================================

/** A started mission with the whole starter roster deployed, in the given phase. */
export function startedMission(
  phase: TacticalState["phase"] = "bugs",
  mapSeed = "mission-2:map",
): TacticalState {
  const state = campaignWithMission(3, mapSeed);
  const parts = new StaticPartCatalogue(STARTER_PARTS);
  const started = startTacticalMission(
    state,
    "mission-2",
    {
      missionId: "mission-2",
      squadIds: state.roster.squads.map((s) => s.id),
      mechIds: state.roster.mechs.map((m) => m.id),
    },
    {
      missionTypes: MISSION_TYPES,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      sheetFor: (mech) => {
        const sheet = validateLoadout(
          mech.loadout,
          parts,
          MECH_RATING_TUNING,
          UPGRADE_TUNING,
        );
        return sheet.ok ? sheet.value : undefined;
      },
      unitTuning: UNIT_TUNING,
      spawnTuning: SPAWN_TUNING,
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
    },
  );
  if (!started.ok || !started.value.activeMission) {
    throw new Error("fixture mission must start");
  }
  return { ...started.value.activeMission, phase };
}

/** Adds one bug of `species` at `pos`, registering its template, and returns the unit. */
export function withBug(
  mission: TacticalState,
  species: BugSpecies,
  pos: TileCoord,
  id = "bug-1",
): { mission: TacticalState; bug: Unit } {
  const templateId = `bug:${species.id}`;
  const bug: Unit = {
    id,
    kind: "bug",
    team: "bugs",
    sourceId: species.id,
    templateId,
    pos,
    facing: "n",
    hp: species.hp,
    maxHp: species.hp,
    ap: species.ap,
    maxAp: species.ap,
    status: [],
    passClass: "infantry",
  };
  const withUnit: { bug: Unit; mission: TacticalState } = {
    bug,
    mission: {
      ...mission,
      units: [...mission.units, bug],
      templates: {
        ...mission.templates,
        [templateId]: {
          id: templateId,
          name: species.name,
          sightRange: species.sightRange,
          maxHp: species.hp,
          maxAp: species.ap,
          move: species.move,
          weapons: [
            {
              id: PRIMARY_WEAPON_ID,
              name: DEFAULT_WEAPON_NAME,
              profile: species.weapon,
            },
          ],
          armor: species.armor,
          passClass: "infantry" as const,
          modelId: species.modelId,
        },
      },
    },
  };
  // Vision follows the new unit, so a behaviour handed a view of this
  // mission can actually see what is in front of it (ADR 0006).
  return {
    bug,
    mission: withVision({ state: withUnit.mission, events: [] }).state,
  };
}

/**
 * The mission as the bugs perceive it, which is what a behaviour takes
 * (ADR 0006 §2.3). Tests build it here rather than casting, so they
 * exercise the same filter the bug phase does.
 */
export function bugView(mission: TacticalState): MissionView {
  return viewFor(mission, "bugs");
}

// ===========================================
// Commands
// ===========================================

/**
 * Moves a unit to the end of a path and refills its action points, the
 * way a turn boundary would.
 *
 * **It does not recompute vision, and that matters.** The real bug phase
 * refreshes what the swarm perceives between bugs, so a bug that walks
 * out of line of sight loses its mark; here the mission keeps whatever
 * `vision` it had. A multi-turn probe built on this therefore lets a bug
 * go on acting against an enemy it can no longer see, which flatters any
 * behaviour that moves into cover.
 *
 * That is not hypothetical — it is how #695 first measured a lurker's
 * concealment weight as costing no engagement, when driving the same
 * sweep through `createBugPhaseRunner` showed it costing all of it. Use
 * the runner when the question is whether a bug keeps fighting; use this
 * when the question is only where it ends up.
 */
export function applyMoveTo(
  mission: TacticalState,
  unitId: string,
  path: readonly TileCoord[],
): TacticalState {
  const end = path.at(-1);
  if (end === undefined) {
    return mission;
  }
  return {
    ...mission,
    units: mission.units.map((u) =>
      u.id === unitId ? { ...u, pos: end, ap: u.maxAp } : u,
    ),
  };
}
