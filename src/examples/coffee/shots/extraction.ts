import { asset, ellipse, group, path } from '../../../illustration/author';
import { anticipate, draw, reveal, rotate, tween } from '../../../illustration/motion';
import { illustrationSchema } from '../../../illustration/schema';
import { createLabel, createCamera, createCup, cupClip } from '../shared';
import { resolveCues, type CueDefinitions } from '../../../storyboard/timeline';
import { extractionCues } from '../cues';
export const createExtractionIllustration = (definitions: CueDefinitions = extractionCues) => {
  const cues = resolveCues(definitions, 5);
  const at = (id: string, offset = 0) => cues[id].start + offset;
  return illustrationSchema.parse({
    eyebrow: 'CATATAN KOPI',
    edition: 'BIJI → ESPRESSO',
    style: 'education',
    camera: createCamera(535, 1000, 1.015),
    clips: [cupClip],
    nodes: [
      ellipse('halo', 370, 350, '$teal', { x: 540, y: 1010, opacity: 0.1, depth: 0.4 }),
      group(
        'machine-rig',
        [
          asset('machine', 'espresso-machine', {
            layerTracks: { needle: [tween('rotation', at('pressure'), 0.5, 0, 73)] },
          }),
          // Show the grounds loading, then lock the basket directly under the grouphead.
          group(
            'basket-rig',
            [
              asset('basket', 'portafilter', { scaleX: 0.7, scaleY: 0.7 }),
              asset('grounds', 'coffee-grounds', {
                y: -20,
                scaleX: 0.65,
                scaleY: 0.65,
                tracks: [...reveal(at('load', 0.6), 0.2)],
              }),
            ],
            {
              x: 0,
              y: 80,
              tracks: [...anticipate('y', at('dock'), cues.dock.end - cues.dock.start, 80, -17)],
            },
          ),
          group('scoop-rig', [asset('scoop', 'coffee-scoop', { scaleX: 0.65, scaleY: 0.65 })], {
            x: -230,
            y: -20,
            tracks: [
              {
                property: 'opacity',
                easing: 'smooth',
                keys: [
                  { time: at('load'), value: 0 },
                  { time: at('load', 0.25), value: 1 },
                  { time: cues.load.end + 0.05, value: 1 },
                  { time: cues.load.end + 0.55, value: 0 },
                ],
              },
              ...anticipate('x', at('load'), 0.7, -230, -20),
              ...rotate(at('load', 0.3), 0.45, 0, 35),
            ],
          }),
          path('stream', 'M0 60 C-4 90 4 120 0 153', 'none', {
            stroke: '$coffee',
            strokeWidth: 10,
            tracks: [...reveal(at('flow'), 0.15), ...draw(at('flow'), 0.35)],
          }),
          ...[0, 1, 2].map((i) =>
            group(`drop-rig-${i}`, [asset('drop', 'water-drop', { scaleX: 0.3, scaleY: 0.3 })], {
              tracks: [
                {
                  property: 'opacity',
                  easing: 'smooth',
                  keys: [
                    { time: at('pressure') + i * 0.1, value: 0 },
                    { time: at('pressure', 0.2) + i * 0.1, value: 1 },
                    { time: at('pressure', 0.4) + i * 0.1, value: 1 },
                    { time: at('pressure', 0.55) + i * 0.1, value: 0 },
                  ],
                },
              ],
              follow: {
                points: [
                  [i * 23 - 23, -96],
                  [i * 23 - 23, -76],
                  [i * 23 - 23, -40],
                  [i * 23 - 23, -20],
                ],
                start: at('pressure') + i * 0.1,
                duration: 0.35,
                orient: false,
              },
            }),
          ),
        ],
        { x: 540, y: 970, tracks: reveal(0.05, 0.4) },
      ),
      createCup({
        id: 'collecting-cup',
        x: 540,
        y: 1157,
        scale: 0.62,
        fillStart: cues.collect.start,
        fillEnd: cues.collect.end,
      }),
      createLabel('pressure-label', 'AIR PANAS + TEKANAN', 281, 616),
      path('pressure-pointer', 'M540 638 V685 M531 674 L540 685 L549 674', 'none', {
        stroke: '$teal',
        strokeWidth: 4,
        tracks: draw(at('pressure', -0.3), 0.4),
      }),
    ],
  });
};
export const extractionIllustration = createExtractionIllustration();
