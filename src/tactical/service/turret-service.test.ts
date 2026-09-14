import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TURRET } from "../data/equipment";
import { TURRET_TUNING } from "../data/turret-tuning";
import { endTurn } from "../model/end-turn-command";
import type { Radar } from "../model/radar";
import type { TacticalState } from "../model/tactical-state";
import { turretBurnedOut, turretIsActive } from "../model/turret";
import { TURRET_BURNED_OUT } from "../model/turret-burned-out-event";
import { TURRET_DEPLOYED } from "../model/turret-deployed-event";
import type { Unit } from "../model/unit";
import { constructionOf } from "./construction-service";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "./turn-service";
import {
  createTurretStep,
  placeTurret,
  validateTurretSite,
} from "./turret-service";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });
const ENGINEER = at(1, 1);
const SITE = at(2, 2);
const ctx = ctxWith(riggedRng(true));

/** An engineer on the open field, and whatever else the caller puts down. */
function field(units: readonly Unit[] = []): TacticalState {
  return missionWith(openField().build(), [
    unitAt("eng", "infantry", ENGINEER),
    ...units,
  ]);
}

/** The engineer as the mission has it. */
function engineer(mission: TacticalState): Unit {
  return mission.units.find((unit) => unit.id === "eng")!;
}

/** A turret put down at `pos` as `placeTurret` leaves it, patched with `overrides`. */
function withTurret(
  mission: TacticalState,
  pos: TileCoord,
  overrides: Partial<Unit> = {},
): { mission: TacticalState; turret: Unit } {
  const placed = placeTurret(
    mission,
    engineer(mission),
    pos,
    TURRET_TUNING,
    new SequentialIdGenerator(),
  );
  const fresh = placed.state.units.at(-1)!;
  const turret: Unit = { ...fresh, ...overrides };
  return {
    mission: {
      ...placed.state,
      units: placed.state.units.map((u) => (u.id === fresh.id ? turret : u)),
    },
    turret,
  };
}

/** The unit with the id, or a thrown fixture error. */
function unitIn(mission: TacticalState, id: string): Unit {
  const unit = mission.units.find((u) => u.id === id);
  if (!unit) throw new Error(`fixture lost unit ${id}`);
  return unit;
}

// ===========================================
// Sites
// ===========================================

describe("validateTurretSite", () => {
  const site = (mission: TacticalState, tile: TileCoord) =>
    validateTurretSite(mission, engineer(mission), tile, TURRET.range);

  it("takes the dish's rule: a diagonal and a two-tile straight are fine, three tiles is out of reach", () => {
    const mission = field();
    expect(site(mission, SITE).ok).toBe(true);
    expect(site(mission, at(3, 1)).ok).toBe(true);
    expect(site(mission, at(4, 1))).toMatchObject({
      ok: false,
      error: { kind: "turret-out-of-reach", range: 2 },
    });
  });

  it("refuses a tile a comrade, a live turret, a scanner or a nest holds, and takes one a burnt-out turret held", () => {
    const comrade = field([unitAt("other", "infantry", SITE)]);
    expect(site(comrade, SITE)).toMatchObject({
      ok: false,
      error: { kind: "turret-tile-blocked" },
    });
    const live = withTurret(field(), SITE).mission;
    expect(site(live, SITE)).toMatchObject({
      ok: false,
      error: { kind: "turret-tile-blocked" },
    });
    const burnt = withTurret(field(), SITE, { hp: 0, turnsLeft: 0 }).mission;
    expect(site(burnt, SITE).ok).toBe(true);
    const scanner: Radar = {
      id: "radar-1",
      team: "tdf",
      pos: SITE,
      range: 30,
      turnsLeft: 3,
    };
    expect(site({ ...field(), radars: [scanner] }, SITE)).toMatchObject({
      ok: false,
      error: { kind: "turret-tile-blocked" },
    });
    expect(site(field(), { ...SITE, x: NaN }).ok).toBe(false);
  });
});

// ===========================================
// Placement
// ===========================================

describe("placeTurret", () => {
  it("puts a mechanical turret on the tile, on overwatch with two shots and a full battery, and announces it", () => {
    const before = field();
    const placed = placeTurret(
      before,
      engineer(before),
      SITE,
      TURRET_TUNING,
      new SequentialIdGenerator(),
    );
    expect(placed.state.units).toHaveLength(2);
    const turret = placed.state.units[1]!;
    expect(turret).toMatchObject({
      kind: "turret",
      team: "tdf",
      sourceId: "turret",
      templateId: "turret:turret",
      pos: SITE,
      facing: "n",
      hp: 30,
      maxHp: 30,
      ap: 0,
      maxAp: 0,
      status: ["overwatch"],
      overwatchShots: 2,
      turnsLeft: 3,
      passClass: "infantry",
    });
    expect(turret.charges).toBeUndefined();
    expect(turretIsActive(turret)).toBe(true);
    const template = placed.state.templates[turret.templateId]!;
    expect(template).toMatchObject({
      name: "Turret",
      maxHp: 30,
      maxAp: 0,
      move: 0,
      armor: 2,
      sightRange: 12,
      passClass: "infantry",
      modelId: "tdf.turret",
      construction: "mechanical",
      weapons: [TURRET_TUNING.weapon],
    });
    // The repair kit asks this before it mends anything (#1138).
    expect(constructionOf(template, turret.kind)).toBe("mechanical");
    expect(placed.events).toEqual([
      {
        type: TURRET_DEPLOYED,
        payload: {
          unitId: "eng",
          turretId: turret.id,
          tile: SITE,
          turnsLeft: 3,
          overwatchShots: 2,
        },
      },
    ]);
    expect(before.units).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(placed.state))).toEqual(placed.state);
  });

  it("shares one template between every turret and draws a fresh id for each", () => {
    const ids = new SequentialIdGenerator();
    const first = placeTurret(
      field(),
      engineer(field()),
      SITE,
      TURRET_TUNING,
      ids,
    );
    const second = placeTurret(
      first.state,
      engineer(first.state),
      at(3, 1),
      TURRET_TUNING,
      ids,
    );
    expect(Object.keys(second.state.templates)).toEqual(
      Object.keys(first.state.templates),
    );
    expect(second.state.units[1]!.id).not.toBe(second.state.units[2]!.id);
    expect(second.state.templates).toBe(first.state.templates);
  });
});

// ===========================================
// The turn
// ===========================================

describe("createTurretStep", () => {
  const step = createTurretStep(TURRET_TUNING);

  it("drains the battery and puts the turret back on watch as the player turn opens, silently", () => {
    // As `refreshSides` leaves it: the last turn's watch lapsed.
    const { mission, turret } = withTurret(field(), SITE, {
      status: [],
      overwatchShots: undefined,
      ap: 0,
    });
    const applied = step(mission, ctx);
    expect(applied.events).toEqual([]);
    expect(unitIn(applied.state, turret.id)).toMatchObject({
      turnsLeft: 2,
      status: ["overwatch"],
      overwatchShots: 2,
      hp: 30,
    });
    expect(unitIn(mission, turret.id).turnsLeft).toBe(3);
    expect(unitIn(applied.state, "eng")).toBe(engineer(mission));
  });

  it("burns the turret out at zero: hit points gone, TurretBurnedOut rather than UnitDied", () => {
    const { mission, turret } = withTurret(field(), SITE, { turnsLeft: 1 });
    const applied = step(mission, ctx);
    const dead = unitIn(applied.state, turret.id);
    expect(dead).toMatchObject({ hp: 0, turnsLeft: 0 });
    expect(turretIsActive(dead)).toBe(false);
    expect(turretBurnedOut(dead)).toBe(true);
    expect(applied.events).toEqual([
      { type: TURRET_BURNED_OUT, payload: { turretId: turret.id, pos: SITE } },
    ]);
  });

  it("touches nothing on the bug phase, and leaves a turret the bugs destroyed alone", () => {
    const bugs = {
      ...withTurret(field(), SITE).mission,
      phase: "bugs" as const,
    };
    expect(step(bugs, ctx).state).toBe(bugs);
    const killed = withTurret(field(), SITE, { hp: 0, turnsLeft: 2 });
    const applied = step(killed.mission, ctx);
    expect(applied.state).toBe(killed.mission);
    expect(turretBurnedOut(killed.turret)).toBe(false);
  });

  it("runs a fresh turret through three watches and burns it out as the fourth turn opens", () => {
    const handler = createEndTurnHandler([...DEFAULT_PHASE_STEPS, step]);
    let { mission } = withTurret(field(), SITE);
    const turretId = mission.units[1]!.id;
    const seen: [number, string, number, boolean, number][] = [];
    let burnedOutOn: number | undefined;
    // Six half-turns without a bug runner: player 1 → bugs 1 → … → player 4.
    for (let i = 0; i < 6; i++) {
      const applied = handler(mission, endTurn(), ctx);
      if (!applied.ok) throw new Error(applied.error.kind);
      mission = applied.value.state;
      const turret = unitIn(mission, turretId);
      seen.push([
        mission.turn,
        mission.phase,
        turret.turnsLeft ?? -1,
        turret.status.includes("overwatch"),
        turret.hp,
      ]);
      if (applied.value.events.some((e) => e.type === TURRET_BURNED_OUT)) {
        burnedOutOn = mission.turn;
      }
    }
    expect(seen).toEqual([
      [1, "bugs", 3, true, 30],
      [2, "player", 2, true, 30],
      [2, "bugs", 2, true, 30],
      [3, "player", 1, true, 30],
      [3, "bugs", 1, true, 30],
      [4, "player", 0, false, 0],
    ]);
    expect(burnedOutOn).toBe(4);
  });
});
