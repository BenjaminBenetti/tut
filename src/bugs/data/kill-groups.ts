import type { KillGroupId } from "../../content/model/kill-group-id";
import type { ArmouredVariantId } from "../model/armoured-variant";
import type { KillGroup } from "../model/kill-group";
import { ARMOURED_VARIANT_BASES } from "./species";

// ===========================================
// Kill groups
// ===========================================

/**
 * The kill groups the game ships (campaign arc §10.2). The armoured
 * carapace is every armoured variant, read off `ARMOURED_VARIANT_BASES`
 * so a fourth variant joins the group, and the autopsy, with its entry
 * there.
 *
 * ```
 *   armoured-carapace ──► swarmer-armoured · lurker-armoured · brute-armoured
 * ```
 */
export const KILL_GROUPS: Readonly<Record<KillGroupId, KillGroup>> = {
  "armoured-carapace": {
    id: "armoured-carapace",
    members: Object.keys(ARMOURED_VARIANT_BASES) as ArmouredVariantId[],
  },
};
