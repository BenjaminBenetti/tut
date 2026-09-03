import type { DeployableId } from "./deployable";
import type { DeployableTypeId } from "./deployable-type";
import type { RegionId } from "./region";

// ===========================================
// Errors
// ===========================================

/** A build named a type the catalogue lacks. */
export interface UnknownDeployableTypeError {
  readonly code: "unknown-deployable-type";
  readonly typeId: DeployableTypeId;
}

/** A build named a region that is not on the map. */
export interface UnknownRegionError {
  readonly code: "unknown-region";
  readonly regionId: RegionId;
}

/** The region already holds as many of the type as it may. */
export interface RegionCapReachedError {
  readonly code: "region-cap-reached";
  readonly typeId: DeployableTypeId;
  readonly regionId: RegionId;
  /** The type's `maxPerRegion`. */
  readonly cap: number;
}

/** A decommission named an installation that does not exist. */
export interface UnknownDeployableError {
  readonly code: "unknown-deployable";
  readonly deployableId: DeployableId;
}

/** The treasury could not cover the build cost. Mirrors the economy's error. */
export interface DeployableInsufficientCreditsError {
  readonly code: "insufficient-credits";
  readonly required: number;
  readonly available: number;
}

/**
 * Why a deployable command was rejected. Plain data discriminated on
 * `code` so a handler can fold it into a `CommandError` and a screen can
 * point at the field concerned.
 *
 * | code                      | command                 |
 * |---------------------------|-------------------------|
 * | `unknown-deployable-type` | BuildDeployable         |
 * | `unknown-region`          | BuildDeployable         |
 * | `region-cap-reached`      | BuildDeployable         |
 * | `insufficient-credits`    | BuildDeployable         |
 * | `unknown-deployable`      | DecommissionDeployable  |
 */
export type DeployableError =
  | UnknownDeployableTypeError
  | UnknownRegionError
  | RegionCapReachedError
  | UnknownDeployableError
  | DeployableInsufficientCreditsError;

/** The `code` tag of a `DeployableError`. */
export type DeployableErrorCode = DeployableError["code"];

// ===========================================
// Messages
// ===========================================

/** Renders an error as one human-readable sentence for the UI or a log. */
export function describeDeployableError(error: DeployableError): string {
  switch (error.code) {
    case "unknown-deployable-type":
      return `No deployable type "${error.typeId}"`;
    case "unknown-region":
      return `No region "${error.regionId}"`;
    case "region-cap-reached":
      return `Region "${error.regionId}" already holds ${String(error.cap)} of "${error.typeId}"`;
    case "unknown-deployable":
      return `No deployable "${error.deployableId}"`;
    case "insufficient-credits":
      return `Need ${String(error.required)} credits, have ${String(error.available)}`;
  }
}
