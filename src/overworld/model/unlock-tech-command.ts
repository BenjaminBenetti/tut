import type { Command } from "../../core/model/command";
import type { TechNodeId } from "../../tech/model/tech-node";

// ===========================================
// Unlock tech
// ===========================================

/** Command type that buys one node of the tech tree for tech points (GDD §5.5.1, #1171). */
export const UNLOCK_TECH = "tech:unlock";

/** Which node. */
export interface UnlockTechPayload {
  readonly nodeId: TechNodeId;
}

/** Spends tech points on a node, making its parts purchasable. */
export type UnlockTechCommand = Command<typeof UNLOCK_TECH, UnlockTechPayload>;

/** Builds an `UnlockTech` command. */
export function unlockTech(nodeId: TechNodeId): UnlockTechCommand {
  return { type: UNLOCK_TECH, payload: { nodeId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [UNLOCK_TECH]: UnlockTechCommand;
  }
}
