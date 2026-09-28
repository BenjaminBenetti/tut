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
// 24 seeds of `endlessStory` through `playCampaign`, research by
// `nextResearch`), as `calibration-force-probe.sim.test.ts` derives it.
// Each band is read at a point of each seed's own campaign, so a band's
// force is the one most of its act is fought with:
//
//   act-1    halfway through the seed's Act I (median mission 7)
//   act-2    halfway through its Act II (median mission 25)
//   act-3    halfway through its Act III (median mission 45)
//   finale   on arrival at the finale (median mission 51)
//
// At that point: the median ranks, every node ≥ half the seeds held,
// and the starting mech refitted by the mech bay's own advice
// (`refitLoadout`: from the starter loadout, each researched part that
// raises `combatRating`). Then every band fills the deployment to its
// cap of eight with rookies bought from the band's median bank, by the
// one rule of `calibration-fill.test-helper`: refit mechs into all but
// one open slot while the bank covers them, a medic in the last. The
// sweep's player never hires, so its bank is what a player would have
// spent on units. To refresh these after a retune, run the probe
// (SIM_FORCES_OUT) and copy what it reports here.

/** The act bands the matrix plays. */
export type ForceBand = ActId;

/** A band's median bank either side of the fill. */
export interface ForceBank {
  /** Credits unspent at the band's point. */
  readonly before: number;
  /** Credits left once the reinforcements are bought. */
  readonly after: number;
}

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
  /** The median bank at the band's point, and what the fill left of it. */
  readonly bank: ForceBank;
  /** Where the numbers come from. */
  readonly basis: string;
}

// ===========================================
// Loadouts
// ===========================================

/**
 * The Act II refit: the thermal lance in the arm and composite plating
 * in place of the radiator, over the starter frame; none of the other
 * parts held by mid-act raises the rating. Rated 142 by the mech bay
 * against the starter's 113.
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
 * lance, guided missile rack, radiator, composite plating and the three
 * autopsy platings. Rated 236; it costs 11,750 to build. The finale's
 * wider research refits to the same parts: nothing it adds raises the
 * rating.
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
    "utility-matriarch-chitin",
  ],
};

// ===========================================
// Research
// ===========================================

/** Nodes at least half the 24 Average seeds held halfway through Act I: 2. */
const RESEARCH_MID_ACT_ONE: readonly TechNodeId[] = [
  "tech.jump-jets",
  "tech.all-terrain",
];

/** Nodes at least half the 24 Average seeds held halfway through Act II: 12, in tree order. */
const RESEARCH_MID_ACT_TWO: readonly TechNodeId[] = [
  "tech.jump-jets",
  "tech.all-terrain",
  "tech.composite-plating",
  "tech.assault-arms",
  "tech.heavy-autocannon",
  "tech.railgun",
  "tech.thermal-lance",
  "tech.high-output-reactor",
  "tech.pheromone-analysis",
  "tech.spitter-autopsy",
  "tech.hive-guard-autopsy",
  "tech.burrower-autopsy",
];

/** Nodes at least half the 23 seeds that finished Act III held halfway through it: 25. */
const RESEARCH_MID_ACT_THREE: readonly TechNodeId[] = [
  "tech.jump-jets",
  "tech.all-terrain",
  "tech.composite-plating",
  "tech.assault-arms",
  "tech.heavy-autocannon",
  "tech.railgun",
  "tech.thermal-lance",
  "tech.high-output-reactor",
  "tech.atlas-chassis",
  "tech.guided-missiles",
  "tech.incendiary-launcher",
  "tech.rotary-cannon",
  "tech.tracker-arms",
  "tech.surveyor-chassis",
  "tech.recon-sensor",
  "tech.field-repair",
  "tech.pheromone-analysis",
  "tech.squad-armour-1",
  "tech.frag-grenades",
  "tech.spitter-autopsy",
  "tech.hive-guard-autopsy",
  "tech.burrower-autopsy",
  "tech.broodmother-autopsy",
  "tech.armoured-autopsy",
  "tech.pod-telemetry",
];

/** Nodes at least half the 23 seeds that reached the finale held on arrival: 30. */
const RESEARCH_AT_FINALE: readonly TechNodeId[] = [
  "tech.jump-jets",
  "tech.all-terrain",
  "tech.sprint-frame",
  "tech.composite-plating",
  "tech.assault-arms",
  "tech.ablative-armour",
  "tech.anchor-legs",
  "tech.heavy-autocannon",
  "tech.railgun",
  "tech.thermal-lance",
  "tech.high-output-reactor",
  "tech.atlas-chassis",
  "tech.guided-missiles",
  "tech.incendiary-launcher",
  "tech.rotary-cannon",
  "tech.tracker-arms",
  "tech.surveyor-chassis",
  "tech.recon-sensor",
  "tech.field-repair",
  "tech.pheromone-analysis",
  "tech.squad-armour-1",
  "tech.frag-grenades",
  "tech.field-medic-training",
  "tech.spitter-autopsy",
  "tech.hive-guard-autopsy",
  "tech.burrower-autopsy",
  "tech.broodmother-autopsy",
  "tech.armoured-autopsy",
  "tech.platform-approach",
  "tech.pod-telemetry",
];

// ===========================================
// The forces
// ===========================================

/**
 * What the fill buys every band today (`fillDeployment`): each median
 * bank covers three refit mechs, so the rule puts refit mechs in two of
 * the three open slots and a medic in the third. The medic is hireable
 * without research; no band holds Heavy Weapons Infantry.
 */
function filled(loadout: MechLoadout): StarterRosterSpec {
  return {
    squads: [{ typeId: "medic", name: "Echo" }],
    mechs: [
      { name: "Warden", loadout },
      { name: "Bulwark", loadout },
    ],
  };
}

/** Each act band's force. */
export const CALIBRATION_FORCES: Readonly<Record<ForceBand, CalibrationForce>> =
  {
    "act-1": {
      label: "Act I: mid-act force, filled to 8",
      squadXp: 35,
      mechXp: 30,
      loadout: STARTER_LOADOUT,
      reinforcements: filled(STARTER_LOADOUT),
      reinforcementXp: 0,
      tech: RESEARCH_MID_ACT_ONE,
      bank: { before: 11_434, after: 5_134 },
      basis:
        "Average sweep halfway through each seed's Act I (24 seeds, median mission 7): squads 35 xp, the mech 30, nodes held by ≥12 seeds (neither raises the starter's rating); median bank 11,434, of which 2 starter mechs at 2,850 and a medic at 600 leave 5,134",
    },
    "act-2": {
      label: "Act II: mid-act force, filled to 8",
      squadXp: 125,
      mechXp: 25,
      loadout: ACT_TWO_LOADOUT,
      reinforcements: filled(ACT_TWO_LOADOUT),
      reinforcementXp: 0,
      tech: RESEARCH_MID_ACT_TWO,
      bank: { before: 34_988, after: 25_588 },
      basis:
        "Average sweep halfway through each seed's Act II (24 seeds, median mission 25): squads 125 xp, the mech 25 (median seed, rebuilt after a wreck), nodes held by ≥12 seeds; median bank 34,988, of which 2 Act II refits at 4,400 and a medic at 600 leave 25,588",
    },
    "act-3": {
      label: "Act III: mid-act force, filled to 8",
      squadXp: 225,
      mechXp: 60,
      loadout: ACT_THREE_LOADOUT,
      reinforcements: filled(ACT_THREE_LOADOUT),
      reinforcementXp: 0,
      tech: RESEARCH_MID_ACT_THREE,
      bank: { before: 66_585, after: 42_485 },
      basis:
        "Average sweep halfway through each seed's Act III (23 of 24 seeds finished it, median mission 45): squads 225 xp, the mech 60, nodes held by ≥12 seeds; median bank 66,585, of which 2 Act III refits at 11,750 and a medic at 600 leave 42,485",
    },
    finale: {
      label: "Finale: arrival force, filled to 8",
      squadXp: 255,
      mechXp: 40,
      loadout: ACT_THREE_LOADOUT,
      reinforcements: filled(ACT_THREE_LOADOUT),
      reinforcementXp: 0,
      tech: RESEARCH_AT_FINALE,
      bank: { before: 79_453, after: 55_353 },
      basis:
        "Average sweep on arrival at the finale (23 of 24 seeds, median mission 51): squads 255 xp, the mech 40, nodes held by ≥12 seeds; median bank 79,453, of which 2 Act III refits at 11,750 and a medic at 600 leave 55,353",
    },
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
