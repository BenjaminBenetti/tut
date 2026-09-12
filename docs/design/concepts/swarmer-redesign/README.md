# Swarmer redesign — three directions

**Concept review · 2026-09-12 · awaiting a direction choice.** Three alternative looks for the swarmer, the starting point for a later redesign of the bug family. Names below identify art directions, not new species.

Each sheet contains a large three-quarter view, a side profile and a front view. Click a preview for the full 1536×1024 image.

| A — Splitmask | B — Crescent | C — Ribknife |
|---|---|---|
| [![Splitmask: pale split face, overlapping shell chevrons and pointed foreblades](a-splitmask.png)](a-splitmask.png) | [![Crescent: broad swept head shield, low body and hooked foreblades](b-crescent.png)](b-crescent.png) | [![Ribknife: pale external ribs over wine-red tissue and hooked foreblades](c-ribknife.png)](c-ribknife.png) |
| **Lean shell hunter.** A pale divided face and repeated chevrons make an arrow pointing into the attack. | **Prehistoric skitterer.** A thin crescent hood gives the swarm a broad, unfamiliar outline. | **Exposed biology.** External ribs and flexible tissue make a creature that looks grown and vulnerable. |
| [Notes and prompt](a-splitmask.md) | [Notes and prompt](b-crescent.md) | [Notes and prompt](c-ribknife.md) |

## What to choose

Choose the silhouette and the material treatment you want the whole bug family to inherit. A combination is also possible; for example, A's divided face with C's exposed joints. The choice does not need to settle every plate or eye.

My starting recommendation is **A — Splitmask**: the split face and pale chevrons give us a clear motif to repeat across the family, and the pointed body communicates rushing. **B** offers the biggest silhouette change; **C** pushes the biological horror furthest.

| Direction | Main strength | Main tradeoff to resolve |
|---|---|---|
| A — Splitmask | The pale/dark pattern has large, simple shapes; the face is recognizable without relying on glow. | The shell and rear haunches could imply too much armour. Keep plates thin and the running stance low. |
| B — Crescent | A distinctive top outline with very few major parts. | A wide shield can suggest a brute; retain its thin edge, small body and quick scuttling stance. |
| C — Ribknife | Exposed tissue communicates fragility; repeating ribs could tie creatures and nests together. | The painting has too much muscle detail for the game. Reduce it to broad colour bands and lower the thorax. |

## How the chosen theme could extend

These are possible follow-up directions, not approved redesigns or additional deliverables in this review.

| Family member | A — Splitmask | B — Crescent | C — Ribknife |
|---|---|---|---|
| Lurker | A narrow split mask, spaced shell chevrons and long blade arms on the tall stalking body. | A narrow swept hood over the tall body, with the crescent repeated in long foreblades. | Long rib arches over a thin torso, exposed joints and long hooked arms. |
| Brute | Broad overlapping chevrons form a heavy dome; the divided face becomes blunt and deep. | A thick domed mantle contrasts with the swarmer's thin flat shield; short cleaver arms underneath. | Broad ribs close into protective plates over a heavy body; thicker cleaver forelimbs. |
| Egg spawner | Split shell halves around eggs; a repeated chevron seam signals where they open. | Overlapping curved husks cradle the clutch; the shield rim becomes the egg lip. | External ribs cage intact egg membranes, repeating the tissue/ivory contrast. |

Keep each class's gameplay read: swarmer low and fast, lurker tall and thin, brute wide and heavy, spawner a rooted clutch. Retain green for swarmers, magenta for lurkers and the existing class-specific accents when exploring the rest of the family.

## Review boundaries and next pass

The brief preserves the swarmer's role, one-tile footprint and intended scale: **0.5 u high, about 0.8 u long**, where 1 u = 2 metres. All three use the existing bug palette, exploring different amounts and placements of bone, chitin and flesh. Palette hexes in prompts are targets; generated shading is not a sampled palette reference.

These are generated concept illustrations, not measured turnarounds or validated game models. Their side/front studies communicate intent, but small anatomy and plate-count differences need resolving in an authored model. After a direction is selected, simplify the anatomy to six limbs total (four running legs plus two blade forelimbs), settle proportions, and build the swarmer within the existing 600-triangle budget. Check it at the game's actual camera and 64 px per tile on asphalt, grass and rock before extending the theme.

The [current concept](../bug-swarmer.md), [current model render](../../renders/bug.swarmer_045.png), [style guide](../../style-guide.md) and runtime assets remain the implementation references until that follow-up is approved. This PR adds review art and documentation only.

## Provenance

Generated on **2026-09-12** with the **built-in `image_gen` tool** using the imagegen skill, one independent generation per direction. The tool does not expose the image-model version. No input reference images were passed; existing repository concepts and the style guide informed the written briefs. PNG outputs are saved unmodified at their generated 1536×1024 resolution.

Exact prompts: [A](prompts/a-splitmask.txt), [B](prompts/b-crescent.txt), [C](prompts/c-ribknife.txt). Each image has a Markdown sidecar with review notes. To make another variant, pass its prompt text to the built-in image tool and save it under a new filename in this directory.
