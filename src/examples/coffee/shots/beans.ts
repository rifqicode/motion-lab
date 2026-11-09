import { asset, ellipse, group, path } from '../../../illustration/author';
import { anticipate, draw, reveal, rotate, squash, tween } from '../../../illustration/motion';
import { illustrationSchema } from '../../../illustration/schema';
import { createLabel, createCamera, createSprout } from '../shared';
export const beanIllustration = illustrationSchema.parse({
  eyebrow: 'CATATAN KOPI',
  edition: 'BIJI → ESPRESSO',
  style: 'education',
  camera: createCamera(530, 1010, 1.035),
  nodes: [
    ellipse('halo', 350, 345, '$gold', { x: 540, y: 985, opacity: 0.2, depth: 0.5 }),
    createSprout('foliage', 260, 1160),
    group(
      'hero-bean',
      [
        asset('bean', 'coffee-bean', { scaleX: 1.8, scaleY: 1.8, rotation: -15 }),
        // A small expressive face is optional art, distinct from the bean's identifying crease.
        ellipse('eye-left', 5, 8, '$cream', { x: 24, y: -33 }),
        ellipse('eye-right', 5, 8, '$cream', { x: 54, y: -20 }),
        path('smile', 'M 21 0 Q 28 19 43 13', 'none', { stroke: '$cream', strokeWidth: 5 }),
      ],
      {
        x: 540,
        y: 920,
        tracks: [
          ...reveal(0.1, 0.3),
          ...anticipate('y', 0.12, 0.9, 760, 920),
          ...rotate(0.2, 1, -25, 0),
        ],
      },
    ),
    group(
      'left-bean',
      [asset('bean', 'coffee-bean', { rotation: 23, scaleX: 0.76, scaleY: 0.76 })],
      { x: 285, y: 1055, tracks: [...reveal(0.3, 0.3), tween('y', 0.3, 0.8, 1180, 1055)] },
    ),
    group(
      'right-bean',
      [asset('bean', 'coffee-bean', { rotation: 48, scaleX: 0.85, scaleY: 0.85 })],
      { x: 790, y: 1015, tracks: [...reveal(0.45, 0.3), ...anticipate('x', 0.45, 0.8, 900, 790)] },
    ),
    path(
      'grind-arrow',
      'M 540 1135 C540 1190 540 1200 540 1240 M525 1224 L540 1240 L555 1224',
      'none',
      { stroke: '$teal', strokeWidth: 7, tracks: [...draw(1.6, 0.65), ...reveal(1.55, 0.1)] },
    ),
    group(
      'grounds-stage',
      [
        asset('grounds', 'coffee-grounds', { scaleX: 1.3, scaleY: 1.3 }),
        createLabel('grounds-label', 'DIGILING HALUS', -148, 90),
      ],
      { x: 540, y: 1305, tracks: [...reveal(2.1, 0.35), ...squash(2.15, 0.5, 0.12)] },
    ),
  ],
});
