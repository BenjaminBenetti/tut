import type { BufferGeometry, Object3D, Texture } from "three";
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
} from "three";

import type { Vec3 } from "../../core/model/grid";
import type { City, CityId } from "../../overworld/model/city";
import { MAX_INFESTATION, MIN_INFESTATION } from "../../overworld/model/city";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";

// ===========================================
// Colour ramp
// ===========================================

/** One stop on the infestation ramp: normalised position and colour. */
export interface RampStop {
  /** Position in `[0, 1]`; stops are listed in ascending order. */
  readonly at: number;
  readonly hex: number;
}

/**
 * Infestation ramp from the Art Director (#74): `ui-ok` (clean) through
 * `ui-bug` (infested) and `ui-warn` to `ui-danger` (overrun), evenly
 * spaced.
 */
export const INFESTATION_RAMP: readonly RampStop[] = [
  { at: 0, hex: 0x7ccb5a },
  { at: 1 / 3, hex: 0x9cff3d },
  { at: 2 / 3, hex: 0xf0c63c },
  { at: 1, hex: 0xe0453c },
];

/** Hovered marker tint: `ui-accent`. */
export const HOVER_COLOUR = 0xf08a24;

/** Selection ring colour: `tdf-orange`, the style guide's selection accent. */
export const SELECTION_COLOUR = 0xf08a24;

/** How much a hovered marker grows. */
const HOVER_SCALE = 1.25;

/** Emissive strength of a hovered disc marker; unhovered discs emit nothing. */
const HOVER_EMISSIVE = 0.6;

/** Sprites draw after translucent plates so the plate tint never sits on the glyph. */
const SPRITE_RENDER_ORDER = 2;

/** Fraction of the glyph height above the anchor where `pickPoint` sits. */
const GLYPH_PICK_LIFT = 0.1;

/** Mission badge tint: `ui-info`, distinct from every infestation stop and the accent. */
export const MISSION_COLOUR = 0x7fd1ff;

/** Badge size relative to the marker glyph, and where it sits relative to the pin. */
const BADGE_SCALE = 0.45;
const BADGE_OFFSET_X = 0.55;
const BADGE_OFFSET_Y = 0.85;

/** Badges draw after the marker so they sit on top of the pin. */
const BADGE_RENDER_ORDER = 3;

/**
 * Maps infestation `0–100` to a colour on the ramp, as a `0xRRGGBB`
 * number. Channels are interpolated linearly in sRGB between the two
 * nearest stops; values outside the range clamp to the nearest end and a
 * non-number counts as clean.
 */
export function infestationColour(infestation: number): number {
  const span = MAX_INFESTATION - MIN_INFESTATION;
  const raw = (infestation - MIN_INFESTATION) / span;
  const t = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  const [first] = INFESTATION_RAMP;
  if (!first) {
    return 0;
  }
  let lower = first;
  let upper = first;
  for (const stop of INFESTATION_RAMP) {
    if (stop.at <= t) {
      lower = stop;
    }
    upper = stop;
    if (stop.at >= t) {
      break;
    }
  }
  const width = upper.at - lower.at;
  const local = width > 0 ? (t - lower.at) / width : 0;
  const channel = (shift: number): number => {
    const a = (lower.hex >> shift) & 0xff;
    const b = (upper.hex >> shift) & 0xff;
    return Math.round(a + (b - a) * local);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

// ===========================================
// Marker
// ===========================================

/** Geometries shared by every marker; the scene builder owns and disposes them. */
export interface CityMarkerGeometry {
  /** The pickable body of a disc marker. */
  readonly body: BufferGeometry;
  /** Flat ring shown under a selected marker. */
  readonly ring: BufferGeometry;
}

/** How markers look: shared geometry and, when art is available, the glyphs. */
export interface CityMarkerLook {
  readonly geometry: CityMarkerGeometry;
  /** White-on-transparent glyph; `undefined` draws a disc instead. */
  readonly glyph: Texture | undefined;
  /** White-on-transparent mission glyph for the badge; `undefined` draws a small disc. */
  readonly missionGlyph?: Texture | undefined;
}

/** What a marker currently shows, for tests and the dev hooks. */
export interface CityMarkerLookReport {
  /** Tint as `0xRRGGBB`; hover overrides infestation. */
  readonly colourHex: number;
  /** True while the active-mission badge is shown. */
  readonly mission: boolean;
}

/**
 * One city on the strategic map: a pin glyph (or a disc when the glyph
 * is missing) tinted by infestation, accent-tinted and grown while
 * hovered, ringed while selected, badged while its city has an active
 * mission. Holds no game truth; `setInfestation` and `setMission` are
 * how state reaches it.
 *
 * ```
 *          ╱▔▔╲ ◆  glyph sprite, anchored at its bottom edge, mission
 *          ╲__╱    badge up and to the right (or discs without art)
 *       ═════╧═════  ring, visible only when selected
 *     ───────────────  plate top = the marker's base
 * ```
 */
export class CityMarker {
  // ===========================================
  // Fields
  // ===========================================

  readonly cityId: CityId;
  /** Add this to the scene; it carries the visual and the ring. */
  readonly object: Group;
  /** The object raycasts hit. */
  readonly pickTarget: Object3D;
  private readonly visual: Sprite | Mesh;
  private readonly material: SpriteMaterial | MeshStandardMaterial;
  private readonly ring: Mesh;
  private readonly ringMaterial: MeshStandardMaterial;
  private readonly badge: Sprite | Mesh;
  private readonly badgeMaterial: SpriteMaterial | MeshStandardMaterial;
  private readonly config: OverworldSceneConfig;
  private infestationHex = 0;
  private hovered = false;
  private mission = false;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param city - The city to represent; its id names the objects.
   * @param base - Point on the plate top the marker stands on.
   * @param look - Shared geometry and optional glyph.
   * @param config - Marker sizes.
   */
  constructor(
    city: City,
    base: Vec3,
    look: CityMarkerLook,
    config: OverworldSceneConfig,
  ) {
    this.cityId = city.id;
    this.config = config;
    this.object = new Group();
    this.object.name = `city-${city.id}`;
    this.object.position.set(base.x, base.y, base.z);

    if (look.glyph) {
      const material = new SpriteMaterial({
        map: look.glyph,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = SPRITE_RENDER_ORDER;
      this.material = material;
      this.visual = sprite;
    } else {
      const material = new MeshStandardMaterial({
        flatShading: true,
        metalness: 0,
        roughness: 0.6,
      });
      const disc = new Mesh(look.geometry.body, material);
      disc.position.y = config.markerHeight / 2;
      this.material = material;
      this.visual = disc;
    }
    this.visual.name = `city-body-${city.id}`;
    this.pickTarget = this.visual;
    this.object.add(this.visual);

    this.ringMaterial = new MeshStandardMaterial({
      color: SELECTION_COLOUR,
      emissive: SELECTION_COLOUR,
      emissiveIntensity: 0.8,
      metalness: 0,
      roughness: 0.6,
    });
    this.ring = new Mesh(look.geometry.ring, this.ringMaterial);
    this.ring.name = `city-ring-${city.id}`;
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.01;
    this.ring.visible = false;
    this.object.add(this.ring);

    const badgeSize = config.markerGlyphSize * BADGE_SCALE;
    if (look.missionGlyph) {
      const material = new SpriteMaterial({
        map: look.missionGlyph,
        color: MISSION_COLOUR,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.center.set(0.5, 0);
      sprite.scale.set(badgeSize, badgeSize, 1);
      sprite.renderOrder = BADGE_RENDER_ORDER;
      this.badgeMaterial = material;
      this.badge = sprite;
    } else {
      const material = new MeshStandardMaterial({
        color: MISSION_COLOUR,
        emissive: MISSION_COLOUR,
        emissiveIntensity: 0.8,
        flatShading: true,
        metalness: 0,
        roughness: 0.6,
      });
      const disc = new Mesh(look.geometry.body, material);
      disc.scale.setScalar(BADGE_SCALE);
      this.badgeMaterial = material;
      this.badge = disc;
    }
    const lift = this.usesGlyph()
      ? config.markerGlyphSize * BADGE_OFFSET_Y
      : config.markerHeight * (1 + BADGE_OFFSET_Y);
    this.badge.position.set(config.markerGlyphSize * BADGE_OFFSET_X, lift, 0);
    this.badge.name = `city-badge-${city.id}`;
    this.badge.visible = false;
    this.object.add(this.badge);

    this.setInfestation(city.infestation);
    this.setHovered(false);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** True when the marker draws the glyph sprite rather than a disc. */
  usesGlyph(): boolean {
    return this.visual instanceof Sprite;
  }

  /** Retints for the given infestation without rebuilding anything. */
  setInfestation(infestation: number): void {
    this.infestationHex = infestationColour(infestation);
    this.applyTint();
  }

  /** Grows the marker and tints it with the accent while hovered. */
  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    const scale = hovered ? HOVER_SCALE : 1;
    if (this.visual instanceof Sprite) {
      const size = this.config.markerGlyphSize * scale;
      this.visual.scale.set(size, size, 1);
    } else {
      this.visual.scale.setScalar(scale);
    }
    this.applyTint();
  }

  /** Shows the selection ring while selected. */
  setSelected(selected: boolean): void {
    this.ring.visible = selected;
  }

  /** Shows the mission badge while the city has an active mission. */
  setMission(active: boolean): void {
    this.mission = active;
    this.badge.visible = active;
  }

  /** True while the mission badge is shown. */
  hasMission(): boolean {
    return this.mission;
  }

  /** Current tint as `0xRRGGBB`, for tests and debug readouts. */
  colourHex(): number {
    return this.material.color.getHex();
  }

  /** Tint and badge state together, for tests and the dev hooks. */
  look(): CityMarkerLookReport {
    return { colourHex: this.colourHex(), mission: this.mission };
  }

  /**
   * A world-space point inside the pickable, for projecting to the
   * screen: just above the anchor on the glyph's pin tail, or the centre
   * of the disc. Staying close to the anchor keeps the point on this
   * marker's side when neighbouring pins overlap. Call after the scene's
   * world matrices are up to date.
   */
  pickPoint(): Vec3 {
    const lift = this.usesGlyph()
      ? this.config.markerGlyphSize * GLYPH_PICK_LIFT
      : this.config.markerHeight / 2;
    const base = this.object.getWorldPosition(this.object.position.clone());
    return { x: base.x, y: base.y + lift, z: base.z };
  }

  /** Releases the marker's materials. Geometry and glyph belong to the builder. */
  dispose(): void {
    this.material.dispose();
    this.ringMaterial.dispose();
    this.badgeMaterial.dispose();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Pushes the hover or infestation colour onto the material. */
  private applyTint(): void {
    const hex = this.hovered ? HOVER_COLOUR : this.infestationHex;
    this.material.color.setHex(hex);
    if (this.material instanceof MeshStandardMaterial) {
      this.material.emissive.setHex(hex);
      this.material.emissiveIntensity = this.hovered ? HOVER_EMISSIVE : 0;
    }
  }
}
