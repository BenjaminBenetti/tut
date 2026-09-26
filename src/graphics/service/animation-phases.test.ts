import { describe, expect, it } from "vitest";

import type { TacticalEvent } from "../../tactical/model/tactical-event";
import { phaseEvents } from "./animation-phases";

/** A minimal event of a type; only `type` matters to the split. */
const event = (type: string, payload: object = {}): TacticalEvent =>
  ({ type, payload }) as unknown as TacticalEvent;

const MOVED = event("tactical:unit-moved");
const ATTACKED = event("tactical:attack-resolved");
const DIED = event("tactical:unit-died");
const SPOTTED = event("tactical:unit-spotted");

describe("phaseEvents", () => {
  it("defers a spot until after placement, and plays everything else first", () => {
    const phases = phaseEvents([MOVED, SPOTTED, ATTACKED]);
    expect(phases.before).toEqual([MOVED, ATTACKED]);
    expect(phases.after).toEqual([SPOTTED]);
  });

  it("keeps order within each phase, so a move still precedes its attack", () => {
    const phases = phaseEvents([MOVED, ATTACKED, DIED]);
    expect(phases.before).toEqual([MOVED, ATTACKED, DIED]);
    expect(phases.after).toEqual([]);
  });

  it("keeps several spots in the order they happened", () => {
    const first = event("tactical:unit-spotted");
    const second = event("tactical:unit-spotted");
    const phases = phaseEvents([first, MOVED, second]);
    expect(phases.after).toEqual([first, second]);
    expect(phases.before).toEqual([MOVED]);
  });

  it("plays a brood's wake after placement, behind the spots of the same step (#1179)", () => {
    const woke = event("tactical:brood-woke");
    const phases = phaseEvents([MOVED, SPOTTED, woke, ATTACKED]);
    expect(phases.before).toEqual([MOVED, ATTACKED]);
    expect(phases.after).toEqual([SPOTTED, woke]);
  });

  it("splits an empty batch into two empty phases", () => {
    expect(phaseEvents([])).toEqual({ before: [], after: [] });
  });

  it("loses nothing: every event lands in exactly one phase", () => {
    const batch = [MOVED, SPOTTED, ATTACKED, SPOTTED, DIED];
    const phases = phaseEvents(batch);
    expect(phases.before.length + phases.after.length).toBe(batch.length);
  });
});

describe("phaseEvents with arrivals (#1116)", () => {
  const stepB1 = event("tactical:unit-moved", { unitId: "b" });
  const stepB2 = event("tactical:unit-moved", { unitId: "b" });
  const spotB = event("tactical:unit-spotted", { unitId: "b", team: "tdf" });
  const stepC = event("tactical:unit-moved", { unitId: "c" });
  const spotC = event("tactical:unit-spotted", { unitId: "c", team: "tdf" });

  it("pulls an arrival's spot ahead of its first move, and plays the walk in the first phase", () => {
    const phases = phaseEvents(
      [stepB1, stepB2, ATTACKED, spotB],
      new Set(["b"]),
    );
    // The object was placed before the batch, so the swell plays where
    // the walk starts and every step follows it in view.
    expect(phases.before).toEqual([spotB, stepB1, stepB2, ATTACKED]);
    expect(phases.after).toEqual([]);
  });

  it("leaves a unit that is not an arrival exactly as before", () => {
    const phases = phaseEvents([stepC, spotC, stepB1, spotB], new Set(["b"]));
    // c was spotted standing still (or its object never existed): its
    // spot waits for the redraw as it always has.
    expect(phases.before).toEqual([stepC, spotB, stepB1]);
    expect(phases.after).toEqual([spotC]);
  });

  it("plays a spot that already precedes the first move in place, once", () => {
    const phases = phaseEvents([spotB, stepB1, stepB2], new Set(["b"]));
    expect(phases.before).toEqual([spotB, stepB1, stepB2]);
    expect(phases.after).toEqual([]);
  });

  it("keeps a later re-spot of the same arrival, in stream order", () => {
    const again = event("tactical:unit-spotted", { unitId: "b", team: "tdf" });
    const phases = phaseEvents([stepB1, spotB, stepB2, again], new Set(["b"]));
    expect(phases.before).toEqual([spotB, stepB1, stepB2, again]);
    expect(phases.after).toEqual([]);
  });

  it("walks an arrival the batch never announces, such as one shot dead on the way in", () => {
    const phases = phaseEvents([stepB1, ATTACKED, DIED], new Set(["b"]));
    expect(phases.before).toEqual([stepB1, ATTACKED, DIED]);
    expect(phases.after).toEqual([]);
  });

  it("loses nothing and repeats nothing", () => {
    const batch = [stepC, stepB1, spotC, stepB2, spotB, DIED];
    const phases = phaseEvents(batch, new Set(["b"]));
    const played = [...phases.before, ...phases.after];
    expect(played).toHaveLength(batch.length);
    for (const event of batch) {
      expect(played.filter((candidate) => candidate === event)).toHaveLength(1);
    }
  });
});

describe("phaseEvents with a burrower coming up (#1179)", () => {
  const upD = event("tactical:unit-surfaced", { unitId: "d" });
  const spotD = event("tactical:unit-spotted", { unitId: "d", team: "tdf" });
  const biteD = event("tactical:attack-resolved", { attackerId: "d" });
  const stepD = event("tactical:unit-moved", { unitId: "d" });

  it("plays the surfacing as the entrance, with the spot straight behind it", () => {
    const phases = phaseEvents([upD, biteD, spotD], new Set(["d"]));
    // The rise out of the ground is the reveal: the spot rides along
    // with it, and the bite plays on a burrower already up.
    expect(phases.before).toEqual([upD, spotD, biteD]);
    expect(phases.after).toEqual([]);
  });

  it("keeps the spot behind the surfacing even when the rules announced it first", () => {
    const phases = phaseEvents([spotD, upD, biteD], new Set(["d"]));
    expect(phases.before).toEqual([upD, spotD, biteD]);
  });

  it("walks a burrower that came up first from where it came up", () => {
    const phases = phaseEvents([upD, stepD, spotD], new Set(["d"]));
    expect(phases.before).toEqual([upD, spotD, stepD]);
    expect(phases.after).toEqual([]);
  });

  it("leaves a surfacing nobody placed where it was, and its spot for after the redraw", () => {
    const phases = phaseEvents([upD, biteD, spotD]);
    expect(phases.before).toEqual([upD, biteD]);
    expect(phases.after).toEqual([spotD]);
  });

  it("plays a surfacing before the redraw and a brood it woke after it, whatever order the rules gave", () => {
    // A watcher's shot at a burrower coming up inside a chamber wakes the
    // brood in the same step: the rise and its burst keep their place at
    // the entrance, and the heave waits for the redraw that uncurls it.
    const woke = event("tactical:brood-woke");
    const shot = event("tactical:attack-resolved", { targetId: "d" });
    for (const batch of [
      [upD, shot, spotD, woke],
      [woke, spotD, upD, shot],
    ]) {
      const phases = phaseEvents(batch, new Set(["d"]));
      expect(phases.before).toEqual([upD, spotD, shot]);
      expect(phases.after).toEqual([woke]);
    }
  });

  it("loses nothing and repeats nothing", () => {
    const batch = [spotD, upD, biteD, stepD, DIED];
    const phases = phaseEvents(batch, new Set(["d"]));
    const played = [...phases.before, ...phases.after];
    expect(played).toHaveLength(batch.length);
    for (const each of batch) {
      expect(played.filter((candidate) => candidate === each)).toHaveLength(1);
    }
  });
});
