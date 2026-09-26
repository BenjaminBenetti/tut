import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { snapshotMap } from "../../mapgen/service/hatch-space";
import type { Mech } from "../../roster/model/mech";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { Squad } from "../../roster/model/squad";
import { SQUAD_MAX_STRENGTH } from "../../roster/model/squad";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { BugUnitSource } from "../model/bug-unit-source";
import type { CivilianTuning } from "../model/civilian";
import { CIVILIAN_SOURCE_ID } from "../model/civilian";
import type {
  PlaceableUnit,
  PlaceUnitCommand,
} from "../model/place-unit-command";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { PassClass, UnitKind } from "../model/unit";
import { passMaskFor } from "../model/unit";
import { UNIT_PLACED } from "../model/unit-placed-event";
import type { UnitTemplate } from "../model/unit-template";
import type { UnitTuning } from "../model/unit-tuning";
import { footprintSizeOf, footprintTiles } from "./footprint-service";
import { footprintFits, occupiedKeys } from "./movement-service";
import type { UnitBuild, UnitPlacement } from "./unit-factory";
import { bugUnit, civilianUnit, mechUnit, squadUnit } from "./unit-factory";
import { joinRescue } from "./missions/civilian-setup";

// ===========================================
// Types
// ===========================================

/** A mech the debug menu can field: a named loadout, no roster entry behind it. */
export interface DebugMechSource {
  /** What the command names it by, e.g. `"starter"`. */
  readonly id: string;
  /** What the menu calls it, e.g. `"Mech (starter)"`. */
  readonly name: string;
  readonly loadout: MechLoadout;
}

/** What placing a unit needs injected: the switch and the catalogues. */
export interface PlaceUnitDeps {
  /**
   * Whether this build offers the development tools at all (#1136).
   * The composition root passes `import.meta.env.DEV`; with it false
   * every placement is refused as `debug-disabled`, so a crafted command
   * in a production save cannot put a unit on the map.
   */
  readonly enabled: boolean;
  /** Every species that can be placed, by id. */
  readonly species: readonly BugUnitSource[];
  /** Every squad type that can be placed, by id. */
  readonly squadTypes: SquadTypeCatalogue;
  /** Every mech that can be placed, by id. */
  readonly mechs: readonly DebugMechSource[];
  /** A loadout's stat sheet, or undefined when it does not validate. */
  readonly sheetFor: (loadout: MechLoadout) => MechStatSheet | undefined;
  readonly unitTuning: UnitTuning;
  /**
   * What a placed civilian group is (campaign arc §6.4). Absent: the
   * menu offers no civilians and a civilian placement is refused as an
   * unknown type.
   */
  readonly civilian?: CivilianTuning;
}

/** Id prefixes for the roster records a placed squad or mech stands in for. */
export const DEBUG_SQUAD_ID_PREFIX = "debugsquad";
export const DEBUG_MECH_ID_PREFIX = "debugmech";

/**
 * What a resolved catalogue entry knows before anything is drawn from
 * the id generator: how much room it needs, and how to build it once
 * the room is confirmed. Resolving and building are split so a refused
 * placement consumes no id.
 */
interface PlacementSource {
  /** Tiles per side the unit will stand on. */
  readonly footprint: number;
  readonly passClass: PassClass;
  /** Builds the unit at the placement, drawing its ids. */
  readonly build: (placement: UnitPlacement, ids: IdGenerator) => UnitBuild;
  /**
   * What else the mission needs once the unit stands: a civilian group
   * joins the rescue, which is made when there is none. Absent: nothing.
   */
  readonly settle?: (
    state: TacticalState,
    unit: UnitBuild["unit"],
    ids: IdGenerator,
  ) => TacticalState;
}

// ===========================================
// Handler
// ===========================================

/**
 * `PlaceUnit` (#1136): the development tools' one command. Puts a unit
 * of a catalogue type on a tile of the live mission — a bug on the bugs'
 * side, a squad or a mech on the player's — at full health and full
 * action points, so from the next phase it acts like any unit that
 * deployed or hatched. No rule of the game produces it; it exists so a
 * playtest can stage an encounter without waiting for a spawner.
 *
 * ```
 *   enabled false                    ──► debug-disabled
 *   missionId ≠ mission.missionId    ──► mission-mismatch
 *   kind/id not in the catalogues    ──► unknown-unit-type
 *   no tile at `tile`                ──► no-such-tile
 *   footprint off the map, impassable
 *     for the class, or split by a wall ──► tile-blocked
 *   footprint overlaps a living unit
 *     or a live spawner              ──► tile-occupied
 *   otherwise ──► units + unit, templates ∪ template, UnitPlaced
 *                 (a civilian group: trapped, and joined to the rescue)
 * ```
 *
 * The refusal order puts the cheap checks first and draws an id only
 * once the tile is known to be free: a refused placement leaves the
 * campaign's id counters where they were. Vision is not touched here —
 * the lifting adapter recomputes both sides after every handler (ADR
 * 0006 §2.2), which is what makes a placed squad see and a placed bug
 * spottable.
 *
 * Pure: never mutates the mission, draws ids from `ctx` only, rolls
 * nothing.
 */
export function createPlaceUnitHandler(
  deps: PlaceUnitDeps,
): TacticalHandler<PlaceUnitCommand> {
  return (mission, command, ctx) => {
    if (!deps.enabled) {
      return err({ kind: "debug-disabled" });
    }
    const { missionId, kind, id, tile } = command.payload;
    if (missionId !== mission.missionId) {
      return err({
        kind: "mission-mismatch",
        expected: missionId,
        active: mission.missionId,
      });
    }
    const source = resolveSource(kind, id, deps);
    if (!source.ok) {
      return source;
    }
    const snapshot = snapshotMap(mission.map);
    if (snapshot.index.getAt(tile) === undefined) {
      return err({ kind: "no-such-tile", x: tile.x, y: tile.y, z: tile.z });
    }
    const { footprint, passClass } = source.value;
    const graph = { index: snapshot.index, reachability: snapshot.reach };
    if (!footprintFits(graph, tile, footprint, passMaskFor(passClass))) {
      return err({ kind: "tile-blocked", x: tile.x, y: tile.y, z: tile.z });
    }
    // The same occupancy a hatchling is held to (#1130): every tile a
    // living unit holds, and a live spawner's own tile.
    const taken = new Set(occupiedKeys(mission, snapshot.index));
    for (const spawner of mission.spawners) {
      if (!spawner.destroyed && snapshot.index.inBounds(spawner.pos)) {
        taken.add(snapshot.index.keyOf(spawner.pos));
      }
    }
    if (
      footprintTiles(tile, footprint).some((cell) =>
        taken.has(snapshot.index.keyOf(cell)),
      )
    ) {
      return err({ kind: "tile-occupied", x: tile.x, y: tile.y, z: tile.z });
    }
    const placement: UnitPlacement = {
      pos: { x: tile.x, y: tile.y, z: tile.z },
      facing: facingToCentre(tile, mission.map),
    };
    const built = source.value.build(placement, ctx.ids);
    const placed: TacticalState = {
      ...mission,
      units: [...mission.units, built.unit],
      templates: withTemplate(mission.templates, built.template),
    };
    return ok({
      state: source.value.settle?.(placed, built.unit, ctx.ids) ?? placed,
      events: [
        {
          type: UNIT_PLACED,
          payload: {
            unitId: built.unit.id,
            kind: built.unit.kind,
            team: built.unit.team,
            tile: placement.pos,
          },
        },
      ],
    });
  };
}

// ===========================================
// Catalogue
// ===========================================

/**
 * Everything the menu can offer, from the same deps the handler places
 * from, so the list and the rule cannot disagree about what exists
 * (#1136): the squad types in catalogue order, then the mechs, then the
 * species, then a trapped civilian group when the deps carry civilians
 * (campaign arc §6.4). The HUD splits them into friendly and hostile by
 * `kind`.
 */
export function placeableUnits(
  deps: Pick<PlaceUnitDeps, "species" | "squadTypes" | "mechs" | "civilian">,
): readonly PlaceableUnit[] {
  return [
    ...deps.squadTypes.listSquadTypes().map((type): PlaceableUnit => ({
      kind: "squad",
      id: type.id,
      name: type.name,
    })),
    ...deps.mechs.map((mech): PlaceableUnit => ({
      kind: "mech",
      id: mech.id,
      name: mech.name,
    })),
    ...deps.species.map((species): PlaceableUnit => ({
      kind: "bug",
      id: species.id,
      name: species.name,
    })),
    ...(deps.civilian === undefined
      ? []
      : [
          {
            kind: "civilian",
            id: CIVILIAN_SOURCE_ID,
            name: `${deps.civilian.name} (trapped)`,
          } satisfies PlaceableUnit,
        ]),
  ];
}

// ===========================================
// Helpers
// ===========================================

/**
 * The catalogue entry behind `kind` and `id`, ready to build, or the
 * refusal. A squad is built from a full-strength, unranked roster record
 * that exists only for the factory; a mech likewise, undamaged, from the
 * named loadout. Neither joins the campaign roster: the unit's
 * `sourceId` points at a record nobody holds, so the names resolver
 * falls back to the template — the type's name — which is what the
 * menu called it.
 */
function resolveSource(
  kind: UnitKind,
  id: string,
  deps: PlaceUnitDeps,
): Result<PlacementSource, TacticalError> {
  const unknown = (): Result<PlacementSource, TacticalError> =>
    err({ kind: "unknown-unit-type", unitKind: kind, id });
  const factoryDeps = (
    ids: IdGenerator,
  ): { ids: IdGenerator; tuning: UnitTuning } => ({
    ids,
    tuning: deps.unitTuning,
  });
  switch (kind) {
    case "bug": {
      const species = deps.species.find((entry) => entry.id === id);
      if (species === undefined) {
        return unknown();
      }
      return ok({
        footprint: footprintSizeOf(species),
        passClass: "infantry",
        build: (placement, ids) => bugUnit(species, placement, { ids }),
      });
    }
    case "squad": {
      const type = deps.squadTypes.getSquadType(id);
      if (type === undefined) {
        return unknown();
      }
      return ok({
        footprint: 1,
        passClass: "infantry",
        build: (placement, ids) => {
          const squad: Squad = {
            id: ids.nextId(DEBUG_SQUAD_ID_PREFIX),
            name: type.name,
            typeId: type.id,
            strength: SQUAD_MAX_STRENGTH,
            maxStrength: SQUAD_MAX_STRENGTH,
            kills: 0,
            missionsSurvived: 0,
            xp: 0,
          };
          return squadUnit(squad, type, placement, factoryDeps(ids));
        },
      });
    }
    case "turret":
    case "generator":
      // A turret is deployed by an engineer, never placed by the menu
      // (#1138): there is no catalogue of turrets to pick from. A
      // generator is the map's (#1175), stood up at mission start.
      return unknown();
    case "civilian": {
      // A trapped group (campaign arc §6.4), so a playtest can stage a
      // rescue in any building: it joins the mission's rescue, which
      // the placement makes when the mission has none.
      const tuning = deps.civilian;
      if (tuning === undefined || id !== CIVILIAN_SOURCE_ID) {
        return unknown();
      }
      return ok({
        footprint: 1,
        passClass: "infantry",
        build: (placement, ids) => civilianUnit(tuning, placement, ids),
        settle: (state, unit, ids) => joinRescue(state, [unit.id], ids),
      });
    }
    case "mech": {
      const source = deps.mechs.find((entry) => entry.id === id);
      if (source === undefined) {
        return unknown();
      }
      const sheet = deps.sheetFor(source.loadout);
      if (sheet === undefined) {
        return err({ kind: "invalid-loadout", mechId: id });
      }
      return ok({
        footprint: 1,
        passClass: "mech",
        build: (placement, ids) => {
          const mech: Mech = {
            id: ids.nextId(DEBUG_MECH_ID_PREFIX),
            name: source.name,
            loadout: source.loadout,
            damage: 0,
            kills: 0,
            missionsSurvived: 0,
            xp: 0,
          };
          return mechUnit(mech, sheet, placement, factoryDeps(ids));
        },
      });
    }
  }
}

/** The templates with the build's added, keeping an existing one (a species shares its template across every bug). */
function withTemplate(
  templates: TacticalState["templates"],
  template: UnitTemplate,
): TacticalState["templates"] {
  return template.id in templates
    ? templates
    : { ...templates, [template.id]: template };
}

/**
 * The direction from the tile toward the map's centre along the
 * dominant axis, the way a deploying line faces the field: a placed
 * unit reads as having arrived rather than as having been dropped
 * facing a wall. South when the tile is the centre.
 */
function facingToCentre(tile: TileCoord, map: TacticalMap): Direction {
  const dx = (map.width - 1) / 2 - tile.x;
  const dz = (map.depth - 1) / 2 - tile.z;
  if (dx === 0 && dz === 0) {
    return "s";
  }
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx > 0 ? "e" : "w";
  }
  return dz > 0 ? "s" : "n";
}
