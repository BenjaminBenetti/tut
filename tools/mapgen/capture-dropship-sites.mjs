/* global window, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { format } from "prettier";
// Run against the baseline checkout for before, then the fix for after.
const phase = process.argv[2] ?? "after";
const out =
  process.env.CAPTURE_OUTPUT ??
  `docs/design/diagnostics/911/generated/${phase}`;
mkdirSync(out, { recursive: true });
const controls = JSON.parse(
  readFileSync("docs/design/diagnostics/911/generated/cases.json", "utf8"),
);
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
let captureSize;
// The Map Lab controls expose presets only. For the measured 40×56 regression,
// feed its exact dimensions into the real recipe construction. No pass, tile,
// model or scene result is replaced. The metadata records this input override.
await page.route("**/src/mapgen-preview.ts*", async (route) => {
  if (typeof captureSize !== "object") return route.continue();
  const response = await route.fetch();
  const body = await response.text();
  // writeUrl and the real generation recipe both carry the control value;
  // replace only the recipe next to hooks, leaving the shipped UI untouched.
  const recipeMarker = /size: state\.size,\s*hooks: DEFAULT_MISSION_HOOKS,/;
  if (!recipeMarker.test(body))
    throw new Error("Recipe capture marker changed");
  await route.fulfill({
    response,
    body: body.replace(
      recipeMarker,
      "size: " +
        JSON.stringify(captureSize) +
        ",\n        hooks: DEFAULT_MISSION_HOOKS,",
    ),
  });
});
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
    captureSize = c.size;
    const query = new URLSearchParams({
      seed: c.seed,
      biome: c.biome,
      settlement: c.settlement,
      size: typeof c.size === "string" ? c.size : "small",
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
            recipeInput:
              typeof c.size === "object"
                ? "Capture supplies exact custom dimensions to Map Lab's real recipe; the preset URL alone does not reproduce this case."
                : "Unmodified Map Lab URL",
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
