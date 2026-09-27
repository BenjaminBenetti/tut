import type { ActId } from "../../content/model/act-id";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { Deployment } from "../../overworld/model/deployment";
import type { MissionId } from "../../overworld/model/mission";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { StarterRosterSpec } from "../../roster/model/starter-roster-spec";
import { createInitialRosterState } from "../../roster/service/roster-state-factory";
import type { GameState } from "../../save/model/game-state";
import type { TechNodeId } from "../../tech/model/tech-node";
import type { GameComposition } from "./game-composition";

// ===========================================
// The force each act band brings (#1179, campaign arc §12)
// ===========================================
//
// What a calibration run deploys, per act band, from the Average
// modelled player of the campaign sweep (`modelled-player.test-helper`,
// 24 seeds of `endlessStory`, research by `nextResearch`):
//
//   act-1    the starting roster, mid-act ranks, no research
//   act-2    act-1's units at mission ~15: its ranks, every node ≥ half
//            the seeds had by then, the mech refitted from them
//   act-3    the force at mission ~35: its ranks and research, the mech
//            refitted, and the deployment filled to the cap with what
//            its unspent credits buy
//   finale   act-3's force (the sweep never reaches the finale)
//
// The refit is the mech bay's own advice: slot by slot from the starter
// loadout, the researched part that raises `combatRating` most.

/** The act bands the matrix plays. */
export type ForceBand = ActId;

/** What one act band deploys, and why. */
export interface CalibrationForce {
  /** A short name for the forces table. */
  readonly label: string;
  /** Experience on each starting squad: its rank. */
  readonly squadXp: number;
  /** Experience on the starting mech. */
  readonly mechXp: number;
  /** The starting mech's loadout. */
  readonly loadout: MechLoadout;
  /** Units added to the starting roster. */
  readonly reinforcements: StarterRosterSpec;
  /** Experience on each added unit. */
  readonly reinforcementXp: number;
  /** Tech unlocked: the node ids. */
  readonly tech: readonly TechNodeId[];
  /** Where the numbers come from. */
  readonly basis: string;
}

// ===========================================
// Loadouts
// ===========================================

/**
 * The Act II refit: the thermal lance (rating +) in the arm and
 * composite plating in the utility slot, over the starter frame. Rated
 * 142 by the mech bay against the starter's 113.
 */
export const ACT_TWO_LOADOUT: MechLoadout = {
  name: "Act II refit",
  chassisId: "chassis-vanguard",
  legsId: "legs-strider",
  armsId: "arms-manipulator",
  armWeaponId: "arm-weapon-thermal-lance",
  backWeaponId: "back-weapon-missile-pod",
  utilityIds: ["utility-composite-plating"],
};

/**
 * The Act III refit: Atlas frame, jump legs, assault arms, thermal
 * lance, guided missile rack, radiator, composite plating and both
 * autopsy platings. Rated 222.
 */
export const ACT_THREE_LOADOUT: MechLoadout = {
  name: "Act III refit",
  chassisId: "chassis-atlas",
  legsId: "legs-jumper",
  armsId: "arms-assault",
  armWeaponId: "arm-weapon-thermal-lance",
  backWeaponId: "back-weapon-guided-missile-rack",
  utilityIds: [
    "utility-radiator",
    "utility-composite-plating",
    "utility-acid-resistant-plating",
    "utility-spine-plate-armour",
  ],
};

// ===========================================
// Research
// ===========================================

/** Nodes at least half the 24 Average seeds had by mission 15. */
const RESEARCH_AT_15: readonly TechNodeId[] = [
  "tech.railgun",
  "tech.jump-jets",
  "tech.heavy-autocannon",
  "tech.composite-plating",
  "tech.assault-arms",
  "tech.all-terrain",
  "tech.thermal-lance",
  "tech.high-output-reactor",
];

/** Nodes at least half the 24 Average seeds had by mission 35. */
const RESEARCH_AT_35: readonly TechNodeId[] = [
  ...RESEARCH_AT_15,
  "tech.atlas-chassis",
  "tech.pheromone-analysis",
  "tech.guided-missiles",
  "tech.incendiary-launcher",
  "tech.rotary-cannon",
  "tech.tracker-arms",
  "tech.surveyor-chassis",
  "tech.recon-sensor",
  "tech.field-repair",
  "tech.spitter-autopsy",
  "tech.frag-grenades",
  "tech.squad-armour-1",
  "tech.field-medic-training",
  "tech.pod-telemetry",
  "tech.hive-guard-autopsy",
  "tech.burrower-autopsy",
  "tech.sprint-frame",
];

// ===========================================
// The forces
// ===========================================

/** Nothing added to the starting roster. */
const NO_REINFORCEMENTS: StarterRosterSpec = { squads: [], mechs: [] };

/**
 * The Act III reinforcements: a medic squad (heavy weapons were never
 * researched by mission 35) and two mechs on the Act III refit, which
 * fill the deployment to its cap of eight. The sweep never spends
 * credits; its median bank at mission 35 is ~60k against ~10k a mech.
 */
const ACT_THREE_REINFORCEMENTS: StarterRosterSpec = {
  squads: [{ typeId: "medic", name: "Echo" }],
  mechs: [
    { name: "Warden", loadout: ACT_THREE_LOADOUT },
    { name: "Bulwark", loadout: ACT_THREE_LOADOUT },
  ],
};

/** The Act III and finale force. */
const ACT_THREE_FORCE: CalibrationForce = {
  label: "Act III: mission-35 force, filled to 8",
  squadXp: 175,
  mechXp: 175,
  loadout: ACT_THREE_LOADOUT,
  reinforcements: ACT_THREE_REINFORCEMENTS,
  reinforcementXp: 0,
  tech: RESEARCH_AT_35,
  basis:
    "Average sweep at mission 35 (24 seeds): xp 175 on every starter unit, nodes held by ≥12 seeds, median 60k credits unspent",
};

/** Each act band's force. */
export const CALIBRATION_FORCES: Readonly<Record<ForceBand, CalibrationForce>> =
  {
    "act-1": {
      label: "Act I: starter roster",
      squadXp: 30,
      mechXp: 30,
      loadout: STARTER_LOADOUT,
      reinforcements: NO_REINFORCEMENTS,
      reinforcementXp: 0,
      tech: [],
      basis:
        "The starting roster at mid-act ranks: 5 xp a mission over ~6 missions, as the sweep awards",
    },
    "act-2": {
      label: "Act II: mission-15 force",
      squadXp: 75,
      mechXp: 75,
      loadout: ACT_TWO_LOADOUT,
      reinforcements: NO_REINFORCEMENTS,
      reinforcementXp: 0,
      tech: [...RESEARCH_AT_15, "tech.pheromone-analysis"],
      basis:
        "Average sweep at mission 15 (24 seeds): xp 75, nodes held by ≥12 seeds, plus Pheromone Analysis, which Live Specimen needs to end Act I",
    },
    "act-3": ACT_THREE_FORCE,
    finale: ACT_THREE_FORCE,
  };

// ===========================================
// Applying a force
// ===========================================

/**
 * `state` with `force` in place: the starting roster's ranks and mech,
 * the reinforcements added with fresh ids, and the research unlocked.
 * Extra tech (a story mission's own gate) joins the force's.
 */
export function withForce(
  game: GameComposition,
  state: GameState,
  force: CalibrationForce,
  extraTech: readonly TechNodeId[] = [],
): GameState {
  const ids = new SequentialIdGenerator(state.meta.ids);
  const extra = createInitialRosterState(force.reinforcements, {
    ids,
    squadTypes: game.content.squadTypes,
  });
  const squads = [
    ...state.roster.squads.map((squad) => ({ ...squad, xp: force.squadXp })),
    ...extra.squads.map((squad) => ({ ...squad, xp: force.reinforcementXp })),
  ];
  const mechs = [
    ...state.roster.mechs.map((mech) => ({
      ...mech,
      xp: force.mechXp,
      loadout: force.loadout,
    })),
    ...extra.mechs.map((mech) => ({ ...mech, xp: force.reinforcementXp })),
  ];
  const unlocked = [...new Set([...force.tech, ...extraTech])];
  return {
    ...state,
    meta: { ...state.meta, ids: ids.getState() },
    roster: { ...state.roster, squads, mechs },
    tech: { ...state.tech, unlocked },
  };
}

/** Every squad and mech of the roster sent on `missionId`. */
export function everyone(state: GameState, missionId: MissionId): Deployment {
  return {
    missionId,
    squadIds: state.roster.squads.map((squad) => squad.id),
    mechIds: state.roster.mechs.map((mech) => mech.id),
  };
}
