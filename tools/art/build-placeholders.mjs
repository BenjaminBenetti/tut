#!/usr/bin/env node
/**
 * Builds the placeholder GLB models for Terra Under Threat.
 *
 *   node tools/art/build-placeholders.mjs [--out public/assets/models]
 *
 * Every model is assembled from primitives sized per
 * `docs/design/style-guide.md` §3 (1 tile = 1 world unit, +Y up, +Z forward,
 * pivot at the base centre) and coloured with palette tokens from §4. The
 * build is deterministic: no randomness, fixed parameters, so re-running it
 * reproduces byte-identical files.
 *
 * Alongside the GLBs it writes `tools/art/placeholders.manifest.json`, a
 * machine-readable record (id, path, footprint, height, sockets, triangles)
 * that the typed asset manifest under `src/graphics/data/` is derived from.
 *
 *   ┌──────────────┐   build()    ┌──────────────┐  GLTFExporter   ┌───────┐
 *   │ MODEL_DEFS   │ ───────────► │ three.js     │ ──────────────► │ .glb  │
 *   │ (this file)  │              │ Object3D     │                 └───────┘
 *   └──────────────┘              └──────────────┘        └──► manifest.json
 */
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  SphereGeometry,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ===========================================
// Node polyfill
// ===========================================

/**
 * GLTFExporter reads its Blob output through the browser `FileReader` API.
 * Node has Blob but no FileReader, so provide the two methods the exporter
 * calls. Both resolve asynchronously like the browser version.
 */
globalThis.FileReader ??= class FileReaderPolyfill {
  /**
   * Reads a Blob into an ArrayBuffer and fires `onloadend`.
   * @param {Blob} blob - Source blob.
   */
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.({ target: this });
    });
  }

  /**
   * Reads a Blob into a base64 data URL and fires `onloadend`.
   * @param {Blob} blob - Source blob.
   */
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      const base64 = Buffer.from(buffer).toString("base64");
      this.result = `data:${blob.type};base64,${base64}`;
      this.onloadend?.({ target: this });
    });
  }
};

// ===========================================
// Palette (style guide §4)
// ===========================================

/** Palette token → hex. Material names in the GLBs are these tokens. */
const PALETTE = {
  "tdf-grey-dark": "#2E3440",
  "tdf-grey-mid": "#5B6573",
  "tdf-grey-light": "#9AA5B1",
  "tdf-olive": "#6B7A3F",
  "tdf-olive-dark": "#45502A",
  "tdf-orange": "#F08A24",
  "tdf-orange-dim": "#B86414",
  "tdf-visor": "#7FD1FF",
  "bug-chitin-black": "#14121A",
  "bug-chitin-dark": "#2B2436",
  "bug-chitin-mid": "#4A3B5A",
  "bug-flesh": "#7A3A4E",
  "bug-flesh-light": "#B05A6E",
  "bug-bio-green": "#9CFF3D",
  "bug-bio-green-dim": "#4C8F1A",
  "bug-bio-magenta": "#E23DFF",
  "bug-bone": "#D8CBB0",
  "env-asphalt": "#3A3D42",
  "env-concrete": "#8E8A82",
  "env-sidewalk": "#A7A297",
  "env-brick": "#8A4B3A",
  "env-glass": "#6E8FA6",
  "env-roof": "#55524C",
  "env-metal": "#6F7378",
  "env-rust": "#8C5A3A",
  "env-grass": "#5E7A3A",
  "env-dirt": "#7A6045",
};

/** Tokens rendered as emissive light sources. */
const EMISSIVE_TOKENS = new Set(["tdf-visor", "bug-bio-green", "bug-bio-magenta"]);

/** Tokens that read as painted metal (lower roughness than cloth/chitin). */
const METAL_TOKENS = new Set([
  "tdf-grey-dark",
  "tdf-grey-mid",
  "tdf-grey-light",
  "env-metal",
  "env-rust",
]);

/**
 * Creates one material per palette token on demand, so each exported file
 * shares materials across its meshes and the exporter emits each once.
 */
class MaterialFactory {
  constructor() {
    /** @type {Map<string, MeshStandardMaterial>} */
    this.cache = new Map();
  }

  /**
   * Returns the material for a palette token, creating it on first use.
   * @param {string} token - Palette token name, e.g. `tdf-grey-mid`.
   * @returns {MeshStandardMaterial} Shared material for that token.
   */
  get(token) {
    const hex = PALETTE[token];
    if (!hex) throw new Error(`Unknown palette token: ${token}`);
    let material = this.cache.get(token);
    if (!material) {
      material = new MeshStandardMaterial({
        name: token,
        color: new Color(hex),
        metalness: 0,
        roughness: METAL_TOKENS.has(token) ? 0.6 : 0.9,
        flatShading: true,
      });
      if (EMISSIVE_TOKENS.has(token)) {
        material.emissive = new Color(hex);
        material.emissiveIntensity = 1.5;
      }
      this.cache.set(token, material);
    }
    return material;
  }
}

// ===========================================
// Primitive helpers
// ===========================================

/**
 * Converts a smooth-shaded geometry into flat-shaded faces so spheres and
 * cylinders read as faceted low-poly forms.
 * @param {import("three").BufferGeometry} geometry - Indexed geometry.
 * @returns {import("three").BufferGeometry} Non-indexed geometry with face normals.
 */
function faceted(geometry) {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

/**
 * Places a mesh and optionally names and rotates it.
 * @param {Mesh} mesh - Mesh to position.
 * @param {[number, number, number]} at - Centre position.
 * @param {{name?: string, rot?: [number, number, number]}} [opts] - Name and Euler rotation in radians.
 * @returns {Mesh} The same mesh.
 */
function place(mesh, at, opts = {}) {
  mesh.position.set(at[0], at[1], at[2]);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  if (opts.name) mesh.name = opts.name;
  return mesh;
}

/**
 * Axis-aligned box centred at `at`.
 * @param {MeshStandardMaterial} material - Material.
 * @param {[number, number, number]} size - Width, height, depth.
 * @param {[number, number, number]} at - Centre position.
 * @param {{name?: string, rot?: [number, number, number]}} [opts] - Name and rotation.
 * @returns {Mesh} Box mesh.
 */
function box(material, size, at, opts) {
  return place(new Mesh(new BoxGeometry(size[0], size[1], size[2]), material), at, opts);
}

/**
 * Faceted cylinder (or cone when `rTop` is 0) with its axis along +Y.
 * @param {MeshStandardMaterial} material - Material.
 * @param {number} rTop - Top radius.
 * @param {number} rBottom - Bottom radius.
 * @param {number} height - Height.
 * @param {number} segments - Radial segments.
 * @param {[number, number, number]} at - Centre position.
 * @param {{name?: string, rot?: [number, number, number]}} [opts] - Name and rotation.
 * @returns {Mesh} Cylinder mesh.
 */
function cylinder(material, rTop, rBottom, height, segments, at, opts) {
  const geometry = faceted(new CylinderGeometry(rTop, rBottom, height, segments));
  return place(new Mesh(geometry, material), at, opts);
}

/**
 * Faceted cone with its apex up.
 * @param {MeshStandardMaterial} material - Material.
 * @param {number} radius - Base radius.
 * @param {number} height - Height.
 * @param {number} segments - Radial segments.
 * @param {[number, number, number]} at - Centre position.
 * @param {{name?: string, rot?: [number, number, number]}} [opts] - Name and rotation.
 * @returns {Mesh} Cone mesh.
 */
function cone(material, radius, height, segments, at, opts) {
  const geometry = faceted(new ConeGeometry(radius, height, segments));
  return place(new Mesh(geometry, material), at, opts);
}

/**
 * Faceted ellipsoid: a low-poly sphere scaled per axis.
 * @param {MeshStandardMaterial} material - Material.
 * @param {number} radius - Base radius before scaling.
 * @param {[number, number, number]} scale - Per-axis scale.
 * @param {[number, number, number]} at - Centre position.
 * @param {{name?: string, widthSegments?: number, heightSegments?: number}} [opts] - Name and tessellation.
 * @returns {Mesh} Ellipsoid mesh.
 */
function ellipsoid(material, radius, scale, at, opts = {}) {
  const geometry = faceted(
    new SphereGeometry(radius, opts.widthSegments ?? 8, opts.heightSegments ?? 6),
  );
  const mesh = place(new Mesh(geometry, material), at, { name: opts.name });
  mesh.scale.set(scale[0], scale[1], scale[2]);
  return mesh;
}

/**
 * Empty node marking an attach point. Names follow `socket_<name>`.
 * @param {string} name - Socket name without the prefix.
 * @param {[number, number, number]} at - Position.
 * @returns {Object3D} Empty node.
 */
function socket(name, at) {
  const node = new Object3D();
  node.name = `socket_${name}`;
  node.position.set(at[0], at[1], at[2]);
  return node;
}

/**
 * Groups children under a named node.
 * @param {string} name - Node name.
 * @param {Object3D[]} children - Children to add in order.
 * @param {[number, number, number]} [at] - Optional position.
 * @returns {Object3D} Group node.
 */
function group(name, children, at) {
  const node = new Object3D();
  node.name = name;
  if (at) node.position.set(at[0], at[1], at[2]);
  for (const child of children) node.add(child);
  return node;
}

/**
 * Ground slab: a 1×1 tile, 0.05 u thick, resting on y = 0.
 * @param {MeshStandardMaterial} material - Material.
 * @param {number} [thickness] - Slab thickness.
 * @returns {Mesh} Slab mesh.
 */
function slab(material, thickness = 0.05) {
  return box(material, [1, thickness, 1], [0, thickness / 2, 0], { name: "slab" });
}

// ===========================================
// TDF infantry (style guide §3: 0.9 u figures on a Ø0.85 disc)
// ===========================================

/** Figure positions (x, z) in a loose wedge, leader front centre (+Z). */
const SQUAD_SLOTS = [
  [0, 0.28],
  [-0.24, 0.05],
  [0.24, 0.05],
  [-0.13, -0.2],
  [0.13, -0.2],
];

/**
 * One 0.9 u infantry figure standing at the origin facing +Z.
 * @param {MaterialFactory} mf - Material factory.
 * @param {"rifle"|"rocket"|"sniper"|"engineer"|"medic"} kit - Weapon or kit carried.
 * @param {string} name - Node name.
 * @returns {Object3D} Figure node.
 */
function buildFigure(mf, kit, name) {
  const parts = [
    box(mf.get("tdf-olive-dark"), [0.18, 0.4, 0.14], [0, 0.2, 0], { name: "legs" }),
    box(mf.get("tdf-olive"), [0.26, 0.34, 0.18], [0, 0.57, 0], { name: "torso" }),
    box(mf.get("tdf-grey-mid"), [0.28, 0.2, 0.06], [0, 0.62, 0.11], { name: "plate" }),
    box(mf.get("tdf-grey-mid"), [0.16, 0.16, 0.16], [0, 0.82, 0], { name: "helmet" }),
    box(mf.get("tdf-visor"), [0.12, 0.04, 0.02], [0, 0.82, 0.09], { name: "visor" }),
    box(mf.get("tdf-orange"), [0.06, 0.03, 0.06], [-0.15, 0.7, 0], { name: "marking" }),
  ];
  switch (kit) {
    case "rocket":
      parts.push(
        box(mf.get("tdf-grey-dark"), [0.08, 0.08, 0.6], [0.14, 0.86, 0], { name: "launcher" }),
      );
      break;
    case "sniper":
      parts.push(
        box(mf.get("tdf-grey-dark"), [0.05, 0.05, 0.55], [0.14, 0.55, 0.15], { name: "rifle" }),
      );
      break;
    case "engineer":
      parts.push(
        box(mf.get("tdf-grey-dark"), [0.05, 0.05, 0.3], [0.14, 0.55, 0.1], { name: "carbine" }),
        box(mf.get("tdf-orange-dim"), [0.2, 0.24, 0.1], [0, 0.6, -0.14], { name: "pack" }),
      );
      break;
    case "medic":
      parts.push(
        box(mf.get("tdf-grey-dark"), [0.05, 0.05, 0.3], [0.14, 0.55, 0.1], { name: "carbine" }),
        box(mf.get("tdf-grey-light"), [0.2, 0.24, 0.1], [0, 0.6, -0.14], { name: "pack" }),
        box(mf.get("tdf-orange"), [0.12, 0.04, 0.02], [0, 0.6, -0.2], { name: "cross" }),
      );
      break;
    default:
      parts.push(
        box(mf.get("tdf-grey-dark"), [0.05, 0.05, 0.36], [0.14, 0.55, 0.12], { name: "rifle" }),
      );
  }
  return group(name, parts);
}

/**
 * Infantry squad token: five figures on one base disc. The left-flank figure
 * carries the squad's special kit.
 * @param {MaterialFactory} mf - Material factory.
 * @param {"rifle"|"rocket"|"sniper"|"engineer"|"medic"} kit - Squad type.
 * @returns {Object3D} Squad root.
 */
function buildInfantrySquad(mf, kit) {
  const base = cylinder(mf.get("tdf-grey-dark"), 0.425, 0.425, 0.05, 16, [0, 0.025, 0], {
    name: "base",
  });
  const figures = SQUAD_SLOTS.map(([x, z], i) => {
    const figure = buildFigure(mf, i === 1 ? kit : "rifle", `figure_${i}`);
    figure.position.set(x, 0.05, z);
    return figure;
  });
  return group("root", [base, ...figures]);
}

// ===========================================
// TDF mech parts (style guide §3, §6 sockets)
// ===========================================

/**
 * Mech legs: pivot at the ground, `socket_chassis` on top at 1.42 u.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Legs root.
 */
function buildMechLegs(mf) {
  const parts = [];
  for (const side of [-1, 1]) {
    const x = side * 0.3;
    parts.push(
      box(mf.get("tdf-grey-dark"), [0.34, 0.14, 0.56], [x, 0.07, 0.05], { name: `foot_${side}` }),
      box(mf.get("tdf-grey-mid"), [0.26, 0.55, 0.3], [x, 0.4, -0.05], { name: `shin_${side}` }),
      box(mf.get("tdf-grey-dark"), [0.3, 0.16, 0.36], [x, 0.7, 0], { name: `knee_${side}` }),
      box(mf.get("tdf-grey-mid"), [0.28, 0.42, 0.32], [x, 0.95, 0.02], { name: `thigh_${side}` }),
    );
  }
  parts.push(
    box(mf.get("tdf-grey-dark"), [0.96, 0.28, 0.5], [0, 1.28, 0], { name: "hip" }),
    box(mf.get("tdf-olive"), [0.5, 0.2, 0.1], [0, 1.24, 0.28], { name: "pelvis_plate" }),
    socket("chassis", [0, 1.42, 0]),
  );
  return group("root", parts);
}

/**
 * Mech chassis: pivot where it sits on the legs; exposes arm and back sockets.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Chassis root.
 */
function buildMechChassis(mf) {
  return group("root", [
    box(mf.get("tdf-grey-mid"), [1.0, 1.0, 0.7], [0, 0.5, 0], { name: "torso" }),
    box(mf.get("tdf-olive"), [0.7, 0.5, 0.08], [0, 0.45, 0.37], { name: "chest_plate" }),
    box(mf.get("tdf-grey-dark"), [0.8, 0.7, 0.1], [0, 0.5, -0.38], { name: "back_plate" }),
    box(mf.get("tdf-grey-dark"), [1.36, 0.3, 0.6], [0, 0.9, 0], { name: "shoulders" }),
    box(mf.get("tdf-olive"), [0.3, 0.34, 0.62], [-0.55, 0.92, 0], { name: "pad_l" }),
    box(mf.get("tdf-olive"), [0.3, 0.34, 0.62], [0.55, 0.92, 0], { name: "pad_r" }),
    box(mf.get("tdf-grey-mid"), [0.44, 0.32, 0.44], [0, 1.21, 0.05], { name: "cockpit" }),
    box(mf.get("tdf-visor"), [0.32, 0.08, 0.03], [0, 1.23, 0.28], { name: "visor" }),
    box(mf.get("tdf-orange"), [0.2, 0.12, 0.02], [-0.3, 0.6, 0.36], { name: "marking" }),
    box(mf.get("tdf-orange-dim"), [0.1, 0.3, 0.02], [0.42, 0.4, 0.36], { name: "hazard" }),
    socket("arm_l", [-0.72, 0.85, 0]),
    socket("arm_r", [0.72, 0.85, 0]),
    socket("back", [0.3, 1.05, -0.25]),
  ]);
}

/**
 * Mech arm hanging from a shoulder socket, forearm pointing +Z, with
 * `socket_weapon` at the hand.
 * @param {MaterialFactory} mf - Material factory.
 * @param {-1|1} side - -1 for left, 1 for right.
 * @returns {Object3D} Arm root.
 */
function buildMechArm(mf, side) {
  const s = side;
  return group("root", [
    box(mf.get("tdf-grey-dark"), [0.28, 0.28, 0.28], [s * 0.08, 0, 0], { name: "shoulder" }),
    box(mf.get("tdf-grey-mid"), [0.26, 0.5, 0.3], [s * 0.1, -0.35, 0], { name: "upper_arm" }),
    box(mf.get("tdf-olive"), [0.05, 0.3, 0.02], [s * 0.24, -0.35, 0.16], { name: "stripe" }),
    box(mf.get("tdf-grey-dark"), [0.24, 0.2, 0.24], [s * 0.1, -0.62, 0.05], { name: "elbow" }),
    box(mf.get("tdf-grey-mid"), [0.24, 0.24, 0.4], [s * 0.1, -0.65, 0.27], { name: "forearm" }),
    socket("weapon", [s * 0.1, -0.65, 0.47]),
  ]);
}

/**
 * Arm weapon: autocannon pointing +Z from `socket_weapon`.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Weapon root.
 */
function buildAutocannon(mf) {
  return group("root", [
    box(mf.get("tdf-grey-dark"), [0.22, 0.22, 0.3], [0, 0, 0.1], { name: "receiver" }),
    box(mf.get("tdf-grey-mid"), [0.1, 0.1, 0.45], [0, 0, 0.4], { name: "barrel" }),
    box(mf.get("tdf-orange"), [0.14, 0.14, 0.06], [0, 0, 0.63], { name: "muzzle" }),
    socket("muzzle", [0, 0, 0.66]),
  ]);
}

/**
 * Back weapon: six-tube missile pod sitting on `socket_back`.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Weapon root.
 */
function buildMissilePod(mf) {
  const parts = [
    box(mf.get("tdf-grey-dark"), [0.2, 0.1, 0.2], [0, -0.05, 0], { name: "mount" }),
    box(mf.get("tdf-grey-mid"), [0.5, 0.34, 0.5], [0, 0.17, 0], { name: "pod" }),
    box(mf.get("tdf-orange-dim"), [0.5, 0.04, 0.02], [0, 0.34, 0.26], { name: "stripe" }),
  ];
  let i = 0;
  for (const y of [0.1, 0.24]) {
    for (const x of [-0.15, 0, 0.15]) {
      parts.push(
        box(mf.get("tdf-grey-dark"), [0.1, 0.1, 0.06], [x, y, 0.26], { name: `tube_${i++}` }),
      );
    }
  }
  parts.push(socket("muzzle", [0, 0.17, 0.3]));
  return group("root", parts);
}

/**
 * Fully assembled reference mech: legs, chassis, both arms, autocannon on
 * the right arm and missile pod on the back. Height 2.79 u.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Mech root.
 */
function buildMechAssembled(mf) {
  const legs = buildMechLegs(mf);
  legs.name = "legs";
  const chassis = buildMechChassis(mf);
  chassis.name = "chassis";
  chassis.position.set(0, 1.42, 0);
  const armL = buildMechArm(mf, -1);
  armL.name = "arm_l";
  armL.position.set(-0.72, 0.85, 0);
  const armR = buildMechArm(mf, 1);
  armR.name = "arm_r";
  armR.position.set(0.72, 0.85, 0);
  const cannon = buildAutocannon(mf);
  cannon.name = "weapon_arm";
  cannon.position.set(0.1, -0.65, 0.47);
  armR.add(cannon);
  const pod = buildMissilePod(mf);
  pod.name = "weapon_back";
  pod.position.set(0.3, 1.05, -0.25);
  chassis.add(armL, armR, pod);
  return group("root", [legs, chassis]);
}

// ===========================================
// Bugs (style guide §3 silhouettes, §4.2 palette)
// ===========================================

/**
 * Swarmer: low six-legged wedge, 0.5 u tall, 0.8 u long, green accents.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Swarmer root.
 */
function buildSwarmer(mf) {
  const dark = mf.get("bug-chitin-dark");
  const mid = mf.get("bug-chitin-mid");
  const bone = mf.get("bug-bone");
  const parts = [
    box(dark, [0.34, 0.24, 0.5], [0, 0.26, -0.05], { name: "body" }),
    box(mid, [0.28, 0.2, 0.26], [0, 0.3, -0.38], { name: "abdomen" }),
    box(mid, [0.26, 0.18, 0.22], [0, 0.22, 0.28], { name: "thorax" }),
    box(dark, [0.18, 0.14, 0.18], [0, 0.14, 0.44], { name: "head" }),
    box(mf.get("bug-bio-green"), [0.04, 0.04, 0.04], [-0.05, 0.16, 0.53], { name: "eye_l" }),
    box(mf.get("bug-bio-green"), [0.04, 0.04, 0.04], [0.05, 0.16, 0.53], { name: "eye_r" }),
    box(mf.get("bug-bio-green"), [0.02, 0.02, 0.4], [0, 0.39, -0.1], { name: "vein" }),
  ];
  [-0.2, -0.05, 0.1].forEach((z, i) =>
    parts.push(cone(bone, 0.05, 0.14, 4, [0, 0.44, z], { name: `spine_${i}` })),
  );
  let leg = 0;
  for (const side of [-1, 1]) {
    for (const z of [-0.25, 0, 0.2]) {
      parts.push(
        box(dark, [0.05, 0.3, 0.05], [side * 0.24, 0.13, z], {
          name: `leg_${leg++}`,
          rot: [0, 0, side * -0.6],
        }),
      );
    }
    parts.push(
      box(mf.get("bug-chitin-black"), [0.05, 0.06, 0.3], [side * 0.14, 0.12, 0.5], {
        name: `blade_back_${side}`,
        rot: [0.5, 0, 0],
      }),
      box(bone, [0.02, 0.05, 0.3], [side * 0.14, 0.09, 0.51], {
        name: `blade_edge_${side}`,
        rot: [0.5, 0, 0],
      }),
    );
  }
  return group("root", parts);
}

/**
 * Lurker: tall forward-leaning stalker with two long scythe arms, 1.3 u,
 * magenta accents.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Lurker root.
 */
function buildLurker(mf) {
  const dark = mf.get("bug-chitin-dark");
  const mid = mf.get("bug-chitin-mid");
  const bone = mf.get("bug-bone");
  const black = mf.get("bug-chitin-black");
  const parts = [
    box(mid, [0.16, 0.2, 0.14], [0, 0.85, 0], { name: "waist" }),
    box(dark, [0.3, 0.34, 0.22], [0, 1.03, 0.08], { name: "chest", rot: [0.35, 0, 0] }),
    box(dark, [0.16, 0.18, 0.22], [0, 1.24, 0.2], { name: "head", rot: [0.3, 0, 0] }),
    box(mf.get("bug-bio-magenta"), [0.1, 0.02, 0.02], [0, 1.2, 0.32], { name: "slit" }),
    box(mf.get("bug-bio-magenta"), [0.03, 0.3, 0.02], [0, 1.02, -0.06], { name: "spine_glow" }),
    box(dark, [0.08, 0.08, 0.6], [0, 0.78, -0.38], { name: "tail", rot: [-0.4, 0, 0] }),
  ];
  for (const side of [-1, 1]) {
    const x = side * 0.12;
    parts.push(
      box(dark, [0.09, 0.42, 0.12], [x, 0.62, -0.08], { name: `thigh_${side}`, rot: [-0.35, 0, 0] }),
      box(dark, [0.08, 0.5, 0.09], [x, 0.24, 0.04], { name: `shin_${side}`, rot: [0.2, 0, 0] }),
      box(black, [0.06, 0.06, 0.06], [x, 0.03, 0.08], { name: `foot_${side}` }),
      box(mid, [0.07, 0.42, 0.08], [side * 0.2, 1.08, 0.3], {
        name: `upper_arm_${side}`,
        rot: [-1.1, 0, 0],
      }),
      box(black, [0.04, 0.7, 0.12], [side * 0.24, 1.0, 0.55], {
        name: `blade_back_${side}`,
        rot: [0.25, 0, 0],
      }),
      box(bone, [0.05, 0.68, 0.03], [side * 0.24, 1.0, 0.62], {
        name: `blade_edge_${side}`,
        rot: [0.25, 0, 0],
      }),
    );
  }
  return group("root", parts);
}

/**
 * Brute: boulder-like armoured dome, 1.8 u tall, 0.95 u wide, cleaver arms
 * dragging, green eye slits.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Brute root.
 */
function buildBrute(mf) {
  const dark = mf.get("bug-chitin-dark");
  const mid = mf.get("bug-chitin-mid");
  const bone = mf.get("bug-bone");
  const black = mf.get("bug-chitin-black");
  const parts = [
    ellipsoid(dark, 0.5, [0.95, 1.3, 1.0], [0, 1.05, 0], {
      name: "carapace",
      widthSegments: 10,
      heightSegments: 6,
    }),
    box(mf.get("bug-flesh"), [0.9, 0.06, 0.06], [0, 0.55, 0.3], { name: "seam" }),
    box(dark, [0.34, 0.28, 0.3], [0, 0.72, 0.5], { name: "head" }),
    box(mf.get("bug-bio-green"), [0.08, 0.02, 0.02], [-0.08, 0.76, 0.66], { name: "eye_l" }),
    box(mf.get("bug-bio-green"), [0.08, 0.02, 0.02], [0.08, 0.76, 0.66], { name: "eye_r" }),
  ];
  const spikes = [
    [0, 1.82, 0],
    [-0.2, 1.7, -0.15],
    [0.2, 1.7, -0.15],
    [-0.3, 1.5, 0.2],
    [0.3, 1.5, 0.2],
  ];
  spikes.forEach((at, i) =>
    parts.push(cone(bone, 0.08, 0.25, 4, at, { name: `spike_${i}`, rot: [0.15 * (i % 2), 0, 0] })),
  );
  let leg = 0;
  for (const side of [-1, 1]) {
    for (const z of [-0.22, 0.2]) {
      parts.push(
        box(dark, [0.22, 0.42, 0.24], [side * 0.3, 0.21, z], { name: `leg_${leg++}` }),
      );
    }
    parts.push(
      box(mid, [0.24, 0.5, 0.26], [side * 0.5, 0.55, 0.2], { name: `arm_${side}` }),
      box(black, [0.1, 0.16, 0.7], [side * 0.46, 0.08, 0.4], { name: `blade_back_${side}` }),
      box(bone, [0.11, 0.05, 0.68], [side * 0.46, 0.02, 0.42], { name: `blade_edge_${side}` }),
    );
  }
  return group("root", parts);
}

/**
 * Egg spawner: fleshy mound, four eggs (one split and glowing), a hatch
 * stalk with `socket_hatch` on top. 1.4 u tall.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Spawner root.
 */
function buildEggSpawner(mf) {
  const flesh = mf.get("bug-flesh");
  const fleshLight = mf.get("bug-flesh-light");
  const parts = [
    cylinder(mf.get("bug-bio-green-dim"), 0.55, 0.55, 0.02, 12, [0, 0.01, 0], { name: "pool" }),
    ellipsoid(flesh, 0.5, [1.0, 0.8, 1.0], [0, 0.15, 0], {
      name: "mound",
      widthSegments: 10,
      heightSegments: 6,
    }),
    cylinder(flesh, 0.12, 0.2, 0.7, 8, [0, 0.85, 0], { name: "stalk" }),
    cylinder(mf.get("bug-chitin-dark"), 0.2, 0.2, 0.1, 8, [0, 1.25, 0], { name: "hatch" }),
    cylinder(mf.get("bug-bio-magenta"), 0.12, 0.12, 0.04, 8, [0, 1.32, 0], { name: "hatch_glow" }),
    socket("hatch", [0, 1.4, 0]),
    box(mf.get("bug-chitin-dark"), [0.08, 0.14, 0.5], [-0.25, 0.45, -0.1], {
      name: "ridge_0",
      rot: [0, 0.4, 0],
    }),
    box(mf.get("bug-chitin-dark"), [0.08, 0.14, 0.4], [0.2, 0.42, -0.3], {
      name: "ridge_1",
      rot: [0, -0.7, 0],
    }),
  ];
  const eggs = [
    [-0.28, 0.5, 0.2],
    [0.28, 0.5, -0.22],
    [-0.22, 0.48, -0.28],
  ];
  eggs.forEach((at, i) =>
    parts.push(ellipsoid(fleshLight, 0.18, [1, 1.4, 1], at, { name: `egg_${i}` })),
  );
  parts.push(
    ellipsoid(fleshLight, 0.18, [1, 0.9, 1], [0.28, 0.5, 0.24], { name: "egg_split" }),
    ellipsoid(mf.get("bug-bio-magenta"), 0.11, [1, 1, 1], [0.28, 0.66, 0.24], { name: "egg_core" }),
  );
  const veins = [
    [[0, 0.46, 0.3], [0, 0.6, 0]],
    [[-0.3, 0.4, -0.05], [0, 1.4, 0]],
    [[0.15, 0.44, -0.3], [0, -0.5, 0]],
  ];
  veins.forEach(([at, rot], i) =>
    parts.push(
      box(mf.get("bug-bio-green"), [0.025, 0.025, 0.4], at, { name: `vein_${i}`, rot }),
    ),
  );
  return group("root", parts);
}

// ===========================================
// City tile kit (style guide §7)
// ===========================================

/**
 * Lane-marking dash on a road slab.
 * @param {MaterialFactory} mf - Material factory.
 * @param {[number, number, number]} at - Centre position (y ignored).
 * @param {boolean} alongX - True to run the dash along X instead of Z.
 * @param {string} name - Node name.
 * @returns {Mesh} Dash mesh.
 */
function dash(mf, at, alongX, name) {
  const size = alongX ? [0.2, 0.01, 0.06] : [0.06, 0.01, 0.2];
  return box(mf.get("env-sidewalk"), size, [at[0], 0.05, at[2]], { name });
}

/**
 * Road tile with markings describing which edges the road continues to.
 * @param {MaterialFactory} mf - Material factory.
 * @param {"straight"|"corner"|"t"|"cross"} shape - Road shape.
 * @returns {Object3D} Tile root.
 */
function buildRoad(mf, shape) {
  const parts = [slab(mf.get("env-asphalt"))];
  const arms = {
    straight: [[0, 0, -0.3], [0, 0, 0], [0, 0, 0.3]],
    corner: [[0, 0, 0.3], [0, 0, 0], [0.3, 0, 0]],
    t: [[-0.3, 0, 0], [0, 0, 0], [0.3, 0, 0], [0, 0, 0.3]],
    cross: [],
  }[shape];
  arms.forEach((at, i) => parts.push(dash(mf, at, at[0] !== 0, `dash_${i}`)));
  if (shape === "cross") {
    parts.push(box(mf.get("env-sidewalk"), [0.12, 0.01, 0.12], [0, 0.05, 0], { name: "centre" }));
  }
  return group("root", parts);
}

/**
 * Raised sidewalk tile with a kerb on the +Z edge (and +X for corners).
 * @param {MaterialFactory} mf - Material factory.
 * @param {boolean} corner - True for the two-kerb corner piece.
 * @returns {Object3D} Tile root.
 */
function buildSidewalk(mf, corner) {
  const parts = [
    slab(mf.get("env-sidewalk"), 0.12),
    box(mf.get("env-concrete"), [1, 0.12, 0.08], [0, 0.06, 0.46], { name: "kerb_z" }),
  ];
  if (corner) {
    parts.push(box(mf.get("env-concrete"), [0.08, 0.12, 1], [0.46, 0.06, 0], { name: "kerb_x" }));
  }
  return group("root", parts);
}

/**
 * Wall segment 1 u long along X, 1.5 u tall, pivot at the base midpoint.
 * @param {MaterialFactory} mf - Material factory.
 * @param {"solid"|"window"|"door"|"half"} kind - Wall variant.
 * @returns {Object3D} Wall root.
 */
function buildWall(mf, kind) {
  const brick = mf.get("env-brick");
  const concrete = mf.get("env-concrete");
  switch (kind) {
    case "window":
      return group("root", [
        box(brick, [1, 0.6, 0.1], [0, 0.3, 0], { name: "sill" }),
        box(brick, [1, 0.4, 0.1], [0, 1.3, 0], { name: "lintel" }),
        box(brick, [0.2, 0.5, 0.1], [-0.4, 0.85, 0], { name: "jamb_l" }),
        box(brick, [0.2, 0.5, 0.1], [0.4, 0.85, 0], { name: "jamb_r" }),
        box(mf.get("env-glass"), [0.6, 0.5, 0.02], [0, 0.85, 0], { name: "glass" }),
      ]);
    case "door":
      return group("root", [
        box(brick, [0.2, 1.5, 0.1], [-0.4, 0.75, 0], { name: "jamb_l" }),
        box(brick, [0.2, 1.5, 0.1], [0.4, 0.75, 0], { name: "jamb_r" }),
        box(brick, [0.6, 0.3, 0.1], [0, 1.35, 0], { name: "lintel" }),
        box(mf.get("env-metal"), [0.64, 0.04, 0.12], [0, 1.22, 0], { name: "frame" }),
        socket("door", [0, 0, 0]),
      ]);
    case "half":
      return group("root", [box(concrete, [1, 0.5, 0.12], [0, 0.25, 0], { name: "wall" })]);
    default:
      return group("root", [
        box(brick, [1, 1.5, 0.1], [0, 0.75, 0], { name: "wall" }),
        box(concrete, [1, 0.15, 0.12], [0, 0.075, 0], { name: "footer" }),
      ]);
  }
}

/**
 * Six-step staircase rising 1.5 u over one tile along +Z.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Stairs root.
 */
function buildStairs(mf) {
  const parts = [];
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const top = (1.5 / steps) * (i + 1);
    const depth = 1 / steps;
    parts.push(
      box(mf.get("env-concrete"), [0.9, top, depth], [0, top / 2, -0.5 + depth * (i + 0.5)], {
        name: `step_${i}`,
      }),
    );
  }
  const slope = -Math.atan2(1.5, 1);
  parts.push(
    box(mf.get("env-metal"), [0.04, 0.06, 1.8], [-0.47, 0.9, 0], { name: "rail_l", rot: [slope, 0, 0] }),
    box(mf.get("env-metal"), [0.04, 0.06, 1.8], [0.47, 0.9, 0], { name: "rail_r", rot: [slope, 0, 0] }),
  );
  return group("root", parts);
}

/**
 * Two-tile sedan car, footprint 2×1 along X, pivot at the centre.
 * @param {MaterialFactory} mf - Material factory.
 * @returns {Object3D} Car root.
 */
function buildCar(mf) {
  const parts = [
    box(mf.get("env-metal"), [1.8, 0.36, 0.8], [0, 0.34, 0], { name: "body" }),
    box(mf.get("env-glass"), [0.9, 0.3, 0.72], [-0.1, 0.67, 0], { name: "cabin" }),
    box(mf.get("env-rust"), [0.3, 0.1, 0.7], [0.8, 0.3, 0], { name: "bumper" }),
  ];
  let i = 0;
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.42, 0.42]) {
      parts.push(
        cylinder(mf.get("tdf-grey-dark"), 0.16, 0.16, 0.12, 8, [x, 0.16, z], {
          name: `wheel_${i++}`,
          rot: [Math.PI / 2, 0, 0],
        }),
      );
    }
  }
  return group("root", parts);
}

/**
 * Street props keyed by name.
 * @param {MaterialFactory} mf - Material factory.
 * @param {"barrier-concrete"|"sandbags"|"dumpster"|"lamp-post"|"hydrant"} kind - Prop kind.
 * @returns {Object3D} Prop root.
 */
function buildProp(mf, kind) {
  switch (kind) {
    case "barrier-concrete":
      return group("root", [
        box(mf.get("env-concrete"), [0.9, 0.15, 0.45], [0, 0.075, 0], { name: "base" }),
        box(mf.get("env-concrete"), [0.9, 0.35, 0.25], [0, 0.325, 0], { name: "top" }),
        box(mf.get("tdf-orange-dim"), [0.9, 0.06, 0.26], [0, 0.4, 0], { name: "stripe" }),
      ]);
    case "sandbags": {
      const parts = [];
      let n = 0;
      for (let row = 0; row < 3; row++) {
        const y = 0.08 + row * 0.16;
        const offset = row % 2 ? 0.15 : 0;
        for (let i = 0; i < 3 - (row % 2); i++) {
          parts.push(
            box(mf.get("tdf-olive-dark"), [0.3, 0.16, 0.24], [-0.3 + offset + i * 0.3, y, 0], {
              name: `bag_${n++}`,
            }),
          );
        }
      }
      return group("root", parts);
    }
    case "dumpster":
      return group("root", [
        box(mf.get("env-metal"), [0.9, 0.8, 0.6], [0, 0.5, 0], { name: "bin" }),
        box(mf.get("env-rust"), [0.94, 0.1, 0.64], [0, 0.95, 0], { name: "lid" }),
        box(mf.get("tdf-grey-dark"), [0.8, 0.1, 0.5], [0, 0.05, 0], { name: "wheels" }),
      ]);
    case "lamp-post":
      return group("root", [
        cylinder(mf.get("env-metal"), 0.06, 0.08, 0.2, 8, [0, 0.1, 0], { name: "base" }),
        cylinder(mf.get("env-metal"), 0.035, 0.045, 2.4, 6, [0, 1.4, 0], { name: "pole" }),
        box(mf.get("env-metal"), [0.5, 0.05, 0.05], [0.25, 2.6, 0], { name: "arm" }),
        box(mf.get("tdf-grey-light"), [0.25, 0.1, 0.16], [0.42, 2.55, 0], { name: "lamp" }),
      ]);
    case "hydrant":
      return group("root", [
        cylinder(mf.get("env-rust"), 0.08, 0.1, 0.5, 8, [0, 0.25, 0], { name: "body" }),
        cylinder(mf.get("env-rust"), 0.05, 0.09, 0.1, 8, [0, 0.55, 0], { name: "cap" }),
        box(mf.get("env-rust"), [0.3, 0.08, 0.08], [0, 0.35, 0], { name: "nozzles" }),
      ]);
    default:
      throw new Error(`Unknown prop: ${kind}`);
  }
}

// ===========================================
// Model registry
// ===========================================

/**
 * @typedef {object} ModelDef
 * @property {string} id - Manifest id, dot-separated.
 * @property {"units"|"bugs"|"props"|"tiles"|"buildings"} category - Output folder.
 * @property {string} file - File name inside the category folder.
 * @property {{w: number, d: number}} footprint - Footprint in tiles (0×0 for parts).
 * @property {number} height - Height in world units.
 * @property {(mf: MaterialFactory) => Object3D} build - Builder.
 */

/** @type {ModelDef[]} */
const MODEL_DEFS = [
  ...["rifle", "rocket", "sniper", "engineer", "medic"].map((kit) => ({
    id: `tdf.infantry.${kit}`,
    category: "units",
    file: `tdf-infantry-${kit}.glb`,
    footprint: { w: 1, d: 1 },
    height: kit === "rocket" ? 0.95 : 0.95,
    build: (mf) => buildInfantrySquad(mf, kit),
  })),
  { id: "tdf.mech.legs-a", category: "units", file: "tdf-mech-legs-a.glb", footprint: { w: 1, d: 1 }, height: 1.42, build: buildMechLegs },
  { id: "tdf.mech.chassis-a", category: "units", file: "tdf-mech-chassis-a.glb", footprint: { w: 0, d: 0 }, height: 1.37, build: buildMechChassis },
  { id: "tdf.mech.arm-l-a", category: "units", file: "tdf-mech-arm-l-a.glb", footprint: { w: 0, d: 0 }, height: 0.77, build: (mf) => buildMechArm(mf, -1) },
  { id: "tdf.mech.arm-r-a", category: "units", file: "tdf-mech-arm-r-a.glb", footprint: { w: 0, d: 0 }, height: 0.77, build: (mf) => buildMechArm(mf, 1) },
  { id: "tdf.mech.weapon-arm.autocannon", category: "units", file: "tdf-mech-weapon-arm-autocannon.glb", footprint: { w: 0, d: 0 }, height: 0.22, build: buildAutocannon },
  { id: "tdf.mech.weapon-back.missile-pod", category: "units", file: "tdf-mech-weapon-back-missile-pod.glb", footprint: { w: 0, d: 0 }, height: 0.36, build: buildMissilePod },
  { id: "tdf.mech.assembled-a", category: "units", file: "tdf-mech-assembled-a.glb", footprint: { w: 1, d: 1 }, height: 2.79, build: buildMechAssembled },
  { id: "bug.swarmer", category: "bugs", file: "bug-swarmer.glb", footprint: { w: 1, d: 1 }, height: 0.51, build: buildSwarmer },
  { id: "bug.lurker", category: "bugs", file: "bug-lurker.glb", footprint: { w: 1, d: 1 }, height: 1.35, build: buildLurker },
  { id: "bug.brute", category: "bugs", file: "bug-brute.glb", footprint: { w: 1, d: 1 }, height: 1.85, build: buildBrute },
  { id: "bug.egg-spawner", category: "props", file: "egg-spawner.glb", footprint: { w: 1, d: 1 }, height: 1.4, build: buildEggSpawner },
  ...["straight", "corner", "t", "cross"].map((shape) => ({
    id: `tile.city.road-${shape}`,
    category: "tiles",
    file: `city-road-${shape}.glb`,
    footprint: { w: 1, d: 1 },
    height: 0.05,
    build: (mf) => buildRoad(mf, shape),
  })),
  { id: "tile.city.sidewalk", category: "tiles", file: "city-sidewalk.glb", footprint: { w: 1, d: 1 }, height: 0.12, build: (mf) => buildSidewalk(mf, false) },
  { id: "tile.city.sidewalk-corner", category: "tiles", file: "city-sidewalk-corner.glb", footprint: { w: 1, d: 1 }, height: 0.12, build: (mf) => buildSidewalk(mf, true) },
  { id: "tile.temperate.ground-a", category: "tiles", file: "temperate-ground-a.glb", footprint: { w: 1, d: 1 }, height: 0.05, build: (mf) => group("root", [slab(mf.get("env-grass"))]) },
  { id: "tile.temperate.ground-b", category: "tiles", file: "temperate-ground-b.glb", footprint: { w: 1, d: 1 }, height: 0.05, build: (mf) => group("root", [slab(mf.get("env-dirt"))]) },
  { id: "building.wall", category: "buildings", file: "wall.glb", footprint: { w: 1, d: 0 }, height: 1.5, build: (mf) => buildWall(mf, "solid") },
  { id: "building.wall-window", category: "buildings", file: "wall-window.glb", footprint: { w: 1, d: 0 }, height: 1.5, build: (mf) => buildWall(mf, "window") },
  { id: "building.wall-door", category: "buildings", file: "wall-door.glb", footprint: { w: 1, d: 0 }, height: 1.5, build: (mf) => buildWall(mf, "door") },
  { id: "building.wall-half", category: "buildings", file: "wall-half.glb", footprint: { w: 1, d: 0 }, height: 0.5, build: (mf) => buildWall(mf, "half") },
  { id: "building.floor", category: "buildings", file: "floor.glb", footprint: { w: 1, d: 1 }, height: 0.05, build: (mf) => group("root", [slab(mf.get("env-concrete"))]) },
  { id: "building.roof", category: "buildings", file: "roof.glb", footprint: { w: 1, d: 1 }, height: 0.05, build: (mf) => group("root", [slab(mf.get("env-roof"))]) },
  { id: "building.roof-parapet", category: "buildings", file: "roof-parapet.glb", footprint: { w: 1, d: 0 }, height: 0.15, build: (mf) => group("root", [box(mf.get("env-concrete"), [1, 0.15, 0.08], [0, 0.075, 0], { name: "parapet" })]) },
  { id: "building.stairs", category: "buildings", file: "stairs.glb", footprint: { w: 1, d: 1 }, height: 1.5, build: buildStairs },
  { id: "prop.barrier-concrete", category: "props", file: "barrier-concrete.glb", footprint: { w: 1, d: 1 }, height: 0.5, build: (mf) => buildProp(mf, "barrier-concrete") },
  { id: "prop.sandbags", category: "props", file: "sandbags.glb", footprint: { w: 1, d: 1 }, height: 0.48, build: (mf) => buildProp(mf, "sandbags") },
  { id: "prop.dumpster", category: "props", file: "dumpster.glb", footprint: { w: 1, d: 1 }, height: 1.0, build: (mf) => buildProp(mf, "dumpster") },
  { id: "prop.car-sedan", category: "props", file: "car-sedan.glb", footprint: { w: 2, d: 1 }, height: 0.82, build: buildCar },
  { id: "prop.lamp-post", category: "props", file: "lamp-post.glb", footprint: { w: 1, d: 1 }, height: 2.65, build: (mf) => buildProp(mf, "lamp-post") },
  { id: "prop.hydrant", category: "props", file: "hydrant.glb", footprint: { w: 1, d: 1 }, height: 0.6, build: (mf) => buildProp(mf, "hydrant") },
];

// ===========================================
// Export
// ===========================================

/**
 * Counts triangles across all meshes under a node.
 * @param {Object3D} root - Node to traverse.
 * @returns {number} Triangle count.
 */
function countTriangles(root) {
  let triangles = 0;
  root.traverse((node) => {
    if (node instanceof Mesh) {
      const geometry = node.geometry;
      const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
      triangles += count / 3;
    }
  });
  return triangles;
}

/**
 * Collects socket node names under a node.
 * @param {Object3D} root - Node to traverse.
 * @returns {string[]} Socket names in traversal order.
 */
function collectSockets(root) {
  const sockets = [];
  root.traverse((node) => {
    if (node.name.startsWith("socket_")) sockets.push(node.name);
  });
  return sockets;
}

/**
 * Builds one model, exports it as GLB and returns its manifest record.
 * @param {ModelDef} def - Model definition.
 * @param {string} outDir - Root output directory.
 * @returns {Promise<object>} Manifest record with byte size and triangle count.
 */
async function exportModel(def, outDir) {
  const root = def.build(new MaterialFactory());
  const scene = new Scene();
  scene.add(root);
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(scene, { binary: true });
  const bytes = Buffer.from(glb);
  const relative = join(def.category, def.file);
  const target = join(outDir, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return {
    id: def.id,
    category: def.category,
    path: `assets/models/${relative}`,
    footprint: def.footprint,
    height: def.height,
    sockets: collectSockets(root),
    quality: "placeholder",
    triangles: countTriangles(root),
    bytes: bytes.length,
  };
}

/**
 * Entry point: builds every model and writes the JSON manifest record.
 */
async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const outFlag = process.argv.indexOf("--out");
  const outDir = resolve(
    outFlag >= 0 ? process.argv[outFlag + 1] : join(here, "..", "..", "public", "assets", "models"),
  );
  const records = [];
  for (const def of MODEL_DEFS) {
    const record = await exportModel(def, outDir);
    records.push(record);
    const kb = (record.bytes / 1024).toFixed(1).padStart(6);
    console.log(`${record.id.padEnd(36)} ${String(record.triangles).padStart(5)} tris ${kb} KB`);
  }
  const manifestPath = join(here, "placeholders.manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`\n${records.length} models → ${outDir}\nmanifest → ${manifestPath}`);
}

await main();
