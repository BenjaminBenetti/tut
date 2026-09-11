import { describe, expect, it, vi } from "vitest";
import {
  assertDevice,
  assertRenderer,
  launchWorkBrowser,
  renderingMode,
} from "./browser.mjs";

const launch = vi.hoisted(() => vi.fn());
vi.mock("@playwright/test", () => ({ chromium: { launch } }));
vi.mock("node:fs", () => ({
  existsSync: () => false,
  readFileSync: () => {
    throw new Error("Missing device must not read PCI files");
  },
  statSync: () => {
    throw new Error("Missing device must not be opened");
  },
}));

describe("non-evidence iGPU boundary", () => {
  it("keeps evidence and every CI request on software despite an explicit opt-in", () => {
    const requested = { TUT_GPU: "1" };
    expect(renderingMode(requested)).toBe("swiftshader");
    expect(renderingMode(requested, "evidence")).toBe("swiftshader");
    expect(renderingMode({ ...requested, CI: "true" }, "survey")).toBe(
      "swiftshader",
    );
    expect(renderingMode({}, "play")).toBe("swiftshader");
    expect(renderingMode(requested, "survey")).toBe("igpu");
    expect(() => renderingMode(requested, "typo")).toThrow();
  });

  it("requires the allowed physical device and rejects access to the discrete card", () => {
    const allowed = {
      present: true,
      discrete: false,
      character: true,
      vendor: "0x1002",
      device: "0x13c0",
    };
    expect(() => assertDevice(allowed)).not.toThrow();
    for (const bad of [
      { present: false },
      { discrete: true },
      { character: false },
      { device: "0x7550" },
      { vendor: "0xffff" },
    ])
      expect(() => assertDevice({ ...allowed, ...bad })).toThrow(/renderD129/);
  });

  it("refuses software fallback as hardware proof, while retaining a valid AMD control", () => {
    for (const renderer of [
      "ANGLE SwiftShader Device",
      "llvmpipe (LLVM 20)",
      "softpipe",
      "unavailable",
    ])
      expect(() => assertRenderer("igpu", renderer)).toThrow();
    expect(() =>
      assertRenderer("igpu", "AMD Radeon Graphics (radeonsi, LLVM 20)"),
    ).not.toThrow();
    expect(() =>
      assertRenderer("swiftshader", "AMD Radeon Graphics"),
    ).toThrow();
    expect(() =>
      assertRenderer("swiftshader", "ANGLE SwiftShader Device"),
    ).not.toThrow();
  });

  it("refuses missing passthrough before launching a browser", async () => {
    await expect(
      launchWorkBrowser({ purpose: "survey", env: { TUT_GPU: "1" } }),
    ).rejects.toThrow(/renderD129/);
    expect(launch).not.toHaveBeenCalled();
  });
});
