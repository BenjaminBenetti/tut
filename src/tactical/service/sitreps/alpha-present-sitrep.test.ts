import { describe, expect, it } from "vitest";

import {
  BROODMOTHER,
  BRUTE,
  LURKER,
  SWARMER,
} from "../../../bugs/data/species";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { SITREP_TUNING } from "../../data/sitrep-tuning";
import { ALPHA_CROWNED } from "../../model/alpha-crowned-event";
import type { BugUnitSource } from "../../model/bug-unit-source";
import type { CrownedAlpha } from "../../model/crowned-alpha";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { bugUnit } from "../unit-factory";
import {
  ALPHA_TEMPLATE_SUFFIX,
  alphaPresentSitrep,
  crownAlpha,
} from "./alpha-present-sitrep";
import { fieldMission } from "./sitrep-fixtures.test-helper";
import { sitrepPhaseSteps } from "./sitrep-service";

// ===========================================
// Fixtures
// ===========================================

const TUNING = SITREP_TUNING.alphaPresent;

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** A step context; crowning draws nothing. */
const CTX = { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };

/**
 * A field mission carrying Alpha Present with `alpha` promised (none
 * when null), and a bug
 * of each species in `bugs` standing in a row along z = 12, their ids
 * issued in that order.
 */
function alphaMission(
  bugs: readonly BugUnitSource[],
  alpha: CrownedAlpha | null = { name: "Grinder", level: 0 },
): TacticalState {
  const ids = new SequentialIdGenerator();
  const built = bugs.map((species, index) =>
    bugUnit(species, { pos: at(4 + index * 4, 12), facing: "s" }, { ids }),
  );
  const mission = fieldMission(["alpha-present"]);
  return {
    ...mission,
    ...(alpha === null ? {} : { alpha }),
    units: [...mission.units, ...built.map(({ unit }) => unit)],
    templates: Object.fromEntries([
      ...Object.entries(mission.templates),
      ...built.map(({ template }) => [template.id, template] as const),
    ]),
  };
}

/** The crowned bugs: those carrying the alpha persona. */
function alphas(mission: TacticalState): Unit[] {
  return mission.units.filter((unit) => unit.persona === "alpha");
}

// ===========================================
// Tests
// ===========================================

describe("crownAlpha (campaign arc §8, §11, #1179)", () => {
  it("crowns exactly one bug, the largest, with +50% hit points, +1 damage, the persona and the name", () => {
    const mission = alphaMission([SWARMER, LURKER, BRUTE, SWARMER]);
    const crowned = crownAlpha(mission, TUNING);
    const [alpha, ...others] = alphas(crowned.state);
    expect(others).toEqual([]);
    expect(alpha?.sourceId).toBe("brute");
    expect(alpha?.name).toBe("Grinder");
    expect(alpha?.maxHp).toBe(Math.round(BRUTE.hp * 1.5));
    expect(alpha?.hp).toBe(Math.round(BRUTE.hp * 1.5));
    const template = crowned.state.templates[alpha?.templateId ?? ""];
    expect(template?.id).toBe(`bug:brute${ALPHA_TEMPLATE_SUFFIX}`);
    expect(template?.maxHp).toBe(45);
    expect(template?.weapons.map((weapon) => weapon.profile.damage)).toEqual(
      mission.templates["bug:brute"]?.weapons.map(
        (weapon) => weapon.profile.damage + 1,
      ),
    );
    // The species' own template, and every other brute's, are untouched.
    expect(crowned.state.templates["bug:brute"]).toBe(
      mission.templates["bug:brute"],
    );
    expect(crowned.state.alpha).toEqual({
      name: "Grinder",
      level: 0,
      unitId: alpha?.id,
    });
    expect(crowned.events).toEqual([
      {
        type: ALPHA_CROWNED,
        payload: { unitId: alpha?.id, name: "Grinder", level: 0 },
      },
    ]);
  });

  it("gives a wounded bug the bonus on top of what it has left", () => {
    const mission = alphaMission([LURKER]);
    const hurt: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.sourceId === "lurker" ? { ...unit, hp: 5 } : unit,
      ),
    };
    const [alpha] = alphas(crownAlpha(hurt, TUNING).state);
    expect(alpha?.maxHp).toBe(18);
    expect(alpha?.hp).toBe(5 + 6);
  });

  it("breaks a tie by unit order, and prefers the species the nemesis was", () => {
    const tie = crownAlpha(alphaMission([LURKER, LURKER]), TUNING).state;
    expect(alphas(tie).map((unit) => unit.id)).toEqual(["unit-1"]);
    const preferred = crownAlpha(
      alphaMission([SWARMER, BRUTE, LURKER], {
        name: "Grinder",
        level: 1,
        speciesId: "lurker",
      }),
      TUNING,
    ).state;
    const [alpha] = alphas(preferred);
    expect(alpha?.sourceId).toBe("lurker");
    // A level-1 nemesis: +25% on top of the +50%.
    expect(alpha?.maxHp).toBe(Math.round(LURKER.hp * 1.75));
  });

  it("falls back to the largest when none of the nemesis' species stands", () => {
    const state = crownAlpha(
      alphaMission([SWARMER, BRUTE], {
        name: "Grinder",
        level: 2,
        speciesId: "lurker",
      }),
      TUNING,
    ).state;
    const [alpha] = alphas(state);
    expect(alpha?.sourceId).toBe("brute");
    expect(alpha?.maxHp).toBe(Math.round(BRUTE.hp * 2));
  });

  it("passes over a persona bug, a dormant one and the dead", () => {
    const mission = alphaMission([BROODMOTHER, BRUTE, BRUTE, SWARMER]);
    const shaped: TacticalState = {
      ...mission,
      units: mission.units.map((unit): Unit => {
        switch (unit.id) {
          case "unit-1":
            return { ...unit, persona: "broodmother" };
          case "unit-2":
            return { ...unit, status: ["dormant"] };
          case "unit-3":
            return { ...unit, hp: 0 };
          default:
            return unit;
        }
      }),
    };
    const [alpha, ...others] = alphas(crownAlpha(shaped, TUNING).state);
    expect(others).toEqual([]);
    expect(alpha?.id).toBe("unit-4");
  });

  it("crowns once, and leaves a mission with no alpha or no bug alone", () => {
    const once = crownAlpha(alphaMission([LURKER, BRUTE]), TUNING).state;
    const again = crownAlpha(once, TUNING);
    expect(again.state).toBe(once);
    expect(again.events).toEqual([]);

    const noAlpha = alphaMission([BRUTE], null);
    expect(crownAlpha(noAlpha, TUNING).state).toBe(noAlpha);
    const noBug = alphaMission([]);
    expect(crownAlpha(noBug, TUNING)).toEqual({ state: noBug, events: [] });
  });
});

describe("alphaPresentSitrep", () => {
  it("crowns at a phase opening, only on a mission carrying the sitrep", () => {
    const rule = alphaPresentSitrep(TUNING);
    expect(rule.id).toBe("alpha-present");
    expect(rule.setup).toBeUndefined();
    const mission = alphaMission([LURKER]);
    expect(alphas(rule.phaseStep!(mission, CTX).state)).toHaveLength(1);

    const steps = sitrepPhaseSteps();
    const run = (state: TacticalState): TacticalState =>
      steps.reduce((current, step) => step(current, CTX).state, state);
    expect(alphas(run(mission))).toHaveLength(1);
    const without: TacticalState = { ...mission, sitreps: [] };
    expect(alphas(run(without))).toEqual([]);
  });
});
