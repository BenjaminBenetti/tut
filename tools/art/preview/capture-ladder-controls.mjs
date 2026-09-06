/* global requestAnimationFrame, window, document */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
const phase = process.argv[2] ?? "before";
const output = `${process.cwd()}/docs/design/diagnostics/891/${phase}`;
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4173";
mkdirSync(output, { recursive: true });
const controls = [
  {
    id: "brick-two-layers",
    seed: "qa813-temperate-town-small-0",
    biome: "temperate",
    settlement: "town",
    size: "small",
    tile: {
      x: 30,
      y: 4,
      z: 36,
    },
    upper: {
      x: 30,
      y: 6,
      z: 35,
    },
  },
  {
    id: "concrete-four-layers",
    seed: "qa813-temperate-city-small-0",
    biome: "temperate",
    settlement: "city",
    size: "small",
    tile: {
      x: 5,
      y: 2,
      z: 34,
    },
    upper: {
      x: 5,
      y: 6,
      z: 33,
    },
  },
];
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const records = existsSync(`${output}/captures.json`)
  ? JSON.parse(readFileSync(`${output}/captures.json`, "utf8"))
  : [];
/** Waits for the scene to consume input and render its new camera. */
async function frame() {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
/** Projects a known map tile through the running Map Lab camera. */
async function screen(tile) {
  return page.evaluate(
    (t) => window.__tutTactical__?.tileScreenPosition(t),
    tile,
  );
}
/** Pans in fixed camera nudges until the target fits the crop. */
async function centre(control) {
  for (let i = 0; i < 40; i++) {
    const low = await screen(control.tile),
      high = await screen(control.upper);
    const p =
      low && high
        ? { x: (low.x + high.x) / 2, y: (low.y + high.y) / 2 }
        : undefined;
    if (!p) throw new Error(`Tile not found ${JSON.stringify(control)}`);
    const dx = p.x - 990,
      dy = p.y - 440;

    if (Math.abs(dx) <= 49 && Math.abs(dy) <= 49) return p;
    await page.keyboard.press(
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "d" : "a") : dy > 0 ? "s" : "w",
    );
    await frame();
  }
  throw new Error("Could not centre target");
}
for (const c of controls) {
  if (records.some((r) => r.id === c.id) && existsSync(`${output}/${c.id}.png`))
    continue;
  const query = new URLSearchParams({
    seed: c.seed,
    biome: c.biome,
    settlement: c.settlement,
    size: c.size,
    models: "1",
    units: "1",
    slope: "100",
  });
  await page.goto(`${baseUrl}/mapgen-preview.html?${query}`);
  await page
    .locator('body[data-models-ready="true"]')
    .waitFor({ timeout: 120000 });
  await page
    .locator('body[data-preview-ready="true"]')
    .waitFor({ timeout: 120000 });
  await page.mouse.move(990, 440);
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 800);
  await frame();
  let pitch = 0;
  for (let i = 0; i < 24; i++) {
    await centre(c);
    const p = await screen(c.tile);
    let q;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      q = await screen({ ...c.tile, x: c.tile.x + dx, z: c.tile.z + dz });
      if (q) break;
    }
    if (!q) throw new Error("No pitch reference");
    pitch = Math.hypot(q.x - p.x, q.y - p.y);
    if (Math.abs(pitch - 140) < 0.8) break;
    await page.mouse.wheel(0, -Math.log(140 / pitch) / 0.0015);
    await frame();
  }
  const p = await centre(c);
  await page.mouse.move(0, 0);
  await frame();
  await page.screenshot({
    timeout: 120000,
    path: `${output}/${c.id}.png`,
    clip: {
      x: Math.round(p.x - 300),
      y: Math.round(p.y - 300),
      width: 600,
      height: 600,
    },
  });
  records.push({ ...c, pitch, pixel: p });
  writeFileSync(`${output}/captures.json`, JSON.stringify(records, null, 2));
  console.log(`${c.id}: ${pitch.toFixed(2)} px/tile`);
}
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
