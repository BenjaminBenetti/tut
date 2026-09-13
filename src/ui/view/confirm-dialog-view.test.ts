// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialogView } from "./confirm-dialog-view";

// ===========================================
// Fixtures
// ===========================================

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});

/** A mounted dialog with spied handlers. */
function mounted(): {
  view: ConfirmDialogView;
  onConfirm: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
} {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = new ConfirmDialogView(
    {
      role: "leave-dialog",
      kicker: "Leave mission",
      confirmAction: "leave-confirm",
      cancelAction: "leave-cancel",
    },
    { onConfirm, onCancel },
  );
  view.mount(root);
  return { view, onConfirm, onCancel };
}

const CONTENT = {
  title: "Leave Alpha behind?",
  lines: ["Alpha is not aboard and will be lost.", "1 objective is open."],
  confirmLabel: "Leave",
  cancelLabel: "Stay",
};

// ===========================================
// Tests
// ===========================================

describe("ConfirmDialogView (#1132)", () => {
  it("mounts hidden under its role, and shows the title, lines and buttons on show", () => {
    const { view } = mounted();
    const dialog = root.querySelector<HTMLElement>(
      '[data-role="leave-dialog"]',
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.hidden).toBe(true);
    expect(view.open).toBe(false);

    view.show(CONTENT);
    expect(dialog?.hidden).toBe(false);
    expect(view.open).toBe(true);
    expect(
      dialog?.querySelector('[data-field="confirm-title"]')?.textContent,
    ).toBe("Leave Alpha behind?");
    expect(
      [...dialog!.querySelectorAll('[data-field="confirm-body"] p')].map(
        (p) => p.textContent,
      ),
    ).toEqual(CONTENT.lines);
    expect(
      dialog?.querySelector('[data-action="leave-confirm"]')?.textContent,
    ).toBe("Leave");
    expect(
      dialog?.querySelector('[data-action="leave-cancel"]')?.textContent,
    ).toBe("Stay");
  });

  it("confirms, hides and reports; cancels, hides and reports", () => {
    const { view, onConfirm, onCancel } = mounted();
    view.show(CONTENT);
    root
      .querySelector<HTMLButtonElement>('[data-action="leave-confirm"]')
      ?.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(view.open).toBe(false);

    view.show(CONTENT);
    root
      .querySelector<HTMLButtonElement>('[data-action="leave-cancel"]')
      ?.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(view.open).toBe(false);
  });

  it("cancels on Escape only while open", () => {
    const { view, onCancel } = mounted();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).not.toHaveBeenCalled();
    view.show(CONTENT);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(view.open).toBe(false);
  });

  it("replaces its lines on a second show and stops listening once unmounted", () => {
    const { view, onCancel } = mounted();
    view.show(CONTENT);
    view.show({ ...CONTENT, lines: ["Only this."] });
    expect(
      [...root.querySelectorAll('[data-field="confirm-body"] p')].map(
        (p) => p.textContent,
      ),
    ).toEqual(["Only this."]);
    view.unmount();
    expect(root.querySelector('[data-role="leave-dialog"]')).toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(view.open).toBe(false);
  });
});
