import { manhattanDistance } from "../../../core/service/grid-math";
import { CoverLevel } from "../../../mapgen/model/cover";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { AttackPreview } from "../../model/attack-preview";
import type { EquipmentId } from "../../model/equipment";
import type { ObjectiveTuning } from "../../model/objective-tuning";
import type { Unit, UnitId } from "../../model/unit";
import type { WeaponId } from "../../model/unit-weapon";
import { previewAttack, weaponOptions } from "../combat-service";
import type { EquipmentRules } from "../equipment-service";
import {
  equipmentOf,
  previewEquipmentUse,
  previewHealUse,
} from "../equipment-service";
import { unitFootprintSize } from "../footprint-service";
import { movePerAction } from "../movement-service";
import { coverAgainst } from "../sight-service";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// Reading the attack card (#1179)
// ===========================================
//
// What a player sees before committing: the wheel's per-target card
// (hit chance, damage band, who else the blast reaches) and the ground's
// cover. Every number here comes from the rules' own previews, so a
// modelled player weighs a shot exactly as the HUD prices it, and only
// against enemies the side has spotted.
//
//   unit ──► shotOptions ──► [ weapon × spotted enemy ] ──► AttackPreview
//        └─► throwOptions ──► [ grenade × spotted enemy tile ] ──► blast
//   tile ──► exposure ──► cover against each spotted shooter, threats in reach

/** The rules a modelled player reads its numbers from. Ports, never data modules. */
export interface PlayerRules extends EquipmentRules {
  readonly objective: ObjectiveTuning;
}

/** One shot the wheel would offer, priced. */
export interface ShotOption {
  readonly attackerId: UnitId;
  readonly targetId: UnitId;
  readonly weaponId: WeaponId;
  readonly preview: AttackPreview;
  /** Hit chance times the band's mean. */
  readonly expected: number;
  /** The chance this one shot kills: hit chance times the share of the band at or above the target's hit points. */
  readonly killChance: number;
  /** Whether the blast reaches a unit of ours besides the target. */
  readonly friendlyFire: boolean;
  /** The target's hit points now. */
  readonly targetHp: number;
}

/** One grenade throw, priced over the spotted enemies it reaches. */
export interface ThrowOption {
  readonly equipmentId: EquipmentId;
  readonly tile: TileCoord;
  /** Expected damage summed over the spotted enemies in the blast, the target included. */
  readonly value: number;
  /** Spotted enemies the blast reaches. */
  readonly enemies: number;
  /** Whether the blast reaches a unit of ours. */
  readonly friendlyFire: boolean;
}

/** One heal, priced by what it mends. */
export interface HealOption {
  readonly equipmentId: EquipmentId;
  readonly tile: TileCoord;
  /** Hit points mended across everyone it reaches. */
  readonly mended: number;
}

// ===========================================
// Shots
// ===========================================

/**
 * Every shot `unit` could take now at a spotted enemy, one per ready
 * weapon and target the rules accept, as the attack card prices it.
 */
export function shotOptions(
  view: PlayerView,
  unit: Unit,
  rules: PlayerRules,
): readonly ShotOption[] {
  const ready = weaponOptions(view.mission, unit.id, rules.combat).filter(
    (option) => option.ready,
  );
  if (ready.length === 0 || view.enemies.length === 0) {
    return [];
  }
  const options: ShotOption[] = [];
  for (const weapon of ready) {
    for (const enemy of view.enemies) {
      const preview = previewAttack(
        view.mission,
        unit.id,
        enemy.id,
        rules.combat,
        weapon.weapon.id,
      );
      if (!preview.ok) {
        continue;
      }
      options.push(priceShot(unit.id, preview.value, enemy, weapon.weapon.id));
    }
  }
  return options;
}

/**
 * The shot at an egg spawner or other objective target by id, when the
 * rules accept one: a player shoots a nest it can see as readily as a bug.
 */
export function shotAtTarget(
  view: PlayerView,
  unit: Unit,
  targetId: string,
  targetHp: number,
  rules: PlayerRules,
): ShotOption | undefined {
  let best: ShotOption | undefined;
  for (const weapon of weaponOptions(view.mission, unit.id, rules.combat)) {
    if (!weapon.ready) {
      continue;
    }
    const preview = previewAttack(
      view.mission,
      unit.id,
      targetId,
      rules.combat,
      weapon.weapon.id,
    );
    if (!preview.ok) {
      continue;
    }
    const option = priceShot(
      unit.id,
      preview.value,
      { id: targetId, hp: targetHp },
      weapon.weapon.id,
    );
    if (
      !option.friendlyFire &&
      (best === undefined || option.expected > best.expected)
    ) {
      best = option;
    }
  }
  return best;
}

/**
 * Whether a unit could fire at all this instant, target aside: at least
 * one weapon is ready. False when every weapon waits on a reload, a
 * vent or a cooldown, or the unit has no action left.
 */
export function canFire(
  view: PlayerView,
  unit: Unit,
  rules: PlayerRules,
): boolean {
  return weaponOptions(view.mission, unit.id, rules.combat).some(
    (option) => option.ready,
  );
}

/**
 * Whether a unit's weapons are waiting on the pool a reload refills:
 * none is ready, and at least one is refused for charges or heat.
 */
export function needsReload(
  view: PlayerView,
  unit: Unit,
  rules: PlayerRules,
): boolean {
  const options = weaponOptions(view.mission, unit.id, rules.combat);
  if (options.length === 0 || options.some((option) => option.ready)) {
    return false;
  }
  return options.some(
    (option) =>
      option.refusal?.kind === "no-charges" ||
      (option.refusal?.kind === "systems-unavailable" &&
        /heat/i.test(option.refusal.reason)),
  );
}

// ===========================================
// Equipment
// ===========================================

/**
 * Every throw of a blast item `unit` carries at a spotted enemy's tile,
 * priced over the spotted enemies the blast reaches.
 */
export function throwOptions(
  view: PlayerView,
  unit: Unit,
  rules: PlayerRules,
): readonly ThrowOption[] {
  const template = view.mission.templates[unit.templateId];
  const items = equipmentOf(template, unit, rules.catalogue).filter(
    (item) => item.definition.kind === "blast" && item.usesLeft > 0,
  );
  if (items.length === 0 || unit.ap < 1) {
    return [];
  }
  const spotted = new Map(view.enemies.map((enemy) => [enemy.id, enemy]));
  const options: ThrowOption[] = [];
  for (const item of items) {
    for (const enemy of view.enemies) {
      if (manhattanDistance(unit.pos, enemy.pos) > item.definition.range + 1) {
        continue;
      }
      const preview = previewEquipmentUse(
        view.mission,
        unit.id,
        item.definition.id,
        enemy.pos,
        rules,
      );
      if (!preview.ok) {
        continue;
      }
      const chance = preview.value.hitChance / 100;
      const [low, high] = preview.value.damage;
      const victims = preview.value.blast?.victims ?? [];
      let value = 0;
      let enemies = 0;
      let friendlyFire = false;
      for (const victim of victims) {
        if (victim.team === "tdf") {
          friendlyFire = true;
          continue;
        }
        if (!spotted.has(victim.id)) {
          continue;
        }
        enemies += 1;
        value += chance * ((victim.damage[0] + victim.damage[1]) / 2);
      }
      // The aimed tile itself: the enemy standing there takes the full band.
      if (!victims.some((victim) => victim.id === enemy.id)) {
        enemies += 1;
        value += chance * Math.min(enemy.hp, (low + high) / 2);
      }
      options.push({
        equipmentId: item.definition.id,
        tile: enemy.pos,
        value,
        enemies,
        friendlyFire,
      });
    }
  }
  return options;
}

/**
 * The heals `unit` could give now: a medkit or repair kit aimed at each
 * wounded unit of ours, priced by what it mends.
 */
export function healOptions(
  view: PlayerView,
  unit: Unit,
  rules: PlayerRules,
): readonly HealOption[] {
  const template = view.mission.templates[unit.templateId];
  const items = equipmentOf(template, unit, rules.catalogue).filter(
    (item) => item.definition.kind === "heal" && item.usesLeft > 0,
  );
  if (items.length === 0 || unit.ap < 1) {
    return [];
  }
  const wounded = view.force.filter((ally) => ally.hp < ally.maxHp);
  const options: HealOption[] = [];
  for (const item of items) {
    for (const ally of wounded) {
      if (manhattanDistance(unit.pos, ally.pos) > item.definition.range + 2) {
        continue;
      }
      const preview = previewHealUse(
        view.mission,
        unit.id,
        item.definition.id,
        ally.pos,
        rules,
      );
      if (!preview.ok) {
        continue;
      }
      const mended = preview.value.beneficiaries
        .filter((beneficiary) =>
          view.force.some((own) => own.id === beneficiary.id),
        )
        .reduce((sum, beneficiary) => sum + beneficiary.amount, 0);
      options.push({ equipmentId: item.definition.id, tile: ally.pos, mended });
    }
  }
  return options;
}

// ===========================================
// Ground
// ===========================================

/** How exposed a tile is to what the side has spotted. */
export interface Exposure {
  /** Cover summed over the spotted shooters in range of the tile: 0 none, 1 low, 2 high each. */
  readonly cover: number;
  /** Spotted shooters that could fire at the tile next bug phase. */
  readonly shooters: number;
  /** Spotted bugs that could close to melee with the tile next bug phase. */
  readonly biters: number;
}

/**
 * The exposure of `tile` to the spotted enemies: cover against each
 * shooter within its reach, and how many bugs could close on it. Reach
 * is the enemy's two actions of movement plus its weapon's range, the
 * way a player reads a bug's card.
 */
export function exposure(view: PlayerView, tile: TileCoord): Exposure {
  let cover = 0;
  let shooters = 0;
  let biters = 0;
  for (const enemy of view.enemies) {
    const template = view.mission.templates[enemy.templateId];
    if (template === undefined) {
      continue;
    }
    const range = Math.max(
      0,
      ...template.weapons.map((weapon) => weapon.profile.range),
    );
    const move = movePerAction(view.mission, enemy) * Math.max(1, enemy.maxAp);
    const size = unitFootprintSize(view.mission, enemy);
    const distance = manhattanDistance(enemy.pos, tile) - (size - 1);
    if (range > 1) {
      if (distance <= range + move) {
        shooters += 1;
        cover += coverAgainst(
          view.mission.map,
          tile,
          enemy.pos,
          view.graph.index,
        );
      }
    } else if (distance <= move + 1) {
      biters += 1;
    }
  }
  return { cover, shooters, biters };
}

/** Whether `tile` has any cover against the nearest spotted shooter, or any cover at all when none is spotted. */
export function coveredTile(view: PlayerView, tile: TileCoord): boolean {
  const index = view.graph.index;
  const probes = [
    { x: tile.x + 4, y: tile.y, z: tile.z },
    { x: tile.x - 4, y: tile.y, z: tile.z },
    { x: tile.x, y: tile.y, z: tile.z + 4 },
    { x: tile.x, y: tile.y, z: tile.z - 4 },
  ];
  return probes.some(
    (probe) =>
      coverAgainst(view.mission.map, tile, probe, index) !== CoverLevel.NONE,
  );
}

// ===========================================
// Private
// ===========================================

/** Prices one previewed shot at a target of `hp` hit points. */
function priceShot(
  attackerId: UnitId,
  preview: AttackPreview,
  target: { readonly id: string; readonly hp: number },
  weaponId: WeaponId,
): ShotOption {
  const chance = preview.hitChance / 100;
  const [low, high] = preview.damage;
  const band = high - low + 1;
  const killing =
    high < target.hp ? 0 : low >= target.hp ? band : high - target.hp + 1;
  return {
    attackerId,
    targetId: target.id,
    weaponId,
    preview,
    expected: chance * Math.min(target.hp, (low + high) / 2),
    killChance: band > 0 ? chance * (killing / band) : 0,
    friendlyFire: (preview.blast?.victims ?? []).some(
      (victim) => victim.team === "tdf",
    ),
    targetHp: target.hp,
  };
}
