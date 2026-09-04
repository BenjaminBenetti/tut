// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { PhaseBannerView } from "./phase-banner-view";

// ===========================================
// Fixtures
// ===========================================

/** Timers the test fires by hand, so no banner waits on a wall clock. */
class ManualTimers {
  private readonly pending = new Map<number, () => void>();
  private next = 1;
  readonly delays: number[] = [];

  set = (run: () => void, ms: number): number => {
    this.delays.push(ms);
    const handle = this.next++;
    this.pending.set(handle, run);
    return handle;
  };

  clear = (handle: number): void => {
    this.pending.delete(handle);
  };

  /** Fires every timer currently pending, once. */
  fire(): void {
    for (const [handle, run] of [...this.pending]) {
      this.pending.delete(handle);
      run();
    }
  }

  get outstanding(): number {
    return this.pending.size;
  }
}

let host: HTMLElement;
let timers: ManualTimers;

function mounted(holdMs = 1000): PhaseBannerView {
  timers = new ManualTimers();
  const view = new PhaseBannerView({
    holdMs,
    setTimer: timers.set,
    clearTimer: timers.clear,
  });
  view.mount(host);
  return view;
}

const banner = (): HTMLElement | null =>
  host.querySelector<HTMLElement>('[data-role="phase-banner"]');

const text = (field: string): string =>
  banner()?.querySelector(`[data-field="${field}"]`)?.textContent ?? "";

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

// ===========================================
// Tests
// ===========================================

describe("PhaseBannerView", () => {
  it("mounts idle and hidden, so it blocks nothing before a phase changes", () => {
    const view = mounted();
    expect(banner()).not.toBeNull();
    expect(banner()?.hidden).toBe(true);
    expect(view.current()).toBeUndefined();
    view.unmount();
  });

  it("announces the bug phase, then the player's turn, one at a time", () => {
    const view = mounted();
    // One EndTurn emits both, which is the case the Executive Director hit.
    view.announce([
      { phase: "bugs", turn: 1 },
      { phase: "player", turn: 2 },
    ]);

    expect(banner()?.hidden).toBe(false);
    expect(banner()?.dataset.phase).toBe("bugs");
    expect(text("title")).toBe("Bug phase");
    expect(view.pending()).toBe(1);

    timers.fire();
    expect(banner()?.dataset.phase).toBe("player");
    expect(text("title")).toBe("Your turn");
    expect(view.pending()).toBe(0);

    timers.fire();
    expect(banner()?.hidden).toBe(true);
    expect(view.current()).toBeUndefined();
    view.unmount();
  });

  it("says outright that the bugs have finished, rather than leaving it to be inferred", () => {
    const view = mounted();
    view.announce([
      { phase: "bugs", turn: 1 },
      { phase: "player", turn: 2 },
    ]);
    timers.fire();
    expect(text("detail")).toBe("The bugs have finished · Turn 2");
    view.unmount();
  });

  it("does not claim the bugs finished for a player turn that did not follow them", () => {
    const view = mounted();
    view.announce([{ phase: "player", turn: 1 }]);
    expect(text("detail")).toBe("Turn 1");
    view.unmount();
  });

  it("holds each banner for the configured time and no longer", () => {
    const view = mounted(1234);
    view.announce([
      { phase: "bugs", turn: 3 },
      { phase: "player", turn: 4 },
    ]);
    timers.fire();
    expect(timers.delays).toEqual([1234, 1234]);
    view.unmount();
  });

  it("is skipped by a click, which advances to the next banner", () => {
    const view = mounted();
    view.announce([
      { phase: "bugs", turn: 1 },
      { phase: "player", turn: 2 },
    ]);
    banner()?.click();
    expect(banner()?.dataset.phase).toBe("player");
    // The skipped banner's timer is cancelled rather than left to fire.
    expect(timers.outstanding).toBe(1);
    banner()?.click();
    expect(banner()?.hidden).toBe(true);
    expect(timers.outstanding).toBe(0);
    view.unmount();
  });

  it("ignores a click when nothing is up", () => {
    const view = mounted();
    banner()?.click();
    expect(banner()?.hidden).toBe(true);
    view.unmount();
  });

  it("queues rather than stacking: a slow phase never overwrites the banner on screen", () => {
    const view = mounted();
    view.announce([{ phase: "bugs", turn: 1 }]);
    expect(banner()?.dataset.phase).toBe("bugs");
    // A second change arriving while the first is still up waits its turn.
    view.announce([{ phase: "player", turn: 2 }]);
    expect(banner()?.dataset.phase).toBe("bugs");
    expect(view.pending()).toBe(1);
    timers.fire();
    expect(banner()?.dataset.phase).toBe("player");
    view.unmount();
  });

  it("leaves the banner alone for a change that carried no phase", () => {
    const view = mounted();
    view.announce([{ phase: "bugs", turn: 1 }]);
    view.announce([]);
    expect(banner()?.dataset.phase).toBe("bugs");
    expect(view.pending()).toBe(0);
    view.unmount();
  });

  it("restarts the entry animation when one banner replaces another", () => {
    const view = mounted();
    view.announce([
      { phase: "bugs", turn: 1 },
      { phase: "player", turn: 2 },
    ]);
    const first = banner()?.dataset.seq;
    timers.fire();
    expect(banner()?.dataset.seq).not.toBe(first);
    view.unmount();
  });

  it("drops a pending queue and its timer on unmount", () => {
    const view = mounted();
    view.announce([
      { phase: "bugs", turn: 1 },
      { phase: "player", turn: 2 },
    ]);
    view.unmount();
    expect(banner()).toBeNull();
    expect(timers.outstanding).toBe(0);
    expect(view.pending()).toBe(0);
  });
});
