import type { IconId } from "../data/icon-manifest";
import { iconUrl } from "../data/icon-manifest";

// ===========================================
// Icon glyph
// ===========================================

/**
 * The decorative glyph span every view puts beside a label (#495).
 *
 * ```
 *   <span class="tut-icon tut-icon--sm" data-icon="armor" aria-hidden="true"
 *         style="--icon: url(…)"></span>
 * ```
 *
 * Shared because the same five lines had been written out seven times
 * and had already drifted: four of the seven set neither `data-icon`
 * nor `aria-hidden`, so their glyphs were announced to a screen reader
 * that already has the label beside them (#595).
 *
 * Two details the copies each had to remember, and which live here now:
 * `iconUrl` returns `url(…)` already, so wrapping it again is invalid
 * CSS and the mask degrades to a **solid block** rather than failing
 * visibly; and the glyph is decorative, so the accessible name has to
 * come from the label next to it.
 *
 * One size, because the theme defines one (`tut-icon--sm`). A size
 * parameter here would let a caller ask for a class with no rule behind
 * it, which renders as an unsized block — the same silent failure the
 * `url(…)` note above describes.
 *
 * @param doc - Document to build in.
 * @param icon - Registered icon id; a mask is loaded from its manifest path.
 * @returns The span, ready to append beside its label.
 */
export function iconGlyph(doc: Document, icon: IconId): HTMLSpanElement {
  const glyph = doc.createElement("span");
  glyph.className = "tut-icon tut-icon--sm";
  glyph.dataset.icon = icon;
  glyph.setAttribute("aria-hidden", "true");
  glyph.style.setProperty("--icon", iconUrl(icon));
  return glyph;
}
