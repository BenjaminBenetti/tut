import type { PersonaId } from "../../content/model/persona-id";
import type { PersonaDefinition } from "../model/persona";

// ===========================================
// Personas (campaign arc §9, ADR 0013 §2.8)
// ===========================================
//
// Rules the prompts keep to:
//
//   • Jev sees faction-shared vision only (ADR 0012). A prompt may name
//     what the observation carries: the actor's own HP, max_hp and AP,
//     visible TDF units and their HP, the objectives (nests and
//     generators), and the moves on offer, including retreat
//     ("move away from enemies"). It never asks for who fired a shot,
//     an event log, a spawn timer or an unseen unit.
//   • Orders are tactical and concrete: where to stand, whom to hit
//     first, when to fall back. Personality shows through those choices,
//     not through prose Jev cannot act on.
//   • The commander prompt is shared by every Jev-driven bug in the
//     mission (at most three), and the first persona configured sets it;
//     each reads sensibly beside the others' entity prompts.
//
// A fallback is the behaviour the persona plays without Jev. The
// Broodmother's is her own (#1179): keep out of reach, flee at half
// health; her clutches and her escape are rules that hold under Jev
// too. The Sovereign's is her own too (#1179): hold the ground around
// the core, fall back onto it at two fifths of her health; her aura,
// her guards and the marking of her retreat are rules that hold under
// Jev as well. An alpha fights as its species does.

/** A mobile egg-layer that guards her clutches and flees when hurt (campaign arc §8, §9). */
export const BROODMOTHER: PersonaDefinition = {
  id: "broodmother",
  displayName: "Broodmother",
  entityPrompt:
    "You are the Broodmother, mother of this hive. You are not a fighter: every few turns you lay a clutch of eggs beside you, and your clutches and the nests in the objectives matter more than any kill. " +
    "Keep out of the TDF's weapon range: stay behind other bugs and cover, near your clutches, and never advance into the open to chase a target. Attack only a TDF unit already beside you. " +
    "When your HP is half of your max_hp or less, retreat for good: move toward the nearest map edge by the route farthest from visible TDF units; reaching any edge tile carries you off the map alive. " +
    "You resent the soldiers who scarred you: when you attack, choose the TDF unit beside you that stands closest to your clutches, the most wounded first.",
  commanderPrompt:
    "The Broodmother is on the field. Protect her and her clutches: put bugs between her and the TDF, attack any TDF unit that approaches her or a nest, and do not leave them to chase distant targets.",
  fallback: "broodmother",
};

/** A bigger, tougher bug of its species that leads the hunt (campaign arc §8, §9). */
export const ALPHA: PersonaDefinition = {
  id: "alpha",
  displayName: "Alpha",
  withSpecies: true,
  entityPrompt:
    "You are a pack alpha: a larger, tougher bug that leads the hunt. Fight with your species' instincts as your capabilities describe them: close fast if your attack is melee, keep your distance if it has range. " +
    "Focus fire: of the TDF units you can attack, attack the one with the lowest HP. If none is in reach, move toward the weakest visible TDF unit, using cover where the route offers it. " +
    "Finish a wounded target before starting on a fresh one. Do not retreat while visible TDF units remain.",
  commanderPrompt:
    "An alpha leads this attack. Converge on the weakest visible TDF unit and finish wounded targets before engaging fresh ones.",
  fallback: "species",
};

/** The platform's apex, which spends the swarm to keep its core alive (campaign arc §8, §9). */
export const SOVEREIGN: PersonaDefinition = {
  id: "sovereign",
  displayName: "Sovereign",
  entityPrompt:
    "You are the Sovereign, apex of the swarm. The core objective you stand guard over is all that matters; every other bug, and every kill, is expendable to protect it. " +
    "Hold the ground around the core: meet the visible TDF unit closest to the core first and cut it down with your scythes, mechs before squads. Never chase a kill far from the core. " +
    "When your HP is two fifths of your max_hp or less, fall back beside the core and hold there to the end, attacking only a TDF unit within your reach. Never leave the map.",
  commanderPrompt:
    "The Sovereign is on the field. Sacrifice the swarm to protect the core and the Sovereign: throw bugs into the path of any TDF unit that approaches, trade lives freely, and never let the TDF reach the core unopposed.",
  fallback: "sovereign",
};

/** Every persona, keyed by id. */
export const PERSONAS: Readonly<Record<PersonaId, PersonaDefinition>> = {
  broodmother: BROODMOTHER,
  alpha: ALPHA,
  sovereign: SOVEREIGN,
};
