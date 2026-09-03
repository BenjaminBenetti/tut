import type { IdGenerator } from "../../core/model/id-generator";
import type { Mech } from "../model/mech";
import { MECH_ID_PREFIX } from "../model/mech";
import type { MechLoadout } from "../model/mech-loadout";
import type { RosterState } from "../model/roster-state";
import type { Squad } from "../model/squad";
import { SQUAD_ID_PREFIX } from "../model/squad";
import type { SquadType } from "../model/squad-type";
import type { SquadTypeCatalogue } from "../model/squad-type-catalogue";
import type {
  StarterRosterSpec,
  StarterSquadSpec,
} from "../model/starter-roster-spec";
import { createMech } from "./mech-factory";
import { createSquad } from "./squad-factory";

// ===========================================
// Dependencies
// ===========================================

/** What the roster factory needs injected. */
export interface RosterStateFactoryDeps {
  /** Issues squad and mech ids; the caller persists its state afterwards. */
  readonly ids: IdGenerator;
  /** Resolves the spec's squad type ids. */
  readonly squadTypes: SquadTypeCatalogue;
}

// ===========================================
// Factory
// ===========================================

/**
 * Builds the roster a new campaign starts with: every squad and mech in
 * the spec at full strength with fresh ids, drawn in spec order (squads
 * first, then mechs). The starting loadouts are also saved as templates
 * so the player can rebuild a lost mech. Nothing is charged; the starter
 * roster is granted, not bought.
 *
 * @throws {Error} if a squad type id in the spec is not in the catalogue,
 *   which is a content bug rather than a game state.
 */
export function createInitialRosterState(
  spec: StarterRosterSpec,
  deps: RosterStateFactoryDeps,
): RosterState {
  const squads: Squad[] = spec.squads.map((squad) =>
    createSquad(
      resolveSquadType(squad, deps.squadTypes),
      deps.ids.nextId(SQUAD_ID_PREFIX),
      squad.name,
    ),
  );
  const mechs: Mech[] = spec.mechs.map((mech) =>
    createMech(mech.loadout, deps.ids.nextId(MECH_ID_PREFIX), mech.name),
  );
  return {
    squads,
    mechs,
    savedLoadouts: uniqueByName(spec.mechs.map((mech) => mech.loadout)),
    graveyard: [],
  };
}

// ===========================================
// Helpers
// ===========================================

/** Looks a starter squad's type up, treating an unknown id as a content bug. */
function resolveSquadType(
  squad: StarterSquadSpec,
  catalogue: SquadTypeCatalogue,
): SquadType {
  const type = catalogue.getSquadType(squad.typeId);
  if (type === undefined) {
    throw new Error(`Unknown starter squad type "${squad.typeId}"`);
  }
  return type;
}

/** Keeps the first loadout for each name, preserving order. */
function uniqueByName(loadouts: readonly MechLoadout[]): MechLoadout[] {
  const seen = new Set<string>();
  return loadouts.filter((loadout) => {
    if (seen.has(loadout.name)) {
      return false;
    }
    seen.add(loadout.name);
    return true;
  });
}
