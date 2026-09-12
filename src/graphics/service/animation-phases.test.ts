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
