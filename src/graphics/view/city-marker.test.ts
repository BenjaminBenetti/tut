import type { MeshBasicMaterial, Object3D } from "three";
import { BoxGeometry, CylinderGeometry, Group, Mesh, Texture } from "three";
import { describe, expect, it } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { City } from "../../overworld/model/city";
import type { ModelLoader } from "../model/model-loader";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import type { SettlementStyleSource } from "../model/settlement-style";
import { settlementVariation } from "../service/settlement-variation";
import {
  CITY_STAND_IN_HEIGHT,
  CityMarker,
  SELECTION_COLOUR,
} from "./city-marker";
import { cornerBracketGeometry } from "./corner-bracket-geometry";

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

/** The shared geometry a builder would own. */
function geometry() {
  return {
    brackets: cornerBracketGeometry(0.37, 0.09, 0.015),
    pick: new CylinderGeometry(0.3, 0.3, 0.4, 12),
    standIn: new BoxGeometry(0.6, CITY_STAND_IN_HEIGHT, 0.6),
  };
}

/** A style table that sends Western Europe to `european` and everything else to `east-asian`. */
const STYLES: SettlementStyleSource = {
  styleFor: (regionId) =>
    regionId === "western-europe" ? "european" : "east-asian",
};

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
    { geometry: geometry(), styles: STYLES, models, text },
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
// Stand-in
// ===========================================

describe("CityMarker (stand-in, no loader)", () => {
  it("stands on the map plane, named after its city, with a block, brackets and an invisible pick solid, and no halo", () => {
    const marker = makeMarker();
    expect(marker.object.name).toBe("city-london");
    expect(marker.object.position.toArray()).toEqual([1, 0.05, 2]);
    expect(marker.usesModel()).toBe(false);
    expect(marker.look().model).toBe("stand-in");
    expect(named(marker, "city-stand-in-london")).toBeInstanceOf(Mesh);
    expect(named(marker, "city-brackets-london")).toBeInstanceOf(Mesh);
    expect(named(marker, "city-halo-london")).toBeUndefined();
    expect(named(marker, "city-ring-london")).toBeUndefined();
    expect(marker.pickTarget.name).toBe("city-body-london");
    expect(marker.pickTarget.visible).toBe(false);
  });

  it("draws nothing around a city that is neither hovered nor selected", () => {
    const marker = makeMarker();
    expect(marker.bracketsVisible()).toBe(false);
    expect(marker.labelVisible()).toBe(false);
  });

  it("grows the visual and shows faint orange brackets while hovered, then hides them", () => {
    const marker = makeMarker();
    marker.setHovered(true);
    expect(named(marker, "city-visual-london")?.scale.x).toBeGreaterThan(1);
    expect(marker.bracketsVisible()).toBe(true);
    expect(marker.bracketOpacity()).toBeLessThan(0.5);
    const brackets = named(marker, "city-brackets-london") as Mesh;
    expect((brackets.material as MeshBasicMaterial).color.getHex()).toBe(
      SELECTION_COLOUR,
    );
    marker.setHovered(false);
    expect(named(marker, "city-visual-london")?.scale.x).toBe(1);
    expect(marker.bracketsVisible()).toBe(false);
  });

  it("shows solid brackets while selected, whether or not hovered", () => {
    const marker = makeMarker();
    marker.setSelected(true);
    expect(marker.bracketsVisible()).toBe(true);
    expect(marker.bracketOpacity()).toBeGreaterThan(0.9);
    marker.setHovered(true);
    expect(marker.bracketOpacity()).toBeGreaterThan(0.9);
    marker.setHovered(false);
    expect(marker.bracketsVisible()).toBe(true);
    marker.setSelected(false);
    expect(marker.bracketsVisible()).toBe(false);
  });

  it("applies the city's own mirror, yaw and height to the variant group", () => {
    const marker = makeMarker();
    const variation = settlementVariation("london");
    const variant = named(marker, "city-variant-london");
    expect(variant?.rotation.y).toBeCloseTo(variation.yaw, 9);
    expect(variant?.scale.x).toBe(variation.mirrored ? -1 : 1);
    expect(variant?.scale.y).toBeCloseTo(variation.heightScale, 9);
    expect(variant?.scale.z).toBe(1);
    expect(marker.look().variation).toEqual(variation);
  });

  it("varies two cities of the same style and scale differently", () => {
    const london = makeMarker();
    const paris = makeMarker({ ...CITY, id: "paris", name: "Paris" });
    expect(london.look().modelId).toBe(paris.look().modelId);
    expect(london.look().variation).not.toEqual(paris.look().variation);
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
  it("loads the settlement for the region's style and the city's scale under the variant, reporting glb", async () => {
    const loader = fakeLoader();
    const marker = makeMarker({ ...CITY, scale: "town" }, loader);
    expect(marker.look().model).toBe("loading");
    await settled();
    expect(loader.asked).toEqual(["overworld.settlement.european.town"]);
    expect(marker.usesModel()).toBe(true);
    expect(marker.look().model).toBe("glb");
    expect(marker.look().style).toBe("european");
    expect(marker.look().modelId).toBe("overworld.settlement.european.town");
    const settlement = named(marker, "city-settlement-london");
    expect(settlement?.parent?.name).toBe("city-variant-london");
    expect(named(marker, "city-stand-in-london")).toBeUndefined();
  });

  it("gives Tokyo and London different models at the same scale", async () => {
    const loader = fakeLoader();
    makeMarker(CITY, loader);
    makeMarker(
      { ...CITY, id: "tokyo", name: "Tokyo", regionId: "east-asia" },
      loader,
    );
    await settled();
    expect(loader.asked).toEqual([
      "overworld.settlement.european.city",
      "overworld.settlement.east-asian.city",
    ]);
  });

  it("reports a placeholder when the loader fell back to a box", async () => {
    const marker = makeMarker(
      CITY,
      fakeLoader(["overworld.settlement.european.city"]),
    );
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
      "overworld.settlement.european.rural",
      "overworld.settlement-eggs.european.rural",
    ]);
    const eggs = named(marker, "city-eggs-london");
    expect(eggs).toBeDefined();
    expect(eggs?.parent?.name).toBe("city-variant-london");
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
        id === "overworld.settlement.european.city"
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
