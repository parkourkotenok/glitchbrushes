# Image Brush Style Audit

## Scope and repeatable evidence

This is an engine-level audit of the curated built-in catalog after `275ad4a`. The visual evidence is the deterministic [contact sheet](artifacts/image-brush-style-audit/contact-sheet.png), with per-cell hashes and timings in [the manifest](artifacts/image-brush-style-audit/manifest.json).

The harness decodes the committed transparent `image-brush-astronaut.png` and photographic `parkour-kotenok-road.jpg`, then renders every recipe with the same nine-point curved path, 64 px size, 32 px spacing, full opacity, seed `image-brush-style-audit-v1`, and stroke id `style-audit-stroke`. It runs every cell twice and fails if pixels or output bounds differ.

Regenerate it without a UI, Worker, or network dependency:

```powershell
npm run audit:image-brush-styles
```

`ffmpeg` is the only host tool used, exclusively to decode the two committed source assets to deterministic RGBA. The contact sheet is encoded by the harness itself.

## Catalog decisions

| Style                  | Mutation / stage        | FX rack                                            | Identity and nearest overlap                                                                  | Artifacts / performance                                                 | Decision |
| ---------------------- | ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Clean Repeat           | clean / before          | —                                                  | Readable repeated source; baseline for every other recipe.                                    | No FX; lowest cost.                                                     | Core     |
| Glitched Repeat        | fixed / before          | Slice → Block Corruption → RGB Split               | One stable broken tip; distinct from progressive damage.                                      | Crisp but can look rigid by design; medium.                             | Core     |
| Progressive Decay      | progressive / each      | Slice → Block Corruption                           | Clearly grows damage along the stroke.                                                        | Later copies can become sparse; high variant work.                      | Core     |
| Random Glitch Chain    | per-stamp / each        | Slice → Block Corruption → RGB Split → Scanline    | Seeded grab-bag; overlaps Packet Loss Stream and RGB Separation Trail.                        | Readable, but recipe identity is intentionally inconsistent; medium.    | More     |
| Datamosh Trail         | evolving / each         | Datamosh → Motion Field → RGB Split                | Directional accumulating smear.                                                               | Sensitive to dense strokes; high.                                       | Core     |
| RGB Separation Trail   | random-stack / each     | RGB Split → Chroma Drift → Scanline                | Color-channel jitter; closest to Chroma Feedback.                                             | Distinct enough for specialists, but not a primary workflow; medium.    | More     |
| Pixel Sort Trail       | whole-trail / after     | Pixel Sort → Scanline                              | Connected sorted streaks across the full path.                                                | Requires a local trail buffer; high.                                    | Core     |
| Whole Trail            | whole-trail / after     | Feedback → Scanline → RGB Split                    | Generic connected feedback trail; overlaps Chroma Feedback and MOSH Flow Trail.               | High and too abstract as a first-choice card. Preserve its ID.          | Legacy   |
| MOSH Flow Trail        | whole-trail / after     | Flow Field → Chroma Drift                          | Geometry-moving flow, visibly different from pixel sorting.                                   | High; alpha-bleed path needs the dedicated ghost regression acceptance. | Core     |
| Codec Damage Trail     | whole-trail / after     | Codec Block Damage → Block Corruption → Row Repeat | Structural codec blocks across the trail; overlaps Compression Breakdown but is more spatial. | High; useful specialist recipe.                                         | More     |
| Chroma Feedback        | evolving / before-after | Chroma Drift → Feedback → RGB Split                | Colored feedback memory; closest to RGB Separation Trail.                                     | Realtime quality is deliberately lighter; high visual cost.             | Core     |
| Codec Breakdown        | stroke-gradient / each  | Codec Block Damage → DCT Damage → Block Corruption | Clean-to-codec progression.                                                                   | Later stamps retain useful structure; high.                             | Core     |
| Packet Loss Stream     | random-stack / each     | Block Corruption → Row Repeat → Codec Block Damage | Packetized randomized loss; overlaps Random Glitch Chain.                                     | Legible but less universal than Core; high.                             | More     |
| Broken Interface       | alternating / each      | Block Corruption → RGB Split → Codec Block Damage  | Alternating UI/macroblock fragments, clearly branded.                                         | Stable, readable, medium.                                               | Core     |
| Scatter Fragments      | per-stamp / each        | Block Corruption → Slice → Codec Block Damage      | The only deliberately dispersed composition.                                                  | Intentional out-of-path scatter; medium.                                | Core     |
| Pixel Embroidery — NEW | fixed / before          | Pixel Embroidery                                   | Readable stitched grid that retains the transparent source silhouette.                        | No codec/RGB noise; medium.                                             | Core     |
| Xerox Decay — NEW      | progressive / each      | Xerox Decay                                        | Toner and halftones visibly erode from first to later stamps.                                 | Controlled Preserve Alpha; medium.                                      | Core     |
| Zine Stitch — NEW      | fixed / before          | Pixel Embroidery → Xerox Decay                     | Deliberately restrained dirty-zine combination.                                               | No third FX obscures the stitch pattern; high.                          | Core     |

### New print and texture recipes

**Pixel Embroidery**, **Xerox Decay**, and **Zine Stitch** are now built-in Core recipes and visual cards. The first two retain their experimental FX metadata and remain excluded from generic randomization; they appear only through their dedicated styles unless explicitly selected in Advanced FX. The static browser card adds `NEW` for all three.

`compression-breakdown` remains its serialized ID while the catalog labels it **Codec Breakdown**. The compatibility alias `codec-breakdown → compression-breakdown` resolves on project and preference restore. `whole-trail` remains a Legacy entry rather than disappearing from existing projects.

## Curation outcome

Core should contain thirteen high-separation cards: Clean Repeat, Glitched Repeat, Progressive Decay, Datamosh Trail, Pixel Sort Trail, MOSH Flow Trail, Chroma Feedback, Codec Breakdown, Broken Interface, Scatter Fragments, Pixel Embroidery, Xerox Decay, and Zine Stitch.

Keep Random Glitch Chain, RGB Separation Trail, Codec Damage Trail, and Packet Loss Stream in **More**. Keep `whole-trail` as **Legacy**: hide it from the Simple/Core browser but retain its serialized ID. No current built-in renderer is categorically broken.

## Implemented catalog and browser rules

1. Simple shows the curated thirteen-style Core catalog; More and Legacy are still resolvable and available in the browser's advanced disclosure.
2. Style cards read `category`, `catalog`, and `badge` presentation metadata. Cards use pre-generated SVG data thumbnails and do not create preview Workers or inspect user pixels.
3. Randomize remains style-first: Balanced, Wild, Placement, Evolution, and FX recipe changes intentionally produce Custom; the selected source set and Essentials stay outside the catalog recipe.
4. Placement, Evolution, FX, Alpha/Blend, Pressure, diagnostics, and raw seed are Advanced-only. The final Advanced disclosure starts collapsed.

## Verification result

The curated harness completed with 18 built-in recipes × 2 source images, asserting a repeat render for each cell. Its sheet has no timestamps or nondeterministic data; only manifest timing observations vary by machine.

## Current integrated status — 2026-08-22

The 18-style catalog and source-preservation contract remain intact. Progressive Decay now uses a stable structural seed and gentler pacing, while Fade along stroke is an independent Evolution setting rather than a catalog replacement. Current full validation passes typecheck, 282/282 tests, and production build.
