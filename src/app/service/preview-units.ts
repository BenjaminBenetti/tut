import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { HookKinds } from "../../mapgen/model/hook";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import type { Squad } from "../../roster/model/squad";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { createMech } from "../../roster/service/mech-factory";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import type { BugUnitSource } from "../../tactical/model/bug-unit-source";
import type { Unit } from "../../tactical/model/unit";
import type {
  Objective,
  Spawner,
  TacticalState,
} from "../../tactical/model/tactical-state";
import {
  DEFAULT_HATCH_RADIUS,
  FIRST_TURN,
} from "../../tactical/model/tactical-state";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import type { UnitBuild } from "../../tactical/service/unit-factory";
import {
  bugUnit,
  mechUnit,
  squadUnit,
} from "../../tactical/service/unit-factory";
import { emptyVision } from "../../tactical/service/vision-service";

// ===========================================
// Types
// ===========================================

/** Units and their templates, ready for the tactical scene builder. */
export interface PreviewUnits {
  readonly units: readonly Unit[];
  readonly templates: Readonly<Record<string, UnitTemplate>>;
}

// ===========================================
// Fixtures
// ===========================================

/** Stand-in for the swarmer species until #322 lands its data. */
const PREVIEW_SWARMER: BugUnitSource = {
  id: "swarmer",
  name: "Swarmer",
  hp: 6,
  armor: 0,
  move: 7,
  ap: 2,
  weapon: { range: 1, accuracy: 60, damage: 3, armorPen: 0 },
  sightRange: 12,
  modelId: "bug.swarmer",
};

// ===========================================
// Placement
// ===========================================

/**
 * A handful of units for the map preview page: a rifle squad and the
 * starter mech on the first deploy zone facing north, and a swarmer on
 * the first edge spawn facing south. Units without a tile to stand on
 * are skipped, so a tiny map still previews. Not game code: the mission
 * start factory (#323) places real deployments.
 */
export function previewUnits(map: TacticalMap): PreviewUnits {
  const deps = { ids: new SequentialIdGenerator(), tuning: UNIT_TUNING };
  const deploy = map.hooks.deployZones[0]?.tiles ?? [];
  const spawn = map.hooks.edgeSpawns[0]?.tiles ?? [];
  const builds: UnitBuild[] = [];

  const rifleType = SQUAD_TYPES.find((t) => t.id === "rifle");
  const squadTile: TileCoord | undefined = deploy[0];
  if (rifleType && squadTile) {
    const squad: Squad = {
      id: "squad-1",
      name: "Alpha",
      typeId: "rifle",
      strength: 5,
      maxStrength: 5,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    };
    builds.push(
      squadUnit(squad, rifleType, { pos: squadTile, facing: "n" }, deps),
    );
  }

  const mechTile: TileCoord | undefined = deploy[1];
  const sheet = validateLoadout(
    STARTER_LOADOUT,
    new StaticPartCatalogue(STARTER_PARTS),
    MECH_RATING_TUNING,
    UPGRADE_TUNING,
  );
  if (mechTile && sheet.ok) {
    const mech = createMech(STARTER_LOADOUT, "mech-1", "Hammerhead");
    builds.push(
      mechUnit(mech, sheet.value, { pos: mechTile, facing: "n" }, deps),
    );
  }

  const bugTile: TileCoord | undefined = spawn[0];
  if (bugTile) {
    builds.push(bugUnit(PREVIEW_SWARMER, { pos: bugTile, facing: "s" }, deps));
  }

  const templates: Record<string, UnitTemplate> = {};
  for (const build of builds) {
    templates[build.template.id] = build.template;
  }
  return { units: builds.map((b) => b.unit), templates };
}

// ===========================================
// Mission
// ===========================================

/**
 * A synthetic mission around `previewUnits` for the preview page's HUD
 * (#339): player phase, turn one, one destroy-spawner objective per
 * egg-spawner hook. Not game code: `startTacticalMission` builds real
 * missions.
 */
export function previewMission(map: TacticalMap): TacticalState {
  const { units, templates } = previewUnits(map);
  const spawners: Spawner[] = map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.EGG_SPAWNER)
    .flatMap((hook) => hook.tiles)
    .map((pos, i) => ({
      id: `spawner-${String(i + 1)}`,
      pos,
      hatchRadius: DEFAULT_HATCH_RADIUS,
      hp: SPAWN_TUNING.spawnerHp,
      timer: SPAWN_TUNING.hatchInterval,
      destroyed: false,
    }));
  const objectives: Objective[] = spawners.map((spawner, i) => ({
    id: `objective-${String(i + 1)}`,
    kind: "destroy-spawner",
    targetId: spawner.id,
    complete: false,
  }));
  return {
    missionId: "preview",
    seed: 1,
    difficulty: 1,
    threat: 0,
    map,
    units,
    templates,
    turn: FIRST_TURN,
    phase: "player",
    objectives,
    spawners,
    edgeSpawn: { nextTurn: SPAWN_TUNING.firstWaveTurn, wave: 0 },
    extraction: map.hooks.extraction.tiles,
    extracted: [],
    vision: emptyVision(),
    log: [],
    commandSeq: 0,
  };
}
