import { describe, expect, it } from "vitest";

import { ATTACK, attack } from "./attack-command";
import { ATTACK_RESOLVED } from "./attack-resolved-event";
import { BUGS_SPAWNED } from "./bugs-spawned-event";
import { END_TURN, endTurn } from "./end-turn-command";
import { EXTRACT, extract } from "./extract-command";
import { INTERACT, interact } from "./interact-command";
import { MISSION_ENDED } from "./mission-ended-event";
import { MOVE, move } from "./move-command";
import { OBJECTIVE_UPDATED } from "./objective-updated-event";
import { OVERWATCH, overwatch } from "./overwatch-command";
import { RELOAD, reload } from "./reload-command";
import { TURN_STARTED } from "./turn-started-event";
import { UNIT_DIED } from "./unit-died-event";
import { UNIT_MOVED } from "./unit-moved-event";

const COMMAND_TAGS = [
  MOVE,
  ATTACK,
  OVERWATCH,
  RELOAD,
  INTERACT,
  END_TURN,
  EXTRACT,
];
const EVENT_TAGS = [
  UNIT_MOVED,
  ATTACK_RESOLVED,
  UNIT_DIED,
  TURN_STARTED,
  BUGS_SPAWNED,
  OBJECTIVE_UPDATED,
  MISSION_ENDED,
];

describe("tactical command and event tags", () => {
  it("are distinct and namespaced under tactical:", () => {
    for (const tags of [COMMAND_TAGS, EVENT_TAGS]) {
      expect(new Set(tags).size).toBe(tags.length);
      for (const tag of tags) {
        expect(tag.startsWith("tactical:")).toBe(true);
      }
    }
    expect(new Set([...COMMAND_TAGS, ...EVENT_TAGS]).size).toBe(
      COMMAND_TAGS.length + EVENT_TAGS.length,
    );
  });

  it("builders produce plain commands carrying their tag", () => {
    expect(move("unit-1", [{ x: 1, y: 0, z: 2 }])).toEqual({
      type: MOVE,
      payload: { unitId: "unit-1", path: [{ x: 1, y: 0, z: 2 }] },
    });
    expect(attack("unit-1", "unit-9")).toEqual({
      type: ATTACK,
      payload: { attackerId: "unit-1", targetId: "unit-9" },
    });
    expect(overwatch("unit-1").payload).toEqual({ unitId: "unit-1" });
    expect(reload("unit-1").payload).toEqual({ unitId: "unit-1" });
    expect(interact("unit-1", "objective-1").payload).toEqual({
      unitId: "unit-1",
      objectiveId: "objective-1",
    });
    expect(endTurn()).toEqual({ type: END_TURN, payload: {} });
    expect(endTurn(true)).toEqual({ type: END_TURN, payload: { early: true } });
    expect(extract("unit-1").payload).toEqual({ unitId: "unit-1" });
    for (const command of [move("u", []), attack("a", "b"), endTurn()]) {
      expect(JSON.parse(JSON.stringify(command))).toEqual(command);
    }
  });
});
