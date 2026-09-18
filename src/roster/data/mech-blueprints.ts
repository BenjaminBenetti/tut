import type { MechLoadout } from "../model/mech-loadout";

/** Buildable examples spanning the roster, offered as drafts without purchasing anything. */
export const MECH_BLUEPRINTS: readonly MechLoadout[] = [
  {
    name: "Jump Scout",
    chassisId: "chassis-courser",
    legsId: "legs-jumper",
    armsId: "arms-manipulator",
    armWeaponId: "arm-weapon-laser",
    backWeaponId: "back-weapon-smoke-launcher",
    utilityIds: ["utility-radiator", "utility-auxiliary-generator"],
  },
  {
    name: "Forward Observer",
    chassisId: "chassis-surveyor",
    legsId: "legs-all-terrain",
    armsId: "arms-manipulator",
    armWeaponId: "arm-weapon-laser",
    backWeaponId: "back-weapon-guided-missile-rack",
    utilityIds: [
      "utility-recon-sensor",
      "utility-target-designator",
      "utility-auxiliary-generator",
    ],
  },
  {
    name: "Urban Breacher",
    chassisId: "chassis-bulwark",
    legsId: "legs-bastion",
    armsId: "arms-assault",
    armWeaponId: "arm-weapon-pile-driver",
    backWeaponId: "back-weapon-incendiary-launcher",
    utilityIds: [
      "utility-armor-plating",
      "utility-radiator",
      "utility-field-repair-module",
    ],
  },
  {
    name: "Siege Battery",
    chassisId: "chassis-atlas",
    legsId: "legs-anchor",
    armsId: "arms-marksman",
    armWeaponId: "arm-weapon-heavy-autocannon",
    backWeaponId: "back-weapon-siege-howitzer",
    utilityIds: [
      "utility-high-output-generator",
      "utility-active-heat-exchanger",
      "utility-targeting-computer",
      "utility-ablative-armor",
    ],
  },
  {
    name: "Beam Crucible",
    chassisId: "chassis-crucible",
    legsId: "legs-all-terrain",
    armsId: "arms-conduit",
    armWeaponId: "arm-weapon-beam-projector",
    backWeaponId: "back-weapon-cluster-rocket-rack",
    utilityIds: [
      "utility-high-output-generator",
      "utility-active-heat-exchanger",
      "utility-emergency-coolant-injector",
      "utility-composite-plating",
    ],
  },
  {
    name: "Rapid Response",
    chassisId: "chassis-courser",
    legsId: "legs-sprint",
    armsId: "arms-assault",
    armWeaponId: "arm-weapon-laser",
    backWeaponId: "back-weapon-smoke-launcher",
    utilityIds: ["utility-high-output-generator", "utility-radiator"],
  },
];
