import { describe, expect, it } from "vitest";

import type { EventEffect, EventType } from "../model/event-type";
import {
  CITY_NAME_TOKEN,
  EVENT_EFFECT_KINDS,
  EVENT_TYPE_IDS,
  isCityScopedEffect,
} from "../model/event-type";
import { EVENT_TYPES } from "./event-types";

const ALL_TYPES: readonly EventType[] = EVENT_TYPE_IDS.map(
  (id) => EVENT_TYPES[id],
);

function effectsOf(type: EventType): readonly EventEffect[] {
  return type.choices.flatMap((choice) => choice.effects);
}

function mentionsCity(type: EventType): boolean {
  return (
    type.title.includes(CITY_NAME_TOKEN) || type.text.includes(CITY_NAME_TOKEN)
  );
}

/**
 * Asserts an effect's numeric payload is meaningful: whole where the
 * target is an integer scale, never a no-op, and in range.
 */
function expectValidPayload(effect: EventEffect, label: string): void {
  switch (effect.kind) {
    case "credits":
      expect(Number.isInteger(effect.amount), label).toBe(true);
      expect(effect.amount, label).not.toBe(0);
      return;
    case "cityInfestation":
    case "threat":
      expect(Number.isInteger(effect.delta), label).toBe(true);
      expect(effect.delta, label).not.toBe(0);
      expect(Math.abs(effect.delta), label).toBeLessThanOrEqual(100);
      return;
    case "stipendMultiplier":
      expect(Number.isFinite(effect.factor), label).toBe(true);
      expect(effect.factor, label).toBeGreaterThan(0);
      expect(effect.factor, label).not.toBe(1);
      expect(Number.isInteger(effect.days), label).toBe(true);
      expect(effect.days, label).toBeGreaterThan(0);
      return;
    default: {
      const exhaustive: never = effect;
      throw new Error(`Unhandled effect ${JSON.stringify(exhaustive)}`);
    }
  }
}

describe("event-types data", () => {
  it("defines every event type id exactly once, keyed by its own id", () => {
    const keys = Object.keys(EVENT_TYPES).sort();
    expect(keys).toEqual([...EVENT_TYPE_IDS].sort());
    for (const id of EVENT_TYPE_IDS) {
      expect(EVENT_TYPES[id].id).toBe(id);
    }
  });

  it("has non-empty titles, texts and choice labels", () => {
    for (const type of ALL_TYPES) {
      expect(type.title.trim().length, type.id).toBeGreaterThan(0);
      expect(type.text.trim().length, type.id).toBeGreaterThan(0);
      for (const choice of type.choices) {
        expect(
          choice.label.trim().length,
          `${type.id}/${choice.id}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("offers at least one choice per type with unique choice ids", () => {
    for (const type of ALL_TYPES) {
      expect(type.choices.length, type.id).toBeGreaterThan(0);
      const ids = type.choices.map((choice) => choice.id);
      expect(new Set(ids).size, type.id).toBe(ids.length);
    }
  });

  it("names a default choice that exists and never charges credits", () => {
    for (const type of ALL_TYPES) {
      const choice = type.choices.find((c) => c.id === type.defaultChoiceId);
      expect(choice, type.id).toBeDefined();
      for (const effect of choice?.effects ?? []) {
        if (effect.kind === "credits") {
          expect(effect.amount, `${type.id}/${choice?.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("gives every choice at least one effect", () => {
    for (const type of ALL_TYPES) {
      for (const choice of type.choices) {
        expect(
          choice.effects.length,
          `${type.id}/${choice.id}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("has a positive finite weight on every type", () => {
    for (const type of ALL_TYPES) {
      expect(Number.isFinite(type.weight), type.id).toBe(true);
      expect(type.weight, type.id).toBeGreaterThan(0);
    }
  });

  it("uses city-scoped effects and the city token only in requiresCity types", () => {
    for (const type of ALL_TYPES) {
      const cityEffects = effectsOf(type).filter(isCityScopedEffect);
      if (type.requiresCity) {
        expect(cityEffects.length, type.id).toBeGreaterThan(0);
        expect(mentionsCity(type), type.id).toBe(true);
      } else {
        expect(cityEffects, type.id).toEqual([]);
        expect(mentionsCity(type), type.id).toBe(false);
      }
    }
  });

  it("keeps every effect payload whole, non-zero and in range", () => {
    for (const type of ALL_TYPES) {
      for (const choice of type.choices) {
        for (const effect of choice.effects) {
          expectValidPayload(effect, `${type.id}/${choice.id}/${effect.kind}`);
        }
      }
    }
  });

  it("exercises every effect kind at least once across the starter set", () => {
    const used = new Set(ALL_TYPES.flatMap(effectsOf).map((e) => e.kind));
    for (const kind of EVENT_EFFECT_KINDS) {
      expect(used.has(kind), kind).toBe(true);
    }
  });

  it("round-trips through JSON unchanged", () => {
    const text = JSON.stringify(EVENT_TYPES);
    expect(JSON.parse(text)).toEqual(EVENT_TYPES);
  });
});
