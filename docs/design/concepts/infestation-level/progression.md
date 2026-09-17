# Concept: Infestation progression

![Infestation levels 1, 4, 7 and 10 applied to a common city reference](progression.png)

- **Status:** Proposed blend; awaiting user review.
- **Generator:** Built-in `image_gen` tool via the imagegen skill; image-model version not exposed.
- **Date:** 2026-09-17.
- **Exact prompt:** [prompts/progression.txt](prompts/progression.txt).
- **Input / edit target:** [Existing grocery exterior screenshot](../../diagnostics/business-signs/shops-review-grocery-exterior.png), the sole image input. Its unmodified original represents level 0 in the review.
- **Output:** Unmodified generated PNG, 1254 × 1254 (the tool returned this native size despite the prompt's 1536 × 1536 request).
- **Style references:** [Style guide](../../style-guide.md) §§2–4; [brown bug family](../../kits/crescent-bugs.md).

## Keep

Growth reads as an increasing presence on the same familiar city: small foundation traces at 1, linked ground patches and wall veins at 4, roof-reaching networks at 7, and widespread membranes and brood growth at 10. The neutral lighting and recognizable shop block make the escalation comparable. Late growth reaches surrounding terrain and neighboring structures as well as the main building.

## Change or resolve before production

The prompt's approximate 5 / 30 / 65 / 95 percent coverage values describe artistic intent; they were not measured from the output and are not tuning constants. Level 10 should use the detail sheet's continuous living carpet to close remaining gaps where exposed asphalt still reads too clean. The amount of recognizable architecture at the maximum level is a review decision.

The image tool reinterprets small windows, signs, props and growth positions. These paint-overs illustrate direction, not pixel-preserving edits, generated-map outputs or proof that increasing the dial preserves a seeded layout. Future implementation should keep the base map stable and add growth coherently as the level rises. Dense decorative eggs must remain distinct from real objectives, and roof growth must respect the game's floor-cut presentation.
