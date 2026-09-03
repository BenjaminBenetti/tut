// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { DomMapViewportHost } from "./dom-map-viewport-host";

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

  it("release is a no-op when the viewport is already home", () => {
    const host = new DomMapViewportHost(viewport, home);
    host.release();
    expect(home.children).toHaveLength(1);
    expect(home.firstElementChild).toBe(viewport);
  });
});
