import type { Command } from "../../core/model/command";

// ===========================================
// Grant tech points
// ===========================================

/**
 * Command type that hands the campaign tech points for nothing (#1171).
 * A development tool: the handler refuses it outside a dev build, so a
 * production campaign cannot be fed points through the store.
 */
export const GRANT_TECH_POINTS = "tech:grant-points";

/** How many. */
export interface GrantTechPointsPayload {
  readonly amount: number;
}

/** Grants `amount` tech points to the campaign; dev builds only. */
export type GrantTechPointsCommand = Command<
  typeof GRANT_TECH_POINTS,
  GrantTechPointsPayload
>;

/** Builds a `GrantTechPoints` command. */
export function grantTechPoints(amount: number): GrantTechPointsCommand {
  return { type: GRANT_TECH_POINTS, payload: { amount } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [GRANT_TECH_POINTS]: GrantTechPointsCommand;
  }
}
