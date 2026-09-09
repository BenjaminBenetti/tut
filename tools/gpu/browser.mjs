/* global document */
import { chromium } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";

export const IGPU_NODE = "/dev/dri/renderD129";
const SWIFTSHADER = [
  "--use-angle=swiftshader",
  "--use-gl=angle",
  "--enable-unsafe-swiftshader",
];

/** Evidence and CI remain software even when a shell has opted into the iGPU. */
export function renderingMode(env, purpose = "evidence") {
  if (!["evidence", "survey", "play"].includes(purpose))
    throw new Error(`Unknown browser purpose: ${purpose}`);
  return env.TUT_GPU === "1" && !env.CI && purpose !== "evidence"
    ? "igpu"
    : "swiftshader";
}

/** Refuse a missing device, the discrete node, or an unexpected PCI identity. */
export function assertDevice({ present, discrete, character, vendor, device }) {
  if (
    !present ||
    !character ||
    discrete ||
    vendor !== "0x1002" ||
    device !== "0x13c0"
  )
    throw new Error(
      "iGPU access requires only renderD129, a character device identifying AMD 1002:13c0; use the approved rebuilt container",
    );
}

/** A successful context is insufficient: software fallback is not GPU access. */
export function assertRenderer(mode, renderer) {
  const software = /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
  if (
    (mode === "swiftshader" && !/swiftshader/i.test(renderer)) ||
    (mode === "igpu" &&
      (software || !/AMD|Radeon|radeonsi|RADV/i.test(renderer)))
  )
    throw new Error(`${mode} renderer was not verified: ${renderer}`);
}

/** Launch a measured backend for surveys/play; existing evidence tools stay unchanged. */
export async function launchWorkBrowser({
  purpose = "evidence",
  env = process.env,
  headless = true,
} = {}) {
  const mode = renderingMode(env, purpose);
  if (mode === "igpu") {
    const present = existsSync(IGPU_NODE);
    const pci = "/sys/class/drm/renderD129/device/";
    assertDevice({
      present,
      discrete: existsSync("/dev/dri/renderD128"),
      character: present && statSync(IGPU_NODE).isCharacterDevice(),
      vendor: present && readFileSync(pci + "vendor", "utf8").trim(),
      device: present && readFileSync(pci + "device", "utf8").trim(),
    });
  }
  const launchEnv = { ...env };
  if (mode === "igpu") {
    launchEnv.DRI_PRIME = "1002:13c0";
    launchEnv.MESA_VK_DEVICE_SELECT = "1002:13c0!";
  }
  // Candidate backends are accepted only after observing the actual WebGL driver.
  const candidates =
    mode === "swiftshader"
      ? [SWIFTSHADER]
      : [
          [
            "--enable-gpu",
            "--use-angle=vulkan",
            "--enable-features=Vulkan",
            "--disable-vulkan-surface",
          ],
          ["--enable-gpu", "--use-gl=egl"],
        ];
  const failures = [];
  for (const args of candidates) {
    let browser;
    try {
      browser = await chromium.launch({
        headless,
        // New headless supports hardware; use the same channel for both survey modes.
        ...(purpose === "evidence" ? {} : { channel: "chromium" }),
        args,
        env: launchEnv,
        timeout: 30000,
      });
      const page = await browser.newPage();
      const renderer = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        const extension = gl?.getExtension("WEBGL_debug_renderer_info");
        const name = extension
          ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
          : "unavailable";
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
        return name;
      });
      assertRenderer(mode, renderer);
      const cdp = await browser.newBrowserCDPSession();
      const { gpu } = await cdp.send("SystemInfo.getInfo");
      await cdp.detach();
      await page.close();
      return {
        browser,
        report: {
          mode,
          renderer,
          args,
          gpu,
          device: mode === "igpu" ? IGPU_NODE : null,
        },
      };
    } catch (error) {
      failures.push(String(error));
      await browser?.close();
    }
  }
  throw new Error(`No verified ${mode} backend:\n${failures.join("\n")}`);
}
