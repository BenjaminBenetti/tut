import type { Object3D } from "three";
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  RingGeometry,
  Texture,
} from "three";
import { describe, expect, it } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { City } from "../../overworld/model/city";
import type { ModelLoader } from "../model/model-loader";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import {
  CITY_STAND_IN_HEIGHT,
  CityMarker,
  HOVER_COLOUR,
  INFESTATION_RAMP,
  infestationColour,
} from "./city-marker";

// ===========================================
// Fixtures
// ===========================================

const CITY: City = {
  id: "london",
  name: "London",
  regionId: "western-europe",
  infestation: 0,
  scale: "city",
  population: 1_000_000,
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

/** The shared geometry a builder would own. */
function geometry() {
  return {
    pad: new CircleGeometry(0.34, 24),
    ring: new RingGeometry(0.4, 0.48, 24),
    pick: new CylinderGeometry(0.3, 0.3, 0.4, 12),
    standIn: new BoxGeometry(0.6, CITY_STAND_IN_HEIGHT, 0.6),
  };
}

/**
 * A loader that answers every id with a fresh named group and records
 * what was asked; `placeholderFor` ids come back named like the real
 * fallback factory's boxes.
 */
function fakeLoader(
  placeholderFor: readonly ModelAssetId[] = [],
): ModelLoader & {
  asked: ModelAssetId[];
} {
  const asked: ModelAssetId[] = [];
  return {
    asked,
    load: (id) => {
      asked.push(id);
      const model = new Group();
      model.name = placeholderFor.includes(id) ? `placeholder:${id}` : id;
      return Promise.resolve(model);
    },
    preload: () => Promise.resolve(),
  };
}

function makeMarker(
  city: City = CITY,
  models?: ModelLoader,
  text?: { textTexture: (name: string) => Texture | undefined },
): CityMarker {
  return new CityMarker(
    city,
    BASE,
    { geometry: geometry(), models, text },
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

/** Lets every pending model load land. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function named(marker: CityMarker, name: string): Object3D | undefined {
  return marker.object.getObjectByName(name);
}

// ===========================================
// Ramp
// ===========================================

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

// ===========================================
// Stand-in
// ===========================================

describe("CityMarker (stand-in, no loader)", () => {
  it("stands on the plate top, named after its city, with a block, a pad and an invisible pick solid", () => {
    const marker = makeMarker();
    expect(marker.object.name).toBe("city-london");
    expect(marker.object.position.toArray()).toEqual([1, 0.05, 2]);
    expect(marker.usesModel()).toBe(false);
    expect(marker.look().model).toBe("stand-in");
    expect(named(marker, "city-stand-in-london")).toBeInstanceOf(Mesh);
    expect(named(marker, "city-pad-london")).toBeInstanceOf(Mesh);
    expect(marker.pickTarget.name).toBe("city-body-london");
    expect(marker.pickTarget.visible).toBe(false);
  });

  it("tints the pad by infestation and retints in place", () => {
    const marker = makeMarker();
    expect(marker.colourHex()).toBe(stop(0));
    marker.setInfestation(100);
    expect(marker.colourHex()).toBe(stop(3));
    expect(marker.look().colourHex).toBe(stop(3));
  });

  it("grows the visual and takes the accent while hovered, then restores its colour", () => {
    const marker = makeMarker();
    marker.setInfestation(50);
    const before = marker.colourHex();
    marker.setHovered(true);
    expect(marker.colourHex()).toBe(HOVER_COLOUR);
    expect(named(marker, "city-visual-london")?.scale.x).toBeGreaterThan(1);
    marker.setHovered(false);
    expect(marker.colourHex()).toBe(before);
    expect(named(marker, "city-visual-london")?.scale.x).toBe(1);
  });

  it("shows the ring only while selected", () => {
    const marker = makeMarker();
    const ring = named(marker, "city-ring-london");
    expect(ring?.visible).toBe(false);
    marker.setSelected(true);
    expect(ring?.visible).toBe(true);
    marker.setSelected(false);
    expect(ring?.visible).toBe(false);
  });

  it("reports its city's own position as the pick point (#420)", () => {
    const marker = makeMarker();
    marker.object.updateMatrixWorld(true);
    expect(marker.pickPoint()).toEqual(BASE);
  });

  it("wants no eggs without a loader but still reports the mission", () => {
    const marker = makeMarker();
    marker.setMission(true);
    expect(marker.hasMission()).toBe(true);
    expect(marker.look().mission).toBe(true);
    expect(named(marker, "city-eggs-london")).toBeUndefined();
  });
});

// ===========================================
// Models
// ===========================================

describe("CityMarker (settlement model, #1155)", () => {
  it("loads the settlement for the city's scale under the visual, reporting glb", async () => {
    const loader = fakeLoader();
    const marker = makeMarker({ ...CITY, scale: "town" }, loader);
    expect(marker.look().model).toBe("loading");
    await settled();
    expect(loader.asked).toEqual(["overworld.settlement.town"]);
    expect(marker.usesModel()).toBe(true);
    expect(marker.look().model).toBe("glb");
    const settlement = named(marker, "city-settlement-london");
    expect(settlement?.parent?.name).toBe("city-visual-london");
    expect(named(marker, "city-stand-in-london")).toBeUndefined();
  });

  it("reports a placeholder when the loader fell back to a box", async () => {
    const marker = makeMarker(CITY, fakeLoader(["overworld.settlement.city"]));
    await settled();
    expect(marker.look().model).toBe("placeholder");
    expect(marker.usesModel()).toBe(true);
  });

  it("adds the matching egg overlay at the settlement's origin while a mission is on offer, and removes it after", async () => {
    const loader = fakeLoader();
    const marker = makeMarker({ ...CITY, scale: "rural" }, loader);
    await settled();
    marker.setMission(true);
    await settled();
    expect(loader.asked).toEqual([
      "overworld.settlement.rural",
      "overworld.settlement-eggs.rural",
    ]);
    const eggs = named(marker, "city-eggs-london");
    expect(eggs).toBeDefined();
    expect(eggs?.parent?.name).toBe("city-visual-london");
    expect(eggs?.position.toArray()).toEqual([0, 0, 0]);
    expect(marker.look().mission).toBe(true);

    marker.setMission(false);
    expect(named(marker, "city-eggs-london")).toBeUndefined();
    expect(marker.look().mission).toBe(false);

    // Toggling back on reuses the overlay rather than fetching again.
    marker.setMission(true);
    await settled();
    expect(named(marker, "city-eggs-london")).toBeDefined();
    expect(loader.asked).toHaveLength(2);
  });

  it("does not add eggs that arrive after the mission is already gone", async () => {
    let finish!: (model: Object3D) => void;
    const marker = makeMarker(CITY, {
      load: (id) =>
        id === "overworld.settlement.city"
          ? Promise.resolve(new Group())
          : new Promise<Object3D>((resolve) => {
              finish = resolve;
            }),
      preload: () => Promise.resolve(),
    });
    await settled();
    marker.setMission(true);
    marker.setMission(false);
    finish(new Group());
    await settled();
    expect(named(marker, "city-eggs-london")).toBeUndefined();
  });

  it("drops a settlement that loads after disposal", async () => {
    let finish!: (model: Object3D) => void;
    const marker = makeMarker(CITY, {
      load: () =>
        new Promise<Object3D>((resolve) => {
          finish = resolve;
        }),
      preload: () => Promise.resolve(),
    });
    marker.dispose();
    finish(new Group());
    await settled();
    expect(named(marker, "city-settlement-london")).toBeUndefined();
    expect(marker.look().model).toBe("loading");
  });
});

// ===========================================
// Labels
// ===========================================

describe("CityMarker name label (#439)", () => {
  it("draws the city's name south of the settlement, hidden until it is wanted", () => {
    const text = textSource();
    const marker = makeMarker(CITY, undefined, text);
    expect(text.asked).toEqual(["London"]);
    const label = named(marker, "city-label-london");
    expect(label).toBeDefined();
    expect(label?.visible).toBe(false);
    expect(label?.position.z).toBeGreaterThan(0);
    expect(label?.position.x).toBe(0);
    // Twice as wide as tall, like its texture.
    expect(label?.scale.x).toBeCloseTo((label?.scale.y ?? 0) * 2, 5);
    expect(marker.labelVisible()).toBe(false);
  });

  it("shows the name while hovered or selected, and hides it again", () => {
    const marker = makeMarker(CITY, undefined, textSource());
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
    const marker = makeMarker();
    expect(named(marker, "city-label-london")).toBeUndefined();
    marker.setHovered(true);
    expect(marker.labelVisible()).toBe(false);
  });
});
