import type { ActId } from "../../content/model/act-id";
import type { GameOutcome } from "../../overworld/model/game-outcome";
import { MAX_THREAT } from "../../overworld/model/threat";
import { formatWhole } from "./format";

// ===========================================
// Types
// ===========================================

/**
 * Which ending the end screen is telling (campaign arc D1, D7, §13):
 *
 * | Variant          | When                                                |
 * |------------------|-----------------------------------------------------|
 * | `platform`       | victory: the platform fell on its first assault     |
 * | `last-hope`      | victory: it fell on the second, after Last Hope     |
 * | `story-victory`  | victory the platform had no part in (an early spine)|
 * | `threat-defeat`  | threat reached its limit                            |
 * | `story-defeat`   | the platform held against a second assault          |
 * | `legacy-victory` | the retired victory stub, on an old save            |
 */
export type OutcomeVariant =
  | "platform"
  | "last-hope"
  | "story-victory"
  | "threat-defeat"
  | "story-defeat"
  | "legacy-victory";

/** The end screen's headline for one ending. */
export interface OutcomeCopy {
  readonly variant: OutcomeVariant;
  readonly title: string;
  readonly tagline: string;
  /** `ok` keeps the world bright; `danger` drains it. */
  readonly tone: "danger" | "ok";
  /**
   * Path under `public/` of the key art that stands behind the panel,
   * or absent for none (the world stays behind the scrim).
   */
  readonly art?: string;
}

// ===========================================
// Constants
// ===========================================

/**
 * The victory key art: the spore platform breaking up over a wrecked
 * city at dawn (`docs/design/concepts/campaign/victory-backdrop.md`).
 */
export const VICTORY_ART = "assets/ui/backdrops/victory.webp";

/** Every ending's words, by variant. */
export const OUTCOME_COPY: Readonly<Record<OutcomeVariant, OutcomeCopy>> = {
  platform: {
    variant: "platform",
    title: "Victory",
    tagline: "The platform burns in orbit. Earth holds.",
    tone: "ok",
    art: VICTORY_ART,
  },
  "last-hope": {
    variant: "last-hope",
    title: "Victory",
    tagline: "The last chance held. Earth holds.",
    tone: "ok",
    art: VICTORY_ART,
  },
  "story-victory": {
    variant: "story-victory",
    title: "Victory",
    tagline: "The last story mission is won. Earth holds.",
    tone: "ok",
    // No art: it shows the platform breaking up, and a spine that
    // ended before the finale never met it.
  },
  "threat-defeat": {
    variant: "threat-defeat",
    title: "Threat limit reached",
    tagline: `Global threat reached ${formatWhole(MAX_THREAT)}, ending the campaign.`,
    tone: "danger",
  },
  "story-defeat": {
    variant: "story-defeat",
    title: "Assault failed",
    tagline:
      "The Spore Platform assault failed a second time. There is no third: the Earth is lost.",
    tone: "danger",
  },
  "legacy-victory": {
    variant: "legacy-victory",
    title: "Earth secured",
    tagline:
      "Every city was clean and no hive remained. This campaign ended under the old victory rule.",
    tone: "ok",
  },
};

// ===========================================
// Selection
// ===========================================

/**
 * Which ending `outcome` is (campaign arc D1, D7). A victory is told by
 * how many Spore Platform assaults it took; a defeat by its cause.
 *
 * ```
 *   victory ── platformAttempts 2 ──────────► last-hope
 *           ├─ platformAttempts 1 ──────────► platform
 *           ├─ none recorded, act finale ───► platform
 *           └─ none recorded ───────────────► story-victory
 *   defeat ─── cause story ─────────────────► story-defeat
 *           └─ threat, or none ─────────────► threat-defeat
 *   victory-stub ───────────────────────────► legacy-victory
 * ```
 *
 * The finale's one story mission is the Spore Platform, so a victory in
 * the finale was won there even when its outcome was frozen before the
 * attempts were counted.
 *
 * @param outcome - How the campaign ended.
 * @param act - The act it ended in (`CampaignProgress.act`), when known.
 */
export function outcomeVariant(
  outcome: GameOutcome,
  act?: ActId,
): OutcomeVariant {
  switch (outcome.kind) {
    case "victory": {
      const attempts = outcome.summary.platformAttempts ?? 0;
      if (attempts > 1) {
        return "last-hope";
      }
      return attempts === 1 || act === "finale" ? "platform" : "story-victory";
    }
    case "defeat":
      return outcome.cause === "story" ? "story-defeat" : "threat-defeat";
    case "victory-stub":
      return "legacy-victory";
  }
}

/**
 * The headline, tagline and tone for `outcome`.
 *
 * @param outcome - How the campaign ended.
 * @param act - The act it ended in, when known (see `outcomeVariant`).
 */
export function outcomeCopy(outcome: GameOutcome, act?: ActId): OutcomeCopy {
  return OUTCOME_COPY[outcomeVariant(outcome, act)];
}
