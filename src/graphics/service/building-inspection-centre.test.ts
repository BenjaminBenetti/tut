import { OrthographicCamera, Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Building } from "../../mapgen/model/building";
import { buildingInspectionCentre } from "./building-inspection-centre";
import { tileTop } from "../view/tactical-map-view";

const building: Building = {
  id: "house",
  kind: "house",
  footprint: [{ x: 0, z: 0, w: 8, d: 8 }],
  groundLevel: 0,
  floors: [
    { index: 0, y: 0, rooms: [] },
    { index: 1, y: 2, rooms: [] },
  ],
  roof: { kind: "pitched", walkable: false },
  entrances: [],
  connectorIds: [],
};

describe("building inspection depth", () => {
  it("keeps the raw cursor projection while targeting the upper room", () => {
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.set(14, 16, 14);
    camera.lookAt(4, 0, 4);
    camera.updateMatrixWorld();
    const hit = new Vector3(3, 4, 3);
    const direction = camera.getWorldDirection(new Vector3());
    const centre = buildingInspectionCentre(
      building,
      hit,
      new Ray(camera.position, direction),
    )!;
    expect(centre.y).toBeCloseTo(tileTop(2) + 0.7);
    const screenHit = hit.clone().project(camera),
      screenCentre = centre.clone().project(camera);
    expect(screenCentre.x).toBeCloseTo(screenHit.x, 10);
    expect(screenCentre.y).toBeCloseTo(screenHit.y, 10);
  });

  it("stops before the far shell when the floor intersection would leave the building", () => {
    const hit = new Vector3(4, 4, 7.9);
    const centre = buildingInspectionCentre(
      building,
      hit,
      new Ray(new Vector3(), new Vector3(0, -1, 1).normalize()),
    )!;
    expect(centre.z).toBeGreaterThan(hit.z);
    expect(centre.z).toBeLessThan(8);
    expect(centre.y).toBeGreaterThan(tileTop(2) + 1);
  });

  it("does not dig through the ground floor or use an upward-looking ray", () => {
    expect(
      buildingInspectionCentre(
        building,
        new Vector3(4, tileTop(0), 4),
        new Ray(new Vector3(), new Vector3(0, -1, 0)),
      ),
    ).toBeUndefined();
    expect(
      buildingInspectionCentre(
        building,
        new Vector3(4, 4, 4),
        new Ray(new Vector3(), new Vector3(0, 1, 0)),
      ),
    ).toBeUndefined();
  });

  it("keeps the centre just under a hit that is lower than the inspection height", () => {
    const hit = new Vector3(4, tileTop(0) + 0.4, 4);
    const centre = buildingInspectionCentre(
      building,
      hit,
      new Ray(new Vector3(), new Vector3(0, -1, 0)),
    )!;
    expect(centre.y).toBeCloseTo(hit.y - 0.05);
    expect(centre.y).toBeGreaterThan(tileTop(0));
  });
});
