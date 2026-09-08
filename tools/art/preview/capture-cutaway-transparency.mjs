/* global document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4199";
const original = "docs/design/diagnostics/937";
const output = `${original}/transparency`;
mkdirSync(output, { recursive: true });
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
// Preserve verified cases across an interrupted long capture session.
const records = process.argv.includes("--resume")
  ? JSON.parse(readFileSync(`${output}/captures.json`, "utf8"))
  : [];
for (const record of records) {
  const pixels = readFileSync(`${output}/${record.filename}`);
  if (createHash("sha256").update(pixels).digest("hex") !== record.sha256)
    throw new Error(`Completed capture changed: ${record.filename}`);
  if (
    record.unitLeftFrame &&
    !readFileSync(`${output}/${record.unitLeftFrame}`).equals(
      readFileSync(`${output}/${record.closedControl}`),
    )
  )
    throw new Error(`Completed closure changed: ${record.unitLeftFrame}`);
}

/** Capture a settled production scene with optional diagnostic uniform overrides. */
async function capture(query) {
  await page.goto(`${baseUrl}/tools/art/preview/roof-cutaway.html?${query}`);
  await page.locator('body[data-ready="true"]').waitFor({ timeout: 120000 });
  const record = await page.evaluate(() => ({ ...document.body.dataset }));
  return { record, pixels: await page.screenshot(), url: page.url() };
}

for (const roof of ["pitched", "flat"]) {
  for (const yaw of [0, 2]) {
    const occupancies = yaw === 0 ? [1, 2] : [2];
    if (
      occupancies.every((units) =>
        [0.35, 0.175, 0].every((floor) =>
          records.some(
            (record) =>
              record.filename ===
              `${roof}-${units}-floor-${floor}-yaw${yaw}.png`,
          ),
        ),
      )
    )
      continue;
    const closedControl = `${roof}-empty-closed-yaw${yaw}.png`;
    const empty = await capture(`roof=${roof}&units=0&ghost=0&yaw=${yaw}`);
    writeFileSync(`${output}/${closedControl}`, empty.pixels);
    if (
      yaw === 0 &&
      !empty.pixels.equals(readFileSync(`${original}/${roof}-empty-closed.png`))
    )
      throw new Error("Original empty-building control changed");
    for (const units of occupancies) {
      const query = `roof=${roof}&units=${units}&yaw=${yaw}`;
      for (const floor of [0.35, 0.175, 0]) {
        const filename = `${roof}-${units}-floor-${floor}-yaw${yaw}.png`;
        if (records.some((record) => record.filename === filename)) continue;
        const shot = await capture(`${query}&radius=4&floor=${floor}`);
        if (
          Number(shot.record.radius) !== 4 ||
          Number(shot.record.floor) !== floor ||
          Number(shot.record.ghostCount) !== units
        )
          throw new Error("Wrong radius, opacity floor or active unit count");
        writeFileSync(`${output}/${filename}`, shot.pixels);
        const record = {
          ...shot.record,
          url: shot.url,
          filename,
          sha256: createHash("sha256").update(shot.pixels).digest("hex"),
        };
        if (floor === 0.35) {
          const baseline = `${roof}-${units}-radius-4${yaw === 2 ? "-yaw2" : ""}.png`;
          if (!shot.pixels.equals(readFileSync(`${original}/${baseline}`)))
            throw new Error(`Original radius-4 control changed: ${baseline}`);
          record.originalControl = baseline;
          record.byteIdenticalToOriginal = true;
        }
        if (floor === 0.175) {
          // No overrides: prove the shipped settings produce the judged candidate.
          const runtime = await capture(query);
          if (
            runtime.record.radius !== "4" ||
            runtime.record.floor !== "0.175" ||
            !runtime.pixels.equals(shot.pixels)
          )
            throw new Error("Production defaults differ from candidate");
          await page.keyboard.press("l");
          await page.locator('body[data-left="true"]').waitFor();
          await page.evaluate(async () => {
            for (let i = 0; i < 20; i++)
              await new Promise((resolve) => requestAnimationFrame(resolve));
          });
          const closed = await page.screenshot();
          if (!closed.equals(empty.pixels))
            throw new Error(
              "Reveal did not close exactly after the force left",
            );
          record.runtimeMatchesCandidate = true;
          record.closesByteIdentically = true;
          record.closedControl = closedControl;
          record.unitLeftFrame = filename.replace(".png", "-units-left.png");
          writeFileSync(`${output}/${record.unitLeftFrame}`, closed);
        }
        records.push(record);
        writeFileSync(
          `${output}/captures.json`,
          JSON.stringify(records, null, 2) + "\n",
        );
        console.log(
          `${roof}, ${units} squads, yaw ${yaw}, floor ${floor}: captured and verified`,
        );
      }
    }
  }
}
if (errors.length) throw new Error(errors.join("\n"));
await page.close();
await browser.close();
console.log(
  "Transparency comparisons, production defaults and exact closure verified",
);
