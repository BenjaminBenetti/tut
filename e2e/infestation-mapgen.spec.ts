import { expect, test } from "@playwright/test";

/** The real Map Lab loads shell art, regenerates from the dial and preserves shared state. */
test("Resin Shell infestation slider controls art and survives reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /failed to load/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto(
    "/mapgen-preview.html?seed=resin-review&biome=temperate&settlement=town&size=small&models=1&infestation=0",
  );
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-models-ready", "true");
  const slider = page.getByRole("slider", { name: /Infestation Level/ });
  await expect(slider).toHaveAttribute("min", "0");
  await expect(slider).toHaveAttribute("max", "10");
  await expect(slider).toHaveAttribute("step", "1");
  await expect(body).toHaveAttribute("data-infested-tiles", "0");
  const baselineAscii = await page.locator("#ascii").textContent();
  await page.locator("#level").fill("2");
  await slider.fill("4");
  await expect(body).toHaveAttribute("data-infestation-level", "4");
  await expect(body).toHaveAttribute("data-models-ready", "true");
  const middle = Number(await body.getAttribute("data-infested-tiles"));
  expect(middle).toBeGreaterThan(0);
  await expect(page.locator("#level")).toHaveValue("2");
  await slider.fill("10");
  await expect(body).toHaveAttribute("data-infestation-level", "10");
  await expect(body).toHaveAttribute("data-models-ready", "true");
  expect(
    Number(await body.getAttribute("data-infested-tiles")),
  ).toBeGreaterThan(middle);
  await expect(page.locator("#stats")).toContainText("×2 movement");
  await expect(page).toHaveURL(/infestation=10/);
  await expect(page).toHaveURL(/models=1/);
  expect(await page.locator("#ascii").textContent()).toBe(baselineAscii);
  await page.reload();
  await expect(body).toHaveAttribute("data-models-ready", "true");
  await expect(slider).toHaveValue("10");
  await slider.fill("0");
  await expect(body).toHaveAttribute("data-infested-tiles", "0");
  await expect(body).toHaveAttribute("data-models-ready", "true");
  await expect(page.locator("#status")).toBeEmpty();
  expect(await page.locator("#ascii").textContent()).toBe(baselineAscii);
  expect(errors).toEqual([]);
});
