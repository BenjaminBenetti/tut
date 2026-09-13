import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Waits until the bug phase has finished playing on the map (#1130).
 *
 * `End turn` resolves the whole round at once, but the screen holds the
 * player's controls — End turn, clicks, action keys and the test hooks
 * that stand in for them — until the last bug has finished moving, and
 * says so with `data-phase-playing` on the body. A spec that ends a turn
 * and then drives a unit has to wait this out, or its hooks are dropped
 * exactly as a player's clicks would be.
 *
 * @param page - The page in a tactical mission.
 * @param timeout - How long a visible bug phase may take to play.
 */
export async function waitForBugPhasePlayed(
  page: Page,
  timeout = 60_000,
): Promise<void> {
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-phase-playing",
    "true",
    { timeout },
  );
}
