import { err, ok } from "../../core/model/result";
import type { Result } from "../../core/model/result";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { AttackPreview } from "../model/attack-preview";
import { CHARGE_DETONATED } from "../model/charge-detonated-event";
import { CHARGE_PLACED } from "../model/charge-placed-event";
import type { CombatTuning } from "../model/combat-tuning";
import type {
  EquipmentCatalogue,
  EquipmentDefinition,
  EquipmentId,
  PlacedCharge,
} from "../model/equipment";
import { DEFAULT_CHARGE_DELAY_TURNS } from "../model/equipment";
import { CHARGE_ID_PREFIX, usesLeftOf } from "../model/equipment";
import { EQUIPMENT_USED } from "../model/equipment-used-event";
import type { HealPreview } from "../model/heal-preview";
import type { RadarTuning } from "../model/radar";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";
import type { UnitWeapon } from "../model/unit-weapon";
import type { UseEquipmentCommand } from "../model/use-equipment-command";
import { actingUnit } from "./acting-unit";
import type { AttackTerrain } from "./attack-formulae";
import { damageRange, hitChance } from "./attack-formulae";
import type { AttackDeps, PreviewDeps } from "./combat-service";
import {
  attackTerrain,
  blastPreview,
  resolveBlastAt,
  terrainForTile,
} from "./combat-service";
import { footprintSizeOf } from "./footprint-service";
import { healReach, resolveHealAt } from "./heal-service";
import { endIfOver } from "./mission-end-service";
import type { MoveGraph } from "./movement-service";
import { buildMoveGraph } from "./movement-service";
import { placeRadar, validateRadarSite } from "./radar-service";
import { hasLineOfSight } from "./sight-service";
import type { PhaseStep } from "./turn-service";
import { closestTiles } from "./weapon-reach-service";

// ===========================================
// Constants
// ===========================================

/** What the preview quotes for a placed charge: it goes off, it does not roll. */
const CERTAIN_HIT_CHANCE = 100;

// ===========================================
// Types
// ===========================================

/**
 * What deciding and previewing a use needs (#1132): the catalogue and
 * the combat knobs. The wheel and the card take only this.
 */
export interface EquipmentRules {
  readonly catalogue: EquipmentCatalogue;
  readonly combat: CombatTuning;
}

/** What resolving a use needs beyond the rules. Ports, never data modules. */
export interface EquipmentDeps extends EquipmentRules {
  /** What a blast can break and leave burning, as the shot rules take it. */
  readonly attack: AttackDeps;
  /** Scan radius and battery for a placed dish. */
  readonly radar: RadarTuning;
}

/** One item a unit carries, with what it has left of it. */
export interface EquipmentCarried {
  readonly definition: EquipmentDefinition;
  readonly usesLeft: number;
}

/** A use the rules have accepted: who, what, with how many left, and the terrain for a thrown item. */
export interface EquipmentUse {
  readonly unit: Unit;
  readonly definition: EquipmentDefinition;
  /** Uses left before this one. Positive. */
  readonly usesLeft: number;
  /** The tile the unit acts from: the tile of its block nearest the target (#1130). */
  readonly from: TileCoord;
  /** Cover, distance and elevation to the tile; absent for a radar, which is carried not thrown. */
  readonly terrain?: AttackTerrain;
}

// ===========================================
// Queries
// ===========================================

/**
 * Whether the unit's frozen template lists the item (#1132). A bug or a
 * mech carries nothing; a squad carries what its type gave it.
 */
export function carriesEquipment(
  mission: TacticalState,
  unit: Unit,
  equipmentId: EquipmentId,
): boolean {
  return (mission.templates[unit.templateId]?.equipment ?? []).includes(
    equipmentId,
  );
}

/**
 * Every item the unit carries, with its uses left, in the template's
 * order: what the card lists and the wheel offers. Ids the catalogue
 * does not know are skipped, so a template from a newer build does not
 * break an older one.
 */
export function equipmentOf(
  template: Pick<UnitTemplate, "equipment"> | undefined,
  unit: Unit,
  catalogue: EquipmentCatalogue,
): readonly EquipmentCarried[] {
  return (template?.equipment ?? []).flatMap((id) => {
    const definition = catalogue.get(id);
    return definition === undefined
      ? []
      : [{ definition, usesLeft: usesLeftOf(unit, definition) }];
  });
}

// ===========================================
// Validation
// ===========================================

/**
 * Checks a use is legal (#1132): the mission running, the unit standing
 * on the acting side with the action points the item costs, carrying it
 * with a use left; then the site by kind — a dish where a scanner may be
 * put (`validateRadarSite`), a grenade or a charge on a tile within the
 * item's range, measured in three dimensions, that the unit can see; a
 * medkit or a repair kit the same throw, and then somebody in its
 * footprint it can mend (#1138) — a kit spent on nothing is refused
 * rather than counted.
 *
 * ```
 *   unit   ──► unit-not-on-map · unit-dead · wrong-phase · no-action-points
 *   item   ──► no-equipment · equipment-spent
 *   radar  ──► radar-out-of-reach · radar-tile-blocked
 *   blast  ──► no-such-tile · out-of-range · tile-out-of-sight
 *   charge ──► the same as a blast
 *   heal   ──► the same as a blast, then nothing-to-heal
 * ```
 *
 * The one predicate the wheel and the handler share, so an entry the
 * wheel opens is a use the rules accept.
 *
 * @param mission - The mission.
 * @param unitId - The unit that would act.
 * @param equipmentId - Which of its items.
 * @param tile - Where.
 * @param deps - The catalogue and the tunings.
 * @param graph - Traversal structures for a dish's walk; built when absent.
 * @returns What was checked, for the handler and the preview.
 */
export function validateEquipmentUse(
  mission: TacticalState,
  unitId: UnitId,
  equipmentId: EquipmentId,
  tile: TileCoord,
  deps: EquipmentRules,
  graph?: MoveGraph,
): Result<EquipmentUse, TacticalError> {
  if (mission.outcome !== undefined) {
    return err({ kind: "mission-over", outcome: mission.outcome });
  }
  const definition = deps.catalogue.get(equipmentId);
  if (definition === undefined) {
    return err({ kind: "no-equipment", unitId, equipmentId });
  }
  const acting = actingUnit(mission, unitId, definition.apCost);
  if (!acting.ok) {
    return acting;
  }
  const unit = acting.value;
  if (!carriesEquipment(mission, unit, equipmentId)) {
    return err({ kind: "no-equipment", unitId, equipmentId });
  }
  const usesLeft = usesLeftOf(unit, definition);
  if (usesLeft <= 0) {
    return err({ kind: "equipment-spent", unitId, equipmentId });
  }
  if (definition.kind === "radar") {
    const site = validateRadarSite(
      mission,
      unit,
      tile,
      definition.range,
      graph ?? buildMoveGraph(mission.map),
    );
    return site.ok ? ok({ unit, definition, usesLeft, from: unit.pos }) : site;
  }
  const index = new TileIndex(mission.map);
  const impact = index.getAt(tile);
  if (impact === undefined) {
    return err({ kind: "no-such-tile", x: tile.x, y: tile.y, z: tile.z });
  }
  const template = mission.templates[unit.templateId];
  const { from } = closestTiles(
    unit.pos,
    template === undefined ? 1 : footprintSizeOf(template),
    impact,
    1,
  );
  const terrain = terrainForTile(
    attackTerrain(mission.map, from, impact, index),
  );
  if (terrain.distance > definition.range) {
    return err({
      kind: "out-of-range",
      distance: terrain.distance,
      range: definition.range,
    });
  }
  if (!hasLineOfSight(mission.map, from, impact, index)) {
    return err({ kind: "tile-out-of-sight", x: tile.x, y: tile.y, z: tile.z });
  }
  if (
    definition.kind === "heal" &&
    (definition.heal === undefined ||
      healReach(mission, unit, definition.heal, tile, index).beneficiaries
        .length === 0)
  ) {
    return err({ kind: "nothing-to-heal", unitId, equipmentId });
  }
  return ok({ unit, definition, usesLeft, from, terrain });
}

/**
 * The numbers for a thrown or placed item at `tile` (#1132), or why it
 * is refused, for the wheel and the footprint overlay: a grenade rolls
 * the same hit formula as a shot at the ground, a charge cannot miss,
 * and the blast says who stands in it — the unit itself included for a
 * charge, which spares nobody. A radar dish has no numbers to preview
 * and is refused as `no-area-weapon`.
 *
 * @param mission - The mission.
 * @param unitId - The unit that would act.
 * @param equipmentId - Which of its items.
 * @param tile - Where.
 * @param deps - The catalogue and the tunings.
 * @param preview - The content a blast preview asks about what would fall.
 * @returns The preview, or the refusal.
 */
export function previewEquipmentUse(
  mission: TacticalState,
  unitId: UnitId,
  equipmentId: EquipmentId,
  tile: TileCoord,
  deps: EquipmentRules,
  preview?: PreviewDeps,
): Result<AttackPreview, TacticalError> {
  const checked = validateEquipmentUse(
    mission,
    unitId,
    equipmentId,
    tile,
    deps,
  );
  if (!checked.ok) {
    return checked;
  }
  const { unit, definition, terrain } = checked.value;
  if (
    definition.kind === "radar" ||
    definition.profile === undefined ||
    terrain === undefined
  ) {
    return err({ kind: "no-area-weapon", unitId });
  }
  const profile = definition.profile;
  return ok({
    // A placed charge is not a shot: the detonation rolls no hit, so the
    // preview says so rather than quoting the ceiling a shot would have.
    hitChance:
      definition.kind === "charge"
        ? CERTAIN_HIT_CHANCE
        : hitChance(profile, terrain, deps.combat),
    damage: damageRange(profile, 0, deps.combat),
    distance: terrain.distance,
    cover: terrain.cover,
    flanked: terrain.flanked,
    elevation: terrain.elevation,
    blast: blastPreview(
      mission,
      profile,
      tile,
      definition.kind === "charge" ? new Set() : new Set([unit.id]),
      deps.combat,
      preview,
    ),
  });
}

/**
 * What a medkit or a repair kit would do at `tile` (#1138), or why it
 * is refused, for the wheel's Heal entry and the footprint overlay: the
 * area it reaches, everyone in it who would be mended and by how much,
 * and how many of the right side and make were already whole. Anything
 * that is not a heal is refused as `no-area-weapon`, the mirror of what
 * `previewEquipmentUse` says to a kit.
 *
 * @param mission - The mission.
 * @param unitId - The unit that would act.
 * @param equipmentId - Which of its items.
 * @param tile - Where.
 * @param deps - The catalogue and the tunings.
 * @returns The preview, or the refusal.
 */
export function previewHealUse(
  mission: TacticalState,
  unitId: UnitId,
  equipmentId: EquipmentId,
  tile: TileCoord,
  deps: EquipmentRules,
): Result<HealPreview, TacticalError> {
  const checked = validateEquipmentUse(
    mission,
    unitId,
    equipmentId,
    tile,
    deps,
  );
  if (!checked.ok) {
    return checked;
  }
  const { unit, definition } = checked.value;
  if (definition.kind !== "heal" || definition.heal === undefined) {
    return err({ kind: "no-area-weapon", unitId });
  }
  const reach = healReach(mission, unit, definition.heal, tile);
  return ok({
    amount: definition.heal.amount,
    radius: definition.heal.radius,
    tiles: reach.footprint.map(({ tile: t }) => ({ x: t.x, y: t.y, z: t.z })),
    beneficiaries: reach.beneficiaries.map((b) => ({
      id: b.unit.id,
      name: mission.templates[b.unit.templateId]?.name ?? b.unit.id,
      distance: b.distance,
      amount: b.amount,
      hpAfter: b.hpAfter,
    })),
    alreadyWhole: reach.alreadyWhole,
  });
}

/**
 * The tiles an item would reach around `tile` (#1132, #1138), whatever
 * it does there: a blast's or a charge's footprint from its attack
 * preview, a kit's from its heal preview, nothing for a radar dish or a
 * refused use. The one question the overlay asks, so it needs no branch
 * of its own on the item's kind.
 *
 * @param mission - The mission.
 * @param unitId - The unit that would act.
 * @param equipmentId - Which of its items.
 * @param tile - Where.
 * @param deps - The catalogue and the tunings.
 * @param preview - The content a blast preview asks about what would fall.
 * @returns The reached tiles, impact first, or none.
 */
export function equipmentFootprintTiles(
  mission: TacticalState,
  unitId: UnitId,
  equipmentId: EquipmentId,
  tile: TileCoord,
  deps: EquipmentRules,
  preview?: PreviewDeps,
): readonly TileCoord[] {
  if (deps.catalogue.get(equipmentId)?.kind === "heal") {
    const heal = previewHealUse(mission, unitId, equipmentId, tile, deps);
    return heal.ok ? heal.value.tiles : [];
  }
  const blast = previewEquipmentUse(
    mission,
    unitId,
    equipmentId,
    tile,
    deps,
    preview,
  );
  return blast.ok ? (blast.value.blast?.tiles ?? []) : [];
}

// ===========================================
// Handler
// ===========================================

/**
 * The `UseEquipment` handler (#1132): validates, bills the action and
 * the use, announces the use, then does what the item does.
 *
 * ```
 *   UseEquipment ──► EquipmentUsed { usesLeft }
 *                    ├─ radar  ──► RadarDeployed                    (placeRadar)
 *                    ├─ blast  ──► [UnitDied…] BlastResolved [StructureDestroyed…] [EffectStarted…]
 *                    │             the same run a shot at the ground emits, delivery "thrown"
 *                    ├─ charge ──► ChargePlaced { detonatesOnTurn: turn + delay }
 *                    └─ heal   ──► UnitsHealed { healed… }        (resolveHealAt, #1138)
 * ```
 *
 * A grenade that reaches the last spawner ends the mission as a shot
 * would. Using an item never ends the turn: it costs the item's action
 * points and no more.
 */
export function createUseEquipmentHandler(
  deps: EquipmentDeps,
): TacticalHandler<UseEquipmentCommand> {
  return (mission, command, ctx) => {
    const { unitId, equipmentId, tile } = command.payload;
    const checked = validateEquipmentUse(
      mission,
      unitId,
      equipmentId,
      tile,
      deps,
    );
    if (!checked.ok) {
      return checked;
    }
    const { unit, definition, usesLeft, terrain } = checked.value;
    const remaining = usesLeft - 1;
    const billed: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === unit.id
          ? {
              ...u,
              ap: u.ap - definition.apCost,
              equipment: { ...u.equipment, [definition.id]: remaining },
            }
          : u,
      ),
    };
    const used: TacticalEvent = {
      type: EQUIPMENT_USED,
      payload: {
        unitId: unit.id,
        equipmentId: definition.id,
        name: definition.name,
        tile: { x: tile.x, y: tile.y, z: tile.z },
        usesLeft: remaining,
      },
    };
    switch (definition.kind) {
      case "radar": {
        const placed = placeRadar(billed, unit, tile, deps.radar, ctx.ids);
        return ok({ state: placed.state, events: [used, ...placed.events] });
      }
      case "blast": {
        if (definition.profile === undefined || terrain === undefined) {
          return err({ kind: "no-equipment", unitId, equipmentId });
        }
        const chance = hitChance(definition.profile, terrain, deps.combat);
        const hit = ctx.rng.chance(chance / 100);
        const blast = resolveBlastAt(
          billed,
          unit.id,
          new Set([unit.id]),
          weaponFor(definition),
          tile,
          {
            aimedAtTile: true,
            hit,
            source: definition.name.toLowerCase(),
            delivery: "thrown",
          },
          ctx,
          deps.combat,
          deps.attack,
        );
        const events = [used, ...blast.events];
        return ok(
          blast.spawnerHit
            ? endIfOver(blast.state, events)
            : { state: blast.state, events },
        );
      }
      case "charge": {
        const charge: PlacedCharge = {
          id: ctx.ids.nextId(CHARGE_ID_PREFIX),
          ownerId: unit.id,
          equipmentId: definition.id,
          tile: { x: tile.x, y: tile.y, z: tile.z },
          detonatesOnTurn:
            mission.turn +
            (definition.delayTurns ?? DEFAULT_CHARGE_DELAY_TURNS),
        };
        return ok({
          state: { ...billed, charges: [...billed.charges, charge] },
          events: [used, { type: CHARGE_PLACED, payload: { charge } }],
        });
      }
      case "heal": {
        if (definition.heal === undefined) {
          return err({ kind: "no-equipment", unitId, equipmentId });
        }
        // Cannot miss and rolls nothing: the validation already found
        // somebody to mend, so the kit is spent on them.
        const healed = resolveHealAt(
          billed,
          unit.id,
          definition.id,
          definition.heal,
          tile,
        );
        return ok({ state: healed.state, events: [used, ...healed.events] });
      }
    }
  };
}

// ===========================================
// Detonation
// ===========================================

/**
 * Sets off every charge whose turn has come, as the **player** phase
 * opens (#1132). A phase step for `createEndTurnHandler`, run after the
 * radars drain and before the fires burn: placed on turn T, a charge
 * with a delay of two goes off as turn T+2 opens (#1134), so the squad
 * that set it had the rest of turn T and all of turn T+1 to step away,
 * and a bug that walked onto it during either of its phases is standing
 * on it now.
 *
 * ```
 *   player phase opens ──► for each charge with detonatesOnTurn ≤ turn, in order set:
 *                              ChargeDetonated, then the blast's run (delivery "placed")
 *                          charges not yet due stay
 *   bugs phase opens   ──► unchanged
 * ```
 *
 * The blast spares nobody — friendly fire is real — and cannot miss;
 * kills are the owner's, on the map or not. A charge that finishes the
 * last spawner ends the mission there and then.
 *
 * @param deps - The catalogue and the tunings.
 * @returns The step.
 */
export function createDetonateStep(deps: EquipmentDeps): PhaseStep {
  return (mission, ctx) => {
    if (mission.phase !== "player" || mission.charges.length === 0) {
      return { state: mission, events: [] };
    }
    const due = mission.charges.filter(
      (charge) => charge.detonatesOnTurn <= mission.turn,
    );
    if (due.length === 0) {
      return { state: mission, events: [] };
    }
    let state: TacticalState = {
      ...mission,
      charges: mission.charges.filter(
        (charge) => charge.detonatesOnTurn > mission.turn,
      ),
    };
    const events: TacticalEvent[] = [];
    let spawnerHit = false;
    for (const charge of due) {
      events.push({
        type: CHARGE_DETONATED,
        payload: {
          chargeId: charge.id,
          ownerId: charge.ownerId,
          tile: charge.tile,
        },
      });
      const definition = deps.catalogue.get(charge.equipmentId);
      if (definition?.profile === undefined) {
        continue;
      }
      const blast = resolveBlastAt(
        state,
        charge.ownerId,
        new Set(),
        weaponFor(definition),
        charge.tile,
        {
          aimedAtTile: true,
          hit: true,
          source: definition.name.toLowerCase(),
          delivery: "placed",
        },
        ctx,
        deps.combat,
        deps.attack,
      );
      state = blast.state;
      events.push(...blast.events);
      spawnerHit ||= blast.spawnerHit;
    }
    return spawnerHit ? endIfOver(state, events) : { state, events };
  };
}

// ===========================================
// Helpers
// ===========================================

/** The item as the blast rules read a weapon: its name and its profile. */
function weaponFor(definition: EquipmentDefinition): UnitWeapon {
  return {
    id: `equipment:${definition.id}`,
    name: definition.name,
    profile: definition.profile ?? {
      range: definition.range,
      accuracy: 0,
      damage: 0,
      armorPen: 0,
    },
  };
}
