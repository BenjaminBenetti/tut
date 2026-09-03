import { expect, test } from "@playwright/test";

/** Client-pixel box of an element, or null when it is not rendered. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * QA's repro for #291: at 800×600 the overworld top bar must stay one
 * line with its buttons, the outcome badge and a long status message
 * inside it. Since #298 the overworld hands over to the game-over screen
 * the moment a campaign ends, so the badge never lingers in a live
 * session; the test reveals it (and a long status) in place to measure
 * the layout deterministically.
 */
test("the overworld top bar stays one line at 800 px with the outcome badge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const boxes = await page.evaluate((): Record<string, Box | null> => {
    /** The DOM as this test needs it; the e2e tsconfig has no DOM library. */
    interface ElementLike {
      hidden: boolean;
      textContent: string | null;
      getBoundingClientRect(): Box;
    }
    interface DocumentLike {
      querySelector(selector: string): ElementLike | null;
    }
    const doc = (globalThis as { document?: DocumentLike }).document;
    if (!doc) {
      return {};
    }
    const badge = doc.querySelector('#top-bar [data-field="outcome"]');
    const status = doc.querySelector('#top-bar [data-role="status"]');
    if (badge) {
      badge.hidden = false;
      badge.textContent = "Campaign over · defeat";
    }
    if (status) {
      status.hidden = false;
      status.textContent =
        "Need 1,500 credits, have 320: the treasury cannot cover this build right now";
    }
    const rect = (selector: string): Box | null => {
      const el = doc.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      bar: rect("#top-bar"),
      badge: rect('#top-bar [data-field="outcome"]'),
      roster: rect('#top-bar [data-action="roster"]'),
      menu: rect('#top-bar [data-action="main-menu"]'),
      advance: rect('#top-bar [data-action="advance-day"]'),
      day: rect('#top-bar [data-field="day"]'),
    };
  });

  const bar = boxes.bar;
  if (!bar) throw new Error("no top bar");
  expect(bar.height).toBeLessThanOrEqual(44);
  for (const name of ["badge", "roster", "menu", "advance", "day"] as const) {
    const box = boxes[name];
    expect(box, name).not.toBeNull();
    if (!box) continue;
    expect(box.height, name).toBeLessThanOrEqual(bar.height);
    expect(box.y, name).toBeGreaterThanOrEqual(bar.y - 1);
    expect(box.y + box.height, name).toBeLessThanOrEqual(
      bar.y + bar.height + 1,
    );
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(800 + 1);
  }
  expect(errors).toEqual([]);
});
