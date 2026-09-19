import { Mesh, MeshBasicMaterial, RingGeometry } from "three";
import { describe, expect, it } from "vitest";
import { BLIP_RENDER_ORDER, OBJECTIVE_BLIP_COLOUR } from "./intel-blip-painter";
import {
  OBJECTIVE_MARKER_PREFIX,
  OBJECTIVE_MARKERS_NAME,
  ObjectiveMarkerView,
} from "./objective-marker-view";

describe("ObjectiveMarkerView", () => {
  it("draws a white diamond above fog and roofs for every marker and clears stale ones (#1173)", () => {
    const view = new ObjectiveMarkerView();
    expect(view.root.name).toBe(OBJECTIVE_MARKERS_NAME);
    view.updateMarkers([
      { objectiveId: "o-1", pos: { x: 9, y: 0, z: 3 } },
      { objectiveId: "o-2", pos: { x: 10, y: 2, z: 4 } },
    ]);
    expect(view.count()).toBe(2);
    const blip = view.root.getObjectByName(`${OBJECTIVE_MARKER_PREFIX}o-1`)!;
    expect(blip.position.x).toBe(9.5);
    expect(blip.position.z).toBe(3.5);
    let halos = 0;
    view.root.traverse((object) => {
      if (
        !(object instanceof Mesh) ||
        !(object.material instanceof MeshBasicMaterial)
      )
        return;
      expect(object.material.color.getHex()).toBe(OBJECTIVE_BLIP_COLOUR);
      expect(object.material.depthTest).toBe(false);
      expect(object.material.depthWrite).toBe(false);
      expect(object.renderOrder).toBe(BLIP_RENDER_ORDER);
      if (object.geometry instanceof RingGeometry) {
        halos++;
        // Four segments: the radar's structure square, which reads as a diamond.
        expect(object.geometry.parameters.thetaSegments).toBe(4);
      }
    });
    expect(halos).toBe(2);
    view.updateMarkers([{ objectiveId: "o-2", pos: { x: 10, y: 2, z: 4 } }]);
    expect(view.count()).toBe(1);
    expect(
      view.root.getObjectByName(`${OBJECTIVE_MARKER_PREFIX}o-1`),
    ).toBeUndefined();
    view.updateMarkers([]);
    expect(view.count()).toBe(0);
    view.dispose();
    expect(view.root.children).toHaveLength(0);
  });
});
