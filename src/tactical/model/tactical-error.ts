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
    }
  | { readonly kind: "unit-not-on-map"; readonly unitId: string }
  | { readonly kind: "unit-dead"; readonly unitId: string }
  | { readonly kind: "wrong-phase"; readonly unitId: string }
  | { readonly kind: "no-action-points"; readonly unitId: string }
  | { readonly kind: "self-target"; readonly unitId: string }
  | { readonly kind: "friendly-target"; readonly targetId: string }
  | {
      readonly kind: "out-of-range";
      readonly distance: number;
      readonly range: number;
    }
  | { readonly kind: "no-line-of-sight"; readonly targetId: string };

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
    case "unit-not-on-map":
      return `Unit "${error.unitId}" is not in this mission`;
    case "unit-dead":
      return `Unit "${error.unitId}" is dead`;
    case "wrong-phase":
      return `Unit "${error.unitId}" cannot act in this phase`;
    case "no-action-points":
      return `Unit "${error.unitId}" has no action points left`;
    case "self-target":
      return `Unit "${error.unitId}" cannot attack itself`;
    case "friendly-target":
      return `Unit "${error.targetId}" is on the same side`;
    case "out-of-range":
      return `Target is ${String(error.distance)} tiles away; weapon reaches ${String(error.range)}`;
    case "no-line-of-sight":
      return `No line of sight to "${error.targetId}"`;
  }
}
