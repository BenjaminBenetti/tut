import { describe, expect, it } from "vitest";

import { PERSONA_IDS } from "../../content/model/persona-id";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { JEV_PROMPT_MAX_LENGTH } from "../../tactical/model/jev-control";
import { BEHAVIOUR_TAGS } from "../model/bug-species";
import { SPECIES_FALLBACK } from "../model/persona";
import { personaName } from "../service/persona-lookup";
import { BUG_SPECIES } from "./species";
import { ALPHA, BROODMOTHER, PERSONAS, SOVEREIGN } from "./personas";

describe("persona data", () => {
  it("defines every id exactly once, keyed by its own id", () => {
    expect(Object.keys(PERSONAS).sort()).toEqual([...PERSONA_IDS].sort());
    for (const id of PERSONA_IDS) {
      expect(PERSONAS[id].id).toBe(id);
    }
    expect([BROODMOTHER, ALPHA, SOVEREIGN].map((p) => p.id)).toEqual(
      PERSONA_IDS,
    );
  });

  it("keeps every prompt non-empty and inside the limit the relay and configureJev enforce", () => {
    for (const persona of Object.values(PERSONAS)) {
      for (const prompt of [persona.entityPrompt, persona.commanderPrompt]) {
        expect(prompt.trim().length).toBeGreaterThan(0);
        expect(prompt.length).toBeLessThanOrEqual(JEV_PROMPT_MAX_LENGTH);
      }
      expect(persona.displayName.trim().length).toBeGreaterThan(0);
    }
  });

  it("falls back to a behaviour that exists, or to the unit's own species", () => {
    for (const persona of Object.values(PERSONAS)) {
      expect([...BEHAVIOUR_TAGS, SPECIES_FALLBACK]).toContain(persona.fallback);
    }
  });

  it("never names a bug what the starter roster names a squad or mech, on any species", () => {
    // A bare "Alpha" would read as the TDF's Alpha squad in the log and
    // in Jev orders ("Follow Alpha"), which is why the alpha carries its
    // species in its name.
    const ours = new Set([
      ...STARTER_ROSTER.squads.map((squad) => squad.name),
      ...STARTER_ROSTER.mechs.map((mech) => mech.name),
    ]);
    for (const persona of Object.values(PERSONAS)) {
      for (const species of Object.values(BUG_SPECIES)) {
        expect(ours.has(personaName(persona, species.name))).toBe(false);
      }
    }
  });

  it("asks nothing of Jev that its observation never carries", () => {
    // Fair play (ADR 0012): no event log, no spawn timers, no unseen units.
    for (const persona of Object.values(PERSONAS)) {
      const text =
        `${persona.entityPrompt} ${persona.commanderPrompt}`.toLowerCase();
      for (const hidden of ["event log", "spawn timer", "hidden", "unseen"]) {
        expect(text).not.toContain(hidden);
      }
    }
  });

  it("plays the Broodmother on her own behaviour without Jev, and asks Jev for the same plan (#1179)", () => {
    // Headless, or with Jev switched off, she keeps her distance, lays and
    // runs by the deterministic behaviour; Jev's orders say the same.
    expect(BROODMOTHER.fallback).toBe("broodmother");
    const prompt = BROODMOTHER.entityPrompt.toLowerCase();
    for (const plan of ["clutch", "weapon range", "half", "edge"]) {
      expect([plan, prompt.includes(plan)]).toEqual([plan, true]);
    }
  });
});
