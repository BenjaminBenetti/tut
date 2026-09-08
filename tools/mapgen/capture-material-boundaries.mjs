/* global window, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { format } from "prettier";
// Run against the baseline checkout for before, then the fix for after.
const phase = process.argv[2] ?? "after";
const out = `docs/design/diagnostics/945/${phase}`;
mkdirSync(out, { recursive: true });
const controls = [
  {
    id: "01-coastal",
    seed: "mc-opening-01",
    biome: "coastal",
    settlement: "rural",
    size: "small",
    pitch: 45,
    clip: {
      x: 839,
      y: 230,
      width: 1200,
      height: 1000,
    },
    rotation: 0,
    focus: {
      x: 5,
      y: 2,
      z: 22,
    },
  },
  {
    id: "02-coastal-rotated",
    seed: "mc-opening-01",
    biome: "coastal",
    settlement: "rural",
    size: "small",
    pitch: 45,
    clip: {
      x: 742,
      y: 203,
      width: 1200,
      height: 1000,
    },
    rotation: 1,
    focus: {
      x: 5,
      y: 2,
      z: 22,
    },
  },
  {
    id: "03-snowy",
    seed: "mc-opening-02",
    biome: "snowy",
    settlement: "city",
    size: "medium",
    pitch: 45,
    clip: {
      x: 823,
      y: 216,
      width: 1200,
      height: 900,
    },
    rotation: 0,
    focus: {
      x: 56,
      y: 2,
      z: 62,
    },
  },
  {
    id: "04-snowy-rotated",
    seed: "mc-opening-02",
    biome: "snowy",
    settlement: "city",
    size: "medium",
    pitch: 45,
    clip: {
      x: 755,
      y: 280,
      width: 1200,
      height: 900,
    },
    rotation: 1,
    focus: {
      x: 56,
      y: 2,
      z: 62,
    },
  },
  {
    id: "05-snowy-trail-control",
    seed: "mc-resume-01",
    biome: "snowy",
    settlement: "rural",
    size: "small",
    pitch: 45,
    clip: {
      x: 695,
      y: 218,
      width: 1300,
      height: 1050,
    },
    rotation: 0,
    focus: {
      x: 13,
      y: 3,
      z: 24,
    },
  },
  {
    id: "06-waterfront-control",
    seed: "mc-opening-03",
    biome: "coastal",
    settlement: "city",
    size: "medium",
    pitch: 55,
    rotation: 0,
    clip: {
      x: 790,
      y: 250,
      width: 1200,
      height: 1000,
    },
    focus: {
      x: 51,
      y: 1,
      z: 40,
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
const page = await browser.newPage({ viewport: { width: 2400, height: 1500 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(m.text());
    console.log("PAGE ERROR: " + m.text());
  }
});
await page.route("**/src/graphics/service/scene-service.ts*", async (route) => {
  const response = await route.fetch();
  const body = await response.text();
  const marker = "this.renderer.setPixelRatio(window.devicePixelRatio);";
  if (!body.includes(marker))
    throw new Error("Renderer capture marker changed");
  await route.fulfill({
    response,
    body: body.replace(
      marker,
      marker + " window.__materialCaptureRenderer=this.renderer;",
    ),
  });
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
    const url = `${process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:5177"}/mapgen-preview.html?${query}`;
    const started = performance.now();
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
    const rendering = await page.evaluate(async () => {
      const times = [];
      const r = window.__materialCaptureRenderer;
      const gl = r.getContext();
      gl.finish();
      let previous = performance.now();
      for (let i = 0; i < 12; i++) {
        await new Promise(requestAnimationFrame);
        gl.finish();
        const now = performance.now();
        if (i > 3) times.push(now - previous);
        previous = now;
      }
      return {
        timingMethod:
          "RAF interval with gl.finish(), discard first four of twelve frames; software renderer, not a hardware FPS claim",
        frameMs: times,
        render: { ...r.info.render },
        memory: { ...r.info.memory },
        programs: r.info.programs.length,
      };
    });
    await page.screenshot({
      path: `${out}/${c.id}.png`,
      clip: c.clip,
      timeout: 120000,
    });
    writeFileSync(
      `${out}/${c.id}.json`,
      await format(
        JSON.stringify(
          {
            ...c,
            url,
            viewport: { width: 2400, height: 1500 },
            clip: c.clip,
            camera,
            rendering,
            elapsedMs: performance.now() - started,
          },
          null,
          2,
        ),
        { parser: "json" },
      ),
    );
    console.log(c.id + " captured");
  }
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
