import type { Command } from "../../core/model/command";
import type { TileCoord } from "../../mapgen/model/tile-coord";

/** Active mech systems whose targeting differs from ordinary weapon fire. */
export type MechAction = "jump" | "brace" | "coolant" | "designate";
export const MECH_ACTION = "tactical:mech-action";

/** Shared action costs and target shapes for rule validation and capability discovery. */
export const MECH_ACTION_DEFINITIONS = {
  jump: { apCost: 1, target: "tile" },
  brace: { apCost: 1, target: "self" },
  coolant: { apCost: 0, target: "self" },
  designate: { apCost: 1, target: "hostile" },
} as const satisfies Readonly<
  Record<
    MechAction,
    { readonly apCost: number; readonly target: "tile" | "self" | "hostile" }
  >
>;

/** A mech system order; jump names a tile and designation names a unit. */
export interface MechActionPayload {
  readonly unitId: string;
  readonly action: MechAction;
  readonly tile?: TileCoord;
  readonly targetId?: string;
}
export type MechActionCommand = Command<typeof MECH_ACTION, MechActionPayload>;

/** Builds a serializable order for a fitted mech system. */
export function mechAction(payload: MechActionPayload): MechActionCommand {
  return { type: MECH_ACTION, payload };
}

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [MECH_ACTION]: MechActionCommand;
  }
}
declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [MECH_ACTION]: MechActionCommand;
  }
}
