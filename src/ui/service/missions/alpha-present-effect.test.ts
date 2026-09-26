import { describe, expect, it } from "vitest";

import { SITREP_TUNING } from "../../../tactical/data/sitrep-tuning";
import { alphaPresentEffect } from "./alpha-present-effect";

describe("alphaPresentEffect (campaign arc §8, §11, #1179)", () => {
  it("says who leads and what the crown gives, in the shipped numbers", () => {
    const tuning = SITREP_TUNING.alphaPresent;
    expect(alphaPresentEffect(undefined, tuning)).toBe(
      "One bug leads: +50% hp, +1 damage; hunts the weakest.",
    );
    expect(alphaPresentEffect({ name: "Grinder", level: 0 }, tuning)).toBe(
      "Grinder leads: +50% hp, +1 damage; hunts the weakest.",
    );
    expect(alphaPresentEffect({ name: "Grinder", level: 2 }, tuning)).toBe(
      "Grinder, level 2, leads: +100% hp, +1 damage; hunts the weakest.",
    );
  });

  it("quotes the tuning it is handed", () => {
    expect(
      alphaPresentEffect(
        { name: "Hook", level: 1 },
        { hpBonus: 0.4, hpPerLevel: 0.2, damageBonus: 2 },
      ),
    ).toBe("Hook, level 1, leads: +60% hp, +2 damage; hunts the weakest.");
  });
});
