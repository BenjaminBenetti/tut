import type { BufferGeometry } from "three";
import { Group, Mesh, MeshStandardMaterial } from "three";

import type { Vec3 } from "../../core/model/grid";
import type { City, CityId } from "../../overworld/model/city";
import { MAX_INFESTATION, MIN_INFESTATION } from "../../overworld/model/city";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";

// ===========================================
// Colour ramp
// ===========================================

/** Ends of the infestation ramp: `ui-bug` (clear) to `ui-danger` (overrun). */
export const INFESTATION_RAMP = { clear: 0x9cff3d, overrun: 0xe0453c } as const;

/** Selection ring colour: `tdf-orange`, the style guide's selection accent. */
export const SELECTION_COLOUR = 0xf08a24;

/** How much a hovered marker grows. */
const HOVER_SCALE = 1.3;

/** Emissive strength of a hovered marker; unhovered markers emit nothing. */
const HOVER_EMISSIVE = 0.6;

/**
 * Maps infestation `0–100` to a colour on the green → red ramp, as a
 * `0xRRGGBB` number. Each channel is interpolated linearly in sRGB;
 * values outside the range clamp to the nearest end and a non-number
 * counts as clear.
 */
export function infestationColour(infestation: number): number {
  const span = MAX_INFESTATION - MIN_INFESTATION;
  const raw = (infestation - MIN_INFESTATION) / span;
  const t = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  const from = INFESTATION_RAMP.clear;
  const to = INFESTATION_RAMP.overrun;
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

// ===========================================
// Marker
// ===========================================

/** Geometries shared by every marker; the scene builder owns and disposes them. */
export interface CityMarkerGeometry {
  /** The pickable body of the marker. */
  readonly body: BufferGeometry;
  /** Flat ring shown under a selected marker. */
  readonly ring: BufferGeometry;
}

/**
 * One city on the strategic map: a disc coloured by infestation, grown
 * and lit while hovered, ringed while selected. Holds no game truth;
 * `setInfestation` is how state reaches it.
 *
 * ```
 *          ┌───┐  body (pickable)
 *       ═══╧═══╧═══  ring, visible only when selected
 *     ─────────────  plate top
 * ```
 */
export class CityMarker {
  // ===========================================
  // Fields
  // ===========================================

  readonly cityId: CityId;
  /** Add this to the scene; it carries the body and the ring. */
  readonly object: Group;
  /** The mesh raycasts hit. */
  readonly body: Mesh;
  private readonly bodyMaterial: MeshStandardMaterial;
  private readonly ring: Mesh;
  private readonly ringMaterial: MeshStandardMaterial;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param city - The city to represent; its name labels the object.
   * @param base - Point on the plate top the marker stands on.
   * @param geometry - Shared geometries.
   * @param config - Marker sizes.
   */
  constructor(
    city: City,
    base: Vec3,
    geometry: CityMarkerGeometry,
    config: OverworldSceneConfig,
  ) {
    this.cityId = city.id;
    this.object = new Group();
    this.object.name = `city-${city.id}`;
    this.object.position.set(base.x, base.y + config.markerHeight / 2, base.z);

    this.bodyMaterial = new MeshStandardMaterial({
      flatShading: true,
      metalness: 0,
      roughness: 0.6,
    });
    this.body = new Mesh(geometry.body, this.bodyMaterial);
    this.body.name = `city-body-${city.id}`;
    this.object.add(this.body);

    this.ringMaterial = new MeshStandardMaterial({
      color: SELECTION_COLOUR,
      emissive: SELECTION_COLOUR,
      emissiveIntensity: 0.8,
      metalness: 0,
      roughness: 0.6,
    });
    this.ring = new Mesh(geometry.ring, this.ringMaterial);
    this.ring.name = `city-ring-${city.id}`;
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = -config.markerHeight / 2 + 0.01;
    this.ring.visible = false;
    this.object.add(this.ring);

    this.setInfestation(city.infestation);
    this.setHovered(false);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Recolours the body for the given infestation without rebuilding anything. */
  setInfestation(infestation: number): void {
    const colour = infestationColour(infestation);
    this.bodyMaterial.color.setHex(colour);
    this.bodyMaterial.emissive.setHex(colour);
  }

  /** Grows and lights the body while hovered. */
  setHovered(hovered: boolean): void {
    this.body.scale.setScalar(hovered ? HOVER_SCALE : 1);
    this.bodyMaterial.emissiveIntensity = hovered ? HOVER_EMISSIVE : 0;
  }

  /** Shows the selection ring while selected. */
  setSelected(selected: boolean): void {
    this.ring.visible = selected;
  }

  /** Current body colour as `0xRRGGBB`, for tests and debug readouts. */
  colourHex(): number {
    return this.bodyMaterial.color.getHex();
  }

  /** Releases the marker's materials. Geometries belong to the builder. */
  dispose(): void {
    this.bodyMaterial.dispose();
    this.ringMaterial.dispose();
  }
}
