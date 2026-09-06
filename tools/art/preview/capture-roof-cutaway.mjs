/* global requestAnimationFrame, document */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const phase = process.argv[2] ?? "after";
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4173";
const output = `docs/design/diagnostics/916/${phase}`;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const records = [];
for (const roof of ["pitched", "flat"]) {
  let opaque;
  for (const ghost of ["0", "1"]) {
    await page.goto(
      `${baseUrl}/tools/art/preview/roof-cutaway.html?roof=${roof}&ghost=${ghost}`,
    );
    await page.locator('body[data-ready="true"]').waitFor({ timeout: 120000 });
    const id = `${roof}-ghost-${ghost}`;
    const pixels = await page.screenshot({
      path: `${output}/${id}.png`,
      timeout: 120000,
    });
    if (ghost === "0") opaque = pixels;
    if (phase === "after" && ghost === "1" && pixels.equals(opaque))
      throw new Error(
        "Controller is active but its cutaway changed no rendered pixels",
      );
    const record = await page.evaluate(() => ({ ...document.body.dataset }));
    records.push({ id, url: page.url(), ...record });
    if (ghost === "1" && Number(record.ghostCount) !== 1)
      throw new Error("The real controller did not open a cutaway");
    if (ghost === "1" && roof === "pitched") {
      await page.keyboard.press("l");
      await page.locator('body[data-left="true"]').waitFor();
      await page.evaluate(async () => {
        for (let i = 0; i < 20; i++)
          await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      const closed = await page.screenshot({
        path: `${output}/pitched-unit-left.png`,
        timeout: 120000,
      });
      if (phase === "after" && !closed.equals(opaque))
        throw new Error(
          "The pitched roof did not return to its closed frame after the unit left",
        );
    }
    console.log(`${phase}: ${id}`);
  }
}
writeFileSync(
  `${output}/cutaway.json`,
  JSON.stringify(records, null, 2) + "\n",
);
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
