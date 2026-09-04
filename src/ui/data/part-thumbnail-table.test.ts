import { describe, expect, it } from "vitest";

import { STARTER_PARTS } from "../../roster/data/parts";
import { PART_THUMBNAILS, partThumbnail } from "./part-thumbnail-table";
import { THUMBNAIL_MANIFEST } from "./thumbnail-manifest";

describe("part thumbnails", () => {
  it("registers every thumbnail it names", () => {
    for (const id of Object.values(PART_THUMBNAILS)) {
      if (id === undefined) continue;
      expect(THUMBNAIL_MANIFEST[id], id).toBeDefined();
    }
  });

  it("gives every part with a visual slot a picture, and utilities none", () => {
    for (const part of STARTER_PARTS) {
      const thumb = partThumbnail(part.id);
      if (part.slot === "utility") {
        expect(thumb, `${part.id} is a utility`).toBeUndefined();
      } else {
        expect(thumb, `${part.id} has a picture`).toBeDefined();
      }
    }
  });

  it("points each part at a thumbnail of its own kind", () => {
    // A chassis must not be showing the legs' picture, which a
    // copy-paste in the table would produce and nothing else would catch.
    const kindOf = (id: string) =>
      id.startsWith("chassis")
        ? "chassis"
        : id.startsWith("legs")
          ? "legs"
          : id.startsWith("arms")
            ? "arm"
            : id.startsWith("arm-weapon")
              ? "weapon-arm"
              : "weapon-back";
    for (const [partId, thumbId] of Object.entries(PART_THUMBNAILS)) {
      expect(thumbId ?? "", partId).toContain(kindOf(partId));
    }
  });

  it("resolves an unknown part id to nothing rather than guessing", () => {
    expect(partThumbnail("no-such-part")).toBeUndefined();
  });
});
