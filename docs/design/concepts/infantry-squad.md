# Concept: TDF infantry squad token

![TDF infantry squad token](infantry-squad.png)

- **Generator**: Codex CLI 0.152.1 built-in `image_gen` (model gpt-5.6-sol session; image model as served by the tool), via `tools/art/gen-image.sh`.
- **Date**: 2026-09-02
- **Prompt file**: [`prompts/infantry-squad.txt`](prompts/infantry-squad.txt) (exact text passed to the generator, plus the standard save-path suffix the script appends)
- **Style guide refs**: §3 scale/silhouette, §4 palette

## Prompt

```
Concept sheet for a TDF infantry squad token from a near-future Earth turn-based tactics game: five small soldiers standing together on one thin round base disc, arranged in a loose wedge with the leader front centre. Practical military kit: big helmets with small visors, body armour, rifles held ready; one soldier carries a long rocket launcher over the shoulder. Uniforms olive #6B7A3F with dark olive #45502A webbing and boots, armour plates cool grey #5B6573, tiny orange #F08A24 shoulder markings, visors #7FD1FF, base disc dark grey #2E3440. Chunky readable proportions, oversized helmets, no facial detail. Low-poly game model style, flat shading, hard edges, clean vector-like fills with no gradients or noise, plain neutral grey background #8E8A82, no text, no labels, no watermark, no logos. Wide landscape concept sheet showing the same design three times side by side: front view, side view, and isometric three-quarter view from 35 degrees above.
```

## Keep

- Big helmets, cyan visors, orange shoulder patch, olive uniform with grey chest plate, single dark base disc. The rocket carrier reads instantly.
- Chunky proportions survive downscaling.

## Change next pass

- Generator drew three to four figures; the token is five. Regenerate with the count spelled out per figure ("exactly five soldiers: two kneeling in front, three standing behind").
- Base disc should be thinner (0.05 u) and the figures should overlap less at the front.
