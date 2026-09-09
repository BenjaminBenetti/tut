/* global requestAnimationFrame */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadavg } from "node:os";
import { assertRenderer, launchWorkBrowser } from "./browser.mjs";

// Non-evidence workload: identical map, viewport and screenshot in both modes.
const output = process.env.TUT_SURVEY_OUT ?? "test-results/gpu-maplab";
mkdirSync(output, { recursive: true });
const query = new URLSearchParams({
  seed: "mc-opening-01",
  biome: "coastal",
  settlement: "rural",
  size: "small",
  models: "1",
  units: "1",
  slope: "100",
});
const url = `${process.env.TUT_SURVEY_URL ?? "http://127.0.0.1:5173"}/mapgen-preview.html?${query}`;
const { browser, report } = await launchWorkBrowser({ purpose: "survey" });
try {
  const page = await browser.newPage({
    viewport: { width: 2400, height: 1500 },
  });
  const errors = [];
  // The standalone preview has no favicon; this is unrelated to model readiness.
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      /\[assets\].*failed to load/i.test(message.text())
    )
      errors.push(message.text());
  });
  const cdp = await browser.newBrowserCDPSession();
  const before = (await cdp.send("SystemInfo.getProcessInfo")).processInfo;
  const started = performance.now();
  await page.goto(url);
  await page
    .locator('body[data-models-ready="true"][data-preview-ready="true"]')
    .waitFor({ timeout: 120000 });
  await page.mouse.move(0, 0);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: `${output}/survey.png`, timeout: 120000 });
  const wallSeconds = (performance.now() - started) / 1000;
  const after = (await cdp.send("SystemInfo.getProcessInfo")).processInfo;
  const { gpu } = await cdp.send("SystemInfo.getInfo");
  assertRenderer(report.mode, gpu.auxAttributes.glRenderer ?? "unavailable");
  const processes = after.map(({ id, type, cpuTime }) => ({
    id,
    type,
    cpuSeconds:
      cpuTime - (before.find((process) => process.id === id)?.cpuTime ?? 0),
  }));
  if (errors.length) throw new Error(errors.join("\n"));
  const result = {
    ...report,
    gpu,
    purpose: "non-evidence survey",
    url,
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    chromium: browser.version(),
    capturedAt: new Date().toISOString(),
    viewport: page.viewportSize(),
    wallSeconds,
    processes,
    loadAverage: loadavg(),
    cpuMeasurement:
      "CDP cumulative CPU deltas for processes alive at completion; excludes exited processes, browser startup and Vite",
  };
  writeFileSync(
    `${output}/report.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      mode: report.mode,
      renderer: report.renderer,
      wallSeconds,
      processes,
      output,
    }),
  );
} finally {
  await browser.close();
}
