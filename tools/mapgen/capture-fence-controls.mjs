/* global window, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
// Run against the baseline checkout for before, then the fix for after.
const phase = process.argv[2] ?? "after";
const out =
  process.env.CAPTURE_OUTPUT ?? `docs/design/diagnostics/917/${phase}`;
mkdirSync(out, { recursive: true });
const controls = [
  {
    id: "01-reported-fences",
    seed: "mc-opening-01",
    biome: "coastal",
    settlement: "rural",
    size: "small",
    focus: { x: 5, y: 2, z: 22 },
    pitch: 45,
    rotation: 0,
    cropHeight: 1000,
  },
  {
    id: "02-reported-fences-rotated",
    seed: "mc-opening-01",
    biome: "coastal",
    settlement: "rural",
    size: "small",
    focus: { x: 5, y: 2, z: 22 },
    pitch: 45,
    rotation: 1,
    cropHeight: 1000,
  },
  {
    id: "03-rural-trail-context",
    seed: "mc-opening-01",
    biome: "coastal",
    settlement: "rural",
    size: "small",
    focus: { x: 20, y: 2, z: 43 },
    pitch: 45,
    rotation: 0,
    cropHeight: 1000,
  },
  {
    id: "04-waterfront-boundary-control",
    seed: "mc-opening-03",
    biome: "coastal",
    settlement: "city",
    size: "medium",
    focus: { x: 51, y: 1, z: 40 },
    pitch: 55,
    rotation: 0,
    cropHeight: 1000,
  },
  {
    id: "05-garden-boundary",
    seed: "mc-opening-01",
    biome: "coastal",
    settlement: "rural",
    size: "small",
    focus: { x: 40, y: 2, z: 18 },
    pitch: 45,
    rotation: 0,
    cropHeight: 1000,
  },
  {
    id: "06-rural-entrance-control",
    seed: "mc-opening-01",
    biome: "coastal",
    settlement: "rural",
    size: "small",
    focus: { x: 34, y: 2, z: 24 },
    pitch: 55,
    rotation: 0,
    cropHeight: 1000,
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
page.on("console", (message) => {
  if (
    message.type() === "error" ||
    /\[assets\].*failed to load/i.test(message.text())
  )
    errors.push(message.text());
});
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
    if (
      process.env.CAPTURE_ONLY &&
      !process.env.CAPTURE_ONLY.split(",").includes(c.id)
    )
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
      for (let i = 0; i < c.rotation; i++) rig.rotateRight();
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
      clip: { x: 790, y: 250, width: 1200, height: c.cropHeight },
      timeout: 120000,
    });
    writeFileSync(
      `${out}/${c.id}.json`,
      JSON.stringify(
        {
          ...c,
          url,
          viewport: { width: 2400, height: 1500 },
          clip: { x: 790, y: 250, width: 1200, height: c.cropHeight },
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
