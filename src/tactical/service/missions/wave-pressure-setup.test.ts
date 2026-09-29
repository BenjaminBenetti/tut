import { describe, expect, it } from "vitest";

import { err, ok } from "../../../core/model/result";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import type { Mission } from "../../../overworld/model/mission";
import { BUG_SPECIES } from "../../../bugs/data/species";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type { EdgeWavePressure } from "../../model/wave-pressure-tuning";
import { missionWith, openField } from "../tactical-fixtures.test-helper";
import { pressesOffer, withWavePressure } from "./wave-pressure-setup";

// ===========================================
// Fixtures
// ===========================================

const PRESSURE: EdgeWavePressure = {
  surge: { sizeScale: 2.5, spillRadius: 3 },
  turnsSooner: 1,
};

/** The same press narrowed to Act III's offers. */
const ACT_3_PRESSURE: EdgeWavePressure = { ...PRESSURE, onlyInAct: "act-3" };

const OFFER: Mission = {
  id: "mission-1",
  typeId: "tunnel-sabotage",
  cityId: "city-1",
  difficulty: 4,
  mapParams: {
    biome: "temperate",
    settlement: "town",
    size: "small",
    seed: "wave-pressure",
  },
  rewards: { credits: 300, techPoints: 0 },
  createdDay: 1,
  expiresDay: 6,
  ignorePenalty: 10,
};

/** The deps every setup is handed. */
function deps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
  };
}

/** A rule that stands nothing and pins the next wave to turn 4, with a deploy override. */
const OWN: MissionSetupRule = {
  typeId: "tunnel-sabotage",
  setup: (state) =>
    ok({ ...state, edgeSpawn: { ...state.edgeSpawn, nextTurn: 4 } }),
  deployTiles: () => [{ x: 1, y: 0, z: 1 }],
  garrisoned: false,
};

// ===========================================
// Tests
// ===========================================

describe("withWavePressure (#1179)", () => {
  it("runs the type's own setup, then presses its edge waves", () => {
    const map = openField().build();
    const state = missionWith(map, []);
    const setUp = withWavePressure(OWN, PRESSURE).setup(
      state,
      map,
      OFFER,
      deps(),
    );
    if (!setUp.ok) throw new Error("setup refused");
    expect(setUp.value.edgeSpawn).toEqual({
      nextTurn: 3,
      wave: 0,
      surge: { sizeScale: 2.5, spillRadius: 3 },
    });
  });

  it("keeps the rule's type, deploy tiles and garrison", () => {
    const pressed = withWavePressure(OWN, PRESSURE);
    expect(pressed.typeId).toBe("tunnel-sabotage");
    expect(pressed.deployTiles?.(openField().build(), 0)).toEqual([
      { x: 1, y: 0, z: 1 },
    ]);
    expect(pressed.garrisoned).toBe(false);
  });

  it("passes a refusal through untouched", () => {
    const refusing: MissionSetupRule = {
      typeId: "tunnel-sabotage",
      setup: () => err({ kind: "unknown-unit-type", unitKind: "bug", id: "x" }),
    };
    const map = openField().build();
    expect(
      withWavePressure(refusing, PRESSURE).setup(
        missionWith(map, []),
        map,
        OFFER,
        deps(),
      ),
    ).toEqual(err({ kind: "unknown-unit-type", unitKind: "bug", id: "x" }));
  });
});

describe("withWavePressure narrowed to an act (#1179)", () => {
  /** The narrowed press's setup of `offer` on an open field. */
  function setUpWith(offer: Mission) {
    const map = openField().build();
    const setUp = withWavePressure(OWN, ACT_3_PRESSURE).setup(
      missionWith(map, []),
      map,
      offer,
      deps(),
    );
    if (!setUp.ok) throw new Error("setup refused");
    return setUp.value;
  }

  it("presses an offer made in its act", () => {
    expect(setUpWith({ ...OFFER, act: "act-3" }).edgeSpawn).toEqual({
      nextTurn: 3,
      wave: 0,
      surge: { sizeScale: 2.5, spillRadius: 3 },
    });
  });

  it("leaves an offer made in another act as the type's own setup left it", () => {
    const map = openField().build();
    const offer: Mission = { ...OFFER, act: "act-2" };
    const own = OWN.setup(missionWith(map, []), map, offer, deps());
    if (!own.ok) throw new Error("setup refused");
    expect(setUpWith(offer)).toEqual(own.value);
    expect(setUpWith(offer).edgeSpawn).toEqual({ nextTurn: 4, wave: 0 });
  });

  it("leaves an offer saved before acts unpressed", () => {
    expect(OFFER.act).toBeUndefined();
    expect(setUpWith(OFFER).edgeSpawn).toEqual({ nextTurn: 4, wave: 0 });
  });
});

describe("pressesOffer (#1179)", () => {
  it.each([
    ["an Act II offer", "act-2"],
    ["an Act III offer", "act-3"],
    ["an offer saved before acts", undefined],
  ] as const)("a press on the whole type lands on %s", (_, act) => {
    expect(pressesOffer(PRESSURE, { act })).toBe(true);
  });

  it.each([
    ["lands on an Act III offer", "act-3", true],
    ["passes over an Act II offer", "act-2", false],
    ["passes over a finale offer", "finale", false],
    ["passes over an offer saved before acts", undefined, false],
  ] as const)("a press narrowed to Act III %s", (_, act, pressed) => {
    expect(pressesOffer(ACT_3_PRESSURE, { act })).toBe(pressed);
  });
});
