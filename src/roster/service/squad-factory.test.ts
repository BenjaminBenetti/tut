import { describe, expect, it } from "vitest";

import { RIFLE_SQUAD, ROCKET_SQUAD } from "../data/squad-types";
import type { Squad } from "../model/squad";
import { SQUAD_MAX_STRENGTH } from "../model/squad";
import { createSquad } from "./squad-factory";

describe("createSquad", () => {
  it("returns a full-strength squad with no history", () => {
    const squad = createSquad(RIFLE_SQUAD, "squad-1", "Alpha");
    expect(squad).toEqual<Squad>({
      id: "squad-1",
      name: "Alpha",
      typeId: "rifle",
      strength: SQUAD_MAX_STRENGTH,
      maxStrength: SQUAD_MAX_STRENGTH,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    });
  });

  it("keeps strength an integer within 0..maxStrength", () => {
    const squad = createSquad(ROCKET_SQUAD, "squad-2", "Bravo");
    expect(Number.isInteger(squad.strength)).toBe(true);
    expect(squad.strength).toBeGreaterThanOrEqual(0);
    expect(squad.strength).toBeLessThanOrEqual(squad.maxStrength);
    expect(squad.maxStrength).toBe(5);
  });

  it("references the type by id rather than embedding it", () => {
    const squad = createSquad(ROCKET_SQUAD, "squad-3", "Charlie");
    expect(squad.typeId).toBe(ROCKET_SQUAD.id);
    expect(squad).not.toHaveProperty("hireCost");
  });

  it("produces independent objects on each call", () => {
    const a = createSquad(RIFLE_SQUAD, "squad-4", "Delta");
    const b = createSquad(RIFLE_SQUAD, "squad-4", "Delta");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("round-trips through JSON unchanged", () => {
    const squad = createSquad(RIFLE_SQUAD, "squad-5", "Echo");
    const restored = JSON.parse(JSON.stringify(squad)) as Squad;
    expect(restored).toEqual(squad);
  });
});
