// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { MAP_READY_ATTRIBUTE } from "../../ui/model/map-viewport-host";
import { DomMapViewportHost } from "./dom-map-viewport-host";

/** A scene whose settling this test decides, the way a frame would. */
class FakeScene {
  private listener: (() => void) | undefined;
  settleCount = 0;

  onSettled(listener: () => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  /** Runs whatever is waiting, as a rendered frame at the new size would. */
  settle(): void {
    this.settleCount += 1;
    const waiting = this.listener;
    this.listener = undefined;
    waiting?.();
  }

  /** Whether anything is still waiting to be told. */
  get waiting(): boolean {
    return this.listener !== undefined;
  }
}

/** Whether the page currently says the map is worth measuring. */
const ready = (): boolean => document.body.hasAttribute(MAP_READY_ATTRIBUTE);

describe("DomMapViewportHost", () => {
  let home: HTMLElement;
  let viewport: HTMLElement;
  let cell: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    home = document.createElement("div");
    viewport = document.createElement("div");
    viewport.id = "map-viewport";
    home.appendChild(viewport);
    cell = document.createElement("div");
    document.body.append(home, cell);
  });

  it("moves the same element into the container and back home", () => {
    const host = new DomMapViewportHost(viewport, home);
    host.attach(cell);
    expect(cell.firstElementChild).toBe(viewport);
    expect(home.children).toHaveLength(0);
    host.release();
    expect(home.firstElementChild).toBe(viewport);
    expect(cell.children).toHaveLength(0);
  });

  it("says the map is ready only once the scene has drawn at the new size (#473)", () => {
    const scene = new FakeScene();
    const host = new DomMapViewportHost(viewport, home);
    host.useScene(scene);
    host.attach(cell);
    // The element has moved, but nothing has been rendered at its size:
    // this is the window in which a projected position is 78 px out.
    expect(ready()).toBe(false);
    expect(scene.waiting).toBe(true);
    scene.settle();
    expect(document.body.getAttribute(MAP_READY_ATTRIBUTE)).toBe("true");
  });

  it("clears the flag when the screen gives the viewport back", () => {
    const scene = new FakeScene();
    const host = new DomMapViewportHost(viewport, home);
    host.useScene(scene);
    host.attach(cell);
    scene.settle();
    expect(ready()).toBe(true);
    host.release();
    expect(ready()).toBe(false);
  });

  it("does not raise the flag for a screen that left while still settling", () => {
    const scene = new FakeScene();
    const host = new DomMapViewportHost(viewport, home);
    host.useScene(scene);
    host.attach(cell);
    host.release();
    expect(scene.waiting).toBe(false);
    // A frame that lands after the screen is gone must not say the map
    // is measurable: the layout it settled on no longer exists.
    scene.settle();
    expect(ready()).toBe(false);
  });

  it("re-arms on each attach, so a second visit waits again", () => {
    const scene = new FakeScene();
    const host = new DomMapViewportHost(viewport, home);
    host.useScene(scene);
    host.attach(cell);
    scene.settle();
    host.release();
    host.attach(cell);
    expect(ready()).toBe(false);
    scene.settle();
    expect(ready()).toBe(true);
    expect(scene.settleCount).toBe(2);
  });

  it("never claims ready with no scene wired, rather than guessing", () => {
    const host = new DomMapViewportHost(viewport, home);
    host.attach(cell);
    expect(ready()).toBe(false);
  });

  it("release is a no-op when the viewport is already home", () => {
    const host = new DomMapViewportHost(viewport, home);
    host.release();
    expect(home.children).toHaveLength(1);
    expect(home.firstElementChild).toBe(viewport);
  });
});
