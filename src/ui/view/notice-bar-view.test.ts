// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { NoticeBarView } from "./notice-bar-view";

describe("NoticeBarView", () => {
  it("starts hidden, shows the latest notice with its tone, and dismisses", () => {
    const root = document.createElement("div");
    const view = new NoticeBarView();
    view.mount(root);
    const bar = root.querySelector<HTMLElement>('[data-role="notice"]');
    expect(bar?.hidden).toBe(true);

    view.notify({ message: "Autosave failed: quota", tone: "danger" });
    expect(bar?.hidden).toBe(false);
    expect(bar?.dataset.tone).toBe("danger");
    expect(root.querySelector('[data-field="notice-text"]')?.textContent).toBe(
      "Autosave failed: quota",
    );

    view.notify({ message: "Saved.", tone: "info" });
    expect(bar?.dataset.tone).toBe("info");
    expect(root.querySelector('[data-field="notice-text"]')?.textContent).toBe(
      "Saved.",
    );

    root
      .querySelector<HTMLButtonElement>('[data-action="dismiss-notice"]')
      ?.click();
    expect(bar?.hidden).toBe(true);

    view.unmount();
    expect(root.childElementCount).toBe(0);
  });

  it("ignores notify before mount", () => {
    const view = new NoticeBarView();
    expect(() => {
      view.notify({ message: "x", tone: "warn" });
    }).not.toThrow();
  });
});
