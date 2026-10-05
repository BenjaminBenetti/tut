import {
  AdditiveBlending,
  BufferAttribute,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
} from "three";

import type { FrameUpdatable } from "../model/frame-updatable";

// ===========================================
// Constants
// ===========================================

/** The name the beacon's group goes by under its node, for tests and the inspector. */
export const STORY_BEACON_NAME = "story-beacon";

/** The name of the gem that turns over the model. */
export const STORY_GEM_NAME = "story-gem";

/**
 * Height of the light shaft in world units, from the pedestal top. A
 * model is at most 1.6 tall, so the shaft rises four times past it and
 * still shows above the crowd when the whole web is in view.
 */
export const STORY_BEACON_HEIGHT = 7;

/** The gem's spin, in radians per second: faster than the turntable, so it catches the eye. */
export const STORY_GEM_RATE = 1.2;

/**
 * The beacon's brightness once the research is done, as a share of
 * full: it still says "story", but no longer pulls the eye from the
 * story work still open.
 */
export const STORY_BEACON_DIM = 0.4;

/**
 * The two layers of the shaft: a wide, faint glow round a narrow, bright
 * core. Each tapers towards the top and fades from `alpha` at the foot
 * to nothing at the top.
 */
const SHAFT_LAYERS: readonly {
  readonly foot: number;
  readonly top: number;
  readonly alpha: number;
}[] = [
  { foot: 0.36, top: 0.2, alpha: 0.32 },
  { foot: 0.09, top: 0.05, alpha: 0.85 },
];

/** Alpha falls as `(1 - t) ^ FADE_POWER` up the shaft, so the light hangs low and thins out. */
const FADE_POWER = 1.6;

/** Rings up the shaft, so the fade has vertices to follow its curve. */
const SHAFT_HEIGHT_SEGMENTS = 8;

/** Sides round the shaft; not a multiple of 8, as the scene's other solids. */
const SHAFT_RADIAL_SEGMENTS = 12;

/** The gem: its radius, its stretch into a diamond, and its centre's height above the pedestal top. */
const GEM_RADIUS = 0.26;
const GEM_STRETCH = 1.4;
const GEM_LIFT = 2.15;

/** How brightly the gem glows at full brightness. */
const GEM_GLOW = 0.7;

// ===========================================
// TechStoryBeacon
// ===========================================

/**
 * The beacon over a story node's pedestal on the tech graph (#1237): a
 * tall shaft of gold light with a gold diamond turning above the model,
 * so story research stands out when the whole web is in view.
 *
 * ```
 *        ┆        glow + core, fading to nothing at
 *        ┆        STORY_BEACON_HEIGHT
 *        ┆
 *        ◆        gem, GEM_LIFT up, turning at STORY_GEM_RATE
 *       ▟█▙       the node's model
 *    (───────)    pedestal top: the beacon's foot, y = 0
 * ```
 *
 * It stays cheap under SwiftShader: two open cylinders drawn with the
 * built-in unlit material and additive blending, faded by a per-vertex
 * alpha, so no fragment runs a loop. It writes no depth and casts no
 * shadow. It is not a pick solid; the scene builder picks against its
 * own cylinders only, so a click through the shaft reaches the node
 * behind it.
 *
 * The owner adds `object` under the node and frees the geometry and
 * materials with the rest of its scene.
 */
export class TechStoryBeacon implements FrameUpdatable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this under the node, at the pedestal top. */
  readonly object = new Group();
  private readonly shaftMaterials: MeshBasicMaterial[] = [];
  private readonly gem: Mesh;
  private readonly gemMaterial: MeshStandardMaterial;
  private dimmed = false;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param colour - The beacon's tint: `--ui-story`, as a hex number. */
  constructor(colour: number) {
    this.object.name = STORY_BEACON_NAME;
    for (const layer of SHAFT_LAYERS) {
      const material = new MeshBasicMaterial({
        color: colour,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      });
      this.shaftMaterials.push(material);
      this.object.add(
        new Mesh(shaftGeometry(layer.foot, layer.top, layer.alpha), material),
      );
    }
    this.gemMaterial = new MeshStandardMaterial({
      color: colour,
      emissive: colour,
      emissiveIntensity: GEM_GLOW,
      flatShading: true,
      roughness: 0.35,
      metalness: 0.2,
    });
    this.gem = new Mesh(new OctahedronGeometry(GEM_RADIUS), this.gemMaterial);
    this.gem.name = STORY_GEM_NAME;
    this.gem.scale.y = GEM_STRETCH;
    this.gem.position.y = GEM_LIFT;
    this.object.add(this.gem);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Turns the gem. */
  update(deltaSeconds: number): void {
    this.gem.rotation.y += STORY_GEM_RATE * deltaSeconds;
  }

  /**
   * Dims the shaft and the gem to `STORY_BEACON_DIM` of full, or
   * brings them back up.
   */
  setDimmed(dimmed: boolean): void {
    this.dimmed = dimmed;
    const share = dimmed ? STORY_BEACON_DIM : 1;
    for (const material of this.shaftMaterials) {
      material.opacity = share;
    }
    this.gemMaterial.emissiveIntensity = GEM_GLOW * share;
  }

  /** Whether the beacon is dimmed, for tests and hooks. */
  isDimmed(): boolean {
    return this.dimmed;
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * One open, tapering cylinder standing on y = 0, `STORY_BEACON_HEIGHT`
 * tall, whose vertex alpha fades from `alpha` at its foot to 0 at its
 * top. Its colour channels are white, so the material's colour tints it.
 */
function shaftGeometry(
  foot: number,
  top: number,
  alpha: number,
): CylinderGeometry {
  const geometry = new CylinderGeometry(
    top,
    foot,
    STORY_BEACON_HEIGHT,
    SHAFT_RADIAL_SEGMENTS,
    SHAFT_HEIGHT_SEGMENTS,
    true,
  );
  geometry.translate(0, STORY_BEACON_HEIGHT / 2, 0);
  const positions = geometry.getAttribute("position");
  const colours = new Float32Array(positions.count * 4);
  for (let index = 0; index < positions.count; index++) {
    const rise = Math.min(
      1,
      Math.max(0, positions.getY(index) / STORY_BEACON_HEIGHT),
    );
    colours.set([1, 1, 1, alpha * Math.pow(1 - rise, FADE_POWER)], index * 4);
  }
  geometry.setAttribute("color", new BufferAttribute(colours, 4));
  return geometry;
}
