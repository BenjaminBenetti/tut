import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { WeaponReachTuning } from "../model/weapon-reach-tuning";
import { attackDistance, weaponReach } from "./weapon-reach-service";
import { CoverLevel as Cover } from "../../mapgen/model/cover";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { AttackCommand } from "../model/attack-command";
import type { AttackTarget } from "../model/attack-target";
import type { AttackPreview, BlastPreview } from "../model/attack-preview";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import type { BlastVictim as BlastVictimHit } from "../model/blast-resolved-event";
import { BLAST_RESOLVED } from "../model/blast-resolved-event";
import type { CombatTuning } from "../model/combat-tuning";
import type { DemolitionTuning } from "../model/demolition-tuning";
import type { HazardTuning } from "../model/hazard-tuning";
import { STRUCTURE_DESTROYED } from "../model/structure-destroyed-event";
import type { StructureCatalogue } from "../model/structure-catalogue";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type {
  TacticalContext,
  TacticalHandler,
  TacticalOutcome,
} from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import { UNIT_DIED } from "../model/unit-died-event";
import type { Unit, UnitId } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";
import type { UnitWeapon, WeaponId } from "../model/unit-weapon";
import { weaponOf } from "../model/unit-weapon";
import type { WeaponProfile } from "../model/weapon-profile";
import {
  blastRadiusOf,
  canTargetTile,
  demoForceOf,
  falloffShare,
  hasImpact,
  isMelee,
} from "../model/weapon-profile";
import type { AttackTerrain } from "./attack-formulae";
import { damageRange, hitChance } from "./attack-formulae";
import { findAttackTarget } from "./attack-target-service";
import type { BlastTile } from "./blast-service";
import { blastFootprint, blastVictims } from "./blast-service";
import { demolish } from "./demolition-service";
import { endIfOver } from "./mission-end-service";
import { coverAgainst, elevationBonus, hasLineOfSight } from "./sight-service";
import { damageSpawner } from "./spawner-damage-service";
import { ignite } from "./tile-effect-service";

export type { AttackTerrain } from "./attack-formulae";
export { damageRange, hitChance } from "./attack-formulae";

// ===========================================
// Types
// ===========================================

/**
 * The attacker, its stat block and what it is shooting at, validated for
 * an attack. The target is an `AttackTarget` rather than a `Unit`, so
 * the same pair carries a squad, a mech or an egg spawner (#426).
 */
export interface AttackPair {
  readonly attacker: Unit;
  readonly attackerTemplate: UnitTemplate;
  /** The weapon this attack is made with (#532); one of the template's. */
  readonly weapon: UnitWeapon;
  readonly target: AttackTarget;
}

/**
 * The attacker, its stat block and the tile it is shooting at, validated
 * for a shot at the ground (#1121). No target: whatever stands on the
 * tile is the blast's business.
 */
export interface TileAttackPair {
  readonly attacker: Unit;
  readonly attackerTemplate: UnitTemplate;
  readonly weapon: UnitWeapon;
  readonly impact: TileCoord;
  readonly terrain: AttackTerrain;
}

/**
 * What resolving a shot needs beyond the combat tuning (#1121): the
 * content that says what a blast can break, and the clocks of what it
 * leaves burning. Ports, never data modules (ADR 0003).
 */
export interface AttackDeps {
  readonly structures: StructureCatalogue;
  readonly demolition: DemolitionTuning;
  readonly hazards: HazardTuning;
}

/** What rolling a shot did, and whether an egg spawner was among what it hit. */
export interface AttackRoll extends TacticalApplied<TacticalState> {
  /** True when the shot or its blast damaged a spawner, so the caller asks whether the mission ended. */
  readonly spawnerHit: boolean;
}

// ===========================================
// Terrain
// ===========================================

/**
 * Cover, flank, distance and elevation between two tiles on a map. A
 * target is flanked when it has cover against some direction but none
 * against this attacker. Distance is measured in three dimensions
 * (`attackDistance`, #1119), so a storey of height counts.
 */
export function attackTerrain(
  map: TacticalMap,
  attacker: TileCoord,
  target: TileCoord,
  index: TileIndex = new TileIndex(map),
): AttackTerrain {
  const cover = coverAgainst(map, target, attacker, index);
  const anyCover = SIDE_PROBES.some(
    (probe) =>
      coverAgainst(
        map,
        target,
        { x: target.x + probe.x, y: target.y, z: target.z + probe.z },
        index,
      ) !== Cover.NONE,
  );
  return {
    distance: attackDistance(attacker, target),
    cover,
    flanked: cover === Cover.NONE && anyCover,
    elevation: elevationBonus(attacker, target),
  };
}

/**
 * The terrain as it applies to `weapon` (#446). Geometry is the same for
 * everyone, but cover is not: a melee attacker gets neither the
 * mitigation nor the flank bonus, because both describe a firing line it
 * does not have. Ranged attacks are returned unchanged.
 *
 * Applied here, where the weapon is known, rather than inside
 * `attackTerrain`, which is a pure question about two tiles and a map
 * and is asked by callers that have no weapon in hand.
 */
export function terrainForWeapon(
  terrain: AttackTerrain,
  weapon: WeaponProfile,
): AttackTerrain {
  if (!isMelee(weapon)) {
    return terrain;
  }
  return { ...terrain, cover: Cover.NONE, flanked: false };
}

/**
 * The terrain for a shot at the ground (#1121): distance and elevation
 * as for any shot, and no cover or flank, because both describe a body
 * behind something and there is no body. "The same hit chance applies"
 * to an empty tile, with the target-dependent terms at zero.
 */
export function terrainForTile(terrain: AttackTerrain): AttackTerrain {
  return { ...terrain, cover: Cover.NONE, flanked: false };
}

/** One tile out on each side, to ask whether the target has cover there. */
const SIDE_PROBES: readonly { x: number; z: number }[] = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

// ===========================================
// Validation
// ===========================================

/**
 * Why this target cannot be shot at because it is already down, or
 * undefined while it still stands. Units die and spawners are destroyed,
 * so the rejection names the right thing for the HUD to phrase.
 */
function targetDown(target: AttackTarget): TacticalError | undefined {
  if (target.hp > 0) {
    return undefined;
  }
  return target.kind === "spawner"
    ? { kind: "target-destroyed", targetId: target.id }
    : { kind: "unit-dead", unitId: target.id };
}

/** Attacker and target, both resolved and both still standing. */
interface LivePair {
  readonly attacker: Unit;
  readonly target: AttackTarget;
}

/**
 * The four refusals `validateAttack` and `validateTargeting` both open
 * with: attacker on the map, target resolvable, attacker still standing,
 * target not already down.
 *
 * One implementation rather than two (#992). They were written out twice
 * in the same order, and the #735 audit found that only the copy behind
 * `validateAttack` had ever run in a test — `validateTargeting`'s, which
 * is what a real shot and an overwatch reaction go through, had not. Two
 * copies of one rule drift independently and nothing notices; the pair
 * that matters is the one nobody was watching.
 *
 * The order is load-bearing and is preserved exactly: a missing attacker
 * is reported before a missing target, and both before either is checked
 * for being down, so the error a caller sees never changes.
 */
function liveTargetingPair(
  mission: TacticalState,
  attackerId: UnitId,
  targetId: UnitId,
): Result<LivePair, TacticalError> {
  const attacker = mission.units.find((u) => u.id === attackerId);
  if (attacker === undefined) {
    return err({ kind: "unit-not-on-map", unitId: attackerId });
  }
  const target = findAttackTarget(mission, targetId);
  if (target === undefined) {
    return err({ kind: "unit-not-on-map", unitId: targetId });
  }
  if (attacker.hp <= 0) {
    return err({ kind: "unit-dead", unitId: attackerId });
  }
  const down = targetDown(target);
  if (down !== undefined) {
    return err(down);
  }
  return ok({ attacker, target });
}

/**
 * The checks on the attacker alone that a shot at anything opens with,
 * after it is known to be on the map and standing: its side's phase,
 * action points, the weapon named and its charges. Shared by the shot
 * at a target and the shot at a tile (#1121) so the two cannot drift.
 */
function readyWeapon(
  mission: TacticalState,
  attacker: Unit,
  tuning: CombatTuning,
  weaponId: WeaponId | undefined,
): Result<UnitWeapon, TacticalError> {
  if (attacker.team !== TEAM_FOR_PHASE[mission.phase]) {
    return err({ kind: "wrong-phase", unitId: attacker.id });
  }
  if (attacker.ap < tuning.attackApCost) {
    return err({ kind: "no-action-points", unitId: attacker.id });
  }
  const chosen = weaponOf(
    mission.templates[attacker.templateId]?.weapons ?? [],
    weaponId,
  );
  if (chosen === undefined) {
    return err({ kind: "no-such-weapon", unitId: attacker.id });
  }
  // Charges are per weapon (#532): an empty arm gun does not stop the
  // one on the back.
  if (chargesLeft(attacker, chosen) === 0) {
    return err({ kind: "no-charges", unitId: attacker.id });
  }
  return ok(chosen);
}

/**
 * Checks an attack is legal for the acting unit: attacker and target
 * both on the map and still standing, the attacker on the acting side
 * with action points to spend, and everything `validateTargeting` asks.
 * The target is whatever `findAttackTarget` resolves the id to, so a
 * squad, a mech and an egg spawner are all legal to name (#426).
 * Returns the pair for the formulae.
 */
export function validateAttack(
  mission: TacticalState,
  attackerId: UnitId,
  targetId: UnitId,
  tuning: CombatTuning,
  weaponId?: WeaponId,
): Result<AttackPair & { readonly terrain: AttackTerrain }, TacticalError> {
  const pair = liveTargetingPair(mission, attackerId, targetId);
  if (!pair.ok) {
    return pair;
  }
  // `validateTargeting` below resolves the target again; this entry
  // point only needs the attacker.
  const chosen = readyWeapon(mission, pair.value.attacker, tuning, weaponId);
  if (!chosen.ok) {
    return chosen;
  }
  return validateTargeting(
    mission,
    attackerId,
    targetId,
    tuning,
    chosen.value.id,
  );
}

/**
 * The targeting checks that hold whoever's phase it is and whatever the
 * attacker's action points: attacker and target both on the map and
 * still standing, the target an enemy other than the attacker, in reach
 * and in sight. Reach, sight and cover are judged against the target's
 * tile, so an egg spawner is shot at through exactly the rules a unit
 * is. Reach is the weapon's range plus what height buys (#1119), and
 * the distance it is held against is three-dimensional; the refusal
 * carries both numbers. Overwatch reactions (#328) fire on exactly
 * these. Returns the pair and terrain for the formulae.
 */
export function validateTargeting(
  mission: TacticalState,
  attackerId: UnitId,
  targetId: UnitId,
  tuning: WeaponReachTuning,
  weaponId?: WeaponId,
): Result<AttackPair & { readonly terrain: AttackTerrain }, TacticalError> {
  const pair = liveTargetingPair(mission, attackerId, targetId);
  if (!pair.ok) {
    return pair;
  }
  const { attacker, target } = pair.value;
  if (attackerId === targetId) {
    return err({ kind: "self-target", unitId: attackerId });
  }
  if (attacker.team === target.team) {
    return err({ kind: "friendly-target", targetId });
  }
  const attackerTemplate = templateOf(mission, attacker);
  const weapon = weaponOf(attackerTemplate.weapons, weaponId);
  if (weapon === undefined) {
    return err({ kind: "no-such-weapon", unitId: attackerId });
  }
  const index = new TileIndex(mission.map);
  const terrain = terrainForWeapon(
    attackTerrain(mission.map, attacker.pos, target.pos, index),
    weapon.profile,
  );
  const reach = weaponReach(
    weapon.profile.range,
    attacker.pos,
    target.pos,
    tuning,
  );
  if (terrain.distance > reach) {
    return err({
      kind: "out-of-range",
      distance: terrain.distance,
      range: reach,
    });
  }
  if (!hasLineOfSight(mission.map, attacker.pos, target.pos, index)) {
    return err({ kind: "no-line-of-sight", targetId });
  }
  return ok({ attacker, attackerTemplate, weapon, target, terrain });
}

/**
 * Checks a shot at the ground is legal (#1121): the attacker on the map,
 * standing, on the acting side with action points, the weapon named and
 * loaded and able to do something at a tile; the tile on the map, inside
 * the weapon's range and in sight. There is no target to be down, on
 * one's own side or oneself.
 *
 * ```
 *   attacker      ──► unit-not-on-map · unit-dead · wrong-phase · no-action-points
 *   weapon        ──► no-such-weapon · no-charges · no-area-weapon
 *   tile          ──► no-such-tile · out-of-range (reach, #1119) · tile-out-of-sight
 * ```
 *
 * @returns The pair and the terrain for the formulae.
 */
export function validateTileAttack(
  mission: TacticalState,
  attackerId: UnitId,
  tile: TileCoord,
  tuning: CombatTuning,
  weaponId?: WeaponId,
): Result<TileAttackPair, TacticalError> {
  const attacker = mission.units.find((u) => u.id === attackerId);
  if (attacker === undefined) {
    return err({ kind: "unit-not-on-map", unitId: attackerId });
  }
  if (attacker.hp <= 0) {
    return err({ kind: "unit-dead", unitId: attackerId });
  }
  const chosen = readyWeapon(mission, attacker, tuning, weaponId);
  if (!chosen.ok) {
    return chosen;
  }
  const weapon = chosen.value;
  if (!canTargetTile(weapon.profile)) {
    return err({ kind: "no-area-weapon", unitId: attackerId });
  }
  const index = new TileIndex(mission.map);
  const impact = index.getAt(tile);
  if (impact === undefined) {
    return err({ kind: "no-such-tile", x: tile.x, y: tile.y, z: tile.z });
  }
  const terrain = terrainForTile(
    attackTerrain(mission.map, attacker.pos, impact, index),
  );
  // The same reach rule as a shot at a unit (#1119): height buys reach,
  // and the distance held against it is three-dimensional.
  const reach = weaponReach(weapon.profile.range, attacker.pos, impact, tuning);
  if (terrain.distance > reach) {
    return err({
      kind: "out-of-range",
      distance: terrain.distance,
      range: reach,
    });
  }
  if (!hasLineOfSight(mission.map, attacker.pos, impact, index)) {
    return err({ kind: "tile-out-of-sight", x: tile.x, y: tile.y, z: tile.z });
  }
  return ok({
    attacker,
    attackerTemplate: templateOf(mission, attacker),
    weapon,
    impact: { x: impact.x, y: impact.y, z: impact.z },
    terrain,
  });
}

/** The template a unit references; a mission that lacks it is broken, not an illegal command. */
function templateOf(mission: TacticalState, unit: Unit): UnitTemplate {
  const template = mission.templates[unit.templateId];
  if (template === undefined) {
    throw new Error(
      `Unit "${unit.id}" references a template missing from the mission`,
    );
  }
  return template;
}

// ===========================================
// Charges
// ===========================================

/**
 * Shots left for `weapon`, or undefined when it has no pool at all. A
 * unit whose `charges` record has no entry for a weapon that declares
 * one is treated as full: that is a save written before the weapon
 * existed, not an empty gun.
 */
export function chargesLeft(
  unit: Unit,
  weapon: UnitWeapon,
): number | undefined {
  if (weapon.charges === undefined) {
    return undefined;
  }
  return unit.charges?.[weapon.id] ?? weapon.charges;
}

/** The `charges` patch for a unit that just fired `weapon`; empty when it has no pool. */
function spendCharge(
  unit: Unit,
  weapon: UnitWeapon,
): { charges?: Readonly<Record<WeaponId, number>> } {
  const left = chargesLeft(unit, weapon);
  if (left === undefined) {
    return {};
  }
  return {
    charges: { ...unit.charges, [weapon.id]: Math.max(0, left - 1) },
  };
}

// ===========================================
// Options
// ===========================================

/** One weapon a unit carries, and whether it can be fired right now. */
export interface WeaponOption {
  readonly weapon: UnitWeapon;
  /** Shots left, or undefined for a weapon with no pool. */
  readonly charges: number | undefined;
  /** False when the unit could not attack with it at all this instant. */
  readonly ready: boolean;
  /** Why not, when `ready` is false. */
  readonly refusal?: TacticalError;
}

/**
 * Every weapon `unitId` carries, in template order, each with whether it
 * could be fired this instant and why not (#532).
 *
 * The single list the action bar, the number keys and #529's right-click
 * menu all read, so the three cannot disagree about what a unit can do.
 * Entries are returned whether or not they are ready: a menu that hides
 * an empty gun teaches the player nothing, and one that hides a weapon
 * whose target is out of range looks broken.
 *
 * Readiness here is the unit's own state — phase, action points, charges
 * — not a specific target, because the menu opens before a target is
 * chosen. `previewAttack` answers the per-target question.
 */
export function weaponOptions(
  mission: TacticalState,
  unitId: UnitId,
  tuning: CombatTuning,
): readonly WeaponOption[] {
  const unit = mission.units.find((u) => u.id === unitId);
  const template = unit && mission.templates[unit.templateId];
  if (unit === undefined || template === undefined) {
    return [];
  }
  return template.weapons.map((weapon) => {
    const charges = chargesLeft(unit, weapon);
    const refusal = refuseWeapon(mission, unit, charges, tuning);
    return {
      weapon,
      charges,
      ready: refusal === undefined,
      ...(refusal === undefined ? {} : { refusal }),
    };
  });
}

/**
 * The weapons `unitId` could fire at the ground (#1121): those of
 * `weaponOptions` with a blast, an effect or a force. The wheel offers
 * Attack on a tile from this list and nothing else, so a rifle squad is
 * never offered a shot at the grass.
 */
export function tileWeaponOptions(
  mission: TacticalState,
  unitId: UnitId,
  tuning: CombatTuning,
): readonly WeaponOption[] {
  return weaponOptions(mission, unitId, tuning).filter((option) =>
    canTargetTile(option.weapon.profile),
  );
}

/** Why the unit cannot fire this weapon at all, target aside. */
function refuseWeapon(
  mission: TacticalState,
  unit: Unit,
  charges: number | undefined,
  tuning: CombatTuning,
): TacticalError | undefined {
  if (unit.hp <= 0) {
    return { kind: "unit-dead", unitId: unit.id };
  }
  if (unit.team !== TEAM_FOR_PHASE[mission.phase]) {
    return { kind: "wrong-phase", unitId: unit.id };
  }
  if (unit.ap < tuning.attackApCost) {
    return { kind: "no-action-points", unitId: unit.id };
  }
  if (charges === 0) {
    return { kind: "no-charges", unitId: unit.id };
  }
  return undefined;
}

// ===========================================
// Preview
// ===========================================

/** What a preview may ask about the content, when the caller has it. */
export type PreviewDeps = Pick<AttackDeps, "structures" | "demolition">;

/**
 * The numbers the HUD shows before the player commits (GDD §6.2), or why
 * the attack is not allowed. Pure; `resolveAttack` rolls against exactly
 * this preview. For a weapon that does anything around its impact the
 * preview carries the blast too (#1121): the tiles, who else is standing
 * in them and, with `deps`, what would fall.
 */
export function previewAttack(
  mission: TacticalState,
  attackerId: UnitId,
  targetId: UnitId,
  tuning: CombatTuning,
  weaponId?: WeaponId,
  deps?: PreviewDeps,
): Result<AttackPreview, TacticalError> {
  const checked = validateAttack(
    mission,
    attackerId,
    targetId,
    tuning,
    weaponId,
  );
  if (!checked.ok) {
    return checked;
  }
  const { attacker, weapon, target, terrain } = checked.value;
  const blast = hasImpact(weapon.profile)
    ? blastPreview(
        mission,
        weapon.profile,
        target.pos,
        new Set([attacker.id, target.id]),
        tuning,
        deps,
      )
    : undefined;
  return ok({
    hitChance: hitChance(weapon.profile, terrain, tuning),
    damage: damageRange(weapon.profile, target.armor, tuning),
    distance: terrain.distance,
    cover: terrain.cover,
    flanked: terrain.flanked,
    elevation: terrain.elevation,
    ...(blast === undefined ? {} : { blast }),
  });
}

/**
 * The numbers for a shot at the ground (#1121), or why it is not
 * allowed. The damage band is what an unarmoured thing on the impact
 * tile would take; the blast says who is actually standing in it.
 */
export function previewTileAttack(
  mission: TacticalState,
  attackerId: UnitId,
  tile: TileCoord,
  tuning: CombatTuning,
  weaponId?: WeaponId,
  deps?: PreviewDeps,
): Result<AttackPreview, TacticalError> {
  const checked = validateTileAttack(
    mission,
    attackerId,
    tile,
    tuning,
    weaponId,
  );
  if (!checked.ok) {
    return checked;
  }
  const { attacker, weapon, impact, terrain } = checked.value;
  return ok({
    hitChance: hitChance(weapon.profile, terrain, tuning),
    damage: damageRange(weapon.profile, 0, tuning),
    distance: terrain.distance,
    cover: terrain.cover,
    flanked: terrain.flanked,
    elevation: terrain.elevation,
    blast: blastPreview(
      mission,
      weapon.profile,
      impact,
      new Set([attacker.id]),
      tuning,
      deps,
    ),
  });
}

/**
 * What a weapon would do around `impact` (#1121), for the wheel, the
 * preview panel and the overlay: the footprint, everyone in it but
 * `exclude` with the band each would take, and — when the caller can
 * ask the content — how many props and wall edges would fall.
 */
export function blastPreview(
  mission: TacticalState,
  profile: WeaponProfile,
  impact: TileCoord,
  exclude: ReadonlySet<string>,
  tuning: CombatTuning,
  deps?: PreviewDeps,
): BlastPreview {
  const index = new TileIndex(mission.map);
  const radius = blastRadiusOf(profile);
  const footprint = blastFootprint(mission.map, impact, radius, index);
  const victims = blastVictims(mission, footprint, exclude).map(
    ({ target, distance }) => ({
      id: target.id,
      kind: target.kind,
      name: target.name,
      team: target.team,
      distance,
      damage: blastDamageRange(profile, distance, target.armor, tuning),
    }),
  );
  const force = demoForceOf(profile);
  const fallen =
    deps === undefined || force <= 0
      ? undefined
      : demolish(
          mission.map,
          footprint.map((entry) => entry.tile),
          force,
          deps.structures,
          deps.demolition,
          index,
        );
  return {
    radius,
    tiles: footprint.map(({ tile }) => ({ x: tile.x, y: tile.y, z: tile.z })),
    victims,
    ...(fallen === undefined
      ? {}
      : { demolished: fallen.props.length + fallen.walls.length }),
    leavesEffect: profile.aoeEffect !== undefined,
  };
}

/**
 * The band something `distance` tiles from the impact takes (#1121):
 * the weapon's damage less its falloff share, then the ordinary band
 * and armor. Falloff comes off before armor because less arrives, and
 * the armor is the same plate whatever arrives.
 */
export function blastDamageRange(
  profile: WeaponProfile,
  distance: number,
  armor: number,
  tuning: CombatTuning,
): readonly [number, number] {
  const share = falloffShare(profile.aoe?.falloff ?? 0, distance);
  const scaled = Math.round(profile.damage * share);
  if (scaled <= 0) {
    return [0, 0];
  }
  return damageRange({ ...profile, damage: scaled }, armor, tuning);
}

// ===========================================
// Resolution
// ===========================================

/**
 * Rolls a validated attack (GDD §6.2) with the context's RNG. Draw order,
 * part of the determinism contract:
 *
 * ```
 *   1. chance(hitChance / 100)                 hit?
 *   2. nextInt(damage.min, damage.max)         only on a hit
 *   3. per blast victim, nextInt(band)         only for a weapon with a blast (#1121)
 *   4. per reached tile, chance(effect)        only for a weapon with an effect
 * ```
 *
 * The target loses the damage (never below zero hit points) and the
 * attacker's action points become `apAfter`: what the attack leaves for
 * a normal shot, unchanged for an overwatch reaction. Emits
 * `AttackResolved` always and `UnitDied` (with the killer) when the
 * target's hit points reach zero; the corpse stays in `units` at zero
 * hit points for graphics to remove and the results to count.
 *
 * A shot at an egg spawner (#426) rolls identically and hands the damage
 * to `damageSpawner`, the same rule planted charges use, so it emits
 * `SpawnerDamaged` and — on the killing shot — destroys it and completes
 * its objective. Whether that ended the mission is `resolveAttack`'s
 * question, not this one's: an overwatch reaction never shoots a
 * spawner and must not end anything.
 *
 * A weapon that does anything around its impact (#1121) does it here,
 * after the target's own damage and only on a hit: the blast over the
 * target's tile, the demolition and the fire. A miss applies nothing.
 */
export function rollAttack(
  mission: TacticalState,
  checked: AttackPair & { readonly terrain: AttackTerrain },
  ctx: TacticalContext,
  tuning: CombatTuning,
  apAfter: number,
  deps: AttackDeps,
): AttackRoll {
  const { attacker, weapon, target, terrain } = checked;
  const chance = hitChance(weapon.profile, terrain, tuning);
  const band = damageRange(weapon.profile, target.armor, tuning);
  const hit = ctx.rng.chance(chance / 100);
  const damage = hit ? ctx.rng.nextInt(band[0], band[1]) : 0;
  const targetHp = Math.max(0, target.hp - damage);

  // The attacker pays whatever the shot cost it, whatever it shot at.
  const events: TacticalEvent[] = [
    {
      type: ATTACK_RESOLVED,
      payload: {
        attackerId: attacker.id,
        targetId: target.id,
        hit,
        damage,
        targetHp,
        weaponRange: weapon.profile.range,
      },
    },
  ];
  const struck = applyDamage(
    billShot(mission, attacker, weapon, apAfter),
    target,
    damage,
    attacker.id,
  );
  events.push(...struck.events);
  if (!hit || !hasImpact(weapon.profile)) {
    return {
      state: struck.state,
      events,
      spawnerHit: target.kind === "spawner",
    };
  }
  const impact = resolveImpact(
    struck.state,
    attacker,
    weapon,
    target.pos,
    new Set([target.id]),
    { aimedAtTile: false, hit: true },
    ctx,
    tuning,
    deps,
  );
  return {
    state: impact.state,
    events: [...events, ...impact.events],
    spawnerHit: target.kind === "spawner" || impact.spawnerHit,
  };
}

/**
 * Rolls a validated shot at the ground (#1121). Draw order as for
 * `rollAttack`, less the target's own damage:
 *
 * ```
 *   1. chance(hitChance / 100)              hit?
 *   2. per blast victim, nextInt(band)      only on a hit
 *   3. per reached tile, chance(effect)     only on a hit, for a weapon with an effect
 * ```
 *
 * Emits `BlastResolved` always — hit or miss, so the log and the map can
 * say where the shell went — and, on a hit, whatever the blast, the
 * demolition and the fire produce. A miss at an empty tile costs the
 * shot and does nothing else, as the rule says.
 */
export function rollTileAttack(
  mission: TacticalState,
  checked: TileAttackPair,
  ctx: TacticalContext,
  tuning: CombatTuning,
  apAfter: number,
  deps: AttackDeps,
): AttackRoll {
  const { attacker, weapon, impact, terrain } = checked;
  const chance = hitChance(weapon.profile, terrain, tuning);
  const hit = ctx.rng.chance(chance / 100);
  const billed = billShot(mission, attacker, weapon, apAfter);
  return resolveImpact(
    billed,
    attacker,
    weapon,
    impact,
    new Set(),
    { aimedAtTile: true, hit },
    ctx,
    tuning,
    deps,
  );
}

/** How the shot was aimed, for the blast's event. */
interface ImpactAim {
  readonly aimedAtTile: boolean;
  readonly hit: boolean;
}

/**
 * Everything a shot does around where it landed (#1121), in order:
 *
 * ```
 *   footprint = blastFootprint(map, impact, radius)
 *   1. victims   every unit and spawner in it but the attacker and `exclude`,
 *                each rolled in blastDamageRange, dead ones announced   ──► BlastResolved
 *   2. demolish  props and walls the weapon's force can take            ──► StructureDestroyed…
 *   3. ignite    the weapon's effect over the footprint that remains    ──► EffectStarted…
 * ```
 *
 * On a miss only the event is emitted, and only for a shot aimed at the
 * ground — a missed shot at a unit already has its `AttackResolved`.
 * The attacker never damages itself: a brute's sweep does not cut the
 * brute, and a mortar's crew is behind the tube.
 */
function resolveImpact(
  mission: TacticalState,
  attacker: Unit,
  weapon: UnitWeapon,
  impact: TileCoord,
  exclude: ReadonlySet<string>,
  aim: ImpactAim,
  ctx: TacticalContext,
  tuning: CombatTuning,
  deps: AttackDeps,
): AttackRoll {
  const profile = weapon.profile;
  const index = new TileIndex(mission.map);
  const radius = blastRadiusOf(profile);
  const footprint = blastFootprint(mission.map, impact, radius, index);
  let state = mission;
  const events: TacticalEvent[] = [];
  const victims: BlastVictimHit[] = [];
  let spawnerHit = false;
  if (aim.hit) {
    const spared = new Set([...exclude, attacker.id]);
    for (const { target, distance } of blastVictims(
      mission,
      footprint,
      spared,
    )) {
      const band = blastDamageRange(profile, distance, target.armor, tuning);
      const damage = band[1] <= 0 ? 0 : ctx.rng.nextInt(band[0], band[1]);
      const hp = Math.max(0, target.hp - damage);
      victims.push({ targetId: target.id, kind: target.kind, damage, hp });
      spawnerHit ||= target.kind === "spawner";
      const struck = applyDamage(state, target, damage, attacker.id);
      state = struck.state;
      events.push(...struck.events);
    }
  }
  if (aim.aimedAtTile || radius > 0) {
    events.push({
      type: BLAST_RESOLVED,
      payload: {
        attackerId: attacker.id,
        impact,
        hit: aim.hit,
        radius,
        aimedAtTile: aim.aimedAtTile,
        weaponRange: profile.range,
        victims,
      },
    });
  }
  if (!aim.hit) {
    return { state, events, spawnerHit };
  }
  const force = demoForceOf(profile);
  if (force > 0) {
    const fallen = demolish(
      state.map,
      footprint.map((entry) => entry.tile),
      force,
      deps.structures,
      deps.demolition,
      index,
    );
    state = { ...state, map: fallen.map };
    for (const prop of fallen.props) {
      events.push({
        type: STRUCTURE_DESTROYED,
        payload: {
          unitId: attacker.id,
          tile: prop.tile,
          structure: { kind: "prop", propId: prop.id, propKind: prop.kind },
        },
      });
    }
    for (const wall of fallen.walls) {
      events.push({
        type: STRUCTURE_DESTROYED,
        payload: {
          unitId: attacker.id,
          tile: wall.tile,
          structure: { kind: "wall", side: wall.side, wallKind: wall.kind },
        },
      });
    }
  }
  if (profile.aoeEffect !== undefined) {
    const lit = ignite(
      state,
      footprint.map(sitesOf),
      profile.aoeEffect,
      attacker.id,
      ctx,
      deps.hazards,
    );
    state = lit.state;
    events.push(...lit.events);
  }
  return { state, events, spawnerHit };
}

/** A footprint entry as the ignition service reads it. */
function sitesOf(entry: BlastTile): { tile: TileCoord; distance: number } {
  return {
    tile: { x: entry.tile.x, y: entry.tile.y, z: entry.tile.z },
    distance: entry.distance,
  };
}

/** The mission with the attacker's action points and charge spent. */
function billShot(
  mission: TacticalState,
  attacker: Unit,
  weapon: UnitWeapon,
  apAfter: number,
): TacticalState {
  return {
    ...mission,
    units: mission.units.map((unit): Unit =>
      unit.id === attacker.id
        ? {
            ...unit,
            ap: apAfter,
            ...spendCharge(unit, weapon),
          }
        : unit,
    ),
  };
}

/**
 * Takes `damage` off `target`, wherever it lives: a spawner through
 * `damageSpawner`, the one rule for that; a unit by its hit points, with
 * `UnitDied` when they reach zero. Zero damage changes nothing.
 */
function applyDamage(
  mission: TacticalState,
  target: AttackTarget,
  damage: number,
  attackerId: UnitId,
): TacticalApplied<TacticalState> {
  // Where the damage lands is the one thing the target's kind decides.
  if (target.kind === "spawner") {
    return damageSpawner(mission, target.id, damage, attackerId);
  }
  if (damage <= 0) {
    return { state: mission, events: [] };
  }
  const hp = Math.max(0, target.hp - damage);
  const events: TacticalEvent[] = [];
  if (target.hp > 0 && hp === 0) {
    events.push({
      type: UNIT_DIED,
      payload: { unitId: target.id, killerId: attackerId },
    });
  }
  return {
    state: {
      ...mission,
      units: mission.units.map((unit): Unit =>
        unit.id === target.id ? { ...unit, hp } : unit,
      ),
    },
    events,
  };
}

/**
 * How many more times a unit could attack this turn (#533).
 *
 * ```
 *   ap < cost                 ──► 0
 *   attack ends the turn      ──► 1     one shot, whatever is left
 *   otherwise                 ──► ⌊ap / cost⌋
 * ```
 *
 * Derived rather than stored, so the HUD never has to know which kinds
 * fire twice: an infantry squad with two actions reports 2, a mech with
 * two reports 1, and a spent unit reports 0.
 */
export function attacksRemaining(
  unit: Pick<Unit, "kind" | "ap">,
  tuning: CombatTuning,
): number {
  if (tuning.attackApCost <= 0 || unit.ap < tuning.attackApCost) {
    return 0;
  }
  return tuning.attackEndsTurn[unit.kind]
    ? 1
    : Math.floor(unit.ap / tuning.attackApCost);
}

/**
 * Resolves an `Attack` command: validates it, then rolls it with the
 * attacker paying `attackApCost`, or every remaining action point when
 * attacks end the turn for its kind — which is how an infantry squad
 * gets two shots and a mech one (#533). Rolls against exactly the numbers
 * `previewAttack` shows. When the shot destroyed an egg spawner and that
 * completed the last objective, the mission ends here rather than at the
 * next turn boundary, the way `Interact` ends it (#426). Pure: on any
 * error the mission is returned untouched.
 *
 * A command carrying `tile` instead of `targetId` is a shot at the
 * ground (#1121), validated by `validateTileAttack` and rolled by
 * `rollTileAttack`; one carrying neither, or both, is refused.
 */
export function resolveAttack(
  mission: TacticalState,
  command: AttackCommand,
  ctx: TacticalContext,
  tuning: CombatTuning,
  deps: AttackDeps,
): TacticalOutcome {
  const { attackerId, targetId, tile, weaponId } = command.payload;
  if ((targetId === undefined) === (tile === undefined)) {
    return err({ kind: "no-aim", unitId: attackerId });
  }
  if (tile !== undefined) {
    const checked = validateTileAttack(
      mission,
      attackerId,
      tile,
      tuning,
      weaponId,
    );
    if (!checked.ok) {
      return checked;
    }
    const applied = rollTileAttack(
      mission,
      checked.value,
      ctx,
      tuning,
      apAfterShot(checked.value.attacker, tuning),
      deps,
    );
    return ok(settle(applied));
  }
  const checked = validateAttack(
    mission,
    attackerId,
    targetId!,
    tuning,
    weaponId,
  );
  if (!checked.ok) {
    return checked;
  }
  const applied = rollAttack(
    mission,
    checked.value,
    ctx,
    tuning,
    apAfterShot(checked.value.attacker, tuning),
    deps,
  );
  return ok(settle(applied));
}

/** What a shot leaves the attacker: one action less, or none when its kind's attack ends the turn. */
function apAfterShot(attacker: Unit, tuning: CombatTuning): number {
  return tuning.attackEndsTurn[attacker.kind]
    ? 0
    : Math.max(0, attacker.ap - tuning.attackApCost);
}

/**
 * Shooting the last spawner wins the mission there and then, exactly as
 * planting charges on it does; a shot at a unit still waits for the
 * turn boundary, which is where a squad wipe has always been noticed.
 * A blast that reached a spawner counts as shooting it (#1121).
 */
function settle(applied: AttackRoll): TacticalApplied<TacticalState> {
  return applied.spawnerHit
    ? endIfOver(applied.state, applied.events)
    : { state: applied.state, events: applied.events };
}

/** The `Attack` handler for `registerTacticalCommands`, closed over the tuning and the content. */
export function createAttackHandler(
  tuning: CombatTuning,
  deps: AttackDeps,
): TacticalHandler<AttackCommand> {
  return (mission, command, ctx) =>
    resolveAttack(mission, command, ctx, tuning, deps);
}
