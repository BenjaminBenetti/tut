import type { ArchitecturalPlan } from "../model/architectural-plan";
import type { KnownBuildingKindId } from "./building-kind-ids";

/** One control room off a service bay, the rest open plant floor (#1175). */
const INSTALLATION_PLAN: ArchitecturalPlan = {
  style: "industrial",
  serviceDepth: { min: 3, max: 4 },
  serviceWidth: { min: 3, max: 4 },
  minimumPublicDepth: 4,
};

/** Human-scale service rooms leave distinct, generous main spaces in each building. */
export const ARCHITECTURAL_PLANS: Readonly<
  Record<KnownBuildingKindId, ArchitecturalPlan>
> = {
  house: {
    style: "residential",
    serviceDepth: { min: 3, max: 4 },
    serviceWidth: { min: 2, max: 3 },
    minimumPublicDepth: 3,
  },
  apartment: {
    style: "residential",
    serviceDepth: { min: 3, max: 4 },
    serviceWidth: { min: 2, max: 3 },
    minimumPublicDepth: 3,
  },
  shop: {
    style: "retail",
    serviceDepth: { min: 2, max: 3 },
    serviceWidth: { min: 3, max: 5 },
    minimumPublicDepth: 4,
  },
  tower: {
    style: "workplace",
    serviceDepth: { min: 3, max: 4 },
    serviceWidth: { min: 3, max: 4 },
    minimumPublicDepth: 3,
  },
  warehouse: {
    style: "industrial",
    serviceDepth: { min: 3, max: 4 },
    serviceWidth: { min: 3, max: 4 },
    minimumPublicDepth: 5,
  },
  // Installations are plant rooms behind a service bay (#1175).
  "sensor-array": INSTALLATION_PLAN,
  "repellent-dispersal": INSTALLATION_PLAN,
  "defensive-battery": INSTALLATION_PLAN,
  bank: INSTALLATION_PLAN,
};
