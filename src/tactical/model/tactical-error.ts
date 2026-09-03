// ===========================================
// Tactical error
// ===========================================

/** Why a tactical command or mission start was rejected. Serializable. */
export type TacticalError =
  | { readonly kind: "no-active-mission" }
  | { readonly kind: "mission-active"; readonly missionId: string }
  | { readonly kind: "mission-not-found"; readonly missionId: string }
  | { readonly kind: "empty-deployment" }
  | { readonly kind: "unit-not-found"; readonly unitId: string }
  | { readonly kind: "invalid-loadout"; readonly mechId: string }
  | { readonly kind: "map-recipe"; readonly reason: string }
  | {
      readonly kind: "no-deploy-room";
      readonly unitId: string;
      readonly passClass: string;
    };

/** Human-readable text for a tactical error, for the status line and logs. */
export function describeTacticalError(error: TacticalError): string {
  switch (error.kind) {
    case "no-active-mission":
      return "No mission is in progress";
    case "mission-active":
      return `Mission "${error.missionId}" is already in progress`;
    case "mission-not-found":
      return `No mission "${error.missionId}" is on offer`;
    case "empty-deployment":
      return "A deployment needs at least one unit";
    case "unit-not-found":
      return `Unit "${error.unitId}" is not in the roster`;
    case "invalid-loadout":
      return `Mech "${error.mechId}" has a loadout that no longer validates`;
    case "map-recipe":
      return `The mission's map cannot be generated: ${error.reason}`;
    case "no-deploy-room":
      return `No ${error.passClass} tile is left in the deploy zone for "${error.unitId}"`;
  }
}
