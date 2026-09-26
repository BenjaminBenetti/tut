import type { PersonaLookup } from "../../bugs/model/persona";
import type { ConfigureJevCommand } from "../../tactical/model/jev-command";
import { configureJev } from "../../tactical/model/jev-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { CampaignStore } from "../../ui/model/game-session";
import type { JevPolicy } from "../../ui/model/jev-policy";
import type { JevPreference } from "../../ui/model/jev-preference";

// ===========================================
// Constants
// ===========================================

/**
 * The most named enemies Jev drives in one mission (campaign arc §9:
 * "at most 1–3 Jev-driven actors per mission"). Counted over the whole
 * mission, dead ones included, so a fourth persona arriving after one
 * has died still plays its fallback.
 */
export const MAX_JEV_PERSONAS_PER_MISSION = 3;

// ===========================================
// Types
// ===========================================

/** What the default policy reads and writes through. */
export interface JevDefaultPolicyDeps {
  /** The live campaign: the mission is read from it and `configureJev` goes through it. */
  readonly store: Pick<CampaignStore, "getState" | "subscribe" | "dispatch">;
  /** `JevClient.configured`: a relay URL is set. Without one the policy never acts. */
  readonly configured: boolean;
  /** The player's "Smart enemies (Jev)" setting, read each time there is something to configure. */
  readonly preference: Pick<JevPreference, "enabled">;
  /** Resolves a unit's persona; the shipped `PERSONAS` in the app. */
  readonly personaOf: PersonaLookup;
  /** The per-mission cap; `MAX_JEV_PERSONAS_PER_MISSION` unless a test says otherwise. */
  readonly limit?: number;
}

// ===========================================
// Pure rule
// ===========================================

/**
 * The `configureJev` commands the default policy owes `mission` now, in
 * the order it dispatches them (ADR 0013 §2.8): one per living bug that
 * carries a persona this build knows and has no Jev entry yet, in
 * `units` order, until the mission has `limit` persona actors.
 *
 * ```
 *   units ──► living bug, persona known, no jev.entities[id] ──► first (limit − used)
 *                                                                   │
 *   configureJev(id, { enabled: true, entityPrompt }, commander) ◄──┘
 *   commander = the bugs' existing prompt, else the first due persona's
 * ```
 *
 * An entry of any kind, enabled or not, means the unit has been decided
 * on (by this policy, the inspector or a save) and is never touched
 * again, which is what makes the policy idempotent. The bug commander
 * prompt already set is passed through unchanged, because
 * `configureJevHandler` overwrites it with whatever it is given; with
 * none set the first persona's commander prompt becomes the faction's,
 * and later ones keep it. A finished mission is owed nothing: the
 * command would be refused.
 *
 * @param mission - The mission in progress.
 * @param personaOf - Resolves a unit's persona.
 * @param limit - The most persona actors the mission may have.
 * @returns The commands to dispatch, possibly none.
 */
export function personaJevConfigurations(
  mission: TacticalState,
  personaOf: PersonaLookup,
  limit: number = MAX_JEV_PERSONAS_PER_MISSION,
): readonly ConfigureJevCommand[] {
  if (mission.outcome !== undefined) {
    return [];
  }
  const entities = mission.jev?.entities ?? {};
  const decided = (unitId: string): boolean => Object.hasOwn(entities, unitId);
  const used = mission.units.filter(
    (unit) =>
      unit.team === "bugs" && unit.persona !== undefined && decided(unit.id),
  ).length;
  let commander = mission.jev?.commanders.bugs ?? "";
  const commands: ConfigureJevCommand[] = [];
  for (const unit of mission.units) {
    if (used + commands.length >= limit) {
      break;
    }
    if (
      unit.team !== "bugs" ||
      unit.hp <= 0 ||
      unit.persona === undefined ||
      decided(unit.id)
    ) {
      continue;
    }
    const persona = personaOf(unit.persona);
    if (persona === undefined) {
      continue;
    }
    commander = commander.trim() === "" ? persona.commanderPrompt : commander;
    commands.push(
      configureJev(
        unit.id,
        { enabled: true, entityPrompt: persona.entityPrompt },
        commander,
      ),
    );
  }
  return commands;
}

// ===========================================
// JevDefaultPolicy
// ===========================================

/**
 * Puts named enemies under Jev by default (campaign arc §9, ADR 0013
 * §2.8). App layer only: it needs the relay's configuration and the
 * player's preference, neither of which the simulation may read, and it
 * acts through ordinary `configureJev` commands the save records. The
 * simulation never enables Jev on its own, so the headless sims and
 * auto-resolve, which run no policy, play every persona's fallback and
 * never wait on an activation.
 *
 * ```
 *   start() ──► apply() now            (mission start: before the first End Turn)
 *          └──► apply() on every store change after it
 *                 (a hatch, an edge wave or a placed unit brought a persona in)
 *
 *   apply(): configured? ─no─► nothing
 *              │ yes
 *            personaJevConfigurations(mission) empty? ─yes─► nothing
 *              │ no
 *            preference on? ─no─► nothing        (turning it off stops new actors only)
 *              │ yes
 *            dispatch the first, re-read, repeat
 * ```
 *
 * Timing: a persona placed at mission start is configured before the
 * first End Turn. One that arrives as a bug phase opens is configured
 * as soon as the store reports it; that phase has already decided which
 * bugs Jev drives (`startJevPhase`), so it plays its fallback there and
 * Jev takes it from the next bug phase. It arrives with no AP, so
 * nothing is lost.
 *
 * Commands go one at a time with the state re-read between them, and a
 * store change delivered while one is dispatching is ignored, so a
 * nested notification can never configure the same unit twice.
 */
export class JevDefaultPolicy implements JevPolicy {
  // ===========================================
  // Fields
  // ===========================================

  private unsubscribe: (() => void) | undefined;
  private applying = false;
  private readonly limit: number;

  // ===========================================
  // Construction
  // ===========================================

  /** @param deps - Store, relay configuration, preference and personas. */
  constructor(private readonly deps: JevDefaultPolicyDeps) {
    this.limit = deps.limit ?? MAX_JEV_PERSONAS_PER_MISSION;
  }

  // ===========================================
  // JevPolicy
  // ===========================================

  /** Configures what is due now, then again after every store change until disposed. */
  start(): void {
    this.dispose();
    this.apply();
    this.unsubscribe = this.deps.store.subscribe(() => {
      this.apply();
    });
  }

  /** Stops observing; every actor already configured stays configured. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  // ===========================================
  // Applying
  // ===========================================

  /**
   * Dispatches `configureJev` for every persona due now.
   *
   * @returns How many actors were configured.
   */
  apply(): number {
    if (this.applying || !this.deps.configured) {
      return 0;
    }
    this.applying = true;
    let configured = 0;
    try {
      // Bounded by the cap as well as by the rule, so a store that
      // accepted a command without recording it can never spin here.
      while (configured < this.limit) {
        const mission = this.deps.store.getState().activeMission;
        const next =
          mission === undefined
            ? undefined
            : personaJevConfigurations(
                mission,
                this.deps.personaOf,
                this.limit,
              )[0];
        if (next === undefined || !this.deps.preference.enabled()) {
          break;
        }
        if (!this.deps.store.dispatch(next).ok) {
          break;
        }
        configured++;
      }
    } finally {
      this.applying = false;
    }
    return configured;
  }
}
