import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * Fills localStorage to its quota with throwaway keys so the next
 * autosave write fails (the QA repro from #217). Clears the store first:
 * replacing an existing autosave with a same-size value would still fit.
 */
async function fillStorageToQuota(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    for (const size of [512 * 1024, 64 * 1024, 4 * 1024, 256, 16]) {
      const s = "x".repeat(size);
      for (let i = 0; ; i++) {
        try {
          localStorage.setItem(`fill-${size}-${i}`, s);
        } catch {
          break;
        }
      }
    }
  });
}

test("a failed autosave on New game shows a notice that survives navigation", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await fillStorageToQuota(page);

  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const notice = page.locator('[data-role="notice"]');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute("data-tone", "danger");
  await expect(notice).toContainText("Autosave failed");

  // It outlives the screen swap and can be dismissed.
  await page.locator('[data-action="main-menu"]').click();
  await expect(body).toHaveAttribute("data-screen", "main-menu");
  await expect(notice).toBeVisible();
  await page.locator('[data-action="dismiss-notice"]').click();
  await expect(notice).toBeHidden();

  expect(pageErrors).toEqual([]);
});
