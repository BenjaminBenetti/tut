/* global document */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { format } from "prettier";
import captureConfig from "./capture-vite.config.mjs";

const out = "docs/design/diagnostics/infestation";
mkdirSync(out, { recursive: true });
const server = await createServer({
  ...captureConfig,
  server: {
    ...captureConfig.server,
    port: 8797,
    strictPort: true,
    host: "127.0.0.1",
  },
});
await server.listen();
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
const records = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /failed to load/i.test(message.text()))
      errors.push(message.text());
  });
  for (const biome of ["temperate", "snowy", "desert", "coastal"]) {
    const levels = biome === "temperate" ? [0, 1, 4, 7, 10] : [10];
    const query = new URLSearchParams({
      seed: "resin-review",
      biome,
      settlement: "town",
      size: "small",
      models: "1",
      infestation: "0",
    });
    await page.goto(`http://127.0.0.1:8797/mapgen-preview.html?${query}`, {
      timeout: 120000,
    });
    await page
      .locator('body[data-models-ready="true"]')
      .waitFor({ timeout: 120000 });
    for (const level of levels) {
      await page
        .getByRole("slider", { name: /Infestation Level/ })
        .fill(String(level));
      await page
        .locator(
          `body[data-infestation-level="${level}"][data-models-ready="true"]`,
        )
        .waitFor({ timeout: 120000 });
      const name = `${biome}-level-${level}`;
      await page.screenshot({ path: `${out}/${name}.png` });
      records.push({
        name,
        url: page.url().replace("http://127.0.0.1:8797", ""),
        ...(await page.evaluate(() => ({
          infestedTiles: Number(document.body.dataset.infestedTiles),
          stats: document.querySelector("#stats").textContent,
        }))),
      });
      console.log(name);
    }
    if (biome === "temperate") {
      await page.locator("#level").fill("6");
      await page.screenshot({ path: `${out}/temperate-level-10-cutaway.png` });
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    `${out}/captures.json`,
    await format(JSON.stringify({ errors, records }), { parser: "json" }),
  );
} finally {
  await browser.close();
  await server.close();
}
