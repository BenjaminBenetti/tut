import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelAssetEntry, ModelManifest } from "../model/asset-manifest";
import type { AssetLogger } from "../model/asset-logger";
import type { FallbackModelFactory, ModelLoader } from "../model/model-loader";

// ===========================================
// Types
// ===========================================

/** Fetches and parses one GLB by URL, resolving to its scene root. */
export type SceneLoadFn = (url: string) => Promise<Object3D>;

/** What the loader is composed from. */
export interface GltfModelLoaderOptions {
  readonly manifest: ModelManifest;
  /** Prefix for every manifest path; pass Vite's `BASE_URL` in the app. */
  readonly baseUrl: string;
  /** Builds the stand-in returned when a GLB fails to load. */
  readonly fallback: FallbackModelFactory;
  readonly logger: AssetLogger;
  /** Replaces three's `GLTFLoader`; tests inject a fake here. */
  readonly loadScene?: SceneLoadFn;
}

// ===========================================
// Constants
// ===========================================

/**
 * Prefix on every fallback warning. The end-to-end smoke test fails on any
 * console warning carrying it, so a broken asset path cannot slip through
 * even though the app itself keeps running on the placeholder.
 */
export const ASSET_WARNING_PREFIX = "[assets]";

// ===========================================
// GltfModelLoader
// ===========================================

/**
 * `ModelLoader` over the typed manifest. Each id is fetched at most once;
 * the parsed scene is kept as a prototype and every `load` hands out a
 * deep clone that shares geometry and materials with it. A fetch that
 * fails is logged once and replaced by a placeholder, which is cached
 * the same way so the warning never repeats.
 *
 * ```
 *   load(id) ──► prototypes.get(id)? ──no──► fetch ──ok──► scene ─┐
 *                      │ yes                   │fail            │
 *                      │                       ▼                 │
 *                      │              warn + fallback.create ────┤
 *                      ▼                                         ▼
 *                 await prototype ◄──────────────── cache promise ┘
 *                      │
 *                      ▼
 *                 prototype.clone(true)
 * ```
 */
export class GltfModelLoader implements ModelLoader {
  // ===========================================
  // Fields
  // ===========================================

  private readonly manifest: ModelManifest;
  private readonly baseUrl: string;
  private readonly fallback: FallbackModelFactory;
  private readonly logger: AssetLogger;
  private readonly loadScene: SceneLoadFn;
  /** Pending or settled prototype per id; caching the promise dedupes concurrent loads. */
  private readonly prototypes = new Map<ModelAssetId, Promise<Object3D>>();

  // ===========================================
  // Constructor
  // ===========================================

  /** Wires the loader; nothing is fetched until `load` or `preload`. */
  constructor(options: GltfModelLoaderOptions) {
    this.manifest = options.manifest;
    this.baseUrl = options.baseUrl;
    this.fallback = options.fallback;
    this.logger = options.logger;
    this.loadScene = options.loadScene ?? createGltfSceneLoader();
  }

  // ===========================================
  // ModelLoader
  // ===========================================

  /** Returns a fresh clone of the cached prototype, fetching it first if needed. */
  async load(id: ModelAssetId): Promise<Object3D> {
    const prototype = await this.prototype(id);
    return prototype.clone(true);
  }

  /** Fetches every id into the cache, in parallel. */
  async preload(ids: readonly ModelAssetId[]): Promise<void> {
    await Promise.all(ids.map((id) => this.prototype(id)));
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** The cached prototype promise for an id, started on first request. */
  private prototype(id: ModelAssetId): Promise<Object3D> {
    let pending = this.prototypes.get(id);
    if (pending === undefined) {
      pending = this.fetchPrototype(id);
      this.prototypes.set(id, pending);
    }
    return pending;
  }

  /** Fetches the GLB, or logs once and builds the placeholder. */
  private async fetchPrototype(id: ModelAssetId): Promise<Object3D> {
    const entry = this.entryFor(id);
    const url = `${this.baseUrl}${entry.path}`;
    try {
      const scene = await this.loadScene(url);
      scene.name = id;
      return scene;
    } catch (error: unknown) {
      this.logger.warn(
        `${ASSET_WARNING_PREFIX} Model "${id}" failed to load from ${url}; using a placeholder. ${describeError(error)}`,
      );
      return this.fallback.create(id, entry);
    }
  }

  /** Looks an id up in the manifest. Throws: an unregistered id is a programmer error. */
  private entryFor(id: ModelAssetId): ModelAssetEntry {
    const entry: ModelAssetEntry | undefined = this.manifest[id];
    if (entry === undefined) {
      throw new Error(`Model id "${id}" is not in the manifest`);
    }
    return entry;
  }
}

// ===========================================
// Helpers
// ===========================================

/** The production `SceneLoadFn`: three's GLTFLoader, one instance reused. */
function createGltfSceneLoader(): SceneLoadFn {
  const loader = new GLTFLoader();
  return async (url) => (await loader.loadAsync(url)).scene;
}

/** Renders whatever was thrown as one line for the log. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
