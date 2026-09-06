/* global document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4199";
const output = "docs/design/diagnostics/937";
const rotated = process.argv.includes("--rotated");
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
  for (const units of rotated ? [2] : [1, 2]) {
    let opaque;
    for (const radius of rotated ? [2, 3, 4] : [0, 2, 3, 4, 5]) {
      const ghost = radius === 0 ? "0" : "1";
      const id = `${roof}-${units}-radius-${radius || "off"}${rotated ? "-yaw2" : ""}`;
      await page.goto(
        `${baseUrl}/tools/art/preview/roof-cutaway.html?roof=${roof}&units=${units}&radius=${radius || 2}&ghost=${ghost}&yaw=${rotated ? 2 : 0}`,
      );
      await page
        .locator('body[data-ready="true"]')
        .waitFor({ timeout: 120000 });
      const pixels = await page.screenshot({ path: `${output}/${id}.png` });
      const record = await page.evaluate(() => ({ ...document.body.dataset }));
      records.push({ id, url: page.url(), ...record });
      // Preserve each completed case if a long capture terminal is interrupted.
      writeFileSync(
        `${output}/${rotated ? "rotated" : "captures"}.json`,
        JSON.stringify(records, null, 2) + "\n",
      );
      if (radius === 0) opaque = pixels;
      else if (
        Number(record.ghostCount) !== units ||
        (opaque && pixels.equals(opaque))
      )
        throw new Error("The real controller must visibly reveal every centre");
      if (roof === "pitched" && units === 1 && radius === 4) {
        await page.keyboard.press("l");
        await page.locator('body[data-left="true"]').waitFor();
        await page.evaluate(async () => {
          for (let i = 0; i < 20; i++)
            await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        const closed = await page.screenshot({
          path: `${output}/pitched-1-radius-4-unit-left.png`,
        });
        if (!closed.equals(opaque))
          throw new Error(
            "The doubled reveal must close after the squad leaves",
          );
      }
      console.log(id);
    }
  }
}
writeFileSync(
  `${output}/${rotated ? "rotated" : "captures"}.json`,
  JSON.stringify(records, null, 2) + "\n",
);
if (errors.length) throw new Error(errors.join("\n"));
await page.close();
await browser.close();
console.log("Cutaway radius capture complete");
