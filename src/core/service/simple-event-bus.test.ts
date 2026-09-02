import { describe, expect, it } from "vitest";

import { SimpleEventBus } from "./simple-event-bus";

interface TestEvents extends Record<string, unknown> {
  "day:advanced": { day: number };
  "mech:lost": { mechId: string };
}

describe("SimpleEventBus", () => {
  it("delivers payloads to listeners of that type only", () => {
    const bus = new SimpleEventBus<TestEvents>();
    const days: number[] = [];
    const losses: string[] = [];
    bus.on("day:advanced", ({ day }) => days.push(day));
    bus.on("mech:lost", ({ mechId }) => losses.push(mechId));

    bus.emit("day:advanced", { day: 3 });

    expect(days).toEqual([3]);
    expect(losses).toEqual([]);
  });

  it("unsubscribes via the returned function", () => {
    const bus = new SimpleEventBus<TestEvents>();
    let calls = 0;
    const off = bus.on("day:advanced", () => calls++);
    bus.emit("day:advanced", { day: 1 });
    off();
    bus.emit("day:advanced", { day: 2 });
    expect(calls).toBe(1);
  });

  it("does not skip listeners when one unsubscribes mid-dispatch", () => {
    const bus = new SimpleEventBus<TestEvents>();
    const order: string[] = [];
    const offA = bus.on("day:advanced", () => {
      order.push("a");
      offA();
    });
    bus.on("day:advanced", () => order.push("b"));
    bus.emit("day:advanced", { day: 1 });
    bus.emit("day:advanced", { day: 2 });
    expect(order).toEqual(["a", "b", "b"]);
  });

  it("emitting with no listeners is a no-op", () => {
    const bus = new SimpleEventBus<TestEvents>();
    expect(() => bus.emit("mech:lost", { mechId: "mech-1" })).not.toThrow();
  });
});
