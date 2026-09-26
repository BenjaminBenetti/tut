import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { NEMESIS_LORE } from "../../data/nemesis-lore";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { Nemesis } from "../../model/nemesis";
import type { OverworldState } from "../../model/overworld-state";
import { addCityInfestation } from "../city-infestation-service";
import { hasFlag } from "../campaign-progress-service";
import { pausedRegions } from "../growth-pause-service";
import { nemesisScar } from "../nemesis-service";
import {
  broodmotherKilled,
  createAlphaHuntConsequence,
} from "./alpha-hunt-consequence";
import { BROODMOTHER_SIGHTED_FLAG } from "./alpha-hunt-quarry";
import {
  fixtureState,
  missionAt,
  progressIn,
  resultFor,
} from "./mission-fixtures.test-helper";
import { MISSION_CONSEQUENCE_RULES } from "./mission-consequence-rules";

// ===========================================
// Fixtures
// ===========================================

const RULE = createAlphaHuntConsequence(NEMESIS_LORE);
const CTX = { tuning: MISSION_TUNING, hive: HIVE_TUNING };

/** Old Scald, a level-1 nemesis last seen in the west. */
const OLD_SCALD: Nemesis = {
  id: "nemesis:mission-3:broodmother",
  speciesId: "broodmother",
  name: "Old Scald",
  scar: "burned along the flank",
  regionId: "west",
  level: 1,
  escapes: 1,
};

/** A hunt at mid (east) for a fresh Broodmother, or for `OLD_SCALD`. */
function hunt(forNemesis = false): Mission {
  return {
    ...missionAt("mid", 9, 15, "alpha-hunt"),
    id: "mission-7",
    alphaHunt: forNemesis
      ? {
          nemesisId: OLD_SCALD.id,
          name: OLD_SCALD.name,
          scar: OLD_SCALD.scar,
          scars: 1,
          level: 1,
        }
      : { name: "Mother Grist", scars: 0 },
  };
}

/** Day 20 in Act II, with `nemeses` on the record. */
function campaign(nemeses: readonly Nemesis[] = []): OverworldState {
  return fixtureState({
    day: 20,
    hives: [{ id: "hive-1", regionId: "east", formedDay: 1 }],
    progress: { ...progressIn("act-2", 14), nemeses },
  });
}

/** `mission` played to `outcome`, with the hunt's own fields. */
function played(
  mission: Mission,
  outcome: MissionResult["outcome"],
  fields: Partial<MissionResult>,
): MissionResult {
  return { ...resultFor(mission, outcome, 0), ...fields };
}

// ===========================================
// Table
// ===========================================

describe("alpha-hunt consequence rule", () => {
  it("is the shipped rule for alpha-hunt", () => {
    expect(MISSION_CONSEQUENCE_RULES["alpha-hunt"].typeId).toBe("alpha-hunt");
  });

  it("reads her death from the field, then the objective, then the outcome", () => {
    const mission = hunt();
    expect(
      broodmotherKilled(played(mission, "lost", { broodmotherKilled: true })),
    ).toBe(true);
    expect(
      broodmotherKilled(
        played(mission, "won", {
          objectives: [
            { kind: "kill-broodmother", complete: false, failed: true },
          ],
        }),
      ),
    ).toBe(false);
    expect(broodmotherKilled(played(mission, "won", {}))).toBe(true);
    expect(broodmotherKilled(played(mission, "extracted", {}))).toBe(false);
  });
});

// ===========================================
// Killed
// ===========================================

describe("alpha-hunt consequences: killed", () => {
  it("strikes a nemesis from the record and holds her region's growth for five days", () => {
    const state = campaign([OLD_SCALD]);
    const { state: next } = RULE.onResolved(
      state,
      hunt(true),
      played(hunt(true), "won", { broodmotherKilled: true }),
      CTX,
    );
    expect(next.progress.nemeses).toEqual([]);
    // Killed on day 20: ticks 21 … 25 are held, 26 grows again.
    expect(next.growthPausedUntil).toEqual({ east: 26 });
    expect(pausedRegions(next, 25).has("east")).toBe(true);
    expect(pausedRegions(next, 26).has("east")).toBe(false);
    expect(hasFlag(next.progress, BROODMOTHER_SIGHTED_FLAG)).toBe(true);
  });

  it("keeps a longer pause already running, and records no nemesis for a fresh kill", () => {
    const state = { ...campaign(), growthPausedUntil: { east: 40 } };
    const { state: next } = RULE.onResolved(
      state,
      hunt(),
      played(hunt(), "won", { broodmotherKilled: true }),
      CTX,
    );
    expect(next.growthPausedUntil).toEqual({ east: 40 });
    expect(next.progress.nemeses).toEqual([]);
  });

  it("counts a kill even when the squad is lost afterwards", () => {
    const { state: next } = RULE.onResolved(
      campaign([OLD_SCALD]),
      hunt(true),
      played(hunt(true), "lost", { broodmotherKilled: true }),
      CTX,
    );
    expect(next.progress.nemeses).toEqual([]);
    expect(next.growthPausedUntil).toEqual({ east: 26 });
  });
});

// ===========================================
// Escaped
// ===========================================

describe("alpha-hunt consequences: escaped", () => {
  it("records a fresh Broodmother who got away at level 1, scarred by her last wound, in the hunt's region", () => {
    const { state: next } = RULE.onResolved(
      campaign(),
      hunt(),
      played(hunt(), "extracted", {
        broodmotherKilled: false,
        broodmotherEscaped: true,
        broodmotherWound: "fire",
      }),
      CTX,
    );
    expect(next.progress.nemeses).toEqual([
      {
        id: "nemesis:mission-7:broodmother",
        speciesId: "broodmother",
        name: "Mother Grist",
        scar: nemesisScar(NEMESIS_LORE, "Mother Grist", "fire", 1),
        regionId: "east",
        level: 1,
        escapes: 1,
      },
    ]);
    expect(NEMESIS_LORE.scars.fire).toContain(next.progress.nemeses[0]?.scar);
    expect(next.growthPausedUntil).toBeUndefined();
  });

  it("raises a nemesis who got away again: level, escapes, a new scar, and her new region", () => {
    const { state: next } = RULE.onResolved(
      campaign([OLD_SCALD]),
      hunt(true),
      played(hunt(true), "lost", { broodmotherKilled: false }),
      CTX,
    );
    const [raised] = next.progress.nemeses;
    expect(raised).toMatchObject({
      id: OLD_SCALD.id,
      name: "Old Scald",
      level: 2,
      escapes: 2,
      regionId: "east",
    });
    expect(NEMESIS_LORE.scars.unmarked).toContain(raised?.scar);
    expect(next.progress.nemeses).toHaveLength(1);
  });

  it("applies the resolver's delta to the city either way", () => {
    const state = campaign();
    const { state: next } = RULE.onResolved(
      state,
      hunt(),
      {
        ...played(hunt(), "won", { broodmotherKilled: true }),
        infestationDelta: -12,
      },
      CTX,
    );
    expect(next.map.cities.find((city) => city.id === "mid")?.infestation).toBe(
      38,
    );
  });
});

// ===========================================
// Ignored
// ===========================================

describe("alpha-hunt consequences: ignored", () => {
  it("costs only the ordinary ignore penalty: no scar, no level, no pause", () => {
    const state = campaign([OLD_SCALD]);
    const lapsed = RULE.onExpired(state, hunt(true), CTX);
    expect(lapsed).toEqual(addCityInfestation(state, "mid", 15));
    expect(lapsed.state.progress).toBe(state.progress);
  });
});
