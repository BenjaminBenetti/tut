import { describe, expect, it } from "vitest";
import type { Mesh } from "three";

import type { PlacedCharge } from "../../tactical/model/equipment";
import { ChargeView } from "./charge-view";

const charge = (id: string, x: number): PlacedCharge => ({
  id,
  ownerId: "squad",
  equipmentId: "breaching-charge",
  tile: { x, y: 0, z: 2 },
  detonatesOnTurn: 2,
});

describe("ChargeView (#1132)", () => {
  it("draws one block per set charge on its tile, adds new ones and drops the ones that went off", () => {
    const view = new ChargeView();
    view.updateCharges([charge("charge-1", 1), charge("charge-2", 4)]);
    expect(view.chargeIds()).toEqual(["charge-1", "charge-2"]);
    const [first] = view.objects();
    expect(first?.position.x).toBe(1.5);
    expect(first?.position.z).toBe(2.5);
    view.updateCharges([charge("charge-2", 4)]);
    expect(view.chargeIds()).toEqual(["charge-2"]);
    expect(view.root.children).toHaveLength(1);
    view.dispose();
    expect(view.chargeIds()).toEqual([]);
  });

  it("blinks the lamp on the frame clock", () => {
    const view = new ChargeView();
    view.updateCharges([charge("charge-1", 1)]);
    const lamp = view.objects()[0]?.children[1] as Mesh;
    const lit = lamp.material;
    view.update(0.3);
    expect(lamp.material).not.toBe(lit);
    view.update(0.25);
    expect(lamp.material).toBe(lit);
    view.dispose();
  });
});
