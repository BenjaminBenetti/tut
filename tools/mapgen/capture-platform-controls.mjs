/* global window, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
// Run against the baseline checkout for before, then the fix for after.
const phase = process.argv[2] ?? "after";
const out = `docs/design/diagnostics/910/${phase}`;
mkdirSync(out, { recursive: true });
const controls = [
  {
    id: "01-critic-platform",
    seed: "mc-opening-01",
    biome: "temperate",
    size: "small",
    focus: { x: 33, y: 5, z: 30 },
    pitch: 60,
  },
  {
    id: "02-second-seed",
    seed: "mc-opening-02",
    biome: "temperate",
    size: "small",
    focus: { x: 32, y: 3, z: 34 },
    pitch: 55,
  },
  {
    id: "03-third-seed",
    seed: "mc-opening-03",
    biome: "temperate",
    size: "small",
    focus: { x: 24, y: 4, z: 33 },
    pitch: 55,
  },
  {
    id: "04-snowy-bed",
    seed: "mc-opening-02",
    biome: "snowy",
    size: "medium",
    focus: { x: 56, y: 4, z: 62 },
    pitch: 45,
  },
  {
    id: "05-desert-bed",
    seed: "mc-opening-02",
    biome: "desert",
    size: "medium",
    focus: { x: 55, y: 3, z: 61 },
    pitch: 45,
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
const page = await browser.newPage({ viewport: { width: 2400, height: 1500 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Capture-only access to the existing rig, preserving the shipped scene,
// geometry and camera methods. No gameplay or generation module is replaced.
await page.route(
  "**/src/graphics/service/orthographic-camera-rig.ts*",
  async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const marker = "this.state = createCameraState(initial);";
    if (!body.includes(marker))
      throw new Error("Camera constructor marker changed");
    await route.fulfill({
      response,
      body: body.replace(marker, marker + " window.__mapgenCaptureRig = this;"),
    });
  },
);
try {
  for (const c of controls) {
    const query = new URLSearchParams({
      seed: c.seed,
      biome: c.biome,
      settlement: "city",
      size: c.size,
      models: "1",
      units: "1",
      slope: "100",
    });
    const url = `${process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:5173"}/mapgen-preview.html?${query}`;
    await page.goto(url);
    await page
      .locator('body[data-models-ready="true"][data-preview-ready="true"]')
      .waitFor({ timeout: 120000 });
    console.log(c.id + " loaded");
    const camera = await page.evaluate(async (c) => {
      const rig = window.__mapgenCaptureRig;
      if (!rig) throw new Error("Capture camera not found");
      const target = {
        x: c.focus.x + 0.5,
        y: c.focus.y * 0.75 + 0.15,
        z: c.focus.z + 0.5,
      };
      rig.lookAt(target);
      rig.apply();
      const viewport = rig.getViewport();
      const project = (x, y, z) => {
        const v = rig.camera.position.clone().set(x, y, z).project(rig.camera);
        return {
          x: ((v.x + 1) * viewport.width) / 2,
          y: ((1 - v.y) * viewport.height) / 2,
        };
      };
      const a = project(target.x, target.y, target.z),
        b = project(target.x + 1, target.y, target.z);
      rig.zoomBy(c.pitch / Math.hypot(a.x - b.x, a.y - b.y));
      rig.apply();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return rig.getState();
    }, c);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `${out}/${c.id}.png`,
      clip: { x: 790, y: 250, width: 1200, height: 1000 },
      timeout: 120000,
    });
    writeFileSync(
      `${out}/${c.id}.json`,
      JSON.stringify(
        {
          ...c,
          url,
          viewport: { width: 2400, height: 1500 },
          clip: { x: 790, y: 250, width: 1200, height: 1000 },
          camera,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(c.id + " captured");
  }
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
