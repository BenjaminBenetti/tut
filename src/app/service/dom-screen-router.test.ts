// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import type { Screen, ScreenId } from "../../ui/model/screen";
import type {
  ScreenChanged,
  ScreenRouterEvents,
} from "../../ui/model/screen-router";
import { DomScreenRouter } from "./dom-screen-router";

class FakeScreen implements Screen {
  private element: HTMLElement | undefined;

  constructor(
    readonly id: ScreenId,
    private readonly log: string[],
  ) {}

  mount(root: HTMLElement): void {
    this.element = root.ownerDocument.createElement("div");
    this.element.dataset.fake = this.id;
    root.appendChild(this.element);
    this.log.push(`mount:${this.id}`);
  }

  unmount(): void {
    this.element?.remove();
    this.element = undefined;
    this.log.push(`unmount:${this.id}`);
  }
}

describe("DomScreenRouter", () => {
  let root: HTMLElement;
  let log: string[];
  let router: DomScreenRouter;
  let events: SimpleEventBus<ScreenRouterEvents>;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete document.body.dataset.screen;
    root = document.createElement("div");
    document.body.appendChild(root);
    log = [];
    events = new SimpleEventBus<ScreenRouterEvents>();
    router = new DomScreenRouter(
      root,
      new Map<ScreenId, () => Screen>([
        ["main-menu", () => new FakeScreen("main-menu", log)],
        ["overworld", () => new FakeScreen("overworld", log)],
      ]),
      events,
    );
  });

  it("starts with no current screen and nothing mounted", () => {
    expect(router.current).toBeUndefined();
    expect(root.children).toHaveLength(0);
    expect(document.body.dataset.screen).toBeUndefined();
  });

  it("mounts the requested screen under the root", () => {
    router.navigate("main-menu");
    expect(router.current).toBe("main-menu");
    expect(root.querySelector('[data-fake="main-menu"]')).not.toBeNull();
    expect(document.body.dataset.screen).toBe("main-menu");
    expect(log).toEqual(["mount:main-menu"]);
  });

  it("unmounts the previous screen before mounting the next", () => {
    router.navigate("main-menu");
    router.navigate("overworld");
    expect(log).toEqual([
      "mount:main-menu",
      "unmount:main-menu",
      "mount:overworld",
    ]);
    expect(root.children).toHaveLength(1);
    expect(root.querySelector('[data-fake="main-menu"]')).toBeNull();
    expect(root.querySelector('[data-fake="overworld"]')).not.toBeNull();
    expect(document.body.dataset.screen).toBe("overworld");
  });

  it("emits screen:changed with from and to", () => {
    const seen: ScreenChanged[] = [];
    events.on("screen:changed", (change) => {
      seen.push(change);
    });
    router.navigate("main-menu");
    router.navigate("overworld");
    expect(seen).toEqual([
      { from: undefined, to: "main-menu" },
      { from: "main-menu", to: "overworld" },
    ]);
  });

  it("treats navigating to the current screen as a no-op", () => {
    const seen: ScreenChanged[] = [];
    events.on("screen:changed", (change) => {
      seen.push(change);
    });
    router.navigate("main-menu");
    router.navigate("main-menu");
    expect(log).toEqual(["mount:main-menu"]);
    expect(seen).toHaveLength(1);
    expect(root.children).toHaveLength(1);
  });

  it("throws for an id with no registered factory", () => {
    const empty = new DomScreenRouter(root, new Map());
    expect(() => {
      empty.navigate("main-menu");
    }).toThrow(/No screen registered for id "main-menu"/);
    expect(empty.current).toBeUndefined();
  });

  it("creates a fresh screen instance on every navigation", () => {
    router.navigate("main-menu");
    router.navigate("overworld");
    router.navigate("main-menu");
    expect(log).toEqual([
      "mount:main-menu",
      "unmount:main-menu",
      "mount:overworld",
      "unmount:overworld",
      "mount:main-menu",
    ]);
  });
});
