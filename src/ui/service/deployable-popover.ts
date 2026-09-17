import type { Deployable } from "../../overworld/model/deployable";
import type { DeployableType } from "../../overworld/model/deployable-type";
import { describeDeployableEffect } from "../../overworld/service/deployable-effect-describer";
import type { PopoverContent, PopoverLine } from "../model/popover-content";
import { formatCredits } from "./format";

// ===========================================
// Types
// ===========================================

/** What the build popover needs beyond the type: how many are held, and why it cannot be built. */
export interface BuildPopoverContext {
  /** Installations of this type already in the region. */
  readonly held: number;
  /** Why the Build button is disabled, when it is; shown as a warning line. */
  readonly blocker?: string | undefined;
}

// ===========================================
// Constants
// ===========================================

/** What the popover says at the top of the ladder. */
export const MAX_LEVEL_LINE = "Max level";

// ===========================================
// Building
// ===========================================

/**
 * The popover for a Build button (#1155): the type's name over what it
 * does at level 1, what it costs to build and to run, and the region
 * cap. A blocker, when there is one, closes the popover as a warning
 * so a disabled button still says why. Pure: catalogue in, lines out.
 *
 * ```
 *   SENSOR ARRAY
 *   Finds infested cities at 60% of the usual infestation
 *   Missions stay on offer 1 day longer
 *   Build ¢800 · upkeep ¢20/day
 *   1 per region · 0/1 built
 *   Need ¢800, have ¢500               ◄── only while blocked
 * ```
 */
export function buildPopover(
  type: DeployableType,
  context: BuildPopoverContext,
): PopoverContent {
  const first = describeDeployableEffect(type, 1);
  const lines: PopoverLine[] = first.effects.map(body);
  lines.push(
    dim(
      `Build ${formatCredits(first.cost)} · upkeep ${formatCredits(first.upkeepPerDay)}/day`,
    ),
    dim(
      `${String(type.maxPerRegion)} per region · ${String(context.held)}/${String(type.maxPerRegion)} built`,
    ),
  );
  if (context.blocker !== undefined) {
    lines.push(warn(context.blocker));
  }
  return { title: type.name, lines };
}

/**
 * The popover for an installed row or a map hover (#1155): the type
 * and level over what it does now and its upkeep, then what the next
 * level would cost and add, or `Max level` at the top. Pure.
 *
 * ```
 *   DEFENSIVE BATTERY · L1 · ONLINE
 *   1 garrison turret on every mission map
 *   Upkeep ¢50/day
 *   Upgrade to L2 · ¢1,500 · upkeep ¢80/day
 *   2 garrison turrets on every mission map (from 1 garrison turret)
 * ```
 */
export function installedPopover(
  type: DeployableType,
  deployable: Deployable,
): PopoverContent {
  const now = describeDeployableEffect(type, deployable.level);
  const lines: PopoverLine[] = now.effects.map(body);
  lines.push(dim(`Upkeep ${formatCredits(now.upkeepPerDay)}/day`));
  if (now.next) {
    lines.push(
      heading(
        `Upgrade to L${String(now.next.level)} · ${formatCredits(now.next.cost)} · upkeep ${formatCredits(now.next.upkeepPerDay)}/day`,
      ),
      ...now.next.deltas.map(body),
    );
  } else {
    lines.push(heading(MAX_LEVEL_LINE));
  }
  return {
    title: `${type.name} · L${String(deployable.level)} · ${deployable.online ? "online" : "offline"}`,
    lines,
  };
}

// ===========================================
// Helpers
// ===========================================

/** A plain effect line. */
function body(text: string): PopoverLine {
  return { text, kind: "body" };
}

/** A cost or cap line, set small and dim. */
function dim(text: string): PopoverLine {
  return { text, kind: "dim" };
}

/** A line that opens the next-level block. */
function heading(text: string): PopoverLine {
  return { text, kind: "heading" };
}

/** Why something cannot be done. */
function warn(text: string): PopoverLine {
  return { text, kind: "warn" };
}
