import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../core/model/elevation";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { COMBAT_TUNING } from "../data/combat-tuning";
import type { MechSystems } from "../model/mech-systems";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { enemyAttackTargets } from "./attack-target-service";
import { blastFootprint, blastVictims } from "./blast-service";
import { previewAttack, validateTargeting } from "./combat-service";
import { radarContacts } from "./radar-service";
import {
  feelsColumn,
  seismicContacts,
  seismicRangeOf,
} from "./seismic-sensor-service";
import {
  FIXTURE_TEMPLATES,
  burrowerAt,
  missionWith,
  unitAt,
} from "./tactical-fixtures.test-helper";
import { withVision } from "./vision-service";

// ===========================================
// Fixtures
// ===========================================

/** The shipped sensor's range: a burrower's phase of digging. */
const RANGE = 10;

/** Template id of a mech that carries the sensor. */
const SENSOR_MECH = "mech:sensor";

/** Template id of a sensor mech on a 2×2 block, like the shipped frames. */
const SENSOR_BLOCK = "mech:sensor-block";

/** A mech's frozen systems with a seismic sensor fitted. */
const SENSOR_SYSTEMS: MechSystems = {
  heatCapacity: 10,
  cooling: 2,
  idleHeat: 0,
  movementHeat: 1,
  seismicRange: RANGE,
};

/** Open ground wide enough to stand a burrower past the sensor's reach. */
const FIELD: TacticalMap = new FixtureMapBuilder(24, 24, 3 * STOREY_LAYERS)
  .fillGround()
  .build();

/** A ground tile. */
const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** A TDF mech at `pos` carrying the sensor (on `template`). */
function carrier(
  id: string,
  pos: TileCoord,
  template: string = SENSOR_MECH,
  hp = 10,
): Unit {
  return { ...unitAt(id, "mech", pos, { hp }), templateId: template };
}

/** A mission on the open field with the fixture templates plus the sensor mechs. */
function field(units: readonly Unit[]): TacticalState {
  const base = missionWith(FIELD, units);
  const mech = base.templates[FIXTURE_TEMPLATES.mech]!;
  return {
    ...base,
    templates: {
      ...base.templates,
      [SENSOR_MECH]: { ...mech, id: SENSOR_MECH, systems: SENSOR_SYSTEMS },
      [SENSOR_BLOCK]: {
        ...mech,
        id: SENSOR_BLOCK,
        systems: SENSOR_SYSTEMS,
        footprint: 2,
      },
    },
  };
}

// ===========================================
// Range
// ===========================================

describe("seismicContacts: range (campaign arc §10.2)", () => {
  it("feels a burrower within the range, on its column, and not one step beyond", () => {
    const m = field([
      carrier("m", at(2, 2)),
      burrowerAt("near", at(8, 6)), // 6 + 4 = 10: the rim
      burrowerAt("far", at(9, 6)), // 7 + 4 = 11
    ]);
    expect(seismicContacts(m, "tdf")).toEqual([
      { kind: "burrowed", pos: at(8, 6) },
    ]);
  });

  it("measures by the tunnel's Manhattan steps, not as the crow flies", () => {
    // (10, 5) is 8.5 tiles off in a straight line but 11 steps of
    // digging: a burrower there cannot reach the mech's side next phase.
    const m = field([carrier("m", at(2, 2)), burrowerAt("d", at(10, 5))]);
    expect(seismicContacts(m, "tdf")).toEqual([]);
  });

  it("measures from every tile a mech on a block stands on", () => {
    // Anchor (2,2), block to (3,3): (13,3) is 11 from the anchor, 10
    // from (3,3).
    const block = carrier("m", at(2, 2), SENSOR_BLOCK);
    const m = field([block, burrowerAt("d", at(13, 3))]);
    expect(seismicContacts(m, "tdf")).toEqual([
      { kind: "burrowed", pos: at(13, 3) },
    ]);
    expect(feelsColumn(m, block, at(13, 3))).toBe(true);
    expect(feelsColumn(m, block, at(14, 3))).toBe(false);
  });

  it("follows the burrower's column as it tunnels, and loses it past the rim", () => {
    const m = field([carrier("m", at(2, 2)), burrowerAt("d", at(12, 2))]);
    expect(seismicContacts(m, "tdf")).toEqual([
      { kind: "burrowed", pos: at(12, 2) },
    ]);
    const dug: TacticalState = {
      ...m,
      units: m.units.map((unit) =>
        unit.id === "d" ? { ...unit, pos: at(13, 2) } : unit,
      ),
    };
    expect(seismicContacts(dug, "tdf")).toEqual([]);
  });
});

// ===========================================
// Carrier
// ===========================================

describe("seismicContacts: the carrier (campaign arc §10.2)", () => {
  it("feels nothing with no sensor on the field", () => {
    const m = field([
      unitAt("m", "mech", at(2, 2)),
      unitAt("s", "infantry", at(3, 2)),
      burrowerAt("d", at(4, 2)),
    ]);
    expect(seismicContacts(m, "tdf")).toEqual([]);
    expect(seismicRangeOf(m, m.units[0]!)).toBe(0);
  });

  it("feels nothing once the carrier is dead", () => {
    const m = field([
      carrier("m", at(2, 2), SENSOR_MECH, 0),
      burrowerAt("d", at(4, 2)),
    ]);
    expect(seismicRangeOf(m, m.units[0]!)).toBe(0);
    expect(seismicContacts(m, "tdf")).toEqual([]);
  });

  it("feels nothing once the carrier has left the field", () => {
    const mech = carrier("m", at(2, 2));
    const m = field([
      unitAt("s", "infantry", at(3, 2)),
      burrowerAt("d", at(4, 2)),
    ]);
    const gone: TacticalState = { ...m, extracted: [mech] };
    expect(seismicContacts(gone, "tdf")).toEqual([]);
    // The same mech still on the field feels it.
    expect(seismicContacts({ ...m, units: [mech, ...m.units] }, "tdf")).toEqual(
      [{ kind: "burrowed", pos: at(4, 2) }],
    );
  });

  it("is the whole side's: each carrier adds its own ground, and each burrower is reported once", () => {
    const m = field([
      carrier("west", at(1, 1)),
      carrier("east", at(20, 20)),
      unitAt("s", "infantry", at(10, 10)),
      burrowerAt("by-west", at(4, 4)),
      burrowerAt("by-east", at(18, 18)),
      burrowerAt("between", at(10, 11)), // 19 from each: neither
    ]);
    expect(seismicContacts(m, "tdf")).toEqual([
      { kind: "burrowed", pos: at(4, 4) },
      { kind: "burrowed", pos: at(18, 18) },
    ]);
    const both = field([
      carrier("a", at(2, 2)),
      carrier("b", at(3, 2)),
      burrowerAt("d", at(4, 2)),
    ]);
    expect(seismicContacts(both, "tdf")).toHaveLength(1);
  });

  it("reports only bugs under the ground: one on the surface is vision's, a dead one nothing", () => {
    const m = field([
      carrier("m", at(2, 2)),
      burrowerAt("up", at(4, 2), { status: [] }),
      burrowerAt("dead", at(5, 2), { hp: 0 }),
      burrowerAt("down", at(6, 2)),
    ]);
    expect(seismicContacts(m, "tdf")).toEqual([
      { kind: "burrowed", pos: at(6, 2) },
    ]);
  });

  it("gives the swarm nothing: no bug carries a sensor, and TDF sensors report to the TDF", () => {
    const m = field([carrier("m", at(2, 2)), burrowerAt("d", at(4, 2))]);
    expect(seismicContacts(m, "bugs")).toEqual([]);
  });
});

// ===========================================
// Knowledge, not a rule
// ===========================================

describe("a sensed burrower keeps every burrow guarantee (campaign arc §10.2)", () => {
  /** A sensor mech two tiles from a burrower it feels, seen by the side's vision. */
  const sensed = (): TacticalState => {
    const m = field([carrier("m", at(2, 2)), burrowerAt("d", at(4, 2))]);
    const seen = withVision({ state: m, events: [] }).state;
    expect(seismicContacts(seen, "tdf")).toHaveLength(1);
    return seen;
  };

  it("is still unspotted, and cannot be targeted or previewed", () => {
    const m = sensed();
    expect(m.vision.tdf.spotted).not.toContain("d");
    const refusal = { kind: "target-burrowed", targetId: "d" };
    const targeting = validateTargeting(m, "m", "d", COMBAT_TUNING);
    expect(targeting.ok ? "ok" : targeting.error).toEqual(refusal);
    const preview = previewAttack(m, "m", "d", COMBAT_TUNING);
    expect(preview.ok ? "ok" : preview.error).toEqual(refusal);
    expect(enemyAttackTargets(m, "tdf").map((t) => t.id)).not.toContain("d");
  });

  it("is untouched by a blast landing on its column", () => {
    const m = sensed();
    const victims = blastVictims(
      m,
      blastFootprint(m.map, at(4, 2), 2),
      new Set(["m"]),
    );
    expect(victims.map((victim) => victim.target.id)).not.toContain("d");
  });

  it("adds nothing to the radar's contacts, which Jev reads", () => {
    const m = sensed();
    expect(radarContacts(m, "tdf")).toEqual([]);
  });
});
