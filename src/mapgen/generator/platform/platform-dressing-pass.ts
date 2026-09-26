import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { MapDraft } from "../../model/map-draft";
import type { PlatformLayout } from "../../model/platform-layout";
import type { ColumnCoord } from "../../model/road";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import { isPassableGround } from "../../service/draft-queries";
import { dressCore } from "./core-dressing";
import { dressHull } from "./hull-dressing";
import {
  PlatformPropStamp,
  reopenPlatformPockets,
} from "./platform-prop-stamp";

// ===========================================
// PlatformDressingPass
// ===========================================

/**
 * Dresses either stage of the spore platform (#1179) with the
 * infestation kit and carapace walls, by the layout's stage: the hull's
 * buttresses, ring cradle, pods, rib walls and clutter, or the core
 * chamber's rim wall, niche buttresses, rib cage and arteries. A last
 * flood fill lifts any prop that cut a pocket of deck off the routes.
 *
 * ```
 *   hull-deck ─► dropship-sites ─► platform-dressing   (after: landing-sites)
 *   core-chamber ─────────────────► platform-dressing
 * ```
 */
export class PlatformDressingPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "platform-dressing";
  readonly requires: readonly DraftCapability[];
  readonly provides: readonly DraftCapability[] = ["props"];

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Dresses by `tuning`. `after` names what must be on the draft first
   * beyond the layout: the hull waits for its landing site so nothing
   * stands where the drop ship docks.
   */
  constructor(
    private readonly tuning: SporePlatformTuning,
    after: readonly DraftCapability[] = [],
  ) {
    this.requires = ["platform", ...after];
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Places the stage's props, then reopens anything they sealed off. */
  run(context: GenerationContext): void {
    const { draft, registries, rng, diagnostics } = context;
    const layout = draft.platform;
    if (layout === undefined) {
      diagnostics.note("no platform layout: nothing to dress");
      return;
    }
    const stamp = new PlatformPropStamp(draft, registries, layout);
    const before = draft.props.length;
    if (layout.stage === "hull") {
      dressHull(stamp, draft, layout, this.tuning, rng.fork("hull"));
    } else {
      dressCore(stamp, draft, layout, this.tuning, rng.fork("core"));
    }
    const origin = routeOrigin(draft, layout);
    const lifted =
      origin === undefined ? 0 : reopenPlatformPockets(draft, layout, origin);
    diagnostics.note(
      `platform dressing (${layout.stage}): ` +
        `${String(draft.props.length - before + lifted)} props, ` +
        `${String(lifted)} lifted to reopen pockets`,
    );
  }
}

/** The first passable column of the first route: where the pocket flood starts. */
function routeOrigin(
  draft: MapDraft,
  layout: PlatformLayout,
): ColumnCoord | undefined {
  for (const route of layout.routes) {
    const column = route.path.find((c) => isPassableGround(draft, c.x, c.z));
    if (column !== undefined) return column;
  }
  return undefined;
}
