import { describe, expect, it } from "vitest";

import {
  ACID_RESISTANT_PLATING,
  ARMOUR_PIERCING_ROUNDS,
  MATRIARCH_CHITIN,
  SEISMIC_SENSOR,
} from "../../roster/data/autopsy-parts";
import { STARTER_PARTS } from "../../roster/data/parts";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { describeTechEffect } from "./tech-effect-describer";

const SOURCES = { parts: new StaticPartCatalogue(STARTER_PARTS) };

/** The unlock line for a part effect. */
const unlockOf = (partId: string): string =>
  describeTechEffect({ kind: "part", partId }, SOURCES);

describe("describeTechEffect for an autopsy counter (campaign arc §10.2)", () => {
  it("says what each counter part resists, pierces or reveals", () => {
    expect(unlockOf(ACID_RESISTANT_PLATING)).toBe(
      "Acid-Resistant Plating (acid resist 3)",
    );
    expect(unlockOf(SEISMIC_SENSOR)).toBe(
      "Seismic Sensor (reveals burrowed bugs within 10)",
    );
    expect(unlockOf(ARMOUR_PIERCING_ROUNDS)).toBe(
      "Armour-Piercing Rounds (pierces 2 armour)",
    );
    expect(unlockOf(MATRIARCH_CHITIN)).toBe(
      "Matriarch Chitin (acid resist 2, spine resist 2)",
    );
  });

  it("names a part that counters nothing by its name alone", () => {
    expect(unlockOf("utility-radiator")).toBe("Radiator");
  });
});
