/* global requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const candidate = process.env.CAPTURE_BASE_URL ?? "http://localhost:4199";
const baseline = process.env.BASELINE_BASE_URL ?? "http://localhost:4198";
const output = "docs/design/diagnostics/947";
mkdirSync(output, { recursive: true });
const records = process.argv.includes("--resume")
  ? JSON.parse(readFileSync(`${output}/captures.json`, "utf8")).records
  : [];
for (const record of records) {
  const bytes = readFileSync(`${output}/${record.filename}`);
  if (
    sha256(bytes) !== record.sha256 ||
    (record.controlSha256 && sha256(bytes) !== record.controlSha256)
  )
    throw new Error(`Completed capture changed: ${record.filename}`);
}
const errors = [];
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
page.on("pageerror", (error) => errors.push(error.message));

/** Stable bytes, with a recorded hash for each actual rendered frame. */
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Load the same production indoor fixture on baseline or candidate. */
async function load(base, roof, yaw, units) {
  await page.mouse.move(-10, -10);
  await page.goto(
    `${base}/tools/art/preview/roof-cutaway.html?roof=${roof}&yaw=${yaw}&units=${units}&pointer=1`,
  );
  await page.locator('body[data-ready="true"]').waitFor({ timeout: 120000 });
}

/** Move the real browser pointer, then wait for the actual fade and drawn frame. */
async function move(x, y, strength) {
  await page.mouse.move(x, y);
  await page.waitForFunction(
    (expected) => globalThis.__cutawayState().pointerStrength === expected,
    strength,
    { timeout: 20000 },
  );
  await page.evaluate(
    async (frames) => {
      for (let i = 0; i < frames; i++)
        await new Promise((resolve) => requestAnimationFrame(resolve));
    },
    strength === 0 ? 20 : 2,
  );
  if (
    (await page.evaluate(() => globalThis.__cutawayState().pointerStrength)) !==
    strength
  )
    throw new Error("Pointer changed after settling");
}

/** Save a frame with live uniforms and optional exact baseline equality. */
async function capture(filename, pointer, control) {
  const state = await page.evaluate(() => globalThis.__cutawayState());
  if (state.pointerRadius !== 3) throw new Error("Wrong pointer radius");
  const completed = records.find((record) => record.filename === filename);
  const bytes = completed
    ? readFileSync(`${output}/${filename}`)
    : await page.screenshot({ timeout: 120000 });
  if (control && !bytes.equals(control))
    throw new Error(`Control changed: ${filename}`);
  if (completed) {
    console.log(`${filename}: retained verified capture`);
    return bytes;
  }
  writeFileSync(`${output}/${filename}`, bytes);
  records.push({
    filename,
    url: page.url(),
    pointer,
    state,
    sha256: sha256(bytes),
    ...(control
      ? { controlSha256: sha256(control), byteIdenticalToControl: true }
      : {}),
  });
  writeFileSync(
    `${output}/captures.json`,
    JSON.stringify(
      { baselineCommit: process.env.BASELINE_COMMIT ?? "3c04481", records },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `${filename}${control ? ": byte-identical control" : ": captured"}`,
  );
  return bytes;
}

try {
  for (const roof of ["pitched", "flat"]) {
    for (const yaw of [0, 2]) {
      const prefix = `${roof}-yaw${yaw}`;
      if (
        [
          "open-ground",
          "hover",
          "hover-shifted",
          "pointer-left",
          "squad-only",
          "overlap",
          "overlap-left",
        ].every((suffix) =>
          records.some(
            (record) => record.filename === `${prefix}-${suffix}.png`,
          ),
        )
      )
        continue;
      await load(baseline, roof, yaw, 0);
      const empty = await page.screenshot({ timeout: 120000 });
      await load(baseline, roof, yaw, 1);
      const squad = await page.screenshot({ timeout: 120000 });

      await load(candidate, roof, yaw, 0);
      await move(15, 475, 0);
      await capture(`${prefix}-open-ground.png`, [15, 475], empty);
      await move(600, 475, 1);
      await capture(`${prefix}-hover.png`, [600, 475]);
      await move(760, 405, 1);
      await capture(`${prefix}-hover-shifted.png`, [760, 405]);
      await move(-10, -10, 0);
      await capture(`${prefix}-pointer-left.png`, [-10, -10], empty);

      await load(candidate, roof, yaw, 1);
      await move(15, 475, 0);
      await capture(`${prefix}-squad-only.png`, [15, 475], squad);
      await move(760, 405, 1);
      await capture(`${prefix}-overlap.png`, [760, 405]);
      await move(-10, -10, 0);
      await capture(`${prefix}-overlap-left.png`, [-10, -10], squad);
    }
  }
} finally {
  await browser.close();
}
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "Pointer, overlap and exact closure controls verified against current main",
);
