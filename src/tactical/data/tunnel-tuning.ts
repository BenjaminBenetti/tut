import type { TunnelTuning } from "../model/tunnel-tuning";
import { BREACHING_CHARGE } from "./equipment";

// ===========================================
// Defaults
// ===========================================

/**
 * The shipped Tunnel Sabotage tuning (campaign arc §6.7). Placeholders
 * for calibration, each with its reason:
 *
 * - **Fuse 3 turns**, the arc's number: the charge set on turn T goes
 *   off as turn T+3 opens, so the force holds the mouth, or at least
 *   the ground near it, through three bug phases. Measured against a
 *   pullable charge (C2b-2-defence.md, 32 seeds a cell): at 3 the new
 *   player wins 27/32 in act 2 and 31/32 in act 3, the expert 31 and
 *   32; at 4 the new player's act 2 fell to 16/32 while act 3 held
 *   28/32, and at 2 act 3 was 16/16 at 16 seeds.
 * - **One melee attack pulls a charge**, Ben's rule (2026-09-28): the
 *   player has to hold the mouth until it blows, not set it and walk
 *   away. It is the rule, not a knob to calibrate with.
 * - **The breaching charge's blast** (#1132): 20 damage, radius 3,
 *   demolition force 3. The arc says the mission reuses it, and a mouth
 *   collapsing hurts whoever stands beside it as a breach would.
 * - **One burrower a mouth every 3 turns, the mouths a turn apart,
 *   from turn 2.** A counted schedule rather than a chance: a chance
 *   lets one seed surface nothing for five turns and another three in a
 *   row out of one mouth, and neither reads as the mission's pressure.
 *   With three mouths a turn apart and each every third turn, exactly
 *   one burrower comes up a bug phase while all three are open, and
 *   every mouth sealed takes a third of that away — the pressure the
 *   player can see shrink. Turn 1's bug phase is quiet so the force can
 *   leave the drop ship before the ground opens.
 *
 * ```
 *   turn        2  3  4  5  6  7  8
 *   mouth 0     ●        ●        ●
 *   mouth 1        ●        ●
 *   mouth 2           ●        ●
 * ```
 */
export const TUNNEL_TUNING: TunnelTuning = {
  fuseTurns: 3,
  chargeEquipmentId: BREACHING_CHARGE.id,
  meleeHitsToDisarm: 1,
  firstSurfaceTurn: 2,
  surfaceEvery: 3,
};
