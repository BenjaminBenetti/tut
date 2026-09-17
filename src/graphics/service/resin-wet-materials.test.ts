import { MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { ResinWetMaterials } from "./resin-wet-materials";

describe("wet tissue reflection ownership", () => {
  it("shares one reflection across tissue while preserving city and loader materials", () => {
    const cache = new ResinWetMaterials();
    const city = new MeshStandardMaterial({ name: "env-concrete" });
    const tissue = new MeshPhysicalMaterial({
      name: "resin-wet",
      roughness: 0.17,
      clearcoat: 0.85,
    });
    expect(cache.material(city)).toBe(city);
    const wet = cache.material(tissue) as MeshPhysicalMaterial;
    const other = cache.material(
      new MeshStandardMaterial({ name: "resin-skin" }),
    ) as MeshStandardMaterial;
    expect(wet).not.toBe(tissue);
    expect(cache.material(tissue)).toBe(wet);
    expect(wet.envMap).toBe(other.envMap);
    expect(wet.clearcoat).toBe(0.85);
    expect(tissue.envMap).toBeNull();
    const originalDisposal = vi.spyOn(tissue, "dispose");
    const textureDisposal = vi.spyOn(wet.envMap!, "dispose");
    const copyDisposal = vi.spyOn(wet, "dispose");
    cache.dispose();
    expect(textureDisposal).toHaveBeenCalledOnce();
    expect(copyDisposal).toHaveBeenCalledOnce();
    expect(originalDisposal).not.toHaveBeenCalled();
  });
});
