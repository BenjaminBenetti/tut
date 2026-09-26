import { describe, expect, it } from "vitest";

import { SITREP_IDS } from "../../../content/model/sitrep-id";
import { SITREP_RULES } from "./sitrep-rules";

describe("SITREP_RULES", () => {
  it("keys every rule by its own id, and has one for every sitrep", () => {
    expect(Object.keys(SITREP_RULES).sort()).toEqual([...SITREP_IDS].sort());
    for (const id of SITREP_IDS) {
      expect(SITREP_RULES[id].id).toBe(id);
    }
  });

  it("gives each sitrep the hooks it needs and no others", () => {
    const hooks = Object.fromEntries(
      SITREP_IDS.map((id) => {
        const rule = SITREP_RULES[id];
        return [
          id,
          [
            rule.setup === undefined ? "" : "setup",
            rule.sight === undefined ? "" : "sight",
            rule.phaseStep === undefined ? "" : "phase",
          ]
            .filter(Boolean)
            .join("+"),
        ];
      }),
    );
    expect(hooks).toEqual({
      nightfall: "sight",
      "spore-fog": "setup",
      "city-ablaze": "setup+phase",
      "salvage-rich": "setup",
      "local-guides": "setup",
    });
  });
});
