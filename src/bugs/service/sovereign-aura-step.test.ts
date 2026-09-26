import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { attack } from "../../tactical/model/attack-command";
import { SOVEREIGN_AURA } from "../../tactical/model/sovereign-aura-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import {
  createAttackHandler,
  validateAttack,
} from "../../tactical/service/combat-service";
import {
  ctxWith,
  fixtureAttackDeps,
  riggedRng,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import { fieldMap } from "./broodmother.test-helper";
import { createSovereignAuraStep, sovereignAura } from "./sovereign-aura-step";
import { sovereignMission } from "./sovereign.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** Her anchor: her block covers x 10–13, z 10–13. */
const ANCHOR = { x: 10, y: 0, z: 10 };

/** A bug of the fixture's kind at `x`, `z`. */
function bugAt(id: string, x: number, z: number, extra: Partial<Unit> = {}) {
  return {
    ...unitAt(id, "infantry", { x, y: 0, z }, { team: "bugs" }),
    ...extra,
  };
}

/**
 * The Sovereign on a 30×30 field with a bug exactly at her aura's edge
 * (6 tiles off her block), one a tile past it, one diagonal past it and
 * one asleep beside her.
 */
function auraField(phase: TacticalState["phase"] = "bugs"): TacticalState {
  return sovereignMission(
    fieldMap(30, 30).build(),
    [
      bugAt("edge", 19, 11),
      bugAt("past", 20, 12),
      bugAt("corner", 17, 17),
      bugAt("sleeper", 14, 10, { status: ["dormant"] }),
      unitAt("squad", "infantry", { x: 2, y: 0, z: 28 }),
    ],
    ANCHOR,
    { phase },
  ).mission;
}

/** Each unit's aura bonus, by id, for the units that carry one. */
function bonuses(mission: TacticalState): Record<string, number> {
  return Object.fromEntries(
    mission.units
      .filter((unit) => unit.auraDamage !== undefined)
      .map((unit) => [unit.id, unit.auraDamage ?? 0]),
  );
}

// ===========================================
// Tests
// ===========================================

describe("sovereignAura (#1179, campaign arc §9)", () => {
  it("drives the awake bugs within 6 tiles of her block one point harder, and nobody past it", () => {
    const mission = auraField();
    // The fixture exhibits the case: the aura's radius is the 6 the
    // edge bug stands at, and the others are one past it.
    expect(SOVEREIGN_TUNING.aura.radius).toBe(6);
    const applied = sovereignAura(mission);
    expect(bonuses(applied.state)).toEqual({ edge: 1 });
    expect(applied.events).toEqual([
      {
        type: SOVEREIGN_AURA,
        payload: {
          unitId: mission.units.find((u) => u.sourceId === "sovereign")!.id,
          empowered: ["edge"],
          damageBonus: 1,
        },
      },
    ]);
  });

  it("lends nothing to herself, to a sleeper, to the squad or to a dead bug", () => {
    const mission = auraField();
    const withDead: TacticalState = {
      ...mission,
      units: [...mission.units, bugAt("dead", 14, 11, { hp: 0 })],
    };
    const applied = sovereignAura(withDead);
    expect(Object.keys(bonuses(applied.state))).toEqual(["edge"]);
  });

  it("lasts one phase: the next phase to open takes it back, and lends nothing outside the bugs' phase", () => {
    const lent = sovereignAura(auraField()).state;
    const player = sovereignAura({ ...lent, phase: "player" });
    expect(bonuses(player.state)).toEqual({});
    expect(player.events).toEqual([]);
    // And the bugs' next phase lends it afresh.
    expect(
      bonuses(sovereignAura({ ...player.state, phase: "bugs" }).state),
    ).toEqual({ edge: 1 });
  });

  it("leaves a mission without a Sovereign as it was", () => {
    const mission = auraField();
    const without: TacticalState = {
      ...mission,
      units: mission.units.filter((u) => u.sourceId !== "sovereign"),
    };
    const applied = createSovereignAuraStep()(
      without,
      ctxWith(riggedRng(true)),
    );
    expect(applied.state).toBe(without);
    expect(applied.events).toEqual([]);
  });

  it("lends nothing once she is dead", () => {
    const mission = auraField();
    const dead: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.sourceId === "sovereign" ? { ...u, hp: 0 } : u,
      ),
    };
    expect(bonuses(sovereignAura(dead).state)).toEqual({});
  });
});

describe("an empowered bug's bite (#1179)", () => {
  /** A bug beside a squad on the fixture field, on the bugs' phase. */
  function biting(auraDamage?: number): TacticalState {
    const squad = unitAt("squad", "infantry", { x: 5, y: 0, z: 5 });
    const bug = bugAt(
      "biter",
      6,
      5,
      auraDamage === undefined ? {} : { auraDamage },
    );
    return sovereignMission(fieldMap(30, 30).build(), [squad, bug], ANCHOR, {
      phase: "bugs",
    }).mission;
  }

  it("previews and rolls the aura's point on top of its weapon, and nothing without it", () => {
    const plain = validateAttack(biting(), "biter", "squad", COMBAT_TUNING);
    const driven = validateAttack(biting(1), "biter", "squad", COMBAT_TUNING);
    expect(plain.ok && driven.ok).toBe(true);
    if (!plain.ok || !driven.ok) return;
    expect(driven.value.weapon.profile.damage).toBe(
      plain.value.weapon.profile.damage + 1,
    );
    const handler = createAttackHandler(COMBAT_TUNING, fixtureAttackDeps());
    const dealt = (mission: TacticalState): number => {
      const outcome = handler(mission, attack("biter", "squad"), {
        rng: riggedRng(true, "low"),
        ids: new SequentialIdGenerator(),
      });
      if (!outcome.ok) throw new Error(outcome.error.kind);
      const resolved = outcome.value.events.find(
        (e) => e.type === ATTACK_RESOLVED,
      );
      return resolved?.type === ATTACK_RESOLVED ? resolved.payload.damage : -1;
    };
    // The same loaded roll, one point more with the aura.
    expect(dealt(biting(1))).toBe(dealt(biting()) + 1);
  });
});
