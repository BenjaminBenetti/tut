import { CylinderGeometry, RingGeometry, Sprite, Texture } from "three";
import { describe, expect, it } from "vitest";

import type { City } from "../../overworld/model/city";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import {
  CityMarker,
  HOVER_COLOUR,
  INFESTATION_RAMP,
  infestationColour,
} from "./city-marker";

const CITY: City = {
  id: "london",
  name: "London",
  regionId: "western-europe",
  infestation: 0,
  scale: "city",
  neighbourIds: [],
  layout: { x: 0.5, y: 0.2 },
};

const BASE = { x: 1, y: 0.05, z: 2 };

function channels(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function stop(index: number): number {
  const entry = INFESTATION_RAMP[index];
  if (!entry) throw new Error("missing stop");
  return entry.hex;
}

function makeMarker(city: City = CITY, glyph?: Texture): CityMarker {
  const geometry = {
    body: new CylinderGeometry(0.3, 0.3, 0.25, 12),
    ring: new RingGeometry(0.4, 0.5, 8),
  };
  return new CityMarker(
    city,
    BASE,
    { geometry, glyph },
    OVERWORLD_SCENE_CONFIG,
  );
}

describe("infestationColour", () => {
  it("hits every ramp stop exactly", () => {
    expect(infestationColour(0)).toBe(stop(0));
    expect(infestationColour(100 / 3)).toBe(stop(1));
    expect(infestationColour(200 / 3)).toBe(stop(2));
    expect(infestationColour(100)).toBe(stop(3));
  });

  it("is the channel-wise midpoint between two neighbouring stops", () => {
    const [r0, g0, b0] = channels(stop(0));
    const [r1, g1, b1] = channels(stop(1));
    expect(channels(infestationColour(100 / 6))).toEqual([
      Math.round((r0 + r1) / 2),
      Math.round((g0 + g1) / 2),
      Math.round((b0 + b1) / 2),
    ]);
  });

  it("stays between its neighbouring stops on every channel", () => {
    for (let infestation = 0; infestation <= 100; infestation += 5) {
      const t = infestation / 100;
      const upperIndex = INFESTATION_RAMP.findIndex((s) => s.at >= t);
      const lowerIndex = Math.max(0, upperIndex === 0 ? 0 : upperIndex - 1);
      const lower = channels(stop(lowerIndex));
      const upper = channels(stop(upperIndex));
      const actual = channels(infestationColour(infestation));
      for (let c = 0; c < 3; c++) {
        const lo = Math.min(lower[c] ?? 0, upper[c] ?? 0);
        const hi = Math.max(lower[c] ?? 0, upper[c] ?? 0);
        expect(actual[c]).toBeGreaterThanOrEqual(lo);
        expect(actual[c]).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("clamps out-of-range and treats non-numbers as clean", () => {
    expect(infestationColour(-20)).toBe(stop(0));
    expect(infestationColour(250)).toBe(stop(3));
    expect(infestationColour(Number.NaN)).toBe(stop(0));
  });
});

describe("CityMarker (disc fallback)", () => {
  it("stands on the plate top, named after its city, and does not use a glyph", () => {
    const marker = makeMarker();
    expect(marker.object.name).toBe("city-london");
    expect(marker.object.position.toArray()).toEqual([BASE.x, BASE.y, BASE.z]);
    expect(marker.usesGlyph()).toBe(false);
    expect(marker.pickTarget.name).toBe("city-body-london");
  });

  it("starts coloured for the city's infestation and retints in place", () => {
    const marker = makeMarker({ ...CITY, infestation: 100 });
    expect(marker.colourHex()).toBe(stop(3));
    const target = marker.pickTarget;
    marker.setInfestation(0);
    expect(marker.colourHex()).toBe(stop(0));
    expect(marker.pickTarget).toBe(target);
  });

  it("grows and takes the accent while hovered, then restores its colour", () => {
    const marker = makeMarker({ ...CITY, infestation: 50 });
    const resting = marker.colourHex();
    marker.setHovered(true);
    expect(marker.pickTarget.scale.x).toBeGreaterThan(1);
    expect(marker.colourHex()).toBe(HOVER_COLOUR);
    marker.setHovered(false);
    expect(marker.pickTarget.scale.x).toBe(1);
    expect(marker.colourHex()).toBe(resting);
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

  it("reports a pick point at the centre of the disc", () => {
    const marker = makeMarker();
    marker.object.updateMatrixWorld(true);
    expect(marker.pickPoint()).toEqual({
      x: BASE.x,
      y: BASE.y + OVERWORLD_SCENE_CONFIG.markerHeight / 2,
      z: BASE.z,
    });
  });
});

describe("CityMarker (glyph sprite)", () => {
  it("draws a bottom-anchored sprite sized from the config", () => {
    const marker = makeMarker(CITY, new Texture());
    expect(marker.usesGlyph()).toBe(true);
    expect(marker.pickTarget).toBeInstanceOf(Sprite);
    const sprite = marker.pickTarget as Sprite;
    expect(sprite.center.toArray()).toEqual([0.5, 0]);
    expect(sprite.scale.x).toBe(OVERWORLD_SCENE_CONFIG.markerGlyphSize);
    expect(sprite.scale.y).toBe(OVERWORLD_SCENE_CONFIG.markerGlyphSize);
  });

  it("tints the sprite by infestation and by hover", () => {
    const marker = makeMarker({ ...CITY, infestation: 100 }, new Texture());
    expect(marker.colourHex()).toBe(stop(3));
    marker.setHovered(true);
    expect(marker.colourHex()).toBe(HOVER_COLOUR);
    expect(marker.pickTarget.scale.x).toBeGreaterThan(
      OVERWORLD_SCENE_CONFIG.markerGlyphSize,
    );
    marker.setHovered(false);
    expect(marker.colourHex()).toBe(stop(3));
    expect(marker.pickTarget.scale.x).toBe(
      OVERWORLD_SCENE_CONFIG.markerGlyphSize,
    );
  });

  it("reports a pick point just above the anchor, inside the glyph", () => {
    const marker = makeMarker(CITY, new Texture());
    marker.object.updateMatrixWorld(true);
    const lift = marker.pickPoint().y - BASE.y;
    expect(lift).toBeGreaterThan(0);
    expect(lift).toBeLessThan(OVERWORLD_SCENE_CONFIG.markerGlyphSize / 2);
  });
});
