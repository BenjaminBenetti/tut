import { CylinderGeometry, RingGeometry, Sprite, Texture } from "three";
import { describe, expect, it } from "vitest";

import type { City } from "../../overworld/model/city";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import {
  CityMarker,
  HOVER_COLOUR,
  INFESTATION_RAMP,
  infestationColour,
  MISSION_COLOUR,
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

function makeMarker(
  city: City = CITY,
  glyph?: Texture,
  text?: { textTexture: (name: string) => Texture | undefined },
): CityMarker {
  const geometry = {
    body: new CylinderGeometry(0.3, 0.3, 0.25, 12),
    ring: new RingGeometry(0.4, 0.5, 8),
  };
  return new CityMarker(
    city,
    BASE,
    { geometry, glyph, text },
    OVERWORLD_SCENE_CONFIG,
  );
}

/** A stub that rasterises any name to a 128 × 64 texture. */
function textSource(): {
  textTexture: (name: string) => Texture | undefined;
  asked: string[];
} {
  const asked: string[] = [];
  return {
    asked,
    textTexture: (name) => {
      asked.push(name);
      const texture = new Texture();
      texture.image = { width: 128, height: 64 };
      return texture;
    },
  };
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
  it("draws a sprite centred on its city, sized from the config (#420)", () => {
    const marker = makeMarker(CITY, new Texture());
    expect(marker.usesGlyph()).toBe(true);
    expect(marker.pickTarget).toBeInstanceOf(Sprite);
    const sprite = marker.pickTarget as Sprite;
    // Centred, not bottom-anchored: a bottom-anchored sprite draws
    // entirely above its anchor in screen space, which read as the
    // marker sitting off its city.
    expect(sprite.center.toArray()).toEqual([0.5, 0.5]);
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

  it("reports its city's own position as the pick point (#420)", () => {
    const marker = makeMarker(CITY, new Texture());
    marker.object.updateMatrixWorld(true);
    expect(marker.pickPoint()).toEqual({ x: BASE.x, y: BASE.y, z: BASE.z });
  });

  it("puts the mission badge beside the marker on the ground plane, not above it (#420)", () => {
    const marker = makeMarker(CITY, new Texture());
    const badge = marker.object.getObjectByName(`city-badge-${CITY.id}`);
    expect(badge).toBeDefined();
    if (!badge) return;
    // East and north of the marker, so it reads up and to the right
    // under the straight-down camera; an offset in y would point at it.
    expect(badge.position.x).toBeGreaterThan(0);
    expect(badge.position.z).toBeLessThan(0);
    expect(badge.position.y).toBeLessThan(
      OVERWORLD_SCENE_CONFIG.markerGlyphSize / 2,
    );
  });
});

describe("CityMarker mission badge", () => {
  it("is hidden until setMission and reports through look()", () => {
    const marker = makeMarker();
    const badge = marker.object.getObjectByName(`city-badge-${CITY.id}`);
    expect(badge).toBeDefined();
    expect(badge?.visible).toBe(false);
    expect(marker.hasMission()).toBe(false);
    marker.setMission(true);
    expect(badge?.visible).toBe(true);
    expect(marker.look()).toEqual({
      colourHex: marker.colourHex(),
      mission: true,
    });
    marker.setMission(false);
    expect(badge?.visible).toBe(false);
  });

  it("draws the badge as a sprite when a mission glyph is given, tinted MISSION_COLOUR", () => {
    const geometry = {
      body: new CylinderGeometry(1, 1, 1, 12),
      ring: new RingGeometry(1, 2, 24),
    };
    const marker = new CityMarker(
      CITY,
      { x: 0, y: 0, z: 0 },
      { geometry, glyph: new Texture(), missionGlyph: new Texture() },
      OVERWORLD_SCENE_CONFIG,
    );
    const badge = marker.object.getObjectByName(`city-badge-${CITY.id}`);
    expect(badge).toBeInstanceOf(Sprite);
    expect((badge as Sprite).material.color.getHex()).toBe(MISSION_COLOUR);
    expect(badge!.position.x).toBeGreaterThan(0);
    expect(badge!.position.y).toBeGreaterThan(0);
  });
});

describe("CityMarker name label (#439)", () => {
  const labelOf = (marker: CityMarker) =>
    marker.object.getObjectByName(`city-label-${CITY.id}`);

  it("draws the city's name south of the marker, hidden until it is wanted", () => {
    const text = textSource();
    const marker = makeMarker(CITY, new Texture(), text);
    expect(text.asked).toEqual([CITY.name]);
    const label = labelOf(marker);
    expect(label).toBeDefined();
    expect(label?.visible).toBe(false);
    expect(marker.labelVisible()).toBe(false);
    // South on the ground plane, which is below the icon on screen under
    // the strategic map's straight-down camera; the badge goes east and
    // north, so they never sit on each other.
    expect(label?.position.z).toBeGreaterThan(0);
    expect(label?.position.x).toBe(0);
  });

  it("shows the name while hovered or selected, and hides it again", () => {
    const marker = makeMarker(CITY, new Texture(), textSource());
    marker.setHovered(true);
    expect(marker.labelVisible()).toBe(true);
    marker.setHovered(false);
    expect(marker.labelVisible()).toBe(false);
    marker.setSelected(true);
    expect(marker.labelVisible()).toBe(true);
    marker.setSelected(false);
    expect(marker.labelVisible()).toBe(false);
  });

  it("draws no label at all without a text source, as in the headless sim", () => {
    const marker = makeMarker(CITY, new Texture());
    expect(labelOf(marker)).toBeUndefined();
    marker.setHovered(true);
    expect(marker.labelVisible()).toBe(false);
  });
});
