import { ellipse, path, rect } from '../author';
import type { IllustrationNode } from '../schema';
const outline = { stroke: '$ink', strokeWidth: 7 };
export const coffeeAssets: Record<string, IllustrationNode[]> = {
  'coffee-bean': [
    ellipse('body', 85, 118, '$coffee', { ...outline, rotation: -18 }),
    ellipse('shade', 50, 99, '#512e24', { x: 17, rotation: -18, opacity: 0.3 }),
    path('crease', 'M 4 -103 C -50 -32 48 23 -9 104', 'none', { stroke: '$cream', strokeWidth: 9 }),
    path('shine', 'M -49 -68 Q -71 -31 -61 0', 'none', {
      stroke: '$cream',
      strokeWidth: 7,
      opacity: 0.45,
    }),
  ],
  'coffee-grounds': Array.from({ length: 75 }, (_, i) =>
    ellipse(`grain-${i}`, 3 + (i % 4), 2 + (i % 3), i % 3 ? '$coffee' : '$gold', {
      x: -150 + ((i * 71) % 300),
      y: -23 + ((i * 43) % 47),
      rotation: (i * 31) % 180,
    }),
  ),
  'espresso-machine': [
    rect('foot', 690, 45, '$ink', { x: -345, y: 366, rx: 20 }),
    rect('housing', 600, 650, '$coral', { x: -300, y: -300, rx: 55, ...outline }),
    path('side-shade', 'M 220 -296 Q 300 -296 300 -230 V300 Q300 350 250 350 H218 Z', '$coffee', {
      opacity: 0.18,
    }),
    rect('panel', 506, 122, '$paper', { x: -253, y: -251, rx: 27, ...outline }),
    ellipse('gauge', 43, 43, '$gold', { x: -120, y: -190, ...outline }),
    path('gauge-ticks', 'M -150 -190 h9 M -120 -221 v9 M -90 -190 h-9', 'none', {
      stroke: '$ink',
      strokeWidth: 4,
    }),
    path('needle', 'M 0 0 L -23 -12', 'none', { x: -120, y: -190, stroke: '$ink', strokeWidth: 6 }),
    ellipse('button', 17, 17, '$teal', { x: 179, y: -190, ...outline }),
    rect('bay', 460, 395, '$ink', { x: -230, y: -90, rx: 35 }),
    rect('bay-light', 396, 324, '$shadow', { x: -198, y: -55, rx: 25 }),
    rect('grouphead', 240, 63, '$teal', { x: -120, y: -90, rx: 14, ...outline }),
    rect('tray', 492, 36, '$paper', { x: -246, y: 302, rx: 10, ...outline }),
    ...[-160, -80, 0, 80, 160].map((x, i) =>
      path(`slot-${i}`, `M ${x} 313 v14`, 'none', { stroke: '$ink', strokeWidth: 6 }),
    ),
  ],
  portafilter: [
    path('basket', 'M -155 -35 H155 L125 50 Q 0 95 -125 50 Z', '$teal', outline),
    rect('handle', 210, 42, '$ink', { x: 143, y: -18, rx: 18 }),
    path('filter', 'M -117 25 Q 0 65 117 25', 'none', { stroke: '$cream', strokeWidth: 5 }),
    path('spout', 'M 0 72 V111', 'none', { stroke: '$ink', strokeWidth: 22 }),
  ],
  'espresso-cup': [
    ellipse('saucer', 220, 34, '$shadow', { y: 182 }),
    ellipse('saucer-top', 207, 25, '$paper', { y: 170, ...outline }),
    path('handle', 'M 144 -80 C 260 -122 270 91 144 65', 'none', {
      stroke: '$ink',
      strokeWidth: 27,
    }),
    path('handle-highlight', 'M 151 -80 C 250 -108 245 77 150 65', 'none', {
      stroke: '$paper',
      strokeWidth: 14,
    }),
    path('glass', 'M -154 -104 L -128 118 Q 0 195 128 118 L154 -104 Z', '$paper'),
    path('wall', 'M -154 -104 L -128 118 Q 0 195 128 118 L154 -104', 'none', outline),
    // Liquid and crema are independently controllable via instance layerTracks.
    path('liquid', 'M -140 -72 H140 L118 111 Q0 176 -118 111 Z', '$coffee'),
    ellipse('crema', 140, 36, '$gold', { y: -72 }),
    ...Array.from({ length: 16 }, (_, i) =>
      ellipse(`bubble-${i}`, 2 + (i % 3), 2 + (i % 2), '$cream', {
        x: -107 + ((i * 41) % 215),
        y: -86 + ((i * 13) % 26),
      }),
    ),
    path(
      'rim',
      'M -154 -104 C -154 -153 154 -153 154 -104 C154 -55 -154 -55 -154 -104',
      'none',
      outline,
    ),
    path('glass-shine', 'M -126 -42 L -109 82', 'none', {
      stroke: '$cream',
      strokeWidth: 8,
      opacity: 0.6,
    }),
  ],
  steam: [
    path('wisp', 'M 0 0 C -42 -40 42 -62 0 -107 C -30 -138 21 -157 4 -190', 'none', {
      stroke: '$teal',
      strokeWidth: 9,
      opacity: 0.6,
    }),
  ],
  'water-drop': [
    path('drop', 'M0 -24 C-8 -12 -23 5 -18 17 C-10 36 14 31 19 17 C24 6 7 -13 0 -24 Z', '$teal', {
      stroke: '$ink',
      strokeWidth: 3,
    }),
  ],
  'coffee-scoop': [
    path('bowl', 'M-110 -32 Q0 -95 110 -32 Q100 55 0 61 Q-100 55 -110 -32 Z', '$gold', outline),
    path('grounds', 'M-98 -30 Q0 -100 98 -30 Q0 2 -98 -30 Z', '$coffee'),
    rect('handle', 165, 27, '$teal', { x: 100, y: -29, rx: 12, ...outline }),
  ],
};

coffeeAssets['cup-shell'] = coffeeAssets['espresso-cup'].filter((n) =>
  ['saucer', 'saucer-top', 'handle', 'handle-highlight', 'glass', 'wall'].includes(n.id),
);
coffeeAssets['cup-rim'] = coffeeAssets['espresso-cup'].filter((n) =>
  ['rim', 'glass-shine'].includes(n.id),
);
