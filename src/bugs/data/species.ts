import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { BugSpecies } from "../model/bug-species";

// ===========================================
// Bug species (GDD §6.4)
// ===========================================
//
// M2 placeholder tuning. Rules of thumb, sized against the tactical unit
// tuning (a rifle soldier is a few hit points behind cover):
//
//   • hp × armor is the species' "weight": swarmers die to one burst,
//     lurkers take a focused turn, brutes soak a squad's volley.
//   • move is in tiles per action; swarmers outrun infantry, brutes do
//     not. Every species has two actions, so a swarmer can move twice
//     or move and bite.
//   • Weapons are all melee (range 1); accuracy and damage climb with
//     size, and only the brute's blades punch through mech armor.
//   • sightRange is one value for every species (ADR 0006): bugs hunt by
//     scent as much as sight, and giving each its own number is tuning
//     nobody has asked for yet.
//   • hatchWeight is what egg spawners roll on: six swarmers to three
//     lurkers to one brute keeps the first missions swarmy.

/** Tiles every bug sees. One number until a species needs its own (ADR 0006). */
const SIGHT = 10;

/** Fast, weak, numerous; rushes the nearest target (GDD §6.4). */
export const SWARMER: BugSpecies = {
  id: "swarmer",
  name: "Swarmer",
  description:
    "A low, six-legged wedge of chitin that comes in numbers. Dies to a burst, but there is never just one.",
  hp: 6,
  armor: 0,
  move: 7,
  ap: 2,
  weapon: { range: 1, accuracy: 60, damage: 3, armorPen: 0 },
  sightRange: SIGHT,
  behaviour: "rush",
  modelId: "bug.swarmer",
  hatchWeight: 6,
};

/** Stealthy flanker that tries to get behind the line (GDD §6.4). */
export const LURKER: BugSpecies = {
  id: "lurker",
  name: "Lurker",
  description:
    "A tall, eyeless stalker with scythe arms. It circles wide and opens the line from behind.",
  hp: 12,
  armor: 1,
  move: 6,
  ap: 2,
  weapon: { range: 1, accuracy: 70, damage: 6, armorPen: 1 },
  sightRange: SIGHT,
  behaviour: "flank",
  modelId: "bug.lurker",
  hatchWeight: 3,
};

/** Slow, armored; punishes clumping (GDD §6.4). */
export const BRUTE: BugSpecies = {
  id: "brute",
  name: "Brute",
  description:
    "A boulder of carapace dragging two cleaver blades. Slow, but whatever it reaches, it reaches all at once.",
  hp: 30,
  armor: 3,
  move: 3,
  ap: 2,
  weapon: { range: 1, accuracy: 65, damage: 10, armorPen: 2 },
  sightRange: SIGHT,
  behaviour: "punish-clumps",
  modelId: "bug.brute",
  hatchWeight: 1,
};

/**
 * Every bug species keyed by id. Typed as a record over the closed
 * `BugSpeciesId` union so a new id without a definition fails at compile
 * time rather than at runtime.
 */
export const BUG_SPECIES: Readonly<Record<BugSpeciesId, BugSpecies>> = {
  swarmer: SWARMER,
  lurker: LURKER,
  brute: BRUTE,
};
