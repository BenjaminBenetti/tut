import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { ACT_LABELS } from "./act-labels";

describe("ACT_LABELS", () => {
  it("names every act as the arc does", () => {
    expect(ACT_IDS.map((act) => ACT_LABELS[act])).toEqual([
      "Act I · Emergence",
      "Act II · Incubation",
      "Act III · Reclamation",
      "Finale · The Platform",
    ]);
  });
});
