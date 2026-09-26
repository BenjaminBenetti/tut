import type { MissionType } from "../../content/model/mission-type";
import type { MissionTypeId } from "../../content/model/mission-type-id";

// ===========================================
// Mission type catalogue
// ===========================================

/**
 * The mission type definitions, keyed by id; the app passes
 * `MISSION_TYPES`. A `Record` over the closed `MissionTypeId` union, so
 * every service and screen that holds one can look up any mission's
 * type without a missing-entry branch.
 */
export type MissionTypeCatalogue = Readonly<Record<MissionTypeId, MissionType>>;
