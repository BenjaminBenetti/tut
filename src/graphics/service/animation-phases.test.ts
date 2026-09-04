import { describe, expect, it } from "vitest";

import type { TacticalEvent } from "../../tactical/model/tactical-event";
import { phaseEvents } from "./animation-phases";

/** A minimal event of a type; only `type` matters to the split. */
const event = (type: string): TacticalEvent =>
  ({ type, payload: {} }) as unknown as TacticalEvent;

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
