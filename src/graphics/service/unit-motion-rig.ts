import { Box3, Group, Mesh, Vector3 } from "three";
import type { Object3D } from "three";
import { UNIT_MOTION_TUNING } from "../data/unit-motion-tuning";
import type { UnitMotionTuning, UnitMotion } from "../model/unit-motion";

// ===========================================
// Types
// ===========================================

interface Joint {
  readonly object: Group;
  readonly rest: Vector3;
  readonly phase: number;
}

// ===========================================
// Rig
// ===========================================

/**
 * Articulates the named rigid pieces of the shipped GLBs. Only the loaded
 * clone's transforms change; shared geometry, materials and the tactical
 * root (including its selection rings) remain owned by their usual layers.
 */
export class UnitMotionRig implements UnitMotion {
  private readonly body: Joint;
  private readonly legs: Joint[] = [];
  private readonly arms: Joint[] = [];
  private readonly figures: Joint[] = [];
  private readonly height: number;
  private readonly infantry: boolean;
  private readonly mech: boolean;
  private readonly bug: boolean;
  private readonly swarmer: boolean;

  /** Builds pivots once, before the clone is placed on the battlefield. */
  constructor(
    model: Object3D,
    modelId: string,
    private readonly tuning: UnitMotionTuning = UNIT_MOTION_TUNING,
  ) {
    this.infantry = modelId.startsWith("tdf.infantry.");
    this.mech = modelId.startsWith("tdf.mech.");
    this.bug = modelId.startsWith("bug.");
    this.swarmer = modelId === "bug.swarmer";
    this.height = new Box3().setFromObject(model).getSize(new Vector3()).y;
    const parts = model.children.filter((part) => part.name !== "base");
    this.body = pivot(model, parts, "motion-body", new Vector3());
    if (this.infantry) {
      this.rigInfantry();
    } else {
      this.rigLimbs();
    }
    // These Blender exports face +Z (their muzzle/head nodes confirm it).
    // Tactical facings use -Z, so normalize the clone after building pivots.
    model.rotateY(Math.PI);
  }

  /** Alternating strides; mechs take a full left/right cycle over two tiles. */
  walk(strides: number): void {
    this.reset();
    const tuning = this.tuning;
    const cyclesPerTile = this.mech ? tuning.mechWalkCyclesPerTile : 1;
    const cycle = strides * cyclesPerTile * Math.PI * 2;
    const lift = Math.abs(Math.sin(cycle));
    this.body.object.position.y += lift * this.height * tuning.bodyLift;
    this.body.object.rotation.z =
      Math.sin(cycle) * (this.bug ? tuning.bugRoll : tuning.bodyRoll);
    for (const leg of this.legs) {
      const swing = Math.sin(cycle + leg.phase);
      leg.object.rotation.x =
        swing * (this.swarmer ? tuning.swarmerLegSwing : tuning.legSwing);
      leg.object.position.y +=
        Math.max(0, swing) * this.height * tuning.footLift;
    }
    for (const figure of this.figures) {
      const step = Math.sin(cycle + figure.phase);
      figure.object.position.y += Math.abs(step) * tuning.figureLift;
      figure.object.rotation.x = tuning.figureLean * lift;
      figure.object.rotation.z = step * tuning.figureRoll;
    }
    for (const arm of this.arms) {
      arm.object.rotation.x = Math.sin(cycle + arm.phase) * tuning.armSwing;
    }
  }

  /** Recoil and follow-through are local, so they work at every world facing. */
  attack(progress: number, melee: boolean): void {
    this.reset();
    if (progress <= 0 || progress >= 1) return;
    // A quick strike followed by a longer settle, with no frame-rate integration.
    const tuning = this.tuning;
    const peak = melee ? tuning.strikePeak : tuning.recoilPeak;
    const pulse =
      progress < peak
        ? Math.sin(((progress / peak) * Math.PI) / 2)
        : Math.cos((((progress - peak) / (1 - peak)) * Math.PI) / 2);
    this.body.object.position.z +=
      pulse * (melee ? tuning.lunge : -tuning.recoil);
    this.body.object.rotation.x =
      pulse * (melee ? tuning.strikeLean : -tuning.recoilLean);
    for (const arm of this.arms) {
      arm.object.rotation.x =
        pulse * (melee ? -tuning.strikeSwing : -tuning.weaponKick);
      arm.object.rotation.y = melee
        ? Math.cos(arm.phase) * pulse * tuning.strikeTwist
        : 0;
      if (!melee) arm.object.position.z -= pulse * tuning.weaponRecoil;
    }
    for (const figure of this.figures) {
      figure.object.rotation.x = -pulse * tuning.figureRecoil;
    }
  }

  /** Clears only this rig's offsets; world placement and selection stay intact. */
  reset(): void {
    for (const joint of [
      this.body,
      ...this.legs,
      ...this.arms,
      ...this.figures,
    ]) {
      joint.object.position.copy(joint.rest);
      joint.object.rotation.set(0, 0, 0);
    }
  }

  /** Groups each soldier and turns the authored lower-body block into two legs. */
  private rigInfantry(): void {
    const body = this.body.object;
    for (let index = 0; index < 5; index++) {
      const prefix = `fig${index}_`;
      const parts = body.children.filter((part) =>
        part.name.startsWith(prefix),
      );
      if (parts.length === 0) continue;
      const centre = bounds(parts).getCenter(new Vector3());
      centre.y = 0;
      const figure = pivot(
        body,
        parts,
        `motion-figure-${index}`,
        centre,
        index * 0.65,
      );
      this.figures.push(figure);
      const block = figure.object.getObjectByName(`${prefix}legs`);
      if (block instanceof Mesh) {
        // The source is one box for both legs. Two narrower instances retain
        // its atlas and buffers while providing independently swinging limbs.
        const width = new Box3().setFromObject(block).getSize(new Vector3()).x;
        const right = block.clone();
        right.name = `${prefix}leg-right`;
        block.scale.x *= 0.46;
        right.scale.x *= 0.46;
        block.position.x -= width * 0.25;
        right.position.x += width * 0.25;
        figure.object.add(right);
        const knee = figure.object.getObjectByName(`${prefix}knee`);
        for (const [side, pieces] of [
          [block],
          [right, ...(knee ? [knee] : [])],
        ].entries()) {
          const top = bounds(pieces);
          const at = top.getCenter(new Vector3());
          at.y = top.max.y;
          this.legs.push(
            pivot(
              figure.object,
              pieces,
              `motion-leg-${index}-${side}`,
              at,
              index * 0.65 + side * Math.PI,
            ),
          );
        }
      }
      const upper = figure.object.children.filter(
        (part) => !part.name.startsWith("motion-leg-") && part !== block,
      );
      if (upper.length > 0) {
        const at = bounds(upper).getCenter(new Vector3());
        this.arms.push(
          pivot(
            figure.object,
            upper,
            `motion-upper-${index}`,
            at,
            index * 0.65,
          ),
        );
      }
    }
  }

  /** Groups connected armour and blade pieces around hip and shoulder pivots. */
  private rigLimbs(): void {
    const body = this.body.object;
    const legGroups = new Map<string, Object3D[]>();
    const armGroups = new Map<string, Object3D[]>();
    for (const part of [...body.children]) {
      const leg =
        /^(?:leg_([lr]\d)|(?:foot|toe|heel|shin|knee|thigh|hip_joint|claw).*_([lr]))/.exec(
          part.name,
        );
      if (leg) {
        const key = leg[1] ?? leg[2]!;
        legGroups.set(key, [...(legGroups.get(key) ?? []), part]);
      } else if (
        this.bug &&
        /^(?:arm|upper_arm|scythe|blade|cleaver|flesh)_/.test(part.name)
      ) {
        const side = /_l(?:_|$)/.test(part.name) ? "l" : "r";
        armGroups.set(side, [...(armGroups.get(side) ?? []), part]);
      } else if (
        !this.bug &&
        /^(?:shoulder$|upper_arm|upper_stripe|elbow|forearm|sensor_|wrist|receiver|ammo_|hub|barrel|muzzle|pod|tube|mount|rail|breech)/.test(
          part.name,
        )
      ) {
        armGroups.set("weapon", [...(armGroups.get("weapon") ?? []), part]);
      }
    }
    for (const [key, parts] of legGroups) {
      const box = bounds(parts);
      const at = box.getCenter(new Vector3());
      at.y = box.max.y;
      const phase =
        (key.startsWith("r") ? Math.PI : 0) + Number(key[1] ?? 0) * Math.PI;
      this.legs.push(pivot(body, parts, `motion-leg-${key}`, at, phase));
    }
    for (const [key, parts] of armGroups) {
      const box = bounds(parts);
      const at = box.getCenter(new Vector3());
      at.y = box.max.y;
      this.arms.push(
        pivot(body, parts, `motion-arm-${key}`, at, key === "r" ? Math.PI : 0),
      );
    }
  }
}

// ===========================================
// Pivot helpers
// ===========================================

/** Measures a set of siblings in world space before reparenting them. */
function bounds(parts: readonly Object3D[]): Box3 {
  const box = new Box3();
  for (const part of parts) box.union(new Box3().setFromObject(part));
  return box;
}

/** Inserts a pivot at a world point, preserving every piece's authored pose. */
function pivot(
  parent: Object3D,
  parts: readonly Object3D[],
  name: string,
  world: Vector3,
  phase = 0,
): Joint {
  parent.updateWorldMatrix(true, true);
  const object = new Group();
  object.name = name;
  object.position.copy(parent.worldToLocal(world.clone()));
  parent.add(object);
  object.updateWorldMatrix(true, false);
  for (const part of parts) object.attach(part);
  return { object, rest: object.position.clone(), phase };
}
