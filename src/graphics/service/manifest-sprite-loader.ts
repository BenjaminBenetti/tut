import type { Texture } from "three";
import { SRGBColorSpace, TextureLoader } from "three";

import type { SpriteAssetEntry, SpriteId } from "../data/sprite-manifest";
import type { AssetLogger } from "../model/asset-logger";
import { ASSET_WARNING_PREFIX } from "../model/asset-logger";
import type { SpriteSource } from "../model/sprite-source";

// ===========================================
// Types
// ===========================================

/** The sprite manifest shape the loader reads. */
export type SpriteManifest = Readonly<Record<SpriteId, SpriteAssetEntry>>;

/** Fetches one image as a texture; three's `TextureLoader` in the app, a fake in tests. */
export type SpriteFetchFn = (url: string) => Promise<Texture>;

/** What the loader is composed from. */
export interface ManifestSpriteLoaderOptions {
  readonly manifest: SpriteManifest;
  /** Prefix for every manifest path; pass Vite's `BASE_URL` in the app. */
  readonly baseUrl: string;
  readonly logger: AssetLogger;
  /** Replaces three's `TextureLoader`; tests inject a fake here. */
  readonly fetchTexture?: SpriteFetchFn;
}

// ===========================================
// ManifestSpriteLoader
// ===========================================

/**
 * `SpriteSource` over the sprite manifest (#119): resolves an id to its
 * URL, fetches it once, marks it sRGB and caches the promise, so a burst
 * of attacks never refetches the impact sprite. A failed fetch logs once
 * and resolves `undefined`.
 */
export class ManifestSpriteLoader implements SpriteSource {
  // ===========================================
  // Fields
  // ===========================================

  private readonly manifest: SpriteManifest;
  private readonly baseUrl: string;
  private readonly logger: AssetLogger;
  private readonly fetchTexture: SpriteFetchFn;
  private readonly cache = new Map<SpriteId, Promise<Texture | undefined>>();

  // ===========================================
  // Constructor
  // ===========================================

  /** Wires the loader; nothing is fetched until `loadSprite`. */
  constructor(options: ManifestSpriteLoaderOptions) {
    this.manifest = options.manifest;
    this.baseUrl = options.baseUrl;
    this.logger = options.logger;
    this.fetchTexture = options.fetchTexture ?? createSpriteFetch();
  }

  // ===========================================
  // SpriteSource
  // ===========================================

  /** The cached sprite for an id, fetched on first request. */
  loadSprite(id: SpriteId): Promise<Texture | undefined> {
    let pending = this.cache.get(id);
    if (pending === undefined) {
      pending = this.fetch(id);
      this.cache.set(id, pending);
    }
    return pending;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Fetches the image as an sRGB texture, or logs once and yields undefined. */
  private async fetch(id: SpriteId): Promise<Texture | undefined> {
    const entry: SpriteAssetEntry | undefined = this.manifest[id];
    if (entry === undefined) {
      throw new Error(`Sprite id "${id}" is not in the manifest`);
    }
    const url = `${this.baseUrl}${entry.path}`;
    try {
      const texture = await this.fetchTexture(url);
      texture.colorSpace = SRGBColorSpace;
      texture.name = id;
      return texture;
    } catch (error: unknown) {
      this.logger.warn(
        `${ASSET_WARNING_PREFIX} Sprite "${id}" failed to load from ${url}; using flat billboards. ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/** three's `TextureLoader` as a promise-returning fetch. */
function createSpriteFetch(): SpriteFetchFn {
  const loader = new TextureLoader();
  return (url) => loader.loadAsync(url);
}
