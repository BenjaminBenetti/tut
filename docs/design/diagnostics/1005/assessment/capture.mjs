/* global window, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { format } from "prettier";
// Run against the baseline checkout for before, then the fix for after.
const phase = process.argv[2] ?? "after";
const out = `.git/mapgen-1005/captures/${phase}`;
const probe = process.env.WATER_PROBE ?? "baseline";
const runtime = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
mkdirSync(out, { recursive: true });
const cases = JSON.parse(readFileSync(".git/mapgen-1005/cases.json", "utf8"));
const controls = process.env.WATER_PROBES_MODE
  ? (
      process.env.WATER_PROBE_LIST ??
      "hide-ground,hide-models,no-water-shadows,no-water-receive"
    )
      .split(",")
      .map((probe) => ({ ...cases[1], id: probe, probe }))
  : cases;
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
await page.route(
  "**/src/graphics/view/tactical-map-view.ts*",
  async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const marker = "this.buildTiles();";
    if (!body.includes(marker))
      throw new Error("Map view capture marker changed");
    await route.fulfill({
      response,
      body: body.replace(marker, marker + " window.__waterCaptureMap=this;"),
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
    await page.goto(url, { waitUntil: "domcontentloaded" });
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
    const water = await page.evaluate((probe) => {
      const view = window.__waterCaptureMap;
      const rows = [];
      view.root.traverse((mesh) => {
        const ground = mesh.name.startsWith("tiles-ground:tile:water:");
        const model = mesh.name.startsWith("tiles-model:tile.ground.water:");
        if (!ground && !model) return;
        mesh.geometry.computeBoundingBox();
        const matrix = mesh.matrix.clone();
        if (mesh.isInstancedMesh) mesh.getMatrixAt(0, matrix);
        rows.push({
          name: mesh.name,
          count: mesh.count,
          visible: mesh.visible,
          castShadow: mesh.castShadow,
          receiveShadow: mesh.receiveShadow,
          bounds: mesh.geometry.boundingBox,
          matrix: matrix.toArray(),
        });
        if (
          (probe === "hide-ground" && ground) ||
          (probe === "hide-models" && model)
        )
          mesh.visible = false;
        if (probe === "no-water-shadows") mesh.castShadow = false;
        if (probe === "no-water-receive") mesh.receiveShadow = false;
        if (probe === "top-only" && ground) {
          const geometry = mesh.geometry.clone(),
            kept = [];
          const indices = geometry.index,
            normal = geometry.attributes.normal;
          for (let i = 0; i < indices.count; i += 3) {
            const tri = [
              indices.getX(i),
              indices.getX(i + 1),
              indices.getX(i + 2),
            ];
            if (tri.every((v) => normal.getY(v) > 0.99)) kept.push(...tri);
          }
          geometry.setIndex(kept);
          mesh.geometry = geometry;
        }
      });
      if (probe === "no-shadows")
        window.__materialCaptureRenderer.shadowMap.enabled = false;
      return {
        probe,
        meshes: rows,
        waterTiles: view.map.tiles.filter((t) => t.surface === "water"),
      };
    }, c.probe ?? probe);
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
            runtime,
            water,
            pngSha256: createHash("sha256")
              .update(readFileSync(`${out}/${c.id}.png`))
              .digest("hex"),
            url,
            viewport: { width: 2400, height: 1500 },
            clip: c.clip,
            camera,
            actualPitch: camera.zoom * Math.sqrt(2 / 3),
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
