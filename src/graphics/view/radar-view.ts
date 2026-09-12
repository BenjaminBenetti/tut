import type { Object3D } from "three";
import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";
import type { Radar, RadarContact } from "../../tactical/model/radar";
import type { Disposable } from "../model/disposable";
import type { ModelLoader } from "../model/model-loader";
import { tileTopCentre } from "./tactical-map-view";

// ===========================================
// Radar view
// ===========================================

/** Friendly scanner models and location blips, outside the enemy picking lists. */
export class RadarView implements Disposable {
  readonly root = new Group();
  private readonly contacts = new Group();
  private readonly scanners = new Map<string, Object3D>();
  private wanted = new Set<string>();
  private readonly dot = new CircleGeometry(0.16, 20);
  private readonly unitHalo = new RingGeometry(0.25, 0.31, 24);
  private readonly structureHalo = new RingGeometry(0.3, 0.41, 4);
  private readonly material = new MeshBasicMaterial({
    color: 0xe0453c,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });

  /** Creates an empty layer; the shared loader owns model materials and buffers. */
  constructor(private readonly models: ModelLoader) {
    this.root.name = "radar";
    this.contacts.name = "radar-contacts";
    this.root.add(this.contacts);
  }

  /** Counts actually placed objects for the scene's diagnostic readout. */
  counts(): { scanners: number; contacts: number } {
    return {
      scanners: this.scanners.size,
      contacts: this.contacts.children.length,
    };
  }

  /** Draws only supplied intel; hidden enemy models never enter this layer. */
  async update(
    radars: readonly Radar[],
    contacts: readonly RadarContact[],
  ): Promise<void> {
    this.wanted = new Set(radars.map((radar) => radar.id));
    for (const [id, model] of this.scanners) {
      if (!this.wanted.has(id)) {
        model.removeFromParent();
        this.scanners.delete(id);
      }
    }
    this.contacts.clear();
    for (const contact of contacts) {
      const blip = new Group();
      blip.name = `radar-contact-${contact.kind}`;
      const at = tileTopCentre(contact.pos);
      blip.position.set(at.x, at.y + 0.12, at.z);
      for (const geometry of [
        this.dot,
        contact.kind === "structure" ? this.structureHalo : this.unitHalo,
      ]) {
        const mark = new Mesh(geometry, this.material);
        mark.rotation.x = -Math.PI / 2;
        mark.renderOrder = 20;
        blip.add(mark);
      }
      this.contacts.add(blip);
    }
    await Promise.all(radars.map((radar) => this.place(radar)));
  }

  /** Cancels late loads and frees only the geometry/materials owned by this view. */
  dispose(): void {
    this.wanted.clear();
    this.scanners.clear();
    this.contacts.clear();
    this.root.clear();
    this.root.removeFromParent();
    this.dot.dispose();
    this.unitHalo.dispose();
    this.structureHalo.dispose();
    this.material.dispose();
  }

  /** Places one scanner, discarding a load when the view no longer wants it. */
  private async place(radar: Radar): Promise<void> {
    if (this.scanners.has(radar.id)) return;
    const model = await this.models.load("tdf.radar-scanner");
    if (!this.wanted.has(radar.id) || this.scanners.has(radar.id)) return;
    const at = tileTopCentre(radar.pos);
    model.position.set(at.x, at.y, at.z);
    model.name = radar.id;
    this.scanners.set(radar.id, model);
    this.root.add(model);
  }
}
