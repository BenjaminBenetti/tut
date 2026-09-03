import { describe, expect, it } from "vitest";

import type { Command } from "../../core/model/command";
import { commandError } from "../../core/model/command-error";
import type { CommandProcessor } from "../../core/model/command-processor";
import type { Applied, DomainEvent } from "../../core/model/domain-event";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { CommandFailure, StoreChange } from "../../ui/model/state-store";
import { GameStore } from "./game-store";

// ===========================================
// Fixture: a counter with one valid and one always-failing command
// ===========================================

interface CounterState {
  readonly count: number;
}

type CounterCommand =
  | Command<"increment", { readonly by: number }>
  | Command<"explode", { readonly reason: string }>;

type CounterEvent = DomainEvent<
  "incremented",
  { readonly by: number; readonly total: number }
>;

type CounterStore = GameStore<CounterState, CounterCommand, CounterEvent>;
type CounterChange = StoreChange<CounterState, CounterCommand, CounterEvent>;

class CounterProcessor implements CommandProcessor<
  CounterState,
  CounterCommand,
  CounterEvent
> {
  readonly seenStates: CounterState[] = [];

  process(
    state: CounterState,
    command: CounterCommand,
  ): Result<
    Applied<CounterState, CounterEvent>,
    ReturnType<typeof commandError>
  > {
    this.seenStates.push(state);
    switch (command.type) {
      case "increment": {
        const total = state.count + command.payload.by;
        return ok({
          state: { count: total },
          events: [
            { type: "incremented", payload: { by: command.payload.by, total } },
          ],
        });
      }
      case "explode":
        return err(commandError("exploded", command.payload.reason));
    }
  }
}

function makeStore(initial = 0): {
  store: CounterStore;
  processor: CounterProcessor;
} {
  const processor = new CounterProcessor();
  const store = new GameStore<CounterState, CounterCommand, CounterEvent>(
    { count: initial },
    processor,
  );
  return { store, processor };
}

const increment = (by: number): CounterCommand => ({
  type: "increment",
  payload: { by },
});

const explode: CounterCommand = {
  type: "explode",
  payload: { reason: "boom" },
};

// ===========================================
// Tests
// ===========================================

describe("GameStore", () => {
  describe("getState", () => {
    it("returns the initial state until something changes", () => {
      const { store } = makeStore(5);
      expect(store.getState()).toEqual({ count: 5 });
    });
  });

  describe("dispatch", () => {
    it("hands the processor the current state and the command", () => {
      const { store, processor } = makeStore(1);
      store.dispatch(increment(2));
      store.dispatch(increment(3));
      expect(processor.seenStates).toEqual([{ count: 1 }, { count: 3 }]);
    });

    it("replaces the state and returns the processor's result on success", () => {
      const { store } = makeStore(1);
      const result = store.dispatch(increment(4));
      expect(store.getState()).toEqual({ count: 5 });
      expect(result).toEqual(
        ok({
          state: { count: 5 },
          events: [{ type: "incremented", payload: { by: 4, total: 5 } }],
        }),
      );
    });

    it("notifies subscribers with the new state, the events and the command", () => {
      const { store } = makeStore(1);
      const changes: CounterChange[] = [];
      store.subscribe((change) => changes.push(change));

      store.dispatch(increment(2));

      expect(changes).toEqual([
        {
          kind: "command",
          command: increment(2),
          state: { count: 3 },
          events: [{ type: "incremented", payload: { by: 2, total: 3 } }],
        },
      ]);
    });

    it("leaves the state alone, skips subscribers and reports failures", () => {
      const { store } = makeStore(7);
      const changes: CounterChange[] = [];
      const failures: CommandFailure<CounterCommand>[] = [];
      store.subscribe((change) => changes.push(change));
      store.onError((failure) => failures.push(failure));

      const result = store.dispatch(explode);

      expect(store.getState()).toEqual({ count: 7 });
      expect(changes).toEqual([]);
      expect(failures).toEqual([
        { command: explode, error: { code: "exploded", message: "boom" } },
      ]);
      expect(result).toEqual(err({ code: "exploded", message: "boom" }));
    });

    it("lets a throwing processor propagate without touching the state", () => {
      const throwing: CommandProcessor<
        CounterState,
        CounterCommand,
        CounterEvent
      > = {
        process: () => {
          throw new Error("processor bug");
        },
      };
      const store = new GameStore<CounterState, CounterCommand, CounterEvent>(
        { count: 2 },
        throwing,
      );
      let notified = false;
      store.subscribe(() => {
        notified = true;
      });
      expect(() => store.dispatch(increment(1))).toThrow("processor bug");
      expect(store.getState()).toEqual({ count: 2 });
      expect(notified).toBe(false);
    });

    it("delivers a nested dispatch before continuing the outer notification", () => {
      const { store } = makeStore(0);
      const seen: string[] = [];
      store.subscribe((change) => {
        seen.push(`first:${change.state.count}`);
        if (change.state.count === 1) {
          store.dispatch(increment(10));
        }
      });
      store.subscribe((change) => {
        seen.push(
          `second:${change.state.count}:latest=${store.getState().count}`,
        );
      });

      store.dispatch(increment(1));

      expect(store.getState()).toEqual({ count: 11 });
      expect(seen).toEqual([
        "first:1",
        "first:11",
        "second:11:latest=11",
        "second:1:latest=11",
      ]);
    });
  });

  describe("subscribe", () => {
    it("stops delivering after unsubscribe, which is safe to call twice", () => {
      const { store } = makeStore();
      let calls = 0;
      const off = store.subscribe(() => calls++);
      store.dispatch(increment(1));
      off();
      off();
      store.dispatch(increment(1));
      expect(calls).toBe(1);
    });

    it("notifies in subscription order and does not skip anyone when one unsubscribes mid-notification", () => {
      const { store } = makeStore();
      const order: string[] = [];
      const offA = store.subscribe(() => {
        order.push("a");
        offA();
      });
      store.subscribe(() => order.push("b"));
      store.subscribe(() => order.push("c"));

      store.dispatch(increment(1));
      store.dispatch(increment(1));

      expect(order).toEqual(["a", "b", "c", "b", "c"]);
    });

    it("does not invoke a new listener with the current state", () => {
      const { store } = makeStore(3);
      let calls = 0;
      store.subscribe(() => calls++);
      expect(calls).toBe(0);
    });
  });

  describe("onError", () => {
    it("stops reporting after unsubscribe", () => {
      const { store } = makeStore();
      let calls = 0;
      const off = store.onError(() => calls++);
      store.dispatch(explode);
      off();
      store.dispatch(explode);
      expect(calls).toBe(1);
    });

    it("does not fire for successful commands", () => {
      const { store } = makeStore();
      let calls = 0;
      store.onError(() => calls++);
      store.dispatch(increment(1));
      expect(calls).toBe(0);
    });
  });

  describe("replaceState", () => {
    it("swaps the state without consulting the processor", () => {
      const { store, processor } = makeStore(1);
      store.replaceState({ count: 99 });
      expect(store.getState()).toEqual({ count: 99 });
      expect(processor.seenStates).toEqual([]);
    });

    it("notifies subscribers with a replace change carrying no events", () => {
      const { store } = makeStore(1);
      const changes: CounterChange[] = [];
      store.subscribe((change) => changes.push(change));

      store.replaceState({ count: 42 });

      expect(changes).toEqual([
        { kind: "replace", state: { count: 42 }, events: [] },
      ]);
    });

    it("feeds the replaced state into the next dispatch", () => {
      const { store } = makeStore(1);
      store.replaceState({ count: 10 });
      store.dispatch(increment(5));
      expect(store.getState()).toEqual({ count: 15 });
    });
  });
});
