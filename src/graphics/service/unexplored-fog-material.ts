import { Color } from "three";
import type { Material } from "three";

import {
  UNEXPLORED_FOG_COLOUR,
  UNEXPLORED_FOG_LAYERS,
  UNEXPLORED_FOG_STRENGTH,
} from "../data/unexplored-fog";

/** The same stationary wisps for fog in air and fog over opaque surfaces. */
export const MIST_PATTERN = `
  float mistHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float mistNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mistHash(cell), mistHash(cell + vec2(1.0, 0.0)), f.x),
               mix(mistHash(cell + vec2(0.0, 1.0)), mistHash(cell + vec2(1.0)), f.x), f.y);
  }
  float mistWisp(vec2 world, float offset) {
    vec2 p = vec2(world.x * 0.36 + world.y * 0.13, world.y * 0.8);
    float wisp = mistNoise(p + offset) * 0.7 + mistNoise(p * 2.1 - offset) * 0.3;
    return smoothstep(0.18, 0.8, wisp);
  }
`;

/**
 * Clones a terrain material and continues the approved mist over faces
 * that rise through its sheets. A surface replaces each sheet it hides,
 * so the ground keeps its existing strength instead of getting fog twice.
 * Preserves the incoming shader hook/cache key, including ghost cutaways.
 */
export function withUnexploredMist(base: Material): Material {
  const material = base.clone();
  const previousCompile = base.onBeforeCompile.bind(base);
  const previousKey = base.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer): void => {
    previousCompile(shader, renderer);
    shader.uniforms.uMistStrength = { value: UNEXPLORED_FOG_STRENGTH };
    shader.uniforms.uMistColour = { value: new Color(UNEXPLORED_FOG_COLOUR) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 unexploredMist;
        varying vec4 vMistTile;
        varying vec3 vMistWorld;
      `,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 mistPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mistPosition = instanceMatrix * mistPosition;
        #endif
        vMistWorld = (modelMatrix * mistPosition).xyz;
        vMistTile = unexploredMist;
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uMistStrength;
        uniform vec3 uMistColour;
        varying vec4 vMistTile;
        varying vec3 vMistWorld;
        ${MIST_PATTERN}
      `,
      )
      .replace(
        "#include <colorspace_fragment>",
        `#include <colorspace_fragment>
        if (vMistTile.w > 0.5) {
          float mistTransmission = 1.0;
          // A wall/prop may overhang its owning tile. Its exploration
          // belongs to that tile, not the neighbour under its vertices.
          vec2 outside = abs(vMistWorld.xz - vMistTile.xy);
          float overhang = step(0.501, max(outside.x, outside.y));
          ${UNEXPLORED_FOG_LAYERS.map(
            (lift) => `
            {
              float displaced = max(overhang, smoothstep(${(lift - 0.08).toFixed(2)},
                ${(lift + 0.08).toFixed(2)}, vMistWorld.y - vMistTile.z));
              float alpha = displaced * uMistStrength * mistWisp(vMistWorld.xz, ${(lift * 3.7).toFixed(6)});
              mistTransmission *= 1.0 - alpha;
            }
          `,
          ).join("\n")}
          vec3 mistColour = uMistColour;
          #if defined(TONE_MAPPING)
            mistColour = toneMapping(mistColour);
          #endif
          mistColour = linearToOutputTexel(vec4(mistColour, 1.0)).rgb;
          // The air sheets blend in output space too. Keep the same read
          // on dark facades without making their geometry transparent.
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mistColour, 1.0 - mistTransmission);
        }
      `,
      );
  };
  material.customProgramCacheKey = (): string =>
    `${previousKey}:unexplored-mist`;
  return material;
}
