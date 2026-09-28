import type { GeneratorTuning } from "../model/generator";

// ===========================================
// Generator tuning
// ===========================================

/**
 * The generator a defend-installation mission stands up (#1175, GDD
 * §5.4), at armour one. Forty hit points were a swarmer wave of four
 * taking about three turns to wreck one the squad is not covering, so
 * falling a wave behind cost a generator rather than the mission.
 *
 * Sixty since the defence's waves surge (#1179, `WAVE_PRESSURE_TUNING`):
 * a surged wave standing round a generator wrecked forty in one bug
 * phase, and the expert lost act-3 defences and Uplink with its force
 * nearly whole (14 of 16 each). The new player loses a defence on the
 * way home, not at the generators, so sixty lifts the expert to 15–16
 * and leaves the new player where the surge put it.
 */
export const GENERATOR_TUNING: GeneratorTuning = {
  name: "Generator",
  maxHp: 60,
  armor: 1,
  sightRange: 4,
  modelId: "tdf.generator",
};
