/* global document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4199";
const chosenRadius = Number(process.argv[2] ?? 4);
const chosenFloor = Number(process.argv[3] ?? 0.175);
const output = `docs/design/diagnostics/937${chosenFloor === 0.35 ? "" : "/transparency"}`;
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const records = [];
for (const roof of ["pitched", "flat"]) {
  if (process.env.CAPTURE_ROOF && process.env.CAPTURE_ROOF !== roof) continue;
  // Closure must compare equal occupancy. The second flat-roof squad
  // contributes one pixel even with the controller off, so a frame that
  // still contains that squad is not an exact reference after it leaves.
  await page.goto(
    `${baseUrl}/tools/art/preview/roof-cutaway.html?roof=${roof}&units=0&ghost=0`,
  );
  await page.locator('body[data-ready="true"]').waitFor({ timeout: 120000 });
  const emptyClosed = await page.screenshot();
  const closedControl = `${roof}-empty-closed.png`;
  writeFileSync(`${output}/${closedControl}`, emptyClosed);
  for (const units of [1, 2]) {
    if (
      process.env.CAPTURE_UNITS &&
      Number(process.env.CAPTURE_UNITS) !== units
    )
      continue;
    // No uniform overrides: this must use the chosen production defaults.
    await page.goto(
      `${baseUrl}/tools/art/preview/roof-cutaway.html?roof=${roof}&units=${units}`,
    );
    await page.locator('body[data-ready="true"]').waitFor({ timeout: 120000 });
    const record = await page.evaluate(() => ({ ...document.body.dataset }));
    if (
      Number(record.radius) !== chosenRadius ||
      Number(record.floor) !== chosenFloor ||
      Number(record.ghostCount) !== units
    )
      throw new Error("Production default or active unit count is wrong");
    const pixels = await page.screenshot();
    const candidate =
      chosenFloor === 0.35
        ? `${roof}-${units}-radius-${chosenRadius}.png`
        : `${roof}-${units}-floor-${chosenFloor}-yaw0.png`;
    if (!pixels.equals(readFileSync(`${output}/${candidate}`)))
      throw new Error(
        `Production frame differs from reviewed candidate ${candidate}`,
      );
    await page.keyboard.press("l");
    await page.locator('body[data-left="true"]').waitFor();
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++)
        await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const closed = await page.screenshot();
    if (!closed.equals(emptyClosed)) {
      throw new Error("The reveal did not close after the force left");
    }
    if (roof === "pitched" && units === 1)
      writeFileSync(
        `${output}/pitched-1-radius-${chosenRadius}-unit-left.png`,
        closed,
      );
    records.push({
      ...record,
      url: page.url(),
      candidate,
      closedControl,
      byteIdenticalToCandidate: true,
      closesByteIdentically: true,
      sha256: createHash("sha256").update(pixels).digest("hex"),
    });
    writeFileSync(
      `${output}/runtime.json`,
      JSON.stringify(records, null, 2) + "\n",
    );
    console.log(
      `${roof}, ${units} units: production matches candidate and closes`,
    );
  }
}
if (errors.length) throw new Error(errors.join("\n"));
writeFileSync(
  `${output}/runtime.json`,
  JSON.stringify(records, null, 2) + "\n",
);
await page.close();
await browser.close();
console.log("Production radius verified");
