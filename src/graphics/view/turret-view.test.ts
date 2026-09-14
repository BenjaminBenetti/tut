import { Group } from "three";
import { describe, expect, it } from "vitest";

import type { Unit } from "../../tactical/model/unit";
import {
  GUN_SWEEP_ARC,
  TURRET_GUN_NAME,
  TURRET_HUSK_NAME,
  TURRET_SMOKE_NAME,
  TurretView,
} from "./turret-view";

/** A turret as the rules leave it, patched with `overrides`. */
function turret(id: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    kind: "turret",
    team: "tdf",
    sourceId: "turret",
    templateId: "turret:turret",
    pos: { x: 2, y: 0, z: 3 },
    facing: "e",
    hp: 30,
    maxHp: 30,
    ap: 0,
    maxAp: 0,
    status: ["overwatch"],
    passClass: "infantry",
    turnsLeft: 3,
    ...overrides,
  };
}

/** A stand-in for the turret GLB: a body and the `gun` node the real one exports. */
function turretModel(): Group {
  const model = new Group();
  const gun = new Group();
  gun.name = TURRET_GUN_NAME;
  model.add(gun);
  return model;
}

const loader = {
  load: () => Promise.resolve(turretModel()),
  preload: () => Promise.resolve(),
};

describe("TurretView (#1138)", () => {
  it("sweeps a living turret's gun, leaves a smoking husk where one burnt out, and nothing where one was destroyed", async () => {
    const drawn = new Map<string, Group>([["t1", turretModel()]]);
    const view = new TurretView(loader, (id) => drawn.get(id));
    await view.updateTurrets([
      turret("t1"),
      turret("t2", { hp: 0, turnsLeft: 0, pos: { x: 5, y: 0, z: 5 } }),
      turret("t3", { hp: 0, turnsLeft: 2 }),
    ]);
    expect(view.counts()).toEqual({ sweeping: 1, husks: 1 });
    // A quarter of the sweep's period: the gun is at the end of its arc.
    view.update(2);
    const gun = drawn.get("t1")!.getObjectByName(TURRET_GUN_NAME)!;
    expect(gun.rotation.y).toBeCloseTo(GUN_SWEEP_ARC, 5);
    const husk = view.root.getObjectByName(`${TURRET_HUSK_NAME}:t2`)!;
    expect(husk.position.x).toBe(5.5);
    expect(husk.rotation.y).toBeCloseTo(-Math.PI / 2, 5);
    expect(husk.getObjectByName(TURRET_SMOKE_NAME)).toBeDefined();
    expect(view.root.getObjectByName(`${TURRET_HUSK_NAME}:t3`)).toBeUndefined();
    // Burning out stops the sweep; a husk the mission no longer holds goes.
    await view.updateTurrets([turret("t1", { hp: 0, turnsLeft: 0 })]);
    expect(view.counts()).toEqual({ sweeping: 0, husks: 1 });
    expect(view.root.getObjectByName(`${TURRET_HUSK_NAME}:t2`)).toBeUndefined();
    expect(view.root.getObjectByName(`${TURRET_HUSK_NAME}:t1`)).toBeDefined();
    view.dispose();
    expect(view.root.children).toHaveLength(0);
  });

  it("does not resurrect a husk when a model load finishes after disposal", async () => {
    let finish!: (object: Group) => void;
    const view = new TurretView(
      {
        load: () =>
          new Promise<Group>((resolve) => {
            finish = resolve;
          }),
        preload: () => Promise.resolve(),
      },
      () => undefined,
    );
    const pending = view.updateTurrets([turret("t2", { hp: 0, turnsLeft: 0 })]);
    view.dispose();
    finish(turretModel());
    await pending;
    expect(view.counts()).toEqual({ sweeping: 0, husks: 0 });
    expect(view.root.children).toHaveLength(0);
  });
});
