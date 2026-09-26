import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { STORY_SPINE } from "../../data/story-spine";
import type { Mission } from "../../model/mission";
import { isMissionExpired } from "../../model/mission";
import { MISSION_EXPIRED } from "../../model/mission-expired-event";
import { MISSION_OFFERED } from "../../model/mission-offered-event";
import type { MissionOutcome } from "../../model/mission-result";
import { MISSION_WITHDRAWN } from "../../model/mission-withdrawn-event";
import type { OverworldState } from "../../model/overworld-state";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import {
  countsAgainstCap,
  generateMissions,
} from "../mission-generation-service";
import { MISSION_CONSEQUENCE_RULES } from "../missions/mission-consequence-rules";
import {
  boardMap,
  fixtureState,
  missionAt,
  progressIn,
  resultFor,
} from "../missions/mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import { onStoryMissionResolved } from "../story-service";
import { pinContext } from "./story-fixtures.test-helper";
import { STORY_MISSION_RULES } from "./story-mission-rules";
import { createStoryPinTrigger } from "./story-pin-trigger";
import { UPLINK, UPLINK_DIFFICULTY, UPLINK_WAVES } from "./uplink";

// ===========================================
// Fixtures
// ===========================================

/** The fixture overworld on `day`, in `act`. */
function campaign(
  act: OverworldState["progress"]["act"] = "act-3",
  day = 5,
): OverworldState {
  return fixtureState({ day, progress: progressIn(act, 0) });
}

/** The shipped director's day for `state`, with the shipped story table. */
function direct(state: OverworldState, seed = 1): OverworldState {
  return directed(state, seed).state;
}

/** The shipped director's day for `state` and its events. */
function directed(state: OverworldState, seed = 1) {
  return generateMissions(state, {
    intelBonus: {},
    rng: new Mulberry32Rng(seed),
    ids: new SequentialIdGenerator(),
    tuning: MISSION_TUNING,
    missionTypes: MISSION_TYPES,
    offerRules: MISSION_OFFER_RULES,
    consequences: MISSION_CONSEQUENCE_RULES,
    acts: ACTS,
    decorators: [],
    pinTriggers: [createStoryPinTrigger(STORY_MISSION_RULES)],
    hiveTuning: HIVE_TUNING,
  });
}

/** Uplink's offer on the board of `state`, if pinned. */
function uplink(state: OverworldState): Mission | undefined {
  return state.missions.find((mission) => mission.storyId === "uplink");
}

/** Plays Uplink's `offer`, pinned on `state`, to `outcome` with the shipped story. */
function play(
  state: OverworldState,
  offer: Mission,
  outcome: MissionOutcome,
): OverworldState {
  const played: OverworldState = {
    ...state,
    missions: state.missions.filter((mission) => mission !== offer),
  };
  return onStoryMissionResolved(played, offer, resultFor(offer, outcome, 0), {
    rules: STORY_MISSION_RULES,
    spine: STORY_SPINE,
    ids: new SequentialIdGenerator(),
  }).state;
}

// ===========================================
// The rule
// ===========================================

describe("UPLINK", () => {
  it("is Act III's opener: no flags, sets uplink-won on a win, retried five days after a loss (arc §4, §6.9)", () => {
    expect(STORY_MISSION_RULES.uplink).toBe(UPLINK);
    expect(UPLINK).toMatchObject({
      id: "uplink",
      act: "act-3",
      pinWhen: [],
      onWon: [{ kind: "flag", flag: "uplink-won" }],
      onLost: { kind: "retry", delayDays: STORY_RETRY_DAYS },
    });
    const band = ACTS["act-3"].difficultyBand;
    expect(UPLINK_DIFFICULTY).toBe(6);
    expect(UPLINK_DIFFICULTY).toBeGreaterThanOrEqual(band.min);
    expect(UPLINK_DIFFICULTY).toBeLessThanOrEqual(band.max);
    expect(UPLINK_WAVES).toBe(5);
  });

  it("offers a pinned d6 defence of the tracking array at the quietest detected city", () => {
    const offer = UPLINK.create(campaign(), pinContext(1));
    expect(offer).toMatchObject({
      typeId: "defend-installation",
      storyId: "uplink",
      pinned: true,
      difficulty: 6,
      act: "act-3",
      // low (10) is the least infested detected city; no region hives.
      cityId: "low",
      defence: { installation: "tracking-array", generators: 2, waves: 5 },
    });
  });

  it("takes the quietest ordinary offer's city when every city holds one, and offers nothing when none can be taken", () => {
    const full: OverworldState = {
      ...campaign(),
      missions: ["clean", "low", "mid", "full"].map((id) => missionAt(id, 30)),
    };
    expect(UPLINK.create(full, pinContext(1))?.cityId).toBe("low");
    const locked: OverworldState = {
      ...full,
      missions: full.missions.map((mission) => ({ ...mission, pinned: true })),
    };
    expect(UPLINK.create(locked, pinContext(1))).toBeUndefined();
  });
});

// ===========================================
// On the board
// ===========================================

describe("Uplink on the board", () => {
  it("is pinned the day the campaign is in Act III, and never before", () => {
    expect(uplink(direct(campaign("act-2")))).toBeUndefined();
    const offer = uplink(direct(campaign("act-3")));
    expect(offer?.defence?.installation).toBe("tracking-array");
  });

  it("stays pinned once and never expires", () => {
    const once = direct(campaign());
    const offer = uplink(once);
    if (offer === undefined) {
      throw new Error("Uplink must be pinned in Act III");
    }
    expect(isMissionExpired(offer, offer.expiresDay + 1000)).toBe(false);
    const later = direct({ ...once, day: once.day + 60 }, 2);
    expect(
      later.missions.filter((mission) => mission.storyId === "uplink"),
    ).toEqual([offer]);
  });

  it("sits outside the board cap: a full board still gets it", () => {
    // Act III's cap is 5; eight cities leave room for the fill and the pin.
    const state = fixtureState({
      map: boardMap([60, 60, 60, 60, 60, 60, 60, 60]),
      progress: progressIn("act-3", 0),
    });
    const board = direct(state);
    const counted = board.missions.filter((mission) =>
      countsAgainstCap(mission, MISSION_OFFER_RULES),
    );
    expect(counted).toHaveLength(ACTS["act-3"].boardCap);
    expect(uplink(board)?.pinned).toBe(true);
  });

  it("is pinned the day Act III opens with no city free, withdrawing an ordinary offer and never the Defend Installation (#1179)", () => {
    // Every city holds an offer; low's, the quietest, is a triggered
    // Defend Installation, so the quietest ordinary one is mid's.
    const before: OverworldState = {
      ...campaign(),
      missions: [
        missionAt("clean", 30),
        missionAt("low", 30, 10, "defend-installation"),
        missionAt("mid", 30),
        missionAt("full", 30),
      ],
    };
    const { state, events } = directed(before);
    const offer = uplink(state);
    expect(offer).toMatchObject({ pinned: true, cityId: "mid" });
    expect(state.missions.map((mission) => mission.id)).not.toContain(
      "mission-mid",
    );
    for (const kept of [0, 1, 3]) {
      expect(state.missions).toContain(before.missions[kept]);
    }
    expect(events.slice(0, 2)).toEqual([
      {
        type: MISSION_WITHDRAWN,
        payload: {
          missionId: "mission-mid",
          typeId: "infestation-clearance",
          cityId: "mid",
          replacedBy: offer?.id,
        },
      },
      { type: MISSION_OFFERED, payload: { mission: offer } },
    ]);
    expect(
      events.filter((event) => event.type === MISSION_WITHDRAWN),
    ).toHaveLength(1);
    expect(events.map((event) => event.type)).not.toContain(MISSION_EXPIRED);
  });

  it("sets uplink-won on a win and is never pinned again", () => {
    const pinned = direct(campaign("act-3", 10));
    const offer = uplink(pinned);
    if (offer === undefined) {
      throw new Error("Uplink must be pinned in Act III");
    }
    const won = play(pinned, offer, "won");
    expect(won.progress.flags).toEqual(["uplink-won"]);
    expect(won.progress.storyWon).toEqual(["uplink"]);
    expect(won.progress.act).toBe("act-3");
    expect(uplink(direct({ ...won, day: 40 }))).toBeUndefined();
  });

  it("is pinned again five days after a loss", () => {
    const pinned = direct(campaign("act-3", 10));
    const offer = uplink(pinned);
    if (offer === undefined) {
      throw new Error("Uplink must be pinned in Act III");
    }
    const lost = play(pinned, offer, "lost");
    expect(lost.progress.flags).toEqual([]);
    const on = (day: number) => uplink(direct({ ...lost, day }));
    expect(on(10)).toBeUndefined();
    expect(on(10 + STORY_RETRY_DAYS - 1)).toBeUndefined();
    expect(on(10 + STORY_RETRY_DAYS)?.storyId).toBe("uplink");
  });
});
