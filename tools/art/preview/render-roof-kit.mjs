/* global document */
/** Render a composed kit through the production roof fitter and SwiftShader. */
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { createServer } from "vite";
import captureConfig from "./capture-vite.config.mjs";

const [layout, output] = process.argv.slice(2);
if (!layout || !output)
  throw new Error("usage: render-roof-kit.mjs <layout.json> <out.png>");
const server = await createServer({
  ...captureConfig,
  server: {
    ...captureConfig.server,
    host: "127.0.0.1",
    port: 8796,
    strictPort: true,
  },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 960 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:8796/tools/art/preview/roof-kit.html?layout=/${layout}`,
  );
  await page.waitForFunction(() => document.title === "READY", null, {
    timeout: 60000,
  });
  if (errors.length) throw new Error(errors.join("\n"));
  await page.screenshot({ path: resolve(output) });
  console.log(`roof kit → ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
