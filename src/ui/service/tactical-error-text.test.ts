import { describe, expect, it } from "vitest";

import type { TacticalError } from "../../tactical/model/tactical-error";
import { describeTacticalError } from "../../tactical/model/tactical-error";
import type { TacticalNames } from "./tactical-error-text";
import { describeRefusal } from "./tactical-error-text";

/**
 * A sentinel in every entity id a refusal can carry. If it reaches the
 * player's text, an id did.
 */
const ID = "ZZSENTINELZZ";

/** Names that are obviously names, so a leak cannot hide as one. */
const NAMES: TacticalNames = {
  unit: () => "Rifle Squad",
  objective: () => "spawner 2",
  spawner: () => "spawner 2",
  mech: () => "Hammerhead",
  mission: () => "Lagos",
};

/**
 * Every kind in the union, each with the sentinel in every id field.
 *
 * Exhaustive on purpose: the point is not to check the kinds I
 * remembered to rewrite, it is to catch the one somebody adds later
 * that names something and is never given a player wording.
 */
const EVERY_KIND: readonly TacticalError[] = [
  { kind: "no-active-mission" },
  { kind: "mission-active", missionId: ID },
  { kind: "mission-not-found", missionId: ID },
  { kind: "empty-deployment" },
  { kind: "oversized-deployment", size: 9, max: 6 },
  { kind: "unit-not-found", unitId: ID },
  { kind: "illegal-move", unitId: ID, reason: "over-budget" },
  { kind: "mission-over", outcome: "won" },
  { kind: "invalid-loadout", mechId: ID },
  { kind: "map-recipe", reason: "no deploy zone" },
  { kind: "no-deploy-room", unitId: ID, passClass: "mech" },
  { kind: "unit-not-on-map", unitId: ID },
  { kind: "unit-dead", unitId: ID },
  { kind: "wrong-phase", unitId: ID },
  { kind: "no-action-points", unitId: ID },
  { kind: "self-target", unitId: ID },
  { kind: "friendly-target", targetId: ID },
  { kind: "out-of-range", distance: 14, range: 10 },
  { kind: "no-line-of-sight", targetId: ID },
  { kind: "target-destroyed", targetId: ID },
  { kind: "no-charges", unitId: ID },
  { kind: "no-such-weapon", unitId: ID },
  { kind: "charges-full", unitId: ID },
  { kind: "no-reload", unitId: ID },
  { kind: "objective-not-found", objectiveId: ID },
  { kind: "objective-complete", objectiveId: ID },
  { kind: "objective-not-yours", unitId: ID },
  { kind: "objective-target-missing", objectiveId: ID, targetId: ID },
  { kind: "objective-out-of-reach", objectiveId: ID, distance: 9, range: 4 },
  { kind: "not-in-extraction-zone", unitId: ID },
  { kind: "not-extractable", unitId: ID },
  { kind: "mission-not-over", missionId: ID },
  { kind: "mission-mismatch", expected: ID, active: ID },
  { kind: "unhandled-command", commandType: "tactical:move" },
];

describe("describeRefusal", () => {
  // The guard. Not "the cases I rewrote are right" — that would pass
  // while the next id-bearing kind added to the union goes unhandled
  // and falls through to the developer wording.
  it("never puts an entity id in front of the player, for any kind", () => {
    for (const error of EVERY_KIND) {
      const text = describeRefusal(error, NAMES);
      expect(text, `${error.kind} leaked an id: ${text}`).not.toContain(ID);
    }
  });

  it("covers every kind the union has", () => {
    expect(new Set(EVERY_KIND.map((e) => e.kind)).size).toBe(EVERY_KIND.length);
    // A kind added to the union without a fixture here would leave the
    // guard above blind to it, so the count is pinned deliberately.
    expect(EVERY_KIND).toHaveLength(34);
  });

  it("reads as sentences, with the names in place of the ids", () => {
    const said = (error: TacticalError): string =>
      describeRefusal(error, NAMES);
    expect(said({ kind: "no-line-of-sight", targetId: "bug-3" })).toBe(
      "No line of sight to Rifle Squad",
    );
    expect(said({ kind: "no-action-points", unitId: "unit-1" })).toBe(
      "Rifle Squad has no action points left",
    );
    expect(said({ kind: "no-charges", unitId: "unit-1" })).toBe(
      "Rifle Squad is out of charges; reload or vent first",
    );
    expect(said({ kind: "target-destroyed", targetId: "spawner-2" })).toBe(
      "Spawner 2 is already destroyed",
    );
    expect(said({ kind: "invalid-loadout", mechId: "mech-1" })).toBe(
      "Hammerhead has a loadout that no longer validates",
    );
    expect(said({ kind: "mission-not-over", missionId: "mission-1" })).toBe(
      "Lagos is still being fought",
    );
  });

  // The typed error is unchanged: the ids are still there for logs,
  // tests and diagnostics, which is the third acceptance point.
  it("leaves the developer wording alone", () => {
    expect(
      describeTacticalError({ kind: "no-line-of-sight", targetId: "bug-3" }),
    ).toBe('No line of sight to "bug-3"');
  });

  it("keeps the move's own reason after the unit's name", () => {
    expect(
      describeRefusal(
        { kind: "illegal-move", unitId: "unit-1", reason: "over-budget" },
        NAMES,
      ),
    ).toBe(
      `Rifle Squad cannot make that move: ${
        describeTacticalError({
          kind: "illegal-move",
          unitId: "unit-1",
          reason: "over-budget",
        }).split(": ")[1] ?? ""
      }`,
    );
  });
});
