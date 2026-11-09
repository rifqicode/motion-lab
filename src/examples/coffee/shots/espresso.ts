import { asset, ellipse, group, path, rect } from '../../../illustration/author';
import { draw, reveal, tween } from '../../../illustration/motion';
import { illustrationSchema } from '../../../illustration/schema';
import { createLabel, createCamera, createCup, cupClip } from '../shared';
import { resolveCues, type CueDefinitions } from '../../../storyboard/timeline';
import { espressoCues } from '../cues';
export const createEspressoIllustration = (definitions: CueDefinitions = espressoCues) => {
  const cues = resolveCues(definitions, 5);
  return illustrationSchema.parse({
    eyebrow: 'CATATAN KOPI',
    edition: 'BIJI → ESPRESSO',
    style: 'education',
    camera: createCamera(540, 1015, 1.08),
    clips: [cupClip],
    paints: [
      {
        id: 'crema-depth',
        kind: 'radial',
        stops: [
          { offset: 0, color: '$cream' },
          { offset: 1, color: '$gold' },
        ],
      },
    ],
    masks: [
      { id: 'steam-soft', nodes: [rect('visible', 200, 260, 'white', { x: -100, y: -230 })] },
    ],
    nodes: [
      ellipse('halo', 350, 325, '$gold', { x: 540, y: 1080, opacity: 0.22, depth: 0.35 }),
      path('pour', 'M540 690 C532 775 549 850 540 977', 'none', {
        stroke: '$coffee',
        strokeWidth: 11,
        tracks: [
          ...draw(cues.pour.start, cues.pour.end - cues.pour.start),
          tween('opacity', cues.stop.start, cues.stop.end - cues.stop.start, 1, 0),
        ],
      }),
      createCup({
        id: 'hero-cup',
        x: 540,
        y: 1115,
        scale: 1.65,
        fillStart: cues.fill.start,
        fillEnd: cues.fill.end,
      }),
      ...[0, 1, 2].map((i) =>
        group(`steam-rig-${i}`, [asset('steam', 'steam', { scaleX: 0.6, scaleY: 0.72 })], {
          x: 465 + i * 77,
          y: 915,
          mask: 'steam-soft',
          tracks: [
            ...reveal(cues.steam.start + i * 0.13, 0.5),
            tween('y', cues.steam.start + i * 0.13, 1.5, 960, 895),
            tween('x', cues.steam.start + i * 0.13, 1.5, 465 + i * 77, 453 + i * 77),
          ],
        }),
      ),
      group(
        'crema-callout',
        [
          path('leader', 'M745 995 L830 890 H920', 'none', {
            stroke: '$teal',
            strokeWidth: 4,
            tracks: draw(cues.label.start, 0.45),
          }),
          createLabel('crema-label', 'CREMA', 808, 858),
        ],
        { tracks: reveal(cues.label.start, 0.4) },
      ),
    ],
  });
};
export const espressoIllustration = createEspressoIllustration();
const paintCrema = (nodes: typeof espressoIllustration.nodes) =>
  nodes.forEach((n) => {
    if (n.id === 'crema') n.fill = '@crema-depth';
    paintCrema(n.children);
  });
paintCrema(espressoIllustration.nodes);
