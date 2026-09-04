import { expect, test } from "@playwright/test";

/**
 * The map preview with `units=1` builds the tactical scene (#337): the
 * generated map plus a rifle squad, the starter mech and a swarmer on
 * the map's hooks, drawn from the model manifest. `body[data-units]`
 * is set once every model has loaded and been placed.
 */
test("tactical scene renders a generated map with units and no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto(
    "/mapgen-preview.html?seed=smoke&biome=coastal&settlement=town&size=small&units=1",
  );
  const body = page.locator("body");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  // `ready` says the page mounted and drew a frame; the units arrive
  // behind a model load it does not wait for (#688).
  await expect(body).toHaveAttribute("data-preview-ready", "true");
  await expect(body).toHaveAttribute("data-units", "3");
  await expect(page.locator("#status")).toBeEmpty();
  expect(errors).toEqual([]);
});
