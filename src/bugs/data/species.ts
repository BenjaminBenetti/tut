import type { ModelAssetId } from "../../content/data/model-ids";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type {
  ArmouredBaseId,
  ArmouredVariantId,
} from "../model/armoured-variant";
import type { BugSpecies } from "../model/bug-species";
import { armouredVariant } from "../service/armoured-variant-factory";
import { ARMOURED_VARIANT_TUNING } from "./armoured-variant-tuning";

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
//     or move and bite. The Hive Guard's is 0: it is rooted in its
//     chamber and never moves at all (#1179).
//   • Weapons are melee (range 1) except the spitter's acid and the Hive
//     Guard's spines (#1179); accuracy and damage climb with size, and
//     only the brute's blades punch through mech armor. The
//     brute's blow also sweeps the tiles beside its mark and opens
//     walls (#1121, #1130); the small species mark nothing.
//   • footprint: the brute stands on a 2×2 block (#1130); the small
//     species take one tile and declare nothing.
//   • sightRange is one value for every species (ADR 0006): bugs hunt by
//     scent as much as sight, and giving each its own number is tuning
//     nobody has asked for yet.
//   • hatchWeight is what egg spawners roll on: six swarmers to three
//     lurkers to one brute keeps the first missions swarmy. A weight of
//     0 is never rolled (the spitter, the burrower and the armoured
//     variants, until the bestiary mixes them in; the Hive Guard, which
//     is only ever placed).
//   • The Act III armoured variants (#1179) are not written out: each is
//     its base's block plus `ARMOURED_VARIANT_TUNING`'s armour and hit
//     points (`armouredVariant`), so a retune above carries to them.
//   • xpValue is what a kill is worth to the killer (#1130), sized to the
//     rank ladder in `roster/data/ranks.ts` where a swarmer is the unit:
//     a swarmer is one rung's worth at the bottom of the ladder, a
//     lurker is two and a half — a focused turn's work — and a brute six,
//     because a squad that brings one down has earned its stripes. A
//     spitter is two: fragile, but it has to be dug out of cover. A
//     burrower is three: it has to be caught above ground first. A
//     Hive Guard is four: it cannot chase anyone, but it has to be
//     walked up to under its fire. The Broodmother is ten: a boss, and
//     one the squad has to catch before she reaches the edge.
//   • burrows: the burrower (#1179) arrives under the ground and fights
//     from beneath it; see `isBurrowed` in `tactical/model/unit`.

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
  xpValue: 10,
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
  xpValue: 25,
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
  // The cleavers sweep: whoever stands beside its mark takes a share of
  // the blow, which is what "punishes clumping" means on the tile grid
  // (#1121). Force 3 opens solid walls (#1130): a brute is four tiles
  // wide and fits through no door, so the Executive Director asked for
  // a slice with "demo 2 or above" that lets it cut its way to a squad
  // indoors — and on the demolition ladder only 3 brings a solid wall
  // down; 2 stops at doors and windows, which the brute cannot use.
  weapon: {
    range: 1,
    accuracy: 65,
    damage: 10,
    armorPen: 2,
    aoe: { radius: 1, falloff: 0.6 },
    demoForce: 3,
  },
  sightRange: SIGHT,
  behaviour: "punish-clumps",
  modelId: "bug.brute",
  hatchWeight: 1,
  xpValue: 60,
  // A 2×2 block (#1130): the model was squashed into one tile, and a
  // boulder of carapace should not fit where a soldier does.
  footprint: 2,
};

/**
 * Ranged acid bug (#1179, campaign arc §8): the first bug cover protects
 * against. Its spit is an ordinary ranged weapon, so the combat rules
 * hold it to line of sight, reach, cover and hit chance exactly as they
 * hold a carbine (#446: only melee ignores cover). It is fragile — two
 * more hit points than a swarmer, a lurker's worth less — walks at an
 * infantry squad's pace and fights from a distance (`snipe`).
 *
 * `hatchWeight` is 0: the default roll never produces one, so the
 * missions and the pinned sims that exist today are unchanged. The
 * campaign's bestiary mixes it in from mission 8 through a per-mission
 * species mix (ADR 0013 §2.6); until then only the debug placement tool
 * and a sweep with its own weights field it.
 */
export const SPITTER: BugSpecies = {
  id: "spitter",
  name: "Spitter",
  description:
    "A bloated acid sac on four legs, with a spout for a face. It keeps its distance, spits from behind cover and scuttles back when a squad gets close.",
  hp: 8,
  armor: 0,
  move: 5,
  ap: 2,
  // Six tiles: inside a carbine's eight, so a squad that takes cover
  // can always answer. Acid bites through one point of plate, which
  // is a scratch on a mech and all of it on a squad. Tagged acid, so
  // the plating its autopsy unlocks resists it (campaign arc §10.2).
  weapon: { range: 6, accuracy: 60, damage: 4, armorPen: 1, tags: ["acid"] },
  sightRange: SIGHT,
  behaviour: "snipe",
  modelId: "bug.spitter",
  hatchWeight: 0,
  xpValue: 20,
};

/**
 * Melee ambusher that moves under the ground (#1179, campaign arc §8).
 * It arrives `burrowed` — never spotted, shot, blasted or watched — and
 * tunnels five tiles an action under walls and cover alike, then comes
 * up on a free tile beside its mark (`burrow`). Surfacing costs an
 * action, so one that lies in wait beside a squad for a turn comes up
 * and bites in the same phase; one that tunnels in from afar surfaces
 * with nothing left and bites the phase after, having given the squad
 * its turn to answer.
 *
 * A mid-weight: a lurker's plate and a little more hide, and the
 * heaviest bite of the small species — its jaws are the ploughshare it
 * digs with, so the first strike out of the ground is the one that
 * hurts. `hatchWeight` is 0 like the spitter's: only the campaign's
 * bestiary mixes it in, from five missions into Act II (ADR 0013
 * §2.6), so no Act I mission and no pinned sim ever rolls one.
 */
export const BURROWER: BugSpecies = {
  id: "burrower",
  name: "Burrower",
  description:
    "A banded, low-slung digger with spade forelimbs and a bone ploughshare for a face. It moves under the ground and comes up beside you.",
  hp: 14,
  armor: 1,
  move: 5,
  ap: 2,
  // The heaviest bite of the small species, and a point of plate
  // through: out of the ground, it is the strike that has to be feared.
  weapon: { range: 1, accuracy: 75, damage: 8, armorPen: 1 },
  sightRange: SIGHT,
  behaviour: "burrow",
  modelId: "bug.burrower",
  hatchWeight: 0,
  xpValue: 30,
  burrows: true,
};

/**
 * Stationary spine thrower (#1179, campaign arc §6.5, §7.5 and §8): a
 * living turret rooted in a hive chamber, placed beside the hive core
 * by the mission that fights there, never hatched or rolled. It has no
 * move at all (`move: 0`), so the movement rules refuse any path it
 * could be handed; its `guard` behaviour throws spines at the best
 * target in reach and sight, or holds.
 *
 * Tough rather than big: a lurker's armour and one more point, and
 * two thirds of a brute's hit points on one tile (the modeller's brief
 * authors it at 1×1, about two metres across). Its spines reach seven
 * tiles, inside a carbine's eight, so a squad that closes behind cover
 * can always answer; they bite a point of plate, and hit a little
 * harder than acid.
 *
 * `hatchWeight` is 0 and its bestiary entry is `placed` (ADR 0013
 * §2.6): only a placement path (`placeHiveGuards`) or the debug tool
 * puts one on a map.
 */
export const HIVE_GUARD: BugSpecies = {
  id: "hive-guard",
  name: "Hive Guard",
  description:
    "A squat fortress of chitin rooted to the hive floor, a shield plate in front and racks of spines on its back. It never leaves its chamber; it throws spines at anything that comes in.",
  hp: 20,
  armor: 2,
  move: 0,
  ap: 2,
  // Tagged spine, so the plate its autopsy unlocks resists it (campaign
  // arc §10.2).
  weapon: { range: 7, accuracy: 65, damage: 5, armorPen: 1, tags: ["spine"] },
  sightRange: SIGHT,
  behaviour: "guard",
  modelId: "bug.hive-guard",
  hatchWeight: 0,
  xpValue: 40,
};

// ===========================================
// Armoured variants (campaign arc §8, #1179)
// ===========================================

/**
 * The Act III swarmer under slab armour: a second hood layer, a slab
 * spine and plated legs (`bug.swarmer-armoured`). Same rush, same bite,
 * one more point of plate.
 */
export const SWARMER_ARMOURED: BugSpecies = armouredVariant(
  SWARMER,
  {
    id: "swarmer-armoured",
    name: "Armoured Swarmer",
    description:
      "A swarmer under a second hood of dark slab plate with pale rims. It still comes in numbers, and a burst no longer ends it.",
    modelId: "bug.swarmer-armoured",
  },
  ARMOURED_VARIANT_TUNING.swarmer,
);

/**
 * The Act III lurker under slab armour: a slit-eyed face mask, thorax
 * collars and plated sickles (`bug.lurker-armoured`). Same flank, same
 * scythes, one more point of plate.
 */
export const LURKER_ARMOURED: BugSpecies = armouredVariant(
  LURKER,
  {
    id: "lurker-armoured",
    name: "Armoured Lurker",
    description:
      "A lurker behind a slit-eyed mask, its thorax collared and its sickles sleeved in plate. It still circles for the line's back, and takes nearly twice the shooting to bring down.",
    modelId: "bug.lurker-armoured",
  },
  ARMOURED_VARIANT_TUNING.lurker,
);

/**
 * The Act III brute under slab armour: a tortoise-shell of plates, a ram
 * brow and plate-backed cleavers (`bug.brute-armoured`). Same 2×2 block,
 * same wall-opening cleavers, two more points of plate.
 */
export const BRUTE_ARMOURED: BugSpecies = armouredVariant(
  BRUTE,
  {
    id: "brute-armoured",
    name: "Armoured Brute",
    description:
      "A brute under a tortoise-shell of slab plates, with a ram brow over its head. Small arms barely mark it; bring something that punches through.",
    modelId: "bug.brute-armoured",
  },
  ARMOURED_VARIANT_TUNING.brute,
);

/**
 * Each armoured variant's base species (arc §8): what it is derived
 * from, and the row of `ARMOURED_VARIANT_TUNING` it adds. Its autopsy
 * (arc §10.2) and anything else that asks "is this an armoured bug"
 * reads it rather than parsing ids.
 */
export const ARMOURED_VARIANT_BASES: Readonly<
  Record<ArmouredVariantId, ArmouredBaseId>
> = {
  "swarmer-armoured": "swarmer",
  "lurker-armoured": "lurker",
  "brute-armoured": "brute",
};

// ===========================================
// Catalogue
// ===========================================

/**
 * The Broodmother (#1179, campaign arc §6.8, §8 and §9): the boss of
 * Alpha Hunt, a mobile egg-layer. She is placed by her mission
 * (`placeBroodmother`), never hatched or rolled, and she is not a
 * fighter: a weak bite, a boss's hit points, and a behaviour
 * (`broodmother`) that keeps her out of the squad's reach while her
 * clutches — an egg spawner every three turns — do the fighting. At
 * half health she runs for the map edge, and one that reaches it is
 * gone.
 *
 * `hp` is her difficulty-1 value; the mission that places her scales
 * it with difficulty and scars (`broodmotherHp`). She stands on a 3×3
 * block (the modeller's kit): lower than a mech and far wider than a
 * brute, so she fits through no door and walks the streets.
 */
export const BROODMOTHER: BugSpecies = {
  id: "broodmother",
  name: "Broodmother",
  description:
    "A huge ribbed egg sac caged in bone behind a small armoured head. She lays a clutch of eggs every few turns, keeps out of reach, and runs for the edge when she is hurt.",
  hp: 60,
  armor: 1,
  move: 5,
  ap: 2,
  // A weak bite: she is not a fighter. A swarmer's bite with one more
  // point and a little less aim, and nothing that dents plate.
  weapon: { range: 1, accuracy: 55, damage: 4, armorPen: 0 },
  sightRange: SIGHT,
  behaviour: "broodmother",
  modelId: "bug.broodmother",
  hatchWeight: 0,
  xpValue: 100,
  footprint: 3,
};

/**
 * The model of a Broodmother who has escaped before (#1179, arc §6.8):
 * the same build scarred across the crest, two cage spines gone and
 * dark regrowth on her left flank. `placeBroodmother` stands her in it
 * when she carries a scar.
 */
export const BROODMOTHER_SCARRED_MODEL_ID: ModelAssetId =
  "bug.broodmother-scarred";

/**
 * Every bug species keyed by id. Typed as a record over the closed
 * `BugSpeciesId` union so a new id without a definition fails at compile
 * time rather than at runtime.
 */
export const BUG_SPECIES: Readonly<Record<BugSpeciesId, BugSpecies>> = {
  swarmer: SWARMER,
  lurker: LURKER,
  brute: BRUTE,
  spitter: SPITTER,
  burrower: BURROWER,
  "hive-guard": HIVE_GUARD,
  "swarmer-armoured": SWARMER_ARMOURED,
  "lurker-armoured": LURKER_ARMOURED,
  "brute-armoured": BRUTE_ARMOURED,
  broodmother: BROODMOTHER,
};
