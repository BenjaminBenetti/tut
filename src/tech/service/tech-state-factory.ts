import type { TechState } from "../model/tech-state";

/** Builds the tech slice for a fresh campaign: nothing unlocked yet. */
export function createInitialTechState(): TechState {
  return { unlocked: [] };
}
