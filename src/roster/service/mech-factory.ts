import type { Mech, MechId } from "../model/mech";
import type { MechLoadout } from "../model/mech-loadout";

// ===========================================
// Public Functions
// ===========================================

/**
 * Builds a freshly assembled, undamaged mech from a loadout with no
 * history. The caller supplies the id (from core's `IdGenerator`) and the
 * player-facing name. The loadout is copied so the mech owns its parts
 * independently of the saved template. No validation or charging happens
 * here; those belong to the validation and roster services.
 */
export function createMech(
  loadout: MechLoadout,
  id: MechId,
  name: string,
): Mech {
  return {
    id,
    name,
    loadout: copyLoadout(loadout),
    damage: 0,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

// ===========================================
// Private Functions
// ===========================================

/** Copies a loadout so later edits to the source cannot reach the mech. */
function copyLoadout(loadout: MechLoadout): MechLoadout {
  const copy: MechLoadout = {
    name: loadout.name,
    chassisId: loadout.chassisId,
    legsId: loadout.legsId,
    armsId: loadout.armsId,
    armWeaponId: loadout.armWeaponId,
    backWeaponId: loadout.backWeaponId,
    utilityIds: [...loadout.utilityIds],
  };
  return loadout.upgrades === undefined
    ? copy
    : { ...copy, upgrades: { ...loadout.upgrades } };
}
