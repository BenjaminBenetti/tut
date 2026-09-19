import {
  Box3,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Camera, Object3D } from "three";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { Vec2, Vec3 } from "../../core/model/grid";
import type { TechFamilyId, TechNodeId } from "../../tech/model/tech-node";
import type { TechNodeStatus } from "../../tech/service/tech-status-service";
import type {
  TechGraphEdge,
  TechGraphLayout,
} from "../../ui/model/tech-graph-layout";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { ModelLoader } from "../model/model-loader";
import { TechNodeModelSource } from "./tech-node-model-source";

// ===========================================
// Types
// ===========================================

/** What the builder needs. */
export interface TechGraphSceneBuilderOptions {
  readonly layout: TechGraphLayout;
  /** Loads the part models and the core; the app passes the manifest loader, tests a stub. */
  readonly models: ModelLoader;
  /** The model at the graph's core; the salvage every point came from. */
  readonly coreModel?: ModelAssetId;
}

/** Everything the builder keeps for one node. */
interface NodeView {
  readonly id: TechNodeId;
  readonly root: Group;
  /** The model turns on this, so a swap keeps the spin. */
  readonly turntable: Group;
  readonly ring: MeshStandardMaterial;
  readonly halo: Mesh;
  readonly pick: Mesh;
  status: TechNodeStatus;
}

// ===========================================
// Constants
// ===========================================

/** The model the core shows unless told otherwise: the carcass tech points are stripped from. */
export const DEFAULT_CORE_MODEL: ModelAssetId = "bug.tech-carcass";

/** Pedestal radius; the layout keeps nodes further apart than twice this. */
export const PEDESTAL_RADIUS = 0.95;

/** The pedestal's height above the ground plane; models stand on top. */
export const PEDESTAL_HEIGHT = 0.12;

/** Radius of a family's hexagonal plinth. */
export const PLINTH_RADIUS = 1.3;

/** Radius of the core's plinth. */
const CORE_PLINTH_RADIUS = 2.1;

/** The core model's longest side, in world units. */
const CORE_EXTENT = 2.6;

/** The lit ring on a pedestal's rim, in world units. */
const RING_WIDTH = 0.14;

/** Link beams are this wide and lie this far above the ground. */
const BEAM_WIDTH = 0.1;
const BEAM_HEIGHT = 0.05;

/** The pick solid: a cylinder over the pedestal tall enough to cover the model. */
const PICK_HEIGHT = 2.4;
const PICK_RADIUS = PEDESTAL_RADIUS + 0.15;

/** How fast a model turns on its pedestal, in radians per second. */
export const TURNTABLE_RATE = 0.35;

/** Palette tones, as in `theme.css`. */
const PANEL_COLOUR = 0x1c2230;
const LINE_COLOUR = 0x2e3646;
const OK_COLOUR = 0x7ccb5a;
const ACCENT_COLOUR = 0xf08a24;
const WARN_COLOUR = 0xf0c63c;
const INFO_COLOUR = 0x7fd1ff;
const GRID_COLOUR = 0x161b26;
/** The ground under the grid: a shade over the clear colour, so shadows have something to land on. */
const GROUND_COLOUR = 0x0f1219;

/** Ring tint and glow per status. */
const STATUS_LOOK: Readonly<
  Record<TechNodeStatus, { readonly colour: number; readonly glow: number }>
> = {
  unlocked: { colour: OK_COLOUR, glow: 0.9 },
  available: { colour: ACCENT_COLOUR, glow: 0.9 },
  unaffordable: { colour: WARN_COLOUR, glow: 0.35 },
  locked: { colour: LINE_COLOUR, glow: 0.15 },
};

/** How much brighter a hovered ring glows. */
const HOVER_GLOW_BONUS = 0.6;

// ===========================================
// TechGraphSceneBuilder
// ===========================================

/**
 * Builds the tech graph in three (#1171): a pedestal per node with the
 * part's model turning on it, a hexagonal plinth per family, the core
 * at the origin, link beams on the ground between them and a faint
 * grid for depth. Rings and beams are tinted by node status; hover and
 * selection light a ring further and raise a halo.
 *
 * ```
 *   layout ──► build()       pedestals, plinths, beams, pick solids, grid   (sync)
 *          ──► loadModels()  part models onto the turntables, core model   (async)
 *   statuses ──► setStatuses()  ring + beam tints
 *   pointer  ──► pick(ndc, camera) ──► node id           (raycast on pick solids)
 * ```
 *
 * Nothing here imports the DOM; the host decides where the labels go
 * from `worldPosition` and `familyPosition`.
 */
export class TechGraphSceneBuilder {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. Everything the builder creates lives under it. */
  readonly root = new Group();
  /** Tick this every frame; it turns the models. */
  readonly turntables: FrameUpdatable;
  private readonly layout: TechGraphLayout;
  private readonly models: TechNodeModelSource;
  private readonly loader: ModelLoader;
  private readonly coreModel: ModelAssetId;
  private readonly nodes = new Map<TechNodeId, NodeView>();
  private readonly pickToNode = new Map<Object3D, TechNodeId>();
  private readonly families = new Map<TechFamilyId, Vec3>();
  private readonly beams: {
    edge: TechGraphEdge;
    material: MeshStandardMaterial;
  }[] = [];
  private readonly coreTurntable = new Group();
  private readonly raycaster = new Raycaster();
  private hovered: TechNodeId | undefined;
  private selected: TechNodeId | undefined;
  private disposed = false;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Builds every static piece at once; call `loadModels` for the art.
   *
   * @param options - Layout, loader and the core model.
   */
  constructor(options: TechGraphSceneBuilderOptions) {
    this.layout = options.layout;
    this.loader = options.models;
    this.models = new TechNodeModelSource({ models: options.models });
    this.coreModel = options.coreModel ?? DEFAULT_CORE_MODEL;
    this.root.name = "tech-graph";
    this.build();
    this.turntables = {
      update: (deltaSeconds) => {
        const turn = TURNTABLE_RATE * deltaSeconds;
        for (const node of this.nodes.values()) {
          node.turntable.rotation.y += turn;
        }
        this.coreTurntable.rotation.y += turn * 0.5;
      },
    };
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Loads every node's model and the core onto their turntables, in
   * parallel. A node whose model arrives after `dispose` is dropped.
   */
  async loadModels(): Promise<void> {
    const core = this.loader.load(this.coreModel).then((model) => {
      if (this.disposed) {
        return;
      }
      this.coreTurntable.add(fit(model, CORE_EXTENT));
    });
    const nodes = this.layout.nodes.map(async (placement) => {
      const model = await this.models.modelFor(placement.partIds);
      const view = this.nodes.get(placement.id);
      if (this.disposed || view === undefined) {
        return;
      }
      model.traverse((child) => {
        child.castShadow = true;
      });
      view.turntable.add(model);
    });
    await Promise.all([core, ...nodes]);
  }

  /**
   * Retints every ring and beam from `statuses`; a node missing from
   * the map is shown locked.
   */
  setStatuses(statuses: ReadonlyMap<TechNodeId, TechNodeStatus>): void {
    for (const node of this.nodes.values()) {
      node.status = statuses.get(node.id) ?? "locked";
      this.applyLook(node);
    }
    for (const beam of this.beams) {
      const status =
        beam.edge.nodeId === undefined
          ? undefined
          : (statuses.get(beam.edge.nodeId) ?? "locked");
      const look = status === undefined ? undefined : STATUS_LOOK[status];
      beam.material.color.setHex(look?.colour ?? LINE_COLOUR);
      beam.material.emissive.setHex(look?.colour ?? LINE_COLOUR);
      beam.material.emissiveIntensity =
        look === undefined ? 0.2 : look.glow * 0.6;
    }
  }

  /** Every node's current status, for tests and hooks. */
  statusOf(id: TechNodeId): TechNodeStatus | undefined {
    return this.nodes.get(id)?.status;
  }

  /**
   * The node under `ndc`, from a raycast against the pick solids; the
   * nearest hit wins.
   */
  pick(ndc: Vec2, camera: Camera): TechNodeId | undefined {
    if (this.pickToNode.size === 0) {
      return undefined;
    }
    this.root.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hits = this.raycaster.intersectObjects(
      [...this.pickToNode.keys()],
      false,
    );
    const first = hits[0];
    return first === undefined ? undefined : this.pickToNode.get(first.object);
  }

  /** Brightens the hovered node's ring, dimming the last one. */
  setHovered(id: TechNodeId | undefined): void {
    const previous = this.hovered;
    this.hovered = id;
    this.relook(previous);
    this.relook(id);
  }

  /** Raises the selected node's halo, lowering the last one. */
  setSelected(id: TechNodeId | undefined): void {
    const previous = this.selected;
    this.selected = id;
    this.relook(previous);
    this.relook(id);
  }

  /** The selected node, or none. */
  getSelected(): TechNodeId | undefined {
    return this.selected;
  }

  /** The centre of a node's pedestal, on the ground plane. */
  worldPosition(id: TechNodeId): Vec3 | undefined {
    const node = this.nodes.get(id);
    if (!node) {
      return undefined;
    }
    return { x: node.root.position.x, y: 0, z: node.root.position.z };
  }

  /** The centre of a family's plinth, on the ground plane. */
  familyPosition(id: TechFamilyId): Vec3 | undefined {
    return this.families.get(id);
  }

  /** Frees the geometry and materials the builder made. Safe to call twice. */
  dispose(): void {
    this.disposed = true;
    this.root.traverse((child) => {
      const mesh = child as Partial<Mesh>;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          entry.dispose();
        }
      } else {
        material?.dispose();
      }
    });
    this.root.clear();
    this.nodes.clear();
    this.pickToNode.clear();
    this.beams.length = 0;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Lays every static piece down: grid, core, plinths, pedestals, beams. */
  private build(): void {
    const span = Math.ceil(this.layout.radius * 2);
    const ground = new Mesh(
      new CircleGeometry(this.layout.radius * 1.5, 64),
      new MeshStandardMaterial({ color: GROUND_COLOUR, roughness: 1 }),
    );
    ground.name = "ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    const grid = new GridHelper(span, span, GRID_COLOUR, GRID_COLOUR);
    grid.position.y = -0.01;
    this.root.add(ground, grid);

    const corePlinth = plinth(CORE_PLINTH_RADIUS, 0.35, INFO_COLOUR);
    corePlinth.name = "core";
    this.coreTurntable.position.y = 0.35;
    corePlinth.add(this.coreTurntable);
    this.root.add(corePlinth);

    for (const family of this.layout.families) {
      const object = plinth(PLINTH_RADIUS, 0.28, INFO_COLOUR);
      object.name = `family:${family.id}`;
      object.position.set(family.x, 0, family.z);
      this.root.add(object);
      this.families.set(family.id, { x: family.x, y: 0, z: family.z });
    }

    for (const edge of this.layout.edges) {
      this.root.add(this.createBeam(edge));
    }

    for (const placement of this.layout.nodes) {
      const view = this.createNode(placement.id, placement.x, placement.z);
      this.nodes.set(placement.id, view);
      this.pickToNode.set(view.pick, placement.id);
      this.root.add(view.root);
    }
  }

  /** One pedestal: base, lit rim ring, a halo for selection, the turntable and the pick solid. */
  private createNode(id: TechNodeId, x: number, z: number): NodeView {
    const root = new Group();
    root.name = `node:${id}`;
    root.position.set(x, 0, z);

    const base = new Mesh(
      new CylinderGeometry(
        PEDESTAL_RADIUS,
        PEDESTAL_RADIUS * 1.06,
        PEDESTAL_HEIGHT,
        28,
      ),
      new MeshStandardMaterial({ color: PANEL_COLOUR, roughness: 0.7 }),
    );
    base.position.y = PEDESTAL_HEIGHT / 2;
    base.receiveShadow = true;

    const ring = new MeshStandardMaterial({
      color: LINE_COLOUR,
      emissive: LINE_COLOUR,
      emissiveIntensity: 0.15,
    });
    const rim = new Mesh(
      new RingGeometry(PEDESTAL_RADIUS - RING_WIDTH, PEDESTAL_RADIUS, 40),
      ring,
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = PEDESTAL_HEIGHT + 0.005;

    const halo = new Mesh(
      new RingGeometry(PEDESTAL_RADIUS + 0.1, PEDESTAL_RADIUS + 0.22, 48),
      new MeshStandardMaterial({
        color: INFO_COLOUR,
        emissive: INFO_COLOUR,
        emissiveIntensity: 1,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.01;
    halo.visible = false;

    const turntable = new Group();
    turntable.name = "turntable";
    turntable.position.y = PEDESTAL_HEIGHT;

    const pick = new Mesh(
      new CylinderGeometry(PICK_RADIUS, PICK_RADIUS, PICK_HEIGHT, 12),
    );
    pick.name = `pick:${id}`;
    pick.position.y = PICK_HEIGHT / 2;
    pick.visible = false;

    root.add(base, rim, halo, turntable, pick);
    return { id, root, turntable, ring, halo, pick, status: "locked" };
  }

  /** One link: a thin beam on the ground from `edge.from` to `edge.to`. */
  private createBeam(edge: TechGraphEdge): Mesh {
    const dx = edge.to.x - edge.from.x;
    const dz = edge.to.z - edge.from.z;
    const length = Math.hypot(dx, dz);
    const material = new MeshStandardMaterial({
      color: LINE_COLOUR,
      emissive: LINE_COLOUR,
      emissiveIntensity: 0.2,
    });
    const beam = new Mesh(
      new BoxGeometry(length, BEAM_HEIGHT, BEAM_WIDTH),
      material,
    );
    beam.name =
      edge.nodeId === undefined ? "beam:family" : `beam:${edge.nodeId}`;
    beam.position.set(
      (edge.from.x + edge.to.x) / 2,
      BEAM_HEIGHT / 2,
      (edge.from.z + edge.to.z) / 2,
    );
    beam.rotation.y = -Math.atan2(dz, dx);
    this.beams.push({ edge, material });
    return beam;
  }

  /** Re-applies a node's look after hover or selection changed. */
  private relook(id: TechNodeId | undefined): void {
    const node = id === undefined ? undefined : this.nodes.get(id);
    if (node) {
      this.applyLook(node);
    }
  }

  /** Ring tint and glow from status, hover and selection; halo from selection. */
  private applyLook(node: NodeView): void {
    const look = STATUS_LOOK[node.status];
    node.ring.color.setHex(look.colour);
    node.ring.emissive.setHex(look.colour);
    node.ring.emissiveIntensity =
      look.glow + (this.hovered === node.id ? HOVER_GLOW_BONUS : 0);
    node.halo.visible = this.selected === node.id;
  }
}

// ===========================================
// Helpers
// ===========================================

/** A hexagonal plinth with a lit top edge. */
function plinth(radius: number, height: number, tint: number): Group {
  const group = new Group();
  const body = new Mesh(
    new CylinderGeometry(radius, radius * 1.05, height, 6),
    new MeshStandardMaterial({ color: PANEL_COLOUR, roughness: 0.7 }),
  );
  body.position.y = height / 2;
  body.receiveShadow = true;
  const edge = new Mesh(
    new RingGeometry(radius - RING_WIDTH, radius, 6),
    new MeshStandardMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: 0.5,
    }),
  );
  edge.rotation.x = -Math.PI / 2;
  edge.rotation.z = Math.PI / 6;
  edge.position.y = height + 0.005;
  group.add(body, edge);
  return group;
}

/** Scales `model` so its longest side is `extent`, centred and grounded. */
function fit(model: Object3D, extent: number): Object3D {
  const wrapper = new Group();
  wrapper.add(model);
  const box = new Box3().setFromObject(model);
  if (box.isEmpty()) {
    return wrapper;
  }
  const size = box.getSize(new Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  const scale = longest > 0 ? extent / longest : 1;
  model.scale.setScalar(scale);
  const centre = box.getCenter(new Vector3());
  model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  model.traverse((child) => {
    child.castShadow = true;
  });
  return wrapper;
}
