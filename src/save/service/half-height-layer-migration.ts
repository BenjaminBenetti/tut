import { isRecord } from "../../core/model/record-guard";
import type { Migration } from "../model/migration";

// ===========================================
// Frozen v15 → v16 conversion (ADR 0008 §2.6)
// ===========================================

/**
 * Doubles the vertical coordinates of an in-flight v1 map and its mission.
 * Kept independent of live tuning: shipped migrations must never change.
 * Registration and the schema bump accompany the engine's unit switch.
 */
export const HALF_HEIGHT_LAYERS: Migration = {
  from: 15,
  to: 16,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.activeMission)) return state;
    const mission = state.activeMission;
    const map = mission.map;
    if (!isRecord(map) || map.version !== 1) return state;
    const width = positiveInteger(map.width);
    const depth = positiveInteger(map.depth);
    const levels = positiveInteger(map.levels);
    const stride = width * depth;

    /** Decodes the v1 grid key, doubles y, then encodes the v2 coordinate. */
    const key = (value: unknown): unknown => {
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value >= stride * levels
      )
        throw new Error("v1 vision contains an out-of-bounds tile key");
      // gridKey = (y * depth + z) * width + x; levels bounds y, not the stride.
      return Math.floor(value / stride) * 2 * stride + (value % stride);
    };
    const vision = values(mission.vision, (side) =>
      fields(side, {
        visible: (keys) => array(keys, key),
        explored: (keys) => array(keys, key),
        lastSeen: (seen) => values(seen, coord),
      }),
    );
    const converted = fields(mission, {
      units: (units) => array(units, positioned),
      extracted: (units) => array(units, positioned),
      spawners: (spawners) => array(spawners, positioned),
      extraction: coords,
      log: (events) => array(events, movedEvent),
    });
    return {
      ...state,
      activeMission: {
        ...(isRecord(converted) ? converted : mission),
        map: {
          ...map,
          ...(fields(map, {
            tiles: (tiles) => array(tiles, tile),
            buildings: (buildings) => array(buildings, building),
            connectors: (connectors) => array(connectors, connector),
            props: (props) =>
              array(props, (prop) => fields(prop, { tile: coord })),
            hooks: (hooks) =>
              fields(hooks, {
                deployZones: (hooks) => array(hooks, hook),
                objectives: (hooks) => array(hooks, hook),
                edgeSpawns: (hooks) => array(hooks, hook),
                extraction: hook,
              }),
          }) as Record<string, unknown>),
          version: 2,
          levels: levels * 2,
        },
        ...(mission.vision === undefined ? {} : { vision }),
      },
    };
  },
};

// ===========================================
// Spatial records; unrelated metadata stays verbatim
// ===========================================

/** Converts a tile coordinate, also used for floors' y field. */
function coord(value: unknown): unknown {
  return fields(value, { y: double });
}

/** Doubles a saved vertical scalar without consulting current engine units. */
function double(value: unknown): unknown {
  return typeof value === "number" ? value * 2 : value;
}

/** Converts an array of tile coordinates. */
function coords(value: unknown): unknown {
  return array(value, coord);
}

/** Converts a unit or spawner position. */
function positioned(value: unknown): unknown {
  return fields(value, { pos: coord });
}

/** Drops legacy wedges; their converted ramps retain traversal and draw a plank. */
function tile(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { slope: _legacyWedge, ...rest } = value;
  return coord(rest);
}

/** Converts connector endpoints, retiring the legacy slope kind. */
function connector(value: unknown): unknown {
  return fields(value, {
    from: coord,
    to: coord,
    kind: (kind) => (kind === "slope" ? "ramp" : kind),
  });
}

/** Converts a building's heights and entrances, leaving floor indices unchanged. */
function building(value: unknown): unknown {
  return fields(value, {
    groundLevel: double,
    floors: (floors) => array(floors, coord),
    entrances: (entrances) =>
      array(entrances, (entry) => fields(entry, { tile: coord })),
  });
}

/** Converts placement tiles without rewriting recipe or hook metadata. */
function hook(value: unknown): unknown {
  return fields(value, { tiles: coords });
}

/** Converts the only v15 event with coordinates, preserving replay paths. */
function movedEvent(value: unknown): unknown {
  if (!isRecord(value) || value.type !== "tactical:unit-moved") return value;
  return fields(value, {
    payload: (payload) =>
      fields(payload, { from: coord, to: coord, path: coords }),
  });
}

// ===========================================
// Unknown-data helpers
// ===========================================

/** Transforms only present named fields, preserving absent optional fields. */
function fields(
  value: unknown,
  transforms: Readonly<Record<string, (value: unknown) => unknown>>,
): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [
      name,
      transforms[name]?.(entry) ?? entry,
    ]),
  );
}

/** Maps an array without inventing one for an absent field. */
function array(
  value: unknown,
  transform: (entry: unknown) => unknown,
): unknown {
  return Array.isArray(value) ? value.map(transform) : value;
}

/** Maps a dictionary without changing its keys. */
function values(
  value: unknown,
  transform: (entry: unknown) => unknown,
): unknown {
  return isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, transform(entry)]),
      )
    : value;
}

/** Reads a valid v1 dimension before decoding any packed coordinates. */
function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("v1 tactical map has an invalid dimension");
  }
  return value;
}
