import { describe, expect, it } from "vitest";

import type { TacticalError } from "../../tactical/model/tactical-error";
import {
  describeTacticalError,
  TACTICAL_ERROR_KINDS,
} from "../../tactical/model/tactical-error";
import type { TacticalNames } from "./tactical-error-text";
import { describeRefusal, namesFor } from "./tactical-error-text";

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
  target: () => "Rifle Squad",
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
  { kind: "no-objective-in-reach", unitId: ID },
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
    // guard above blind to it. Counted against the union rather than
    // against a literal: `TACTICAL_ERROR_KINDS` is a total `Record`, so
    // the compiler keeps it in step with the type, and this test now
    // rides on that instead of on a number somebody has to remember.
    //
    // The literal was 34 and went stale within the day -- #1044 added
    // `no-objective-in-reach` while this branch was in review, and the
    // number is exactly the sort of thing that gets bumped to green
    // rather than read.
    expect(EVERY_KIND.map((e) => e.kind).sort()).toEqual(
      Object.keys(TACTICAL_ERROR_KINDS).sort(),
    );
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

// ===========================================
// Roster identity (#1040)
// ===========================================

describe("namesFor", () => {
  /** Two squads of the same template, as a deployment routinely produces. */
  const twoRifleSquads = {
    mission: {
      units: [
        { id: "unit-1", sourceId: "squad-1", templateId: "squad:squad-1" },
        { id: "unit-2", sourceId: "squad-2", templateId: "squad:squad-2" },
        { id: "unit-9", sourceId: "bug:swarmer", templateId: "bug:swarmer" },
      ],
      // Distinct templates, one display name: `unit-factory` names a
      // squad's template after the squad *type*, so two rosters collide
      // on the name rather than on the id.
      templates: {
        "squad:squad-1": { name: "Rifle Squad" },
        "squad:squad-2": { name: "Rifle Squad" },
        "bug:swarmer": { name: "Swarmer" },
      },
      objectives: [],
    } as unknown as Parameters<typeof namesFor>[0],
    campaign: {
      roster: {
        squads: [
          { id: "squad-1", name: "Alpha" },
          { id: "squad-2", name: "Bravo" },
        ],
        mechs: [{ id: "mech-1", name: "Hammerhead" }],
      },
      overworld: { missions: [], map: { cities: [], regions: [] } },
    } as unknown as Parameters<typeof namesFor>[1],
  };

  // QA's finding: two roster squads showed as one identity in-mission
  // while the debrief called them Alpha and Bravo.
  it("tells two squads of the same template apart, as the debrief does", () => {
    const names = namesFor(twoRifleSquads.mission, twoRifleSquads.campaign);
    expect(names.unit("unit-1")).toBe("Alpha");
    expect(names.unit("unit-2")).toBe("Bravo");
    expect(names.unit("unit-1")).not.toBe(names.unit("unit-2"));
  });

  // A bug has no roster entry, so its species is its identity and must
  // still resolve rather than falling to the anonymous form.
  it("falls back to the template for a unit with no roster entry", () => {
    const names = namesFor(twoRifleSquads.mission, twoRifleSquads.campaign);
    expect(names.unit("unit-9")).toBe("Swarmer");
  });

  // Without a campaign — a tactical screen that has no roster to hand —
  // the template name is still better than an id.
  it("uses the template when there is no campaign", () => {
    const names = namesFor(twoRifleSquads.mission);
    expect(names.unit("unit-1")).toBe("Rifle Squad");
  });

  it("never returns an id for a unit it cannot find", () => {
    const names = namesFor(twoRifleSquads.mission, twoRifleSquads.campaign);
    expect(names.unit("unit-404")).toBe("that unit");
    expect(names.unit("unit-404")).not.toContain("unit-404");
  });
  it("names an egg spawner a refusal is aimed at, not as a unit", () => {
    // `no-line-of-sight` carries a bare `targetId`, and a spawner is
    // aimed at exactly as a unit is. Resolving it as a unit is how the
    // hit preview came to read "No line of sight to that unit" under a
    // header saying EGG SPAWNER (#1072).
    const names = namesFor(
      {
        ...twoRifleSquads.mission,
        spawners: [{ id: "spawner-7" }],
        objectives: [{ id: "objective-1", targetId: "spawner-7" }],
      } as unknown as Parameters<typeof namesFor>[0],
      twoRifleSquads.campaign,
    );
    expect(
      describeRefusal(
        { kind: "no-line-of-sight", targetId: "spawner-7" },
        names,
      ),
    ).toBe("No line of sight to spawner 1");
    // And a unit target is still a unit.
    expect(
      describeRefusal({ kind: "no-line-of-sight", targetId: "unit-9" }, names),
    ).toBe("No line of sight to Swarmer");
  });
});
