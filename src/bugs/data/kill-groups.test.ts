import { describe, expect, it } from "vitest";

import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import { KILL_GROUP_IDS } from "../../content/model/kill-group-id";
import { KILL_GROUPS } from "./kill-groups";

describe("KILL_GROUPS (campaign arc §10.2)", () => {
  it("defines every kill group under its own id", () => {
    expect(Object.keys(KILL_GROUPS).sort()).toEqual([...KILL_GROUP_IDS].sort());
    for (const [id, group] of Object.entries(KILL_GROUPS)) {
      expect(group.id).toBe(id);
    }
  });

  it("names no group like a species, so their flags never collide", () => {
    for (const id of KILL_GROUP_IDS) {
      expect(BUG_SPECIES_IDS).not.toContain(id);
    }
  });

  it("counts every armoured variant, and nothing else, as the armoured carapace", () => {
    expect([...KILL_GROUPS["armoured-carapace"].members].sort()).toEqual([
      "brute-armoured",
      "lurker-armoured",
      "swarmer-armoured",
    ]);
  });
});
