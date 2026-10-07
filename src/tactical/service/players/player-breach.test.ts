import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../../core/model/elevation";
import { PropKindIds } from "../../../mapgen/data/props";
import type { PropKindId } from "../../../mapgen/model/prop";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { GRENADE } from "../../data/equipment";
import { ATTACK } from "../../model/attack-command";
import { MOVE } from "../../model/move-command";
import type { MoveCommand } from "../../model/move-command";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import type { UnitTemplate } from "../../model/unit-template";
import type { UnitWeapon } from "../../model/unit-weapon";
import { USE_EQUIPMENT } from "../../model/use-equipment-command";
import { FIXTURE_TEMPLATES, unitAt } from "../tactical-fixtures.test-helper";
import {
  EXPERT_BREACH,
  createExpertPlayerPolicy,
} from "./expert-player-policy.test-helper";
import {
  NEW_PLAYER_BREACH,
  createNewPlayerPolicy,
} from "./new-player-policy.test-helper";
import type { UnitOrder } from "./objective-strategy.test-helper";
import { jobSteps, planBreach } from "./player-breach.test-helper";
import {
  FIXTURE_PLAYER_RULES,
  lookingMission,
} from "./player-fixtures.test-helper";
import { fieldFor } from "./player-navigation.test-helper";
import type { ForcePlan } from "./player-policy.test-helper";
import { stepsTo } from "./player-policy.test-helper";
import type { PlayerView } from "./player-view.test-helper";
import { observe } from "./player-view.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The goal inside the pod: a tile of its floor. */
const GOAL = at(9, 6);

/** The drop ship, west of the pod. */
const DROP = at(0, 6);

/** The far side's soft seam: force 1. */
const SEAM: readonly TileCoord[] = [at(10, 5), at(10, 6), at(10, 7)];

/**
 * A pod in miniature on a 16×12 field: a ring of hull plates (force 2)
 * round a two-column floor, a second layer of plates inside its west
 * face (the membrane, as the great pod has it), and a soft seam
 * (force 1) on the east face. From the drop ship the near way is two
 * plates; the seam is a walk round to one breach.
 *
 * ```
 *   x:  0     5 6 7 8 9 10
 *   z=3         P P P P P
 *   z=4         P P . . P
 *   z=5         P P . . s
 *   z=6   D     P P . G s      D drop ship, G goal, P plate, s seam
 *   z=7         P P . . s
 *   z=8         P P . . P
 *   z=9         P P P P P
 * ```
 */
function pod(): TacticalMap {
  const builder = new FixtureMapBuilder(16, 12, 3 * STOREY_LAYERS).fillGround();
  const seam = new Set(SEAM.map((tile) => `${tile.x},${tile.z}`));
  for (let z = 3; z <= 9; z++) {
    for (let x = 6; x <= 10; x++) {
      const ring = x === 6 || x === 10 || z === 3 || z === 9;
      const membrane = x === 7;
      if (!ring && !membrane) continue;
      const kind: PropKindId = seam.has(`${x},${z}`)
        ? PropKindIds.GREAT_POD_HULL_SEAM
        : PropKindIds.GREAT_POD_HULL_PLATE;
      builder.prop(kind, at(x, z));
    }
  }
  return builder.build();
}

/** The breaching order: destroy what stands on the goal, through the walls. */
const BREACH_ORDER: UnitOrder = {
  kind: "destroy",
  goals: [GOAL],
  urgent: true,
  breach: true,
};

/** A rocket: range 10, a blast of radius 1, force 2. */
const ROCKET: UnitWeapon = {
  id: "rocket",
  name: "Rocket",
  profile: {
    range: 10,
    accuracy: 70,
    damage: 6,
    armorPen: 2,
    aoe: { radius: 1, falloff: 0.5 },
    demoForce: 2,
  },
};

/** A mech's arm gun: no blast, force 1, the likelier shot. */
const ARM_GUN: UnitWeapon = {
  id: "arm",
  name: "Autocannon",
  profile: { range: 10, accuracy: 85, damage: 18, armorPen: 1, demoForce: 1 },
};

/** A mech's back gun: a blast of radius 1, force 1, the less likely shot. */
const BACK_GUN: UnitWeapon = {
  id: "back",
  name: "Missile pod",
  profile: {
    range: 14,
    accuracy: 70,
    damage: 22,
    armorPen: 1,
    aoe: { radius: 1, falloff: 0.5 },
    demoForce: 1,
  },
};

/** Template ids of the breaching kit, beside the fixture rifle squad. */
const ROCKET_SQUAD = "squad:rocket";
const GRENADIER = "squad:grenadier";
const BREACH_MECH = "mech:breacher";

/**
 * A mission on the pod with the units, the drop ship west of it and the
 * breaching kit's templates: the rocket squad, a rifle squad with
 * grenades and a mech with both guns.
 */
function mission(units: readonly Unit[]): TacticalState {
  const base = lookingMission(units, {}, pod());
  const squad = base.templates[FIXTURE_TEMPLATES.infantry];
  const mech = base.templates[FIXTURE_TEMPLATES.mech];
  if (squad === undefined || mech === undefined) {
    throw new Error("fixture templates");
  }
  const kit: Readonly<Record<string, UnitTemplate>> = {
    [ROCKET_SQUAD]: { ...squad, id: ROCKET_SQUAD, weapons: [ROCKET] },
    [GRENADIER]: { ...squad, id: GRENADIER, equipment: [GRENADE.id] },
    [BREACH_MECH]: { ...mech, id: BREACH_MECH, weapons: [ARM_GUN, BACK_GUN] },
  };
  return {
    ...base,
    extraction: [DROP],
    templates: { ...base.templates, ...kit },
  };
}

/** A fixture unit of `templateId`. */
function kitted(
  id: string,
  templateId: string,
  pos: TileCoord,
  passClass: "infantry" | "mech" = "infantry",
): Unit {
  return { ...unitAt(id, passClass, pos), templateId };
}

/** One job for the whole force: the breaching order. */
const PLAN: ForcePlan = {
  jobs: [{ order: BREACH_ORDER }],
  couriers: new Set(),
  walkers: new Set(),
  spared: new Set(),
  settled: false,
};

const NEW = createNewPlayerPolicy(FIXTURE_PLAYER_RULES);
const EXPERT = createExpertPlayerPolicy(FIXTURE_PLAYER_RULES);

/** The unit called `id` in the view. */
function own(view: PlayerView, id: string): Unit {
  const unit = view.own.find((candidate) => candidate.id === id);
  if (unit === undefined) throw new Error(`no unit ${id}`);
  return unit;
}

/** The tile a move ends on. */
function endOf(command: MoveCommand): TileCoord {
  const end = command.payload.path.at(-1);
  if (end === undefined) throw new Error("empty path");
  return end;
}

// ===========================================
// Planning
// ===========================================

describe("planning a breach (#1238)", () => {
  it("has the new player blow the near plates, every wall one price to it", () => {
    const view = observe(mission([kitted("delta", ROCKET_SQUAD, at(1, 6))]));
    const breach = planBreach(
      view,
      own(view, "delta"),
      BREACH_ORDER,
      FIXTURE_PLAYER_RULES,
      NEW_PLAYER_BREACH,
    );
    expect(breach?.force).toBe(2);
    expect(breach?.wall.x).toBe(6);
  });

  it("has the expert walk round to the seam: one breach of force 1 against two plates", () => {
    const view = observe(mission([kitted("delta", ROCKET_SQUAD, at(1, 6))]));
    const breach = planBreach(
      view,
      own(view, "delta"),
      BREACH_ORDER,
      FIXTURE_PLAYER_RULES,
      EXPERT_BREACH,
    );
    expect(breach?.force).toBe(1);
    expect(SEAM).toContainEqual({
      x: breach?.wall.x,
      y: breach?.wall.y,
      z: breach?.wall.z,
    });
  });

  it("plans only the walls the force carries the force to open", () => {
    // Without the rocket nothing opens a plate: even the new player goes
    // round to the seam, which the mech's guns open.
    const view = observe(
      mission([kitted("mech", BREACH_MECH, at(1, 6), "mech")]),
    );
    const breach = planBreach(
      view,
      own(view, "mech"),
      BREACH_ORDER,
      FIXTURE_PLAYER_RULES,
      NEW_PLAYER_BREACH,
    );
    expect(breach?.force).toBe(1);
    expect(breach?.wall.x).toBe(10);
    // A rifle squad alone carries nothing that opens a wall.
    const rifles = observe(mission([unitAt("alpha", "infantry", at(1, 6))]));
    expect(
      planBreach(
        rifles,
        own(rifles, "alpha"),
        BREACH_ORDER,
        FIXTURE_PLAYER_RULES,
        NEW_PLAYER_BREACH,
      ),
    ).toBeUndefined();
  });

  it("plans the one wall for the whole force: the first on the way from the drop ship", () => {
    // A unit beside the seam still breaches where the force does, so
    // nobody waits for a blast at a wall of its own beside another's.
    const view = observe(
      mission([
        kitted("delta", ROCKET_SQUAD, at(1, 6)),
        unitAt("alpha", "infantry", at(12, 6)),
      ]),
    );
    const plan = (id: string) =>
      planBreach(
        view,
        own(view, id),
        BREACH_ORDER,
        FIXTURE_PLAYER_RULES,
        NEW_PLAYER_BREACH,
      );
    expect(plan("alpha")?.wall).toEqual(plan("delta")?.wall);
    expect(plan("alpha")?.wall.x).toBe(6);
    // Its steps are its own: a step to the seam, the seam at four, a
    // step onto the goal.
    expect(plan("alpha")?.steps).toBe(1 + 4 + 1);
  });

  it("plans none for an order that does not breach, goals in walking reach, or rules without structures", () => {
    const view = observe(mission([kitted("delta", ROCKET_SQUAD, at(1, 6))]));
    const delta = own(view, "delta");
    const { breach: _none, ...plain } = BREACH_ORDER;
    expect(
      planBreach(view, delta, plain, FIXTURE_PLAYER_RULES, NEW_PLAYER_BREACH),
    ).toBeUndefined();
    const outside = { ...BREACH_ORDER, goals: [at(3, 1)] };
    expect(
      planBreach(view, delta, outside, FIXTURE_PLAYER_RULES, NEW_PLAYER_BREACH),
    ).toBeUndefined();
    const { structures: _blind, ...blind } = FIXTURE_PLAYER_RULES;
    expect(
      planBreach(view, delta, BREACH_ORDER, blind, NEW_PLAYER_BREACH),
    ).toBeUndefined();
  });

  it("prices a job behind walls by the way through, and every other job by the walk", () => {
    const view = observe(mission([kitted("delta", ROCKET_SQUAD, at(1, 6))]));
    const delta = own(view, "delta");
    expect(stepsTo(view, delta, [GOAL])).toBe(Number.POSITIVE_INFINITY);
    const through = jobSteps(
      view,
      delta,
      BREACH_ORDER,
      FIXTURE_PLAYER_RULES,
      NEW_PLAYER_BREACH,
    );
    // Five steps to the wall, two plates at four, a step to the goal.
    expect(through).toBe(5 + 4 + 4 + 1);
    const { breach: _none, ...plain } = BREACH_ORDER;
    expect(
      jobSteps(view, delta, plain, FIXTURE_PLAYER_RULES, NEW_PLAYER_BREACH),
    ).toBe(Number.POSITIVE_INFINITY);
    const outside = { ...BREACH_ORDER, goals: [at(3, 1)] };
    expect(
      jobSteps(view, delta, outside, FIXTURE_PLAYER_RULES, NEW_PLAYER_BREACH),
    ).toBe(stepsTo(view, delta, [at(3, 1)]));
  });
});

// ===========================================
// Acting
// ===========================================

describe("breaching (#1238)", () => {
  it("gives a unit the job behind the walls rather than a fallback, for both players", () => {
    const view = observe(mission([kitted("delta", ROCKET_SQUAD, at(1, 6))]));
    expect(NEW.assign(view, PLAN).get("delta")).toEqual(BREACH_ORDER);
    expect(EXPERT.assign(view, PLAN).get("delta")).toEqual(BREACH_ORDER);
  });

  it("fires the rocket at the near plate from where it can", () => {
    const view = observe(mission([kitted("delta", ROCKET_SQUAD, at(3, 6))]));
    const command = NEW.next(own(view, "delta"), BREACH_ORDER, view);
    expect(command?.type).toBe(ATTACK);
    expect(command?.payload).toMatchObject({
      attackerId: "delta",
      weaponId: "rocket",
      tile: { x: 6, z: expect.any(Number) as number },
    });
  });

  it("holds the rocket while one of ours stands in its blast", () => {
    const wall = (view: PlayerView) =>
      planBreach(
        view,
        own(view, "delta"),
        BREACH_ORDER,
        FIXTURE_PLAYER_RULES,
        NEW_PLAYER_BREACH,
      )?.wall;
    const clear = observe(mission([kitted("delta", ROCKET_SQUAD, at(3, 6))]));
    const target = wall(clear);
    if (target === undefined) throw new Error("no breach");
    const crowded = observe(
      mission([
        kitted("delta", ROCKET_SQUAD, at(3, 6)),
        unitAt("alpha", "infantry", at(target.x - 1, target.z)),
      ]),
    );
    expect(wall(crowded)).toEqual(target);
    expect(
      NEW.next(own(crowded, "delta"), BREACH_ORDER, crowded)?.type,
    ).not.toBe(ATTACK);
  });

  it("brings a unit that cannot open the wall up to wait clear of the blast", () => {
    // Four steps out, a move of three: it stops three short, not beside
    // the wall where the rocket's blast would catch it.
    const far = observe(
      mission([
        kitted("delta", ROCKET_SQUAD, at(0, 1)),
        unitAt("alpha", "infantry", at(2, 6)),
      ]),
    );
    const target = planBreach(
      far,
      own(far, "alpha"),
      BREACH_ORDER,
      FIXTURE_PLAYER_RULES,
      NEW_PLAYER_BREACH,
    )?.wall;
    if (target === undefined) throw new Error("no breach");
    const step = NEW.next(own(far, "alpha"), BREACH_ORDER, far);
    expect(step?.type).toBe(MOVE);
    const end = endOf(step as MoveCommand);
    const field = fieldFor(far.graph, own(far, "alpha"), [target]);
    expect(field.get(far.graph.index.keyOf(own(far, "alpha").pos))).toBe(4);
    expect(field.get(far.graph.index.keyOf(end))).toBe(3);
    // There, it waits.
    const waiting = observe(
      mission([
        kitted("delta", ROCKET_SQUAD, at(0, 1)),
        unitAt("alpha", "infantry", end),
      ]),
    );
    expect(
      NEW.next(own(waiting, "alpha"), BREACH_ORDER, waiting),
    ).toBeUndefined();
  });

  it("has the expert throw a grenade at the seam, and the new player keep its grenades for bugs", () => {
    const view = observe(mission([kitted("bravo", GRENADIER, at(12, 6))]));
    const expert = EXPERT.next(own(view, "bravo"), BREACH_ORDER, view);
    expect(expert?.type).toBe(USE_EQUIPMENT);
    expect(expert?.payload).toMatchObject({ equipmentId: GRENADE.id });
    expect(SEAM).toContainEqual(
      (expert?.payload as { tile: TileCoord } | undefined)?.tile,
    );
    expect(NEW.next(own(view, "bravo"), BREACH_ORDER, view)?.type).not.toBe(
      USE_EQUIPMENT,
    );
  });

  it("has the expert take the gun that opens the widest hole, the new player the likeliest shot", () => {
    const view = observe(
      mission([kitted("mech", BREACH_MECH, at(12, 6), "mech")]),
    );
    const expert = EXPERT.next(own(view, "mech"), BREACH_ORDER, view);
    expect(expert?.type).toBe(ATTACK);
    expect(expert?.payload).toMatchObject({ weaponId: "back" });
    const novice = NEW.next(own(view, "mech"), BREACH_ORDER, view);
    expect(novice?.type).toBe(ATTACK);
    expect(novice?.payload).toMatchObject({ weaponId: "arm" });
  });
});
