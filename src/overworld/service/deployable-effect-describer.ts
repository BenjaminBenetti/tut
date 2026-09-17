import type { DeployableLevel } from "../model/deployable-level";
import { nextDeployableLevel } from "../model/deployable-level";
import type {
  DeployableEffect,
  DeployableType,
} from "../model/deployable-type";
import { DEPLOYABLE_EFFECT_KEYS, levelSpec } from "../model/deployable-type";

// ===========================================
// Types
// ===========================================

/** What the next level would cost and add, for an upgrade prompt. */
export interface DeployableNextLevelDescription {
  readonly level: DeployableLevel;
  /** Credits the upgrade costs. */
  readonly cost: number;
  /** Upkeep per day after the upgrade. */
  readonly upkeepPerDay: number;
  /** One line per effect axis, phrased as the change from the current level. */
  readonly deltas: readonly string[];
}

/**
 * A player-facing account of one level of a type (GDD §5.6): what it
 * does, what it costs to run, and what the next level would add. Built
 * from the catalogue so a popover can never drift from the rules.
 */
export interface DeployableEffectDescription {
  readonly level: DeployableLevel;
  /** One line per effect axis at this level, e.g. `"Slows infestation growth by 25%"`. */
  readonly effects: readonly string[];
  /** Credits to build (level 1) or to reach this level (2, 3). */
  readonly cost: number;
  /** Credits per day at this level. */
  readonly upkeepPerDay: number;
  /** The next level, or absent at the top. */
  readonly next?: DeployableNextLevelDescription;
}

// ===========================================
// Public Functions
// ===========================================

/**
 * Describes `type` at `level`: effect lines, cost and upkeep, plus the
 * next level's price and per-axis deltas when there is one. Pure.
 *
 * ```
 *   Sensor array, level 1
 *     effects: ["Finds infested cities at 60% of the usual infestation",
 *               "Missions stay on offer 1 day longer"]
 *     cost 800 · upkeep 20/day
 *     next: level 2 · 1,000 · upkeep 35/day
 *       ["Finds infested cities at 40% (from 60%)",
 *        "Missions stay on offer 2 days longer (from 1)"]
 * ```
 */
export function describeDeployableEffect(
  type: DeployableType,
  level: DeployableLevel,
): DeployableEffectDescription {
  const spec = levelSpec(type, level);
  const base: DeployableEffectDescription = {
    level,
    effects: describeEffect(spec.effect),
    cost: spec.buildCost,
    upkeepPerDay: spec.upkeepPerDay,
  };
  const nextLevel = nextDeployableLevel(level);
  if (nextLevel === undefined) {
    return base;
  }
  const nextSpec = levelSpec(type, nextLevel);
  return {
    ...base,
    next: {
      level: nextLevel,
      cost: nextSpec.buildCost,
      upkeepPerDay: nextSpec.upkeepPerDay,
      deltas: describeEffectDelta(spec.effect, nextSpec.effect),
    },
  };
}

/**
 * One line per axis of `effect`, in `DEPLOYABLE_EFFECT_KEYS` order,
 * skipping axes the effect leaves alone.
 */
export function describeEffect(effect: DeployableEffect): string[] {
  const lines: string[] = [];
  for (const key of DEPLOYABLE_EFFECT_KEYS) {
    const value = effect[key];
    if (value !== undefined) {
      lines.push(describeAxis(key, value));
    }
  }
  return lines;
}

/**
 * One line per axis that `to` sets, phrased as the change from `from`:
 * `"Slows infestation growth by 45% (from 25%)"`. An axis `to` sets that
 * `from` lacks reads as a plain effect line.
 */
export function describeEffectDelta(
  from: DeployableEffect,
  to: DeployableEffect,
): string[] {
  const lines: string[] = [];
  for (const key of DEPLOYABLE_EFFECT_KEYS) {
    const after = to[key];
    if (after === undefined) {
      continue;
    }
    const before = from[key];
    lines.push(
      before === undefined
        ? describeAxis(key, after)
        : `${describeAxis(key, after)} (from ${axisValue(key, before)})`,
    );
  }
  return lines;
}

/** The effect lines of `type` at `level` joined with `" · "`, for a one-line label. */
export function summarizeDeployableEffect(
  type: DeployableType,
  level: DeployableLevel,
): string {
  return describeEffect(levelSpec(type, level).effect).join(" · ");
}

// ===========================================
// Private Functions
// ===========================================

/** The sentence for one axis at `value`. */
function describeAxis(key: keyof DeployableEffect, value: number): string {
  switch (key) {
    case "detectionFactor":
      return `Finds infested cities at ${axisValue(key, value)} of the usual infestation`;
    case "intelBonus":
      return `Missions stay on offer ${axisValue(key, value)} longer`;
    case "growthFactor":
      return `Slows infestation growth by ${axisValue(key, value)}`;
    case "spreadDeterrence":
      return `Fresh landings ${axisValue(key, value)} rarer`;
    case "garrisonTurrets":
      return `${axisValue(key, value)} on every mission map`;
    case "incomeBonus":
      return `${axisValue(key, value)} to the daily stipend`;
  }
}

/** The short form of one axis' value, for the sentence and the "(from …)" tail. */
function axisValue(key: keyof DeployableEffect, value: number): string {
  switch (key) {
    case "detectionFactor":
      return percent(value);
    case "intelBonus":
      return plural(value, "day");
    case "growthFactor":
      return percent(1 - value);
    case "spreadDeterrence":
      return percent(value);
    case "garrisonTurrets":
      return plural(value, "garrison turret");
    case "incomeBonus":
      return `+${credits(value)}`;
  }
}

/** `0.25` → `"25%"`, rounded to a whole percent. */
function percent(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`;
}

/** `1` → `"1 day"`, `2` → `"2 days"`. */
function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** `1500` → `"¢1,500"`, matching the UI's credit format without importing it. */
function credits(amount: number): string {
  return `¢${amount.toLocaleString("en-US")}`;
}
