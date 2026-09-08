import { NATURAL_MATERIAL_SURFACES } from "../data/natural-material-transition";

/** Stationary world-space material contacts, shared by slabs and fitted slopes. */
export const NATURAL_MATERIAL_FRAGMENT = `
#ifdef USE_MAP
  uniform sampler2D uNaturalField;
  uniform vec2 uNaturalSize;
  uniform sampler2D uNaturalWeights;
  uniform vec4 uNaturalUv[5];
  varying vec2 vNaturalWorld;
  varying float vNaturalUp;

  float naturalId(vec2 cell) {
    if(any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, uNaturalSize)))
      return 0.0;
    return texture2D(uNaturalField, (cell + 0.5) / uNaturalSize).r * 255.0;
  }
  vec3 naturalAlbedo() {
    vec2 naturalDx = dFdx(vNaturalWorld), naturalDz = dFdy(vNaturalWorld);
    // The unwarped owner retains walls, water and built boundaries exactly.
    if(vNaturalUp < 0.05 || naturalId(floor(vNaturalWorld)) == 0.0) {
      return texture2D(map, vMapUv).rgb;
    }
    vec4 weights = texture2D(uNaturalWeights, vNaturalWorld / uNaturalSize);
    float rockWeight = max(0.0, 1.0 - dot(weights, vec4(1.0)));
    vec3 colour = vec3(0.0);
    float total = 0.0;
    ${NATURAL_MATERIAL_SURFACES.map(
      (_, i) => `{
        float weight = ${i < 4 ? `weights[${i}]` : "rockWeight"};
        if(weight > 0.00001) {
            vec4 region = uNaturalUv[${i}];
            // Preserve the unwrapped derivatives across tile boundaries;
            // implicit derivatives of fract() select the whole atlas mip.
            vec2 span = region.zw - region.xy;
            vec3 sampleColour = textureGrad(map, mix(region.xy, region.zw,
              fract(vNaturalWorld)), naturalDx * span, naturalDz * span).rgb;
          colour += sampleColour * weight;
          total += weight;
        }
      }`,
    ).join("\n")}
    if(total > 0.00001) return colour / total;
    return texture2D(map, vMapUv).rgb;
  }
#endif
`;

/** Keeps lighting, shadows and per-instance vision tint downstream of the albedo. */
export const NATURAL_MATERIAL_SAMPLE = `
  #ifdef USE_MAP
    diffuseColor.rgb *= naturalAlbedo();
  #endif
`;
