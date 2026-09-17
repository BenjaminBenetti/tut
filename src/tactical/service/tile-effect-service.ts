import type { TileCoord } from "../../mapgen/model/tile-coord";
import { PassMask } from "../../mapgen/model/pass-mask";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { CombatTuning } from "../model/combat-tuning";
import { EFFECT_DAMAGED } from "../model/effect-damaged-event";
import { EFFECT_ENDED } from "../model/effect-ended-event";
import { EFFECT_STARTED } from "../model/effect-started-event";
import type { HazardTuning } from "../model/hazard-tuning";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { TileEffect } from "../model/tile-effect";
import { TILE_EFFECT_ID_PREFIX } from "../model/tile-effect";
import type { Team, Unit, UnitId } from "../model/unit";
import type { AreaEffect, WeaponProfile } from "../model/weapon-profile";
import { falloffShare } from "../model/weapon-profile";
import { footprintContains, unitFootprintSize } from "./footprint-service";
import { damageRange } from "./attack-formulae";
import { downedEvent } from "./downed-unit-event";
import { damageSpawner } from "./spawner-damage-service";
import type { PhaseStep } from "./turn-service";

// ===========================================
// Types
// ===========================================

/** A tile a blast reached, and how far from the impact, for ignition. */
export interface IgnitionSite {
  readonly tile: TileCoord;
  readonly distance: number;
}

// ===========================================
// Ignition
// ===========================================

/**
 * Lights what a blast leaves behind (#1121). Every reached tile that
 * something could stand on rolls the effect's chance less its falloff;
 * a tile that passes and is not already burning gets a new effect with
 * the tuning's clock, and one that is already burning has its clock
 * reset — one fire per tile, rekindled rather than stacked.
 *
 * ```
 *   for site in footprint order:
 *     pass NONE                         ──► skip (a car, water, rock)
 *     chance × falloffShare(distance)   ──► rng.chance
 *       burning already ──► phasesLeft ← duration,  EffectStarted { rekindled: true }
 *       otherwise       ──► new TileEffect,          EffectStarted
 * ```
 *
 * Draws one `chance` per candidate tile from `ctx.rng`, in footprint
 * order, whatever the outcome; ids come from `ctx.ids`.
 *
 * @param mission - The mission as it stands after the blast's damage and demolition.
 * @param footprint - The tiles the blast reached, impact first.
 * @param effect - The weapon's effect: kind, chance and falloff.
 * @param unitId - The unit whose shot did it, for the event.
 * @param ctx - The command's stream and id generator.
 * @param tuning - Clock per effect kind.
 */
export function ignite(
  mission: TacticalState,
  footprint: readonly IgnitionSite[],
  effect: AreaEffect,
  unitId: UnitId,
  ctx: TacticalContext,
  tuning: HazardTuning,
): TacticalApplied<TacticalState> {
  const index = new TileIndex(mission.map);
  const duration = tuning.effects[effect.kind].duration;
  const effects = [...mission.effects];
  const events: TacticalEvent[] = [];
  for (const site of footprint) {
    const tile = index.getAt(site.tile);
    if (tile === undefined || tile.pass === PassMask.NONE) {
      continue;
    }
    const chance = effect.chance * falloffShare(effect.falloff, site.distance);
    if (chance <= 0 || !ctx.rng.chance(Math.min(1, chance))) {
      continue;
    }
    const at = effects.findIndex(
      (existing) =>
        existing.kind === effect.kind && sameTile(existing.tile, site.tile),
    );
    if (at >= 0) {
      const existing = effects[at]!;
      effects[at] = { ...existing, phasesLeft: duration };
      events.push({
        type: EFFECT_STARTED,
        payload: {
          effectId: existing.id,
          kind: existing.kind,
          tile: existing.tile,
          unitId,
          rekindled: true,
        },
      });
      continue;
    }
    const lit: TileEffect = {
      id: ctx.ids.nextId(TILE_EFFECT_ID_PREFIX),
      kind: effect.kind,
      tile: { x: site.tile.x, y: site.tile.y, z: site.tile.z },
      phasesLeft: duration,
    };
    effects.push(lit);
    events.push({
      type: EFFECT_STARTED,
      payload: {
        effectId: lit.id,
        kind: lit.kind,
        tile: lit.tile,
        unitId,
        rekindled: false,
      },
    });
  }
  return { state: { ...mission, effects }, events };
}

// ===========================================
// Burning
// ===========================================

/**
 * Every tile effect takes its turn at the start of a phase (#1121):
 * the units of the side whose phase begins that stand in one burn, egg
 * spawners burn at the start of the bug phase, and each effect's clock
 * counts down one, removing it at zero.
 *
 * ```
 *   for effect in order:
 *     acting side's living units on its tile ──► damage, EffectDamaged, UnitDied at 0
 *     bug phase: undestroyed spawner on it   ──► damageSpawner (SpawnerDamaged, objective)
 *     phasesLeft − 1 ──► 0 ──► removed, EffectEnded
 * ```
 *
 * "Your turn starts in the fire" is the rule, not "you ended in it":
 * a side that walks into a fire during its own phase pays at the start
 * of its next, and can walk out during this one. That is the XCOM
 * shape, and it is what lets a player light a fire under a swarmer and
 * see it burn before the swarmer moves.
 *
 * Damage rolls in the combat tuning's band around the effect's damage,
 * less armor the effect cannot penetrate, from `ctx.rng.fork("hazard")`
 * in effect order so a spawn roll elsewhere never moves a burn.
 *
 * @param mission - The mission, with the new phase already set.
 * @param ctx - The phase's stream.
 * @param hazards - Damage and penetration per effect kind.
 * @param combat - The damage band and floor.
 */
export function burn(
  mission: TacticalState,
  ctx: TacticalContext,
  hazards: HazardTuning,
  combat: CombatTuning,
): TacticalApplied<TacticalState> {
  if (mission.effects.length === 0) {
    return { state: mission, events: [] };
  }
  const rng = ctx.rng.fork("hazard");
  const acting: Team = TEAM_FOR_PHASE[mission.phase];
  let state = mission;
  const events: TacticalEvent[] = [];
  const remaining: TileEffect[] = [];
  for (const effect of mission.effects) {
    const rule = hazards.effects[effect.kind];
    const profile: WeaponProfile = {
      range: 1,
      accuracy: 100,
      damage: rule.damage,
      armorPen: rule.armorPen,
    };
    for (const unit of state.units) {
      // A block burns when any tile of it is alight (#1130), once per fire.
      if (
        unit.hp <= 0 ||
        unit.team !== acting ||
        !footprintContains(
          unit.pos,
          unitFootprintSize(state, unit),
          effect.tile,
        )
      ) {
        continue;
      }
      const armor = state.templates[unit.templateId]?.armor ?? 0;
      const band = damageRange(profile, armor, combat);
      const damage = rng.nextInt(band[0], band[1]);
      const hp = Math.max(0, unit.hp - damage);
      state = {
        ...state,
        units: state.units.map((u): Unit =>
          u.id === unit.id ? { ...u, hp } : u,
        ),
      };
      events.push({
        type: EFFECT_DAMAGED,
        payload: {
          effectId: effect.id,
          kind: effect.kind,
          targetId: unit.id,
          targetKind: "unit",
          damage,
          hp,
        },
      });
      if (hp === 0) {
        events.push(downedEvent(unit));
      }
    }
    if (acting === "bugs") {
      for (const spawner of state.spawners) {
        if (
          spawner.destroyed ||
          spawner.hp <= 0 ||
          !sameTile(spawner.pos, effect.tile)
        ) {
          continue;
        }
        const band = damageRange(profile, 0, combat);
        const damage = rng.nextInt(band[0], band[1]);
        events.push({
          type: EFFECT_DAMAGED,
          payload: {
            effectId: effect.id,
            kind: effect.kind,
            targetId: spawner.id,
            targetKind: "spawner",
            damage,
            hp: Math.max(0, spawner.hp - damage),
          },
        });
        // The one rule for a spawner losing hit points; its actor field
        // names the effect, which is what did it.
        const hurt = damageSpawner(state, spawner.id, damage, effect.id);
        state = hurt.state;
        events.push(...hurt.events);
      }
    }
    const phasesLeft = effect.phasesLeft - 1;
    if (phasesLeft > 0) {
      remaining.push({ ...effect, phasesLeft });
    } else {
      events.push({
        type: EFFECT_ENDED,
        payload: { effectId: effect.id, kind: effect.kind, tile: effect.tile },
      });
    }
  }
  return { state: { ...state, effects: remaining }, events };
}

/** `burn` as a phase step for `createEndTurnHandler`, closed over the tunings. */
export function createBurnStep(
  hazards: HazardTuning,
  combat: CombatTuning,
): PhaseStep {
  return (mission, ctx) => burn(mission, ctx, hazards, combat);
}

// ===========================================
// Perception
// ===========================================

/**
 * The tile effects `team` knows about: those on ground it has seen
 * (ADR 0006 §2.4). A fire is a thing on the map, like a spawner, so the
 * renderer draws the ones on explored ground and none of the rest.
 */
export function perceivedEffects(
  mission: TacticalState,
  team: Team,
  index: TileIndex = new TileIndex(mission.map),
): readonly TileEffect[] {
  const known = new Set([
    ...(mission.vision[team]?.explored ?? []),
    ...(mission.vision[team]?.visible ?? []),
  ]);
  return mission.effects.filter((effect) =>
    known.has(index.keyOf(effect.tile)),
  );
}

// ===========================================
// Helpers
// ===========================================

/** True when both coordinates name the same tile, level included. */
function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}
