import type { CivilianTuning } from "../model/civilian";

// ===========================================
// Civilian tuning
// ===========================================

/**
 * The civilian group an evacuation frees (campaign arc §6.4).
 *
 * - **Twenty hit points at no armour.** A swarmer's bite takes three, so
 *   a group caught in the open lives through about seven bites, not four.
 * - **Six tiles an action and two actions.** A group outpaces the squad
 *   that freed it. It runs for the drop ship.
 *
 * Both numbers are C2b-1-field's calibration (#1179,
 * `docs/design/calibration/C2b-1-field.md`). At 10 hp and 4 tiles, most
 * lost evacuations were lost on the walk home. The bugs hunt the groups,
 * and a group 60–80 steps out, crossing creep at about four tiles a turn,
 * died before it reached the drop ship about half the time:
 *
 * ```
 *   steps home    <20    20–39   40–59   60–79   80+
 *   survived     100%     ~85%    ~65%    ~47%   ~15%     (10 hp, 4 tiles)
 * ```
 */
export const CIVILIAN_TUNING: CivilianTuning = {
  name: "Civilians",
  maxHp: 20,
  armor: 0,
  move: 6,
  maxAp: 2,
  sightRange: 4,
  modelId: "civ.group",
};
