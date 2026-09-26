import { Group, Object3D, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TunnelMouth } from "../../tactical/model/tunnel-mouth";
import {
  TUNNEL_MOUTH_MODEL_ID,
  TUNNEL_MOUTH_NAME_PREFIX,
  TUNNEL_MOUTH_SEALED_MODEL_ID,
  TunnelMouthView,
} from "./tunnel-mouth-view";

// ===========================================
// Fixtures
// ===========================================

/** The 2 × 2 with its minimum corner at (x, z), in the placer's order. */
function square(x: number, z: number): TileCoord[] {
  return [
    { x, y: 0, z },
    { x: x + 1, y: 0, z },
    { x, y: 0, z: z + 1 },
    { x: x + 1, y: 0, z: z + 1 },
  ];
}

/** An open mouth over the 2 × 2 at (x, z), its charge tile `pos`. */
function mouth(
  id: string,
  x: number,
  z: number,
  pos: TileCoord = { x, y: 0, z },
): TunnelMouth {
  return { id, pos, tiles: square(x, z) };
}

/**
 * A stand-in mouth model: a group whose `socket_charge` sits where the
 * GLB's does, at the footprint's (−½, −½) tile, a little off the ground.
 */
function mouthModel(): Group {
  const model = new Group();
  const socket = new Object3D();
  socket.name = "socket_charge";
  socket.position.set(-0.5, 0.03, -0.5);
  model.add(socket);
  return model;
}

/** A loader that hands out stand-in mouths and records what it was asked for. */
function loader() {
  const load = vi.fn((_id: ModelAssetId) => Promise.resolve(mouthModel()));
  return { load, preload: () => Promise.resolve() };
}

/** The world position of the drawn mouth's charge socket. */
function socketOf(view: TunnelMouthView, id: string): Vector3 {
  const socket = view.mouthObject(id)!.getObjectByName("socket_charge")!;
  socket.updateWorldMatrix(true, false);
  return socket.getWorldPosition(new Vector3());
}

/** `value` to two decimals, so a turned position compares exactly. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ===========================================
// Tests
// ===========================================

describe("TunnelMouthView (arc §6.7)", () => {
  it("centres an open mouth on its 2 × 2, as the open model, with the socket on its charge tile", async () => {
    const models = loader();
    const view = new TunnelMouthView(models);
    await view.updateTunnelMouths([mouth("tunnel-1", 4, 6)]);
    expect(view.ids()).toEqual(["tunnel-1"]);
    expect(models.load).toHaveBeenCalledWith(TUNNEL_MOUTH_MODEL_ID);
    expect(view.drawnModel("tunnel-1")).toBe(TUNNEL_MOUTH_MODEL_ID);

    const root = view.root.getObjectByName(
      `${TUNNEL_MOUTH_NAME_PREFIX}tunnel-1`,
    )!;
    // The 2 × 2 from (4, 6) to (5, 7): its centre is the tiles' shared corner.
    expect(root.position.x).toBe(5);
    expect(root.position.z).toBe(7);
    const socket = socketOf(view, "tunnel-1");
    expect(socket.x).toBeCloseTo(4.5);
    expect(socket.z).toBeCloseTo(6.5);
  });

  it("turns the model so its socket lands on whichever corner tile the charge is set on", async () => {
    const view = new TunnelMouthView(loader());
    const corners: readonly [string, TileCoord][] = [
      ["nw", { x: 4, y: 0, z: 6 }],
      ["ne", { x: 5, y: 0, z: 6 }],
      ["sw", { x: 4, y: 0, z: 7 }],
      ["se", { x: 5, y: 0, z: 7 }],
    ];
    await view.updateTunnelMouths(
      corners.map(([id, pos]) => mouth(id, 4, 6, pos)),
    );
    for (const [id, pos] of corners) {
      const socket = socketOf(view, id);
      const at = { id, x: round(socket.x), z: round(socket.z) };
      expect(at).toEqual({ id, x: pos.x + 0.5, z: pos.z + 0.5 });
    }
  });

  it("swaps a mouth to the sealed model once its charge blows, and keeps it sealed", async () => {
    const models = loader();
    const view = new TunnelMouthView(models);
    const open = mouth("tunnel-1", 4, 6);
    await view.updateTunnelMouths([open]);
    // A charge burning on it still leaves it open.
    await view.updateTunnelMouths([{ ...open, chargeId: "tunnel-1-charge" }]);
    expect(models.load).toHaveBeenCalledTimes(1);

    const sealed: TunnelMouth = {
      ...open,
      chargeId: "tunnel-1-charge",
      sealedOnTurn: 4,
    };
    await view.updateTunnelMouths([sealed]);
    expect(models.load).toHaveBeenLastCalledWith(TUNNEL_MOUTH_SEALED_MODEL_ID);
    expect(view.drawnModel("tunnel-1")).toBe(TUNNEL_MOUTH_SEALED_MODEL_ID);
    expect(view.root.children).toHaveLength(1);

    await view.updateTunnelMouths([sealed]);
    expect(models.load).toHaveBeenCalledTimes(2);
  });

  it("removes a mouth gone from the list and drops a load that finishes after it went", async () => {
    let finish!: (model: Group) => void;
    const view = new TunnelMouthView({
      load: () =>
        new Promise<Group>((resolve) => {
          finish = resolve;
        }),
      preload: () => Promise.resolve(),
    });
    const pending = view.updateTunnelMouths([mouth("tunnel-1", 4, 6)]);
    await view.updateTunnelMouths([]);
    finish(mouthModel());
    await pending;
    expect(view.ids()).toEqual([]);
    expect(view.root.children).toHaveLength(0);
  });

  it("dispose takes every mouth", async () => {
    const view = new TunnelMouthView(loader());
    await view.updateTunnelMouths([
      mouth("tunnel-1", 4, 6),
      mouth("tunnel-2", 20, 6),
    ]);
    expect(view.root.children).toHaveLength(2);
    view.dispose();
    expect(view.ids()).toEqual([]);
    expect(view.root.children).toHaveLength(0);
  });
});
