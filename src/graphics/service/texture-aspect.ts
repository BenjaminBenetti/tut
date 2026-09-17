import type { Texture } from "three";

/**
 * Width over height of a texture's image, so a sprite wearing it is
 * not stretched. Falls back to square for a texture with no measurable
 * image (a bare `Texture` in tests, or one still loading).
 */
export function textureAspect(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | null;
  const width = image?.width ?? 1;
  const height = image?.height ?? 1;
  return height > 0 ? width / height : 1;
}
