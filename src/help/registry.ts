import type { ControlHelp } from './types';

export function helpSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const motionFieldHelp: ControlHelp[] = [
  {
    id: 'mosh.application-target',
    title: 'Application target',
    short: 'Chooses which image area receives the active MOSH effect.',
    description:
      'Targets the whole image, current brush mask, selection, luminance range, or detected edges.',
    performance: 'Smaller targets generally process faster than the whole image.',
    output: 'Affects preview and final output.',
    example: 'Use Brush Mask to confine motion to the last painted mask.',
    defaultValue: 'Whole Image',
    keywords: ['mask', 'selection', 'luminance', 'edge'],
  },
  {
    id: 'mosh.effect-preset',
    title: 'Effect preset',
    short: 'Loads a prepared combination of parameters for the current MOSH effect.',
    description: 'Replaces effect parameters with a built-in or saved user configuration.',
    performance: 'Cost depends on the loaded parameter values.',
    output: 'Affects preview and final output.',
    defaultValue: 'Custom',
    keywords: ['preset', 'motion field'],
  },
  {
    id: 'mosh.field-source',
    title: 'Field source',
    short: 'Defines the direction pattern used to move image blocks.',
    description:
      'Directional uses one direction; Brush Direction follows the last stroke; Radial moves around a center; Vortex rotates; Noise Flow is irregular; Image Edges reacts to contours.',
    performance: 'Edge and noise-derived fields require extra analysis.',
    output: 'Affects preview and final output.',
    defaultValue: 'Directional',
    keywords: ['directional', 'radial', 'vortex', 'noise flow', 'image edges'],
  },
  {
    id: 'mosh.overwrite-blocks',
    title: 'Overwrite blocks',
    short: 'Chooses hard block replacement instead of soft blending.',
    description:
      'When enabled, propagated blocks overwrite their destination for harsher packet-loss damage.',
    low: 'Off produces smoother mixed movement.',
    high: 'On produces hard packet-loss-style blocks.',
    performance: 'Minimal cost impact.',
    output: 'Affects preview and final output.',
    defaultValue: 'Off',
  },
  {
    id: 'motion-field.mix',
    title: 'Mix',
    short: 'Controls how strongly the processed motion result replaces the original.',
    description: 'Blends the Motion Field output with the untouched input.',
    low: 'Mostly original image.',
    high: 'Mostly processed motion result.',
    performance: 'Does not materially change processing cost.',
    output: 'Affects preview and final output.',
    example: 'Use 0.35 for a readable image or 0.85 for destructive movement.',
    defaultValue: '1.00',
    keywords: ['motion field', 'blend'],
  },
  {
    id: 'control.block-size',
    title: 'Block size',
    short: 'Sets the dimensions of macroblocks propagated through the motion field.',
    description: 'Divides the source into blocks before movement is calculated.',
    low: 'Detailed, fragmented movement.',
    high: 'Chunky, obvious blocks.',
    performance: 'Larger blocks usually process faster but look coarser.',
    output: 'Affects preview and final output.',
    example: 'Use 6–12 px for detail or 24–48 px for coarse signal blocks.',
    defaultValue: '12 px',
    related: ['control.propagation-length', 'control.iterations'],
    keywords: ['motion field', 'macroblock'],
  },
  {
    id: 'control.propagation-length',
    title: 'Propagation length',
    short: 'Controls how far copied blocks travel in the generated motion direction.',
    description: 'Sets the maximum travel distance for propagated macroblocks.',
    low: 'Short local block movement.',
    high: 'Long stretched trails and stronger datamosh dragging.',
    performance: 'High values expand the processed area and may slow final rendering.',
    output: 'Affects preview and final output.',
    example: 'Use 40–120 px for compact tearing or 200–480 px for long trails.',
    defaultValue: '110 px',
    related: ['control.block-size', 'control.vector-strength'],
    keywords: ['motion field', 'propagation', 'datamosh'],
  },
  {
    id: 'control.iterations',
    title: 'Iterations',
    short: 'Repeats the current effect pass to accumulate a stronger result.',
    description: 'Runs the effect output through the same operation again.',
    low: 'One clear displacement.',
    high: 'Accumulated melting and repeated prediction errors.',
    performance: 'Cost rises approximately with the number of iterations.',
    output: 'Affects preview and final output; live preview may cap iterations.',
    example: 'Start at 2–4; use 8+ only for deliberately heavy damage.',
    defaultValue: '3',
    keywords: ['passes', 'motion field', 'performance'],
  },
  {
    id: 'control.vector-strength',
    title: 'Vector strength',
    short: 'Sets the magnitude of each motion-field displacement step.',
    description: 'Multiplies the movement vector used for every propagated block.',
    low: 'Subtle movement.',
    high: 'Forceful displacement.',
    performance: 'Large values can expand dirty bounds but do not add passes.',
    output: 'Affects preview and final output.',
    example: 'Use 0.4–1.0 for controlled drift and 1.5–3.0 for tearing.',
    defaultValue: '1.00',
  },
  {
    id: 'control.vector-jitter',
    title: 'Vector jitter',
    short: 'Adds seeded randomness to individual block directions.',
    description: 'Perturbs the field vector independently for neighboring blocks.',
    low: 'Organized motion.',
    high: 'Chaotic broken movement.',
    performance: 'Minimal cost impact.',
    output: 'Affects preview and final output.',
    example: 'Use 0.15 for texture or above 0.8 for packet-like chaos.',
    defaultValue: '0.18',
  },
  {
    id: 'control.persistence',
    title: 'Persistence',
    short: 'Keeps motion from the previous pass alive in later passes.',
    description: 'Controls how much propagated data survives between iterations.',
    low: 'The effect fades quickly.',
    high: 'Trails continue through many iterations.',
    performance: 'Does not add passes, but stronger trails can affect more pixels.',
    output: 'Affects preview and final output.',
    defaultValue: '0.72',
  },
  {
    id: 'control.decay',
    title: 'Decay',
    short: 'Controls how quickly older propagated image data fades.',
    description: 'Reduces the contribution of earlier motion samples.',
    low: 'Strong persistent trails.',
    high: 'Shorter, more transparent trails.',
    performance: 'Minimal cost impact.',
    output: 'Affects preview and final output.',
    defaultValue: '0.12',
  },
  {
    id: 'control.luma-lock',
    title: 'Luma lock',
    short: 'Preserves original brightness while allowing block and color movement.',
    description: 'Mixes original luminance back into the displaced result.',
    low: 'Brightness moves with everything else.',
    high: 'Objects remain recognizable while colors drift.',
    performance: 'Adds a small per-pixel blend cost.',
    output: 'Affects preview and final output.',
    defaultValue: '0.35',
  },
  {
    id: 'control.chroma-drift',
    title: 'Chroma drift',
    short: 'Offsets color information separately from luminance.',
    description: 'Separates chroma channels from the brightness structure.',
    low: 'Colors stay aligned.',
    high: 'Visible color trails and signal separation.',
    performance: 'Small additional sampling cost.',
    output: 'Affects preview and final output.',
    defaultValue: '4 px',
  },
  {
    id: 'control.spill-amount',
    title: 'Spill amount',
    short: 'Allows displaced pixels to extend beyond a mask or selected region.',
    description: 'Expands the write boundary around the active effect target.',
    low: 'Tightly clipped effect.',
    high: 'Displacement can escape the selection.',
    performance: 'Higher spill processes a larger dirty rectangle.',
    output: 'Affects preview and final output.',
    defaultValue: '0',
  },
];

const imageBrushHelp: ControlHelp[] = [
  {
    id: 'image-brush.optimization',
    title: 'Stamp working maximum',
    short: 'Chooses the maximum decoded dimensions used while editing the active stamp.',
    description:
      'Optimization resamples only the working RGBA tip. The original uploaded pixels remain available for restoration and full-resolution workflows.',
    performance:
      'Smaller tips reduce preview, cache, Worker-transfer and per-stamp FX cost quadratically.',
    output: 'Affects working stamp detail; the original asset is preserved.',
    defaultValue: 'Auto',
  },
  {
    id: 'image-brush.lock-recipe',
    title: 'Lock recipe',
    short:
      'Keeps the current seed and variation nonce so the same randomization action reproduces the same recipe.',
    description:
      'Turn it off to generate a fresh variation on every Randomize style click. Turn it on to replay the current seeded recipe.',
    performance: 'No direct processing cost.',
    output: 'Changes recipe generation, not committed pixels by itself.',
    defaultValue: 'Off',
  },
  {
    id: 'control.rendering-quality',
    title: 'Rendering quality',
    short: 'Chooses how closely the live stroke preview matches final processing.',
    description:
      'Controls only the interactive approximation; pointer-up always performs the configured final render.',
    low: 'Realtime favors cached and reduced-cost live variants.',
    high: 'High Quality defers expensive work until pointer-up.',
    performance: 'Realtime and Auto are recommended for large documents.',
    output: 'Does not silently lower committed or exported resolution.',
    example: 'Use Balanced normally and Realtime for long Evolving trails.',
    defaultValue: 'Balanced',
    keywords: ['image brush', 'performance', 'cache'],
    options: [
      {
        value: 'auto',
        label: 'Auto',
        description:
          'Chooses Realtime, Balanced or High from document size, tip size, stamp count and active FX cost.',
      },
      {
        value: 'realtime',
        label: 'Realtime',
        description:
          'Draws one cached variant with smoothing disabled so long strokes stay responsive; final pixels are unchanged.',
      },
      {
        value: 'balanced',
        label: 'Balanced',
        description:
          'Draws the available cached variant pool with smoothing and moderate per-frame work.',
      },
      {
        value: 'high',
        label: 'High',
        description:
          'Uses all available cached preview variants with smoothing; expensive processing still waits for pointer-up.',
      },
    ],
  },
  {
    id: 'control.live-stamps-frame',
    title: 'Maximum live stamps per frame',
    short: 'Caps overlay work in one animation frame while queued path data is preserved.',
    description: 'Limits the number of cached stamp images drawn per requestAnimationFrame.',
    low: 'Smoother UI but the temporary trail may catch up over several frames.',
    high: 'The temporary trail catches up faster but each frame costs more.',
    performance: 'Directly affects interactive frame time.',
    output: 'Preview only; final output retains the entire sampled path.',
    defaultValue: '24',
    keywords: ['image brush', 'rAF', 'queue'],
  },
  {
    id: 'control.maximum-generated-stamps',
    title: 'Maximum generated stamps',
    short: 'Sets a safety limit for a single Image Brush stroke.',
    description: 'Prevents accidental unbounded memory and processing on extremely dense paths.',
    low: 'Shorter maximum trails.',
    high: 'Allows very long or densely spaced trails.',
    performance: 'High limits can make final processing and memory use expensive.',
    output: 'Affects the final stroke safeguard.',
    defaultValue: '5000',
  },
  {
    id: 'image-brush.mutation',
    title: 'Mutation mode',
    short:
      'Defines how consecutive copies reuse, progress, alternate, accumulate, or connect their corruption.',
    description:
      'Nine real modes cover clean/fixed reuse, bounded progressive or random variants, cumulative chains, procedural stacks, alternating recipes, stroke gradients and connected whole-trail processing.',
    performance:
      'Fixed is cheapest; procedural stacks, cumulative chains and connected whole-trail processing cost more.',
    output: 'Affects preview and final output.',
    defaultValue: 'Clean',
    keywords: [
      'fixed glitch',
      'progressive decay',
      'per stamp',
      'evolving',
      'effect stack',
      'alternating',
      'gradient',
      'whole trail',
    ],
    options: [
      {
        value: 'clean',
        label: 'Clean Repeat',
        description: 'Uses the decoded brush image without running the Stamp FX rack.',
      },
      {
        value: 'fixed',
        label: 'Fixed Glitch',
        description:
          'Processes each source image once per stroke and reuses that identical corrupted result.',
      },
      {
        value: 'progressive',
        label: 'Progressive Decay',
        description:
          'Maps stroke progress to bounded key variants whose structural corruption becomes stronger.',
      },
      {
        value: 'per-stamp',
        label: 'Random Per Stamp',
        description:
          'Builds a bounded deterministic pool of different effect combinations and cycles through it.',
      },
      {
        value: 'evolving',
        label: 'Evolving Chain',
        description:
          'Processes every next stamp from the previous prepared result so corruption genuinely accumulates.',
      },
      {
        value: 'random-stack',
        label: 'Random Effect Stack',
        description:
          'Builds a new deterministic subset, order and strength recipe for every stamp.',
      },
      {
        value: 'alternating',
        label: 'Alternating Modes',
        description:
          'Switches between two selected recipes at the configured interval or by a seeded choice.',
      },
      {
        value: 'stroke-gradient',
        label: 'Stroke Gradient',
        description:
          'Interpolates the selected start and end recipes using progress along the current stroke.',
      },
      {
        value: 'whole-trail',
        label: 'Whole Trail Processing',
        description:
          'Builds the clean local stamp layer first and runs the FX rack once across that connected region.',
      },
    ],
  },
  {
    id: 'image-brush.fx-stage',
    title: 'FX processing stage',
    short: 'Chooses whether effects modify the PNG tip, variants, or completed trail.',
    description:
      'Brush Tip processes the PNG once; Every Stamp varies repeated tips; Completed Trail processes the local trail region; Tip + Trail performs both.',
    performance: 'Completed Trail cost depends on the local trail bounding box.',
    output: 'Affects final composition and the processed-tip explanation.',
    defaultValue: 'Brush Tip',
    keywords: ['stage', 'before', 'after', 'trail'],
    options: [
      {
        value: 'before',
        label: 'Brush Tip',
        description:
          'Runs the active mutation recipe on prepared tip variants before they are placed.',
      },
      {
        value: 'each',
        label: 'Every Stamp',
        description: 'Runs the selected mutation behavior while individual copies are generated.',
      },
      {
        value: 'after',
        label: 'Completed Trail',
        description:
          'Places clean copies first, then processes the isolated finished trail as one connected local region.',
      },
      {
        value: 'before-after',
        label: 'Tip + Trail',
        description:
          'Processes stamp variants first and processes the completed local trail a second time.',
      },
    ],
  },
  {
    id: 'image-brush.brush-mode',
    title: 'Brush mode',
    short: 'Chooses how brush-library images are selected and placed along the sampled path.',
    description:
      'Controls placement behavior. Spacing still determines the distance between sampled path points.',
    options: [
      {
        value: 'stamp',
        label: 'Stamp',
        description:
          'Places repeated copies of the active image along the path with ordinary layout controls.',
      },
      {
        value: 'trail',
        label: 'Trail',
        description: 'Builds a continuous repeated-image trail from the active image.',
      },
      {
        value: 'scatter',
        label: 'Scatter',
        description: 'Applies the configured X/Y scatter around every path placement.',
      },
      {
        value: 'sequence',
        label: 'Sequence',
        description: 'Cycles through the brush library in its current order.',
      },
      {
        value: 'random-hose',
        label: 'Random Hose',
        description:
          'Seed-selects images from the library and allows scattered multi-copy placement.',
      },
    ],
  },
  {
    id: 'image-brush.unit',
    title: 'Spacing unit',
    short: 'Chooses whether Spacing is measured from brush width or in document pixels.',
    description:
      'Percentage spacing scales with Size; pixel spacing stays constant when Size changes.',
    options: [
      {
        value: 'percent',
        label: '% width',
        description: 'Spacing equals Size multiplied by this percentage.',
      },
      {
        value: 'pixels',
        label: 'Pixels',
        description: 'Spacing is an absolute number of document pixels.',
      },
    ],
  },
  {
    id: 'image-brush.rotation',
    title: 'Rotation mode',
    short: 'Chooses how every repeated image is rotated.',
    description: 'The base Angle and optional random jitter are added after the selected rule.',
    options: [
      { value: 'fixed', label: 'Fixed', description: 'Uses the same base angle for every stamp.' },
      {
        value: 'follow',
        label: 'Follow Stroke',
        description: 'Rotates each image to the local direction of the stroke.',
      },
      {
        value: 'perpendicular',
        label: 'Perpendicular',
        description: 'Rotates each image 90° across the local stroke direction.',
      },
      {
        value: 'random',
        label: 'Random',
        description: 'Adds a seeded full-circle random angle to every stamp.',
      },
      {
        value: 'alternate',
        label: 'Alternate',
        description: 'Alternates between the base angle and the opposite 180° angle.',
      },
      {
        value: 'spin',
        label: 'Spin Along Stroke',
        description: 'Adds 22.5° for each successive stamp.',
      },
    ],
  },
  {
    id: 'image-brush.blend-mode',
    title: 'Blend mode',
    short: 'Chooses how each stamp color combines with pixels already underneath it.',
    description: 'The mode is used by both live cached stamping and final RGBA compositing.',
    options: [
      {
        value: 'normal',
        label: 'Normal',
        description: 'Alpha-composites the stamp over the image.',
      },
      {
        value: 'multiply',
        label: 'Multiply',
        description: 'Darkens by multiplying stamp and backdrop colors.',
      },
      { value: 'screen', label: 'Screen', description: 'Lightens by combining inverted colors.' },
      {
        value: 'overlay',
        label: 'Overlay',
        description: 'Multiplies dark backdrop tones and screens light tones.',
      },
      {
        value: 'difference',
        label: 'Difference',
        description: 'Uses the absolute color difference for inverted signal colors.',
      },
      {
        value: 'lighten',
        label: 'Lighten',
        description: 'Keeps the lighter value in each color channel.',
      },
      {
        value: 'darken',
        label: 'Darken',
        description: 'Keeps the darker value in each color channel.',
      },
      {
        value: 'hard-light',
        label: 'Hard Light',
        description: 'Applies an overlay-like contrast rule driven by the stamp.',
      },
      {
        value: 'color-dodge',
        label: 'Color Dodge',
        description: 'Brightens the backdrop toward the stamp color.',
      },
      {
        value: 'exclusion',
        label: 'Exclusion',
        description: 'Creates a softer, lower-contrast difference blend.',
      },
    ],
  },
  {
    id: 'image-brush.anchor',
    title: 'Anchor',
    short: 'Chooses which point inside the brush image is attached to the path coordinate.',
    description:
      'Changing the anchor moves the image around the same sampled path without changing the path.',
    options: [
      {
        value: 'center',
        label: 'Center',
        description: 'Attaches the center of the image to the path.',
      },
      { value: 'top', label: 'Top', description: 'Attaches the middle of the top edge.' },
      { value: 'bottom', label: 'Bottom', description: 'Attaches the middle of the bottom edge.' },
      { value: 'left', label: 'Left', description: 'Attaches the middle of the left edge.' },
      { value: 'right', label: 'Right', description: 'Attaches the middle of the right edge.' },
      {
        value: 'custom',
        label: 'Custom',
        description: 'Uses the point dragged directly on the processed-tip preview.',
      },
    ],
  },
  {
    id: 'image-brush.alpha-mode',
    title: 'Alpha mode',
    short: 'Chooses how Stamp FX may change transparent pixels around the brush image.',
    description:
      'Alpha handling is applied to the prepared tip before it is placed on the document.',
    options: [
      {
        value: 'preserve',
        label: 'Preserve Alpha',
        description:
          'Restores the original alpha channel and clears RGB where the source was fully transparent.',
      },
      {
        value: 'inside',
        label: 'Glitch Inside Alpha',
        description:
          'Uses the same strict original-alpha boundary while allowing RGB damage inside it.',
      },
      {
        value: 'bleed',
        label: 'Alpha Bleed',
        description:
          'Adds padding and extends nearby visible color into a soft outer alpha region.',
      },
      {
        value: 'corrupt',
        label: 'Corrupt Alpha',
        description: 'Keeps the alpha changes produced by the active FX.',
      },
    ],
  },
  {
    id: 'image-brush.evolution-curve',
    title: 'Evolution curve',
    short: 'Chooses how mutation strength changes from early to late stamps.',
    description:
      'Progressive Decay and Stroke Gradient read this curve when mapping early and late stamps.',
    options: [
      {
        value: 'constant',
        label: 'Constant',
        description: 'Uses the same added evolution contribution for all stamps.',
      },
      {
        value: 'linear',
        label: 'Linear',
        description: 'Raises corruption evenly from the start to the end.',
      },
      {
        value: 'ease-in',
        label: 'Ease In',
        description: 'Starts gently and increases damage more strongly near the end.',
      },
      {
        value: 'ease-out',
        label: 'Ease Out',
        description: 'Builds damage early and then levels off.',
      },
      {
        value: 'exponential',
        label: 'Exponential',
        description: 'Keeps early copies relatively clean and rises sharply near the end.',
      },
      {
        value: 'pulse',
        label: 'Pulse',
        description: 'Raises and lowers damage in repeated waves along the trail.',
      },
      {
        value: 'random-walk',
        label: 'Random Walk',
        description: 'Adds deterministic seeded variation around the overall progression.',
      },
    ],
  },
  {
    id: 'image-brush.active-effect',
    title: 'Active effect',
    short: 'Chooses which tested Stamp FX will be added to the rack.',
    description:
      'The popover lists the visible result and estimated cost of every available effect. Adding an effect does not replace existing rack items.',
  },
  {
    id: 'image-brush.preset',
    title: 'Style preset',
    short: 'Loads a complete prepared combination of layout, mutation and Stamp FX settings.',
    description:
      'The selected brush image stays loaded. Built-in and user preset choices are explained below.',
  },
  {
    id: 'control.size',
    title: 'Size',
    short:
      'Changes the document-space width of every repeated image. It does not change document resolution.',
    description: 'The renderer scales each brush asset from its decoded width to this width.',
    low: 'Small copies with finer trails.',
    high: 'Large copies and larger dirty regions.',
  },
  {
    id: 'control.spacing',
    title: 'Spacing',
    short: 'Controls spacing between repeated image copies.',
    description: 'The path sampler emits a new stamp after this distance.',
    low: 'Copies overlap and build a dense trail.',
    high: 'Copies separate and leave gaps.',
  },
  {
    id: 'control.opacity',
    title: 'Opacity',
    short: 'Changes the transparency of every placed image.',
    description:
      'Opacity is multiplied by Flow, pressure opacity and opacity jitter before compositing.',
    low: 'Faint copies.',
    high: 'More opaque copies.',
  },
  {
    id: 'image-brush.glitch-amount',
    title: 'Glitch Amount',
    short:
      'Changes the overall corruption strength using effect-specific values for the selected style.',
    description:
      'The slider updates the rack amounts and relevant mutation limits; it is not a uniform pixel multiplier.',
    low: 'Clean or subtle copies with little structural damage.',
    high: 'Broken or extreme copies with stronger effect-specific displacement, blocks and feedback.',
    defaultValue: 'Clean',
  },
  {
    id: 'control.variation',
    title: 'Variation',
    short: 'Controls how far consecutive seeded variants may differ from one another.',
    description:
      'The processing engine widens or narrows per-variant Stamp FX amount changes while preserving deterministic seeds.',
    low: 'Consecutive copies stay visually similar.',
    high: 'Consecutive copies may use noticeably different directions, strengths and damage patterns.',
    defaultValue: '0.35',
  },
  {
    id: 'control.flow',
    title: 'Flow',
    short:
      'Scales each stamp alpha before compositing, so overlapping copies build up more or less strongly.',
    description: 'Flow multiplies Opacity for every live and final placement.',
    low: 'Overlaps accumulate slowly.',
    high: 'Each copy contributes its full configured opacity.',
  },
  {
    id: 'control.angle',
    title: 'Angle',
    short: 'Adds a base rotation in degrees to every placed image.',
    description: 'The selected Rotation mode adds its direction or pattern on top of this angle.',
    low: 'Rotates counter-clockwise.',
    high: 'Rotates clockwise.',
  },
  {
    id: 'control.rotation-jitter',
    title: 'Rotation jitter',
    short: 'Adds a seeded random angle to each repeated image.',
    description:
      'The renderer adds a value between minus and plus this many degrees after the selected rotation rule.',
    low: 'Copies keep nearly the same orientation.',
    high: 'Copies rotate more chaotically.',
    defaultValue: '0°',
  },
  {
    id: 'control.scale-jitter',
    title: 'Scale jitter',
    short: 'Randomly varies the size of each repeated image.',
    description:
      'A seeded multiplier is applied around the configured Size and is clamped above zero.',
    low: 'Copies stay close to the configured Size.',
    high: 'Copies alternate between much smaller and larger sizes.',
    defaultValue: '0',
  },
  {
    id: 'control.x-scatter',
    title: 'X scatter',
    short: 'Offsets Scatter and Random Hose copies horizontally around the path.',
    description: 'The maximum offset is this value multiplied by the configured brush Size.',
    low: 'Copies stay close to the path.',
    high: 'Copies spread farther left and right.',
    defaultValue: '0',
  },
  {
    id: 'control.y-scatter',
    title: 'Y scatter',
    short: 'Offsets Scatter and Random Hose copies vertically around the path.',
    description: 'The maximum offset is this value multiplied by the configured brush Size.',
    low: 'Copies stay close to the path.',
    high: 'Copies spread farther above and below it.',
    defaultValue: '0',
  },
  {
    id: 'control.opacity-jitter',
    title: 'Opacity jitter',
    short: 'Randomly lowers the opacity of Scatter and Random Hose copies.',
    description:
      'Each copy keeps between the configured opacity and that opacity reduced by this fraction.',
    low: 'Copies have nearly uniform opacity.',
    high: 'Some copies become much fainter.',
    defaultValue: '0',
  },
  {
    id: 'control.flip-x-chance',
    title: 'Flip X chance',
    short: 'Sets the seeded probability that a scattered copy is mirrored horizontally.',
    description: 'Zero never flips; one flips every generated copy.',
    low: 'Few or no horizontal mirrors.',
    high: 'Most copies are mirrored horizontally.',
    defaultValue: '0',
  },
  {
    id: 'control.flip-y-chance',
    title: 'Flip Y chance',
    short: 'Sets the seeded probability that a scattered copy is mirrored vertically.',
    description: 'Zero never flips; one flips every generated copy.',
    low: 'Few or no vertical mirrors.',
    high: 'Most copies are mirrored vertically.',
    defaultValue: '0',
  },
  {
    id: 'control.stamps-per-step',
    title: 'Stamps per step',
    short: 'Places multiple Scatter or Random Hose copies at every sampled path point.',
    description: 'The final stamp count and processing cost grow approximately with this value.',
    low: 'One copy per sampled point.',
    high: 'A denser cloud and more final processing.',
    defaultValue: '1',
  },
  {
    id: 'control.edge-softness',
    title: 'Edge softness',
    short: 'Fades alpha near the transformed outer edges of each placed image.',
    description: 'The fade width grows up to about 18% of the smaller transformed stamp dimension.',
    low: 'Keeps the original hard edge.',
    high: 'Creates a wider soft fade at the edge.',
    defaultValue: '0',
  },
  {
    id: 'control.stroke-smoothing',
    title: 'Stroke smoothing',
    short: 'Blends new pointer positions toward the previous input before distance sampling.',
    description: 'It smooths the placement path; it does not blur stamp pixels.',
    low: 'Follows raw pointer movement closely.',
    high: 'Produces a calmer but more delayed path.',
  },
  {
    id: 'control.minimum-pressure-size',
    title: 'Minimum pressure size',
    short: 'Sets brush size at zero pressure when Pressure → size is enabled.',
    description:
      'Pointer pressure interpolates between this fraction and the full configured Size.',
    low: 'Light pressure produces very small copies.',
    high: 'Pressure changes size only slightly.',
    defaultValue: '0.20',
  },
  {
    id: 'control.minimum-pressure-opacity',
    title: 'Minimum pressure opacity',
    short: 'Sets stamp opacity at zero pressure when Pressure → opacity is enabled.',
    description: 'Pointer pressure interpolates between this fraction and the configured Opacity.',
    low: 'Light pressure produces very faint copies.',
    high: 'Pressure changes opacity only slightly.',
    defaultValue: '0.20',
  },
  {
    id: 'control.alpha-threshold',
    title: 'Alpha threshold',
    short: 'Treats pixels at or below this alpha as transparent when trimming image margins.',
    description: 'It changes the calculated transparent trim bounds, not the document alpha.',
    low: 'Trims only nearly transparent pixels.',
    high: 'Can trim faint edge pixels too.',
    defaultValue: '2',
  },
  {
    id: 'control.mutation-amount',
    title: 'Mutation amount',
    short: 'Sets the starting corruption strength used to scale active Stamp FX.',
    description: 'The evolution curve and speed may add more strength for later stamps.',
    low: 'Milder processed variants.',
    high: 'Stronger initial corruption.',
  },
  {
    id: 'control.evolution-speed',
    title: 'Evolution speed',
    short: 'Controls how quickly later Evolving or Feedback stamps gain corruption.',
    description: 'The selected Evolution Curve scales this value across the trail.',
    low: 'Copies change slowly.',
    high: 'Copies reach maximum corruption sooner.',
  },
  {
    id: 'control.maximum-corruption',
    title: 'Maximum corruption',
    short: 'Caps the combined mutation amount and evolution contribution.',
    description: 'No evolving stamp may exceed this normalized FX strength.',
    low: 'Keeps the trail readable.',
    high: 'Allows destructive late stamps.',
  },
  {
    id: 'control.effect-variation',
    title: 'Effect variation',
    short: 'Adds deterministic per-variant changes to individual Stamp FX amounts.',
    description: 'It changes variation strength without creating an unbounded variant cache.',
    low: 'Variants stay similar.',
    high: 'Cached variants differ more.',
  },
  {
    id: 'control.feedback-amount',
    title: 'Feedback amount',
    short:
      'Controls how much of the previous prepared tip is mixed into the next Stroke Feedback stamp.',
    description: 'Only Stroke Feedback reads this value.',
    low: 'Each stamp stays close to the clean tip.',
    high: 'Previous damage strongly carries forward.',
  },
  {
    id: 'control.underlying-sampling',
    title: 'Underlying sampling',
    short:
      'Controls how much document color sampled under the current stamp enters Stroke Feedback.',
    description: 'Only Stroke Feedback reads the current document pixels beneath the stamp.',
    low: 'Ignores the document underneath.',
    high: 'Strongly mixes underlying image color into the tip.',
  },
  {
    id: 'image-brush.decay',
    title: 'Decay',
    short: 'Darkens carried RGB feedback slightly on every Stroke Feedback step.',
    description:
      'The engine multiplies mixed RGB by a small decay factor; alpha is handled separately.',
    low: 'Feedback stays bright.',
    high: 'Feedback fades more quickly.',
  },
  {
    id: 'control.variant-pool',
    title: 'Variant pool',
    short: 'Sets how many deterministic Per Stamp variants are generated and reused.',
    description: 'The pool is capped again by Maximum cached variants and total stamp count.',
    low: 'More repetition and lower memory use.',
    high: 'More variety and more preview/Worker cost.',
  },
  {
    id: 'control.maximum-cached-variants',
    title: 'Maximum cached variants',
    short:
      'Caps how many prepared brush variants may be retained for live preview and final reuse.',
    description: 'Per Stamp uses the smaller of Variant pool, this cap and the final stamp count.',
    low: 'Lower memory use and more repetition.',
    high: 'More variety with higher preparation and memory cost.',
    defaultValue: '16',
  },
  {
    id: 'control.evolving-preview-variants',
    title: 'Evolving preview variants',
    short:
      'Limits how many progressively damaged variants are prepared for the temporary live trail.',
    description: 'The final Worker still processes the complete stroke after pointer-up.',
    low: 'Cheaper live preview with more repeated appearances.',
    high: 'More representative live evolution with more preview preparation.',
    defaultValue: '3',
  },
  {
    id: 'control.evolution-seed-offset',
    title: 'Evolution seed offset',
    short: 'Changes the deterministic seed used while generating evolving and feedback variants.',
    description: 'It changes the reproducible damage pattern without adding extra passes.',
    low: 'Selects an earlier deterministic seed offset.',
    high: 'Selects a later deterministic seed offset.',
    defaultValue: '0.50',
  },
  {
    id: 'control.structural-drift',
    title: 'Structural drift',
    short: 'Adds extra normalized corruption strength when the completed trail is processed.',
    description:
      'Only Completed Trail and Tip + Trail read this value; the engine adds up to 30% of it to post-trail FX strength.',
    low: 'Keeps the completed trail closer to its placed stamps.',
    high: 'Allows stronger connected post-trail damage.',
    defaultValue: '0.24',
  },
  {
    id: 'control.fallback-angle',
    title: 'Fallback angle',
    short: 'Defines the stroke direction used when the pointer path has no measurable movement.',
    description:
      'Single-click stamps and zero-length segments use this angle to calculate direction-aware rotation.',
    low: 'Points the fallback direction counter-clockwise.',
    high: 'Points it clockwise.',
    defaultValue: '0°',
  },
  {
    id: 'control.bleed-amount',
    title: 'Bleed amount',
    short: 'Adds this many pixels of padded alpha bleed around the prepared brush tip.',
    description:
      'Only Alpha Bleed reads this radius; it expands the tip and its conservative read bounds.',
    low: 'A narrow colored fringe.',
    high: 'A wider fringe and larger processed region.',
    defaultValue: '4 px',
  },
  {
    id: 'control.amount',
    title: 'Effect amount',
    short: 'Sets the normalized strength passed to this Stamp FX algorithm.',
    description: 'The mutation mode may scale this value again for individual variants.',
    low: 'A milder result from this rack effect.',
    high: 'A stronger result from this rack effect.',
  },
  {
    id: 'control.mix',
    title: 'Effect mix',
    short: 'Blends this effect result back with the pixels entering its rack step.',
    description: 'Zero keeps the input to this effect; one keeps its complete processed output.',
    low: 'Mostly the pixels before this effect.',
    high: 'Mostly this effect result.',
  },
  {
    id: 'image-brush.follow-direction',
    title: 'Follow direction',
    short: 'Lets direction-aware rotation modes use the local stroke direction.',
    description: 'When off, the Fallback angle supplies the direction instead.',
    defaultValue: 'On',
  },
  {
    id: 'image-brush.toggle',
    title: 'Effect enabled',
    short: 'Includes or bypasses this Stamp FX rack item.',
    description:
      'Bypassing keeps the effect and its settings in the rack but does not run it during preview or final processing.',
    defaultValue: 'On',
  },
  {
    id: 'image-brush.show-stamp-outline',
    title: 'Show stamp outline',
    short: 'Draws the transformed brush boundary on the temporary overlay while painting.',
    description: 'This is a preview guide and does not alter committed pixels.',
    defaultValue: 'On',
  },
  {
    id: 'image-brush.pressure-size',
    title: 'Pressure → size',
    short: 'Maps pointer pressure from Minimum pressure size to the configured full Size.',
    description: 'Mouse input without pressure normally uses full size.',
    defaultValue: 'Off',
  },
  {
    id: 'image-brush.pressure-opacity',
    title: 'Pressure → opacity',
    short: 'Maps pointer pressure from Minimum pressure opacity to the configured Opacity.',
    description: 'Mouse input without pressure normally uses full opacity.',
    defaultValue: 'Off',
  },
  {
    id: 'image-brush.pressure-spacing',
    title: 'Pressure → spacing',
    short: 'Places copies closer together as pointer pressure rises.',
    description:
      'The distance multiplier falls from 1.45 at zero pressure to 0.75 at full pressure.',
    defaultValue: 'Off',
  },
  {
    id: 'image-brush.preview-before-commit',
    title: 'Preview before commit',
    short: 'Keeps the completed stroke pending so Enter can commit it or Escape can discard it.',
    description:
      'The local result is visible while pending but is not added to history until confirmed.',
    defaultValue: 'Off',
  },
  {
    id: 'image-brush.trim-transparent-margins',
    title: 'Trim transparent margins',
    short:
      'Uses the brush image’s visible alpha bounds instead of its full rectangular dimensions.',
    description:
      'It changes placement bounds and preview sizing without deleting the stored source pixels.',
    defaultValue: 'On',
  },
  {
    id: 'image-brush.reset-each-stroke',
    title: 'Reset each stroke',
    short: 'Starts progressive and evolving mutation from its initial state on a new stroke.',
    description: 'Continue between strokes takes precedence when both switches are enabled.',
    defaultValue: 'On',
  },
  {
    id: 'image-brush.continue-between-strokes',
    title: 'Continue between strokes',
    short: 'Carries the evolution offset from one completed stroke into the next.',
    description: 'This keeps deterministic evolution progressing across separate strokes.',
    defaultValue: 'Off',
  },
];

const imageBrushMutationControlHelp: ControlHelp[] = [
  [
    'control.start-glitch',
    'Start glitch',
    'Sets the real FX strength used by the first Progressive Decay key variant.',
  ],
  [
    'control.end-glitch',
    'End glitch',
    'Sets the target FX strength used by the last Progressive Decay key variant.',
  ],
  [
    'control.decay-speed',
    'Decay speed',
    'Changes how quickly Progressive Decay moves from start damage toward end damage.',
  ],
  [
    'control.progressive-key-variants',
    'Progressive key variants',
    'Caps the prepared progressive variants that are reused across the live and final trail.',
  ],
  [
    'control.minimum-effects-per-stamp',
    'Minimum effects per stamp',
    'Sets the smallest deterministic effect subset in the Random Per Stamp pool.',
  ],
  [
    'control.maximum-effects-per-stamp',
    'Maximum effects per stamp',
    'Sets the largest effect subset allowed as Variation increases.',
  ],
  [
    'image-brush.lock-effect-pool',
    'Lock effect pool',
    'Restricts generated recipes to effect types currently enabled in the Stamp FX rack.',
  ],
  [
    'image-brush.allow-repeated-combinations',
    'Allow repeated combinations',
    'Allows deterministic pool entries to reuse an earlier effect combination.',
  ],
  [
    'control.mutation-step',
    'Mutation step',
    'Scales the new FX damage applied to each next Evolving Chain result.',
  ],
  [
    'control.previous-stamp-carry',
    'Previous stamp carry',
    'Controls how strongly the previous processed tip becomes the input of the next Evolving stamp inside the current stroke.',
  ],
  [
    'control.recovery',
    'Recovery',
    'Mixes clean source structure back into every Evolving Chain step.',
  ],
  [
    'control.maximum-damage',
    'Maximum damage',
    'Caps the normalized FX strength reached by the cumulative Evolving Chain.',
  ],
  [
    'control.chroma-drift',
    'Chroma drift',
    'Adds extra strength to Chroma Drift entries while an Evolving Chain is processed.',
  ],
  [
    'control.alpha-stability',
    'Alpha stability',
    'Pulls evolving alpha back toward the clean uploaded image after each mutation.',
  ],
  [
    'control.minimum-stack-effects',
    'Minimum stack effects',
    'Sets the minimum number of effects generated for each Random Effect Stack stamp.',
  ],
  [
    'control.maximum-stack-effects',
    'Maximum stack effects',
    'Sets the maximum number of effects generated for each Random Effect Stack stamp.',
  ],
  [
    'control.minimum-effect-strength',
    'Minimum effect strength',
    'Sets the lower seeded strength bound for generated Random Effect Stack entries.',
  ],
  [
    'control.maximum-effect-strength',
    'Maximum effect strength',
    'Sets the upper seeded strength bound for generated Random Effect Stack entries.',
  ],
  [
    'control.visual-coherence',
    'Visual coherence',
    'Pulls generated stack strengths toward a common value so consecutive recipes feel related.',
  ],
  [
    'image-brush.randomize-effect-order',
    'Randomize effect order',
    'Allows each seeded Random Effect Stack recipe to reorder its chosen effects.',
  ],
  [
    'image-brush.recipe-a',
    'Recipe A',
    'Chooses the first real FX recipe used by Alternating Modes.',
  ],
  [
    'image-brush.recipe-b',
    'Recipe B',
    'Chooses the second real FX recipe used by Alternating Modes.',
  ],
  [
    'control.alternating-interval',
    'Alternating interval',
    'Sets how many consecutive stamps use one recipe before switching to the other.',
  ],
  [
    'control.transition-blend',
    'Transition blend',
    'Adds a controlled amount of the inactive alternating recipe to each stamp.',
  ],
  [
    'image-brush.random-alternation',
    'Random alternation',
    'Uses a seeded A/B choice per interval instead of a strict repeating sequence.',
  ],
  [
    'image-brush.start-recipe',
    'Start recipe',
    'Chooses the real FX recipe at the beginning of Stroke Gradient.',
  ],
  [
    'image-brush.end-recipe',
    'End recipe',
    'Chooses the real FX recipe reached at the end of Stroke Gradient.',
  ],
].map(([id, title, short]) => ({
  id,
  title,
  short,
  description: short,
  output: 'Affects live preview and the final IMAGE BRUSH stroke.',
}));

export const helpRegistry: Readonly<Record<string, ControlHelp>> = Object.fromEntries(
  [...motionFieldHelp, ...imageBrushHelp, ...imageBrushMutationControlHelp].map((entry) => [
    entry.id,
    entry,
  ]),
);

export function genericControlHelp(id: string, label: string): ControlHelp {
  return {
    id,
    title: label,
    short: `Adjusts the ${label.toLowerCase()} setting for the active editor operation.`,
    description: `Changes ${label.toLowerCase()} for the currently selected tool or effect.`,
    low: 'Lower values produce less of this behavior.',
    high: 'Higher values produce more of this behavior.',
    performance: 'Processing cost depends on the active effect and affected area.',
    output: 'Unless marked as preview-only, this affects the committed result.',
    defaultValue: 'See the current preset.',
    keywords: [label],
  };
}

export function resolveControlHelp(id: string, label?: string): ControlHelp {
  return (
    helpRegistry[id] ??
    genericControlHelp(id, label ?? id.split('.').at(-1)?.replace(/-/g, ' ') ?? id)
  );
}
