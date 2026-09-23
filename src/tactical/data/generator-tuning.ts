import type { GeneratorTuning } from "../model/generator";

// ===========================================
// Generator tuning
// ===========================================

/**
 * The generator a defend-installation mission stands up (#1175, GDD
 * §5.4). Forty hit points at armour one: a swarmer wave of four takes
 * about three turns to wreck one the squad is not covering, so falling a
 * wave behind costs a generator rather than the mission.
 */
export const GENERATOR_TUNING: GeneratorTuning = {
  name: "Generator",
  maxHp: 40,
  armor: 1,
  sightRange: 4,
  modelId: "tdf.generator",
};
