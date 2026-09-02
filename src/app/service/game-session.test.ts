import { describe, expect, it } from "vitest";

import { createNewGameState } from "../../save/service/game-state-factory";
import { InMemoryGameSession } from "./game-session";

const stateWithSeed = (seed: number) =>
  createNewGameState({ seed, createdAt: "2026-09-02T00:00:00Z" });

describe("InMemoryGameSession", () => {
  it("has no state until started", () => {
    const session = new InMemoryGameSession();
    expect(session.state).toBeUndefined();
  });

  it("exposes the exact state object it was started with", () => {
    const session = new InMemoryGameSession();
    const state = stateWithSeed(7);
    session.start(state);
    expect(session.state).toBe(state);
  });

  it("starting again swaps in the new campaign", () => {
    const session = new InMemoryGameSession();
    session.start(stateWithSeed(1));
    const second = stateWithSeed(2);
    session.start(second);
    expect(session.state).toBe(second);
  });

  it("replaces the state of an active session", () => {
    const session = new InMemoryGameSession();
    session.start(stateWithSeed(1));
    const next = stateWithSeed(3);
    session.replace(next);
    expect(session.state).toBe(next);
  });

  it("refuses to replace when no session is active", () => {
    const session = new InMemoryGameSession();
    expect(() => {
      session.replace(stateWithSeed(1));
    }).toThrow(/no game session is active/);
  });

  it("clears back to no state", () => {
    const session = new InMemoryGameSession();
    session.start(stateWithSeed(1));
    session.clear();
    expect(session.state).toBeUndefined();
  });
});
