import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The action wheel's root. */
export function wheel(page: Page): Locator {
  return page.locator("#radial-menu");
}

/** One entry on the open wheel, by its id: `overwatch`, `reload`, `extract`, `move:x,y,z`, `attack:<target>`. */
export function wheelItem(page: Page, id: string): Locator {
  return page.locator(`#radial-menu button[data-item="${id}"]`);
}

/**
 * Opens a unit's own action wheel: selects it, then clicks it again
 * (#1112). Waits for the unit's mesh first, because the wheel anchors to
 * where the unit is drawn and opens nowhere until it is.
 *
 * Idempotent: on a unit that is already selected the first click opens
 * the wheel and the second re-draws it in place.
 */
export async function openUnitWheel(page: Page, unitId: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id) !==
          undefined,
        unitId,
      ),
    )
    .toBe(true);
  const select = (): Promise<void> =>
    page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      unitId,
    );
  await select();
  if ((await wheel(page).getAttribute("data-open")) !== "true") {
    await select();
  }
  await expect(wheel(page)).toHaveAttribute("data-open", "true");
}

/**
 * Opens the wheel on a tile, as a left click there does (#1112). The
 * selected unit must be the player's; a bug's selection opens nothing.
 */
export async function openTileWheel(
  page: Page,
  tile: { x: number; y: number; z: number },
): Promise<void> {
  await page.evaluate(
    (t) => (globalThis as HookGlobal).__tutTactical__?.selectTile(t),
    tile,
  );
  await expect(wheel(page)).toHaveAttribute("data-open", "true");
}
