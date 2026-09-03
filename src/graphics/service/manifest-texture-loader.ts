import type { Texture } from "three";
import { LinearSRGBColorSpace, SRGBColorSpace, TextureLoader } from "three";

import type { TextureAssetEntry, TextureId } from "../data/texture-manifest";
import type { AssetLogger } from "../model/asset-logger";
import { ASSET_WARNING_PREFIX } from "../model/asset-logger";
import type { TextureSource } from "../model/texture-source";

// ===========================================
// Types
// ===========================================

/** The manifest shape the loader reads: every registered id to its entry. */
export type TextureManifest = Readonly<Record<TextureId, TextureAssetEntry>>;

/** Fetches and decodes one image by URL into a texture. */
export type TextureFetchFn = (url: string) => Promise<Texture>;

/** What the loader is composed from. */
export interface ManifestTextureLoaderOptions {
  readonly manifest: TextureManifest;
  /** Prefix for every manifest path; pass Vite's `BASE_URL` in the app. */
  readonly baseUrl: string;
  readonly logger: AssetLogger;
  /** Replaces three's `TextureLoader`; tests inject a fake here. */
  readonly fetchTexture?: TextureFetchFn;
}

// ===========================================
// ManifestTextureLoader
// ===========================================

/**
 * `TextureSource` over the typed manifest. Each id is fetched at most
 * once and the promise is cached, so concurrent requests share one
 * download. The manifest's colour space is applied to the texture. A
 * failed fetch is logged with the asset prefix and cached as `undefined`
 * so the warning never repeats.
 *
 * ```
 *   loadTexture(id) ──► cache.get(id)? ──no──► fetch ──ok──► colourSpace ─┐
 *                            │ yes              │fail                    │
 *                            │                  ▼                        │
 *                            │           warn, undefined ────────────────┤
 *                            ▼                                           ▼
 *                       await cached ◄──────────────────── cache promise ┘
 * ```
 */
export class ManifestTextureLoader implements TextureSource {
  // ===========================================
  // Fields
  // ===========================================

  private readonly manifest: TextureManifest;
  private readonly baseUrl: string;
  private readonly logger: AssetLogger;
  private readonly fetchTexture: TextureFetchFn;
  private readonly cache = new Map<TextureId, Promise<Texture | undefined>>();

  // ===========================================
  // Constructor
  // ===========================================

  /** Wires the loader; nothing is fetched until `loadTexture`. */
  constructor(options: ManifestTextureLoaderOptions) {
    this.manifest = options.manifest;
    this.baseUrl = options.baseUrl;
    this.logger = options.logger;
    this.fetchTexture = options.fetchTexture ?? createTextureFetch();
  }

  // ===========================================
  // TextureSource
  // ===========================================

  /** The cached texture for an id, fetched on first request. */
  loadTexture(id: TextureId): Promise<Texture | undefined> {
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

  /** Fetches the image and applies the manifest colour space, or logs once. */
  private async fetch(id: TextureId): Promise<Texture | undefined> {
    const entry = this.entryFor(id);
    const url = `${this.baseUrl}${entry.path}`;
    try {
      const texture = await this.fetchTexture(url);
      texture.colorSpace =
        entry.colorSpace === "srgb" ? SRGBColorSpace : LinearSRGBColorSpace;
      texture.name = id;
      return texture;
    } catch (error: unknown) {
      this.logger.warn(
        `${ASSET_WARNING_PREFIX} Texture "${id}" failed to load from ${url}; using flat colours. ${describeError(error)}`,
      );
      return undefined;
    }
  }

  /** Looks an id up in the manifest. Throws: an unregistered id is a programmer error. */
  private entryFor(id: TextureId): TextureAssetEntry {
    const entry: TextureAssetEntry | undefined = this.manifest[id];
    if (entry === undefined) {
      throw new Error(`Texture id "${id}" is not in the manifest`);
    }
    return entry;
  }
}

// ===========================================
// Helpers
// ===========================================

/** The production `TextureFetchFn`: three's `TextureLoader`, one instance reused. */
function createTextureFetch(): TextureFetchFn {
  const loader = new TextureLoader();
  return (url) => loader.loadAsync(url);
}

/** Renders whatever was thrown as one line for the log. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
