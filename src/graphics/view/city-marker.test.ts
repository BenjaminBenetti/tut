import { CylinderGeometry, RingGeometry } from "three";
import { describe, expect, it } from "vitest";

import type { City } from "../../overworld/model/city";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import { CityMarker, INFESTATION_RAMP, infestationColour } from "./city-marker";

const CITY: City = {
  id: "london",
  name: "London",
  regionId: "western-europe",
  infestation: 0,
  neighbourIds: [],
  layout: { x: 0.5, y: 0.2 },
};

function channels(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function makeMarker(city: City = CITY): CityMarker {
  const geometry = {
    body: new CylinderGeometry(0.3, 0.3, 0.25, 8),
    ring: new RingGeometry(0.4, 0.5, 8),
  };
  return new CityMarker(
    city,
    { x: 1, y: 0.15, z: 2 },
    geometry,
    OVERWORLD_SCENE_CONFIG,
  );
}

describe("infestationColour", () => {
  it("is the clear colour at 0 and the overrun colour at 100", () => {
    expect(infestationColour(0)).toBe(INFESTATION_RAMP.clear);
    expect(infestationColour(100)).toBe(INFESTATION_RAMP.overrun);
  });

  it("is the channel-wise midpoint at 50", () => {
    const [r0, g0, b0] = channels(INFESTATION_RAMP.clear);
    const [r1, g1, b1] = channels(INFESTATION_RAMP.overrun);
    expect(channels(infestationColour(50))).toEqual([
      Math.round((r0 + r1) / 2),
      Math.round((g0 + g1) / 2),
      Math.round((b0 + b1) / 2),
    ]);
  });

  it("loses green and gains red as infestation rises", () => {
    let previousGreen = Number.POSITIVE_INFINITY;
    for (let infestation = 0; infestation <= 100; infestation += 10) {
      const [, green] = channels(infestationColour(infestation));
      expect(green).toBeLessThanOrEqual(previousGreen);
      previousGreen = green;
    }
    const [redClear] = channels(infestationColour(0));
    const [redOverrun] = channels(infestationColour(100));
    expect(redOverrun).toBeGreaterThan(redClear);
  });

  it("clamps out-of-range and treats non-numbers as clear", () => {
    expect(infestationColour(-20)).toBe(INFESTATION_RAMP.clear);
    expect(infestationColour(250)).toBe(INFESTATION_RAMP.overrun);
    expect(infestationColour(Number.NaN)).toBe(INFESTATION_RAMP.clear);
  });
});

describe("CityMarker", () => {
  it("stands on the plate top, named after its city", () => {
    const marker = makeMarker();
    expect(marker.object.name).toBe("city-london");
    expect(marker.object.position.x).toBe(1);
    expect(marker.object.position.z).toBe(2);
    expect(marker.object.position.y).toBeCloseTo(
      0.15 + OVERWORLD_SCENE_CONFIG.markerHeight / 2,
    );
  });

  it("starts coloured for the city's infestation and recolours in place", () => {
    const marker = makeMarker({ ...CITY, infestation: 100 });
    expect(marker.colourHex()).toBe(INFESTATION_RAMP.overrun);
    const body = marker.body;
    marker.setInfestation(0);
    expect(marker.colourHex()).toBe(INFESTATION_RAMP.clear);
    expect(marker.body).toBe(body);
  });

  it("grows while hovered and shrinks back", () => {
    const marker = makeMarker();
    marker.setHovered(true);
    expect(marker.body.scale.x).toBeGreaterThan(1);
    marker.setHovered(false);
    expect(marker.body.scale.x).toBe(1);
  });

  it("shows the ring only while selected", () => {
    const marker = makeMarker();
    const ring = marker.object.getObjectByName("city-ring-london");
    expect(ring?.visible).toBe(false);
    marker.setSelected(true);
    expect(ring?.visible).toBe(true);
    marker.setSelected(false);
    expect(ring?.visible).toBe(false);
  });
});
