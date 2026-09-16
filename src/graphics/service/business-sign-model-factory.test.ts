/// <reference types="node" />
import { readFileSync } from "node:fs";
import {
  Box3,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Matrix3,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Texture,
  Vector3,
} from "three";
import type { BufferGeometry, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import { BUSINESS_SIGN_ATLASES } from "../data/business-sign-atlases";
import { MODEL_MANIFEST } from "../data/model-manifest";
import type { TextureId } from "../data/texture-manifest";
import type { ModelLoader } from "../model/model-loader";
import { BusinessSignModelFactory } from "./business-sign-model-factory";

type SignMesh = Mesh<BufferGeometry, MeshStandardMaterial>;

/** Models the loader's fresh scene clones with borrowed geometry, materials and textures. */
function fixture(flipY = false) {
  const source = new Group();
  const embedded = new Texture();
  embedded.flipY = false;
  const print = new MeshStandardMaterial({ map: embedded, roughness: 0.82 });
  print.name = "business-print-grocery";
  const fascia = new Mesh(new PlaneGeometry(3, 0.28), print);
  fascia.name = "fascia";
  // Authored glTF print coordinates run from the image's top downwards.
  fascia.geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2),
  );
  const canopy = new Mesh(
    new BoxGeometry(3, 0.06, 0.66),
    new MeshStandardMaterial(),
  );
  canopy.name = "canopy";
  source.add(fascia, canopy);
  const load = vi.fn((_id: ModelAssetId) =>
    Promise.resolve(source.clone(true)),
  );
  const models: ModelLoader = { load, preload: () => Promise.resolve() };
  const pages = new Map<TextureId, Texture>();
  for (const id of BUSINESS_SIGN_ATLASES.grocery) {
    const texture = new Texture();
    texture.flipY = flipY;
    pages.set(id, texture);
  }
  const loadTexture = vi.fn((id: TextureId): Promise<Texture | undefined> =>
    Promise.resolve(pages.get(id)),
  );
  const factory = new BusinessSignModelFactory(models, { loadTexture });
  return {
    factory,
    source,
    fascia,
    canopy,
    embedded,
    pages,
    load,
    loadTexture,
  };
}

/** Finds a deliberately named mesh without relying on material ordering. */
function meshNamed(model: Object3D, name: string): SignMesh {
  const mesh = model.getObjectByName(name);
  if (!(mesh instanceof Mesh)) throw new Error(`Missing test mesh ${name}`);
  return mesh as SignMesh;
}

/** Parses the real printed canopy while replacing only browser image decoding. */
async function shippedCanopy(): Promise<Group> {
  const parser = new GLTFLoader().register(() => ({
    name: "business-sign-test-texture",
    loadTexture: () => {
      const texture = new Texture();
      texture.flipY = false;
      return Promise.resolve(texture);
    },
  }));
  const bytes = readFileSync(
    new URL(
      `../../../public/${MODEL_MANIFEST["building.business-grocery"].path}`,
      import.meta.url,
    ),
  );
  const gltf = await parser.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  return gltf.scene;
}

describe("named business sign models", () => {
  for (const flipY of [false, true]) {
    it.each([
      [0, "business.grocery.0", 3.5, 98.5],
      [9, "business.grocery.0", 921.5, 1016.5],
      [10, "business.grocery.1", 3.5, 98.5],
      [49, "business.grocery.4", 921.5, 1016.5],
    ] as const)(
      `keeps name %i inside its padded row with flipY=${flipY}`,
      async (nameIndex, page, topPixel, bottomPixel) => {
        const { factory, loadTexture, load } = fixture(flipY);
        const result = await factory.create({ kind: "grocery", nameIndex });
        const uv = meshNamed(result, "fascia").geometry.getAttribute("uv");
        expect(loadTexture).toHaveBeenCalledWith(page);
        expect(load).toHaveBeenCalledWith("building.business-grocery");
        // Pixel centers exclude neighbouring rows even at the final atlas row.
        expect(uv.getX(0)).toBeCloseTo(0.5 / 1024, 7);
        expect(uv.getX(1)).toBeCloseTo(1023.5 / 1024, 7);
        expect((flipY ? 1 - uv.getY(0) : uv.getY(0)) * 1024).toBeCloseTo(
          topPixel,
          5,
        );
        expect((flipY ? 1 - uv.getY(2) : uv.getY(2)) * 1024).toBeCloseTo(
          bottomPixel,
          5,
        );
        factory.dispose();
      },
    );
  }

  it("caches a name and shares page materials without changing source art or textures", async () => {
    const { factory, source, fascia, canopy, embedded, pages, load } =
      fixture();
    const sourceUv = [...fascia.geometry.getAttribute("uv").array];
    const first = factory.create({ kind: "grocery", nameIndex: 0 });
    expect(factory.create({ kind: "grocery", nameIndex: 0 })).toBe(first);
    const [a, b, c] = await Promise.all([
      first,
      factory.create({ kind: "grocery", nameIndex: 1 }),
      factory.create({ kind: "grocery", nameIndex: 10 }),
    ]);
    expect(load).toHaveBeenCalledTimes(3);
    const printed = [a, b, c].map((model) => meshNamed(model, "fascia"));
    expect(printed[0]!.material).toBe(printed[1]!.material);
    expect(printed[0]!.material).not.toBe(printed[2]!.material);
    expect(printed[0]!.geometry).not.toBe(printed[1]!.geometry);
    expect(printed[0]!.material.map).toBe(pages.get("business.grocery.0"));
    expect(printed[2]!.material.map).toBe(pages.get("business.grocery.1"));
    expect(printed[0]!.material.roughness).toBe(fascia.material.roughness);
    expect(fascia.material.map).toBe(embedded);
    expect([...fascia.geometry.getAttribute("uv").array]).toEqual(sourceUv);
    expect(source.children).toEqual([fascia, canopy]);
    for (const model of [a, b, c]) {
      expect(meshNamed(model, "canopy").geometry).toBe(canopy.geometry);
      expect(meshNamed(model, "canopy").material).toBe(canopy.material);
      expect(new Box3().setFromObject(model)).toEqual(
        new Box3().setFromObject(source),
      );
    }
    for (const texture of pages.values()) {
      expect(texture.offset.toArray()).toEqual([0, 0]);
      expect(texture.repeat.toArray()).toEqual([1, 1]);
      expect(texture.flipY).toBe(false);
    }
    factory.dispose();
  });

  it("retains the authored fallback when the atlas cannot load", async () => {
    const { factory, fascia, loadTexture } = fixture();
    loadTexture.mockResolvedValue(undefined);
    const result = await factory.create({ kind: "grocery", nameIndex: 49 });
    const printed = meshNamed(result, "fascia");
    expect(printed.geometry).toBe(fascia.geometry);
    expect(printed.material).toBe(fascia.material);
    const dispose = vi.spyOn(fascia.material, "dispose");
    factory.dispose();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposes only copied print resources, once, while source assets remain reusable", async () => {
    const { factory, fascia, canopy, embedded, pages } = fixture();
    const [a, b] = await Promise.all([
      factory.create({ kind: "grocery", nameIndex: 0 }),
      factory.create({ kind: "grocery", nameIndex: 1 }),
    ]);
    const copied = [meshNamed(a, "fascia"), meshNamed(b, "fascia")];
    const disposedCopies = copied.map((mesh) =>
      vi.spyOn(mesh.geometry, "dispose"),
    );
    const disposedPrint = vi.spyOn(copied[0]!.material, "dispose");
    const borrowed = [
      fascia.geometry,
      fascia.material,
      canopy.geometry,
      canopy.material,
      embedded,
      ...pages.values(),
    ].map((resource) => vi.spyOn(resource, "dispose"));
    factory.dispose();
    factory.dispose();
    for (const spy of disposedCopies) expect(spy).toHaveBeenCalledTimes(1);
    expect(disposedPrint).toHaveBeenCalledTimes(1);
    for (const spy of borrowed) expect(spy).not.toHaveBeenCalled();
  });

  it("allocates no print resources when a texture finishes after disposal", async () => {
    const { factory, fascia, embedded, pages, load, loadTexture } = fixture();
    let finishTexture!: (texture: Texture) => void;
    const pendingTexture = new Promise<Texture>((resolve) => {
      finishTexture = resolve;
    });
    loadTexture.mockReturnValue(pendingTexture);
    const sourceUv = [...fascia.geometry.getAttribute("uv").array];
    const cloneGeometry = vi.spyOn(fascia.geometry, "clone");
    const cloneMaterial = vi.spyOn(fascia.material, "clone");
    const pending = factory.create({ kind: "grocery", nameIndex: 0 });
    factory.dispose();
    finishTexture(pages.get("business.grocery.0")!);
    expect((await pending).children).toHaveLength(0);
    expect(cloneGeometry).not.toHaveBeenCalled();
    expect(cloneMaterial).not.toHaveBeenCalled();
    expect([...fascia.geometry.getAttribute("uv").array]).toEqual(sourceUv);
    expect(fascia.material.map).toBe(embedded);
    expect(
      (await factory.create({ kind: "grocery", nameIndex: 1 })).children,
    ).toHaveLength(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(loadTexture).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "accepts the shipped GLB's print material and front orientation (flipY=%s)",
    async (flipY) => {
      const source = await shippedCanopy();
      source.updateMatrixWorld(true);
      const sourceUvs = new Map<BufferGeometry, number[]>();
      source.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const geometry = (object as SignMesh).geometry;
        const uv = geometry.getAttribute("uv");
        if (uv) sourceUvs.set(geometry, [...uv.array]);
      });
      const atlas = new Texture();
      atlas.flipY = flipY;
      const factory = new BusinessSignModelFactory(
        {
          load: () => Promise.resolve(source.clone(true)),
          preload: () => Promise.resolve(),
        },
        { loadTexture: () => Promise.resolve(atlas) },
      );
      const result = await factory.create({ kind: "grocery", nameIndex: 49 });
      result.updateMatrixWorld(true);
      const printed: SignMesh[] = [];
      result.traverse((object) => {
        if (
          object instanceof Mesh &&
          (object.material as MeshStandardMaterial).map === atlas
        )
          printed.push(object as SignMesh);
      });
      expect(printed).toHaveLength(1);
      const mesh = printed[0]!;
      const positions = mesh.geometry.getAttribute("position");
      const normals = mesh.geometry.getAttribute("normal");
      const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
      const uv = mesh.geometry.getAttribute("uv");
      const corners = new Set<string>();
      for (let i = 0; i < positions.count; i++) {
        const position = new Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(mesh.matrixWorld);
        const normal = new Vector3()
          .fromBufferAttribute(normals, i)
          .applyNormalMatrix(normalMatrix);
        if (normal.z < 0.99 || Math.abs(position.z - 0.66) > 1e-5) continue;
        const topDownPixel = (flipY ? 1 - uv.getY(i) : uv.getY(i)) * 1024;
        // On the outward face, the text's top must be physically above its bottom.
        if (position.y > 0.27 && (uv.getX(i) < 0.01 || uv.getX(i) > 0.99)) {
          expect(topDownPixel).toBeCloseTo(921.5, 4);
          corners.add("top");
        }
        if (position.y < 0.01 && (uv.getX(i) < 0.01 || uv.getX(i) > 0.99)) {
          expect(topDownPixel).toBeCloseTo(1016.5, 4);
          corners.add("bottom");
        }
      }
      expect(corners).toEqual(new Set(["top", "bottom"]));
      expect(new Box3().setFromObject(result)).toEqual(
        new Box3().setFromObject(source),
      );
      for (const [geometry, original] of sourceUvs) {
        expect([...geometry.getAttribute("uv").array]).toEqual(original);
      }
      factory.dispose();
    },
  );
});
