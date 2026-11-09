import { asset, ellipse, group, node, path, rect } from '../../illustration/author';
import { tween } from '../../illustration/motion';
export const createLabel = (id: string, text: string, x: number, y: number) =>
  node({ id, kind: 'text', text, x, y, fontSize: 29, fill: '$ink' });
export const createCamera = (x = 540, y = 1020, zoom = 1.04) => [
  { time: 0, x: 540, y: 1020, zoom: 0.96 },
  { time: 3.1, x, y, zoom },
  { time: 5, x, y, zoom },
];
export const createSprout = (id: string, x: number, y: number) =>
  group(
    id,
    [
      path('stem', 'M0 65 Q-30 0 3 -65', 'none', { stroke: '$teal', strokeWidth: 7 }),
      path('leaf-left', 'M-7 8 Q-102 0 -86 -63 Q-21 -70 -7 8 Z', '$teal'),
      path('leaf-right', 'M-3 -21 Q65 -111 90 -43 Q57 1 -3 -21 Z', '$teal'),
    ],
    { x, y, depth: 0.3 },
  );
export type CupOptions = {
  id: string;
  x: number;
  y: number;
  scale: number;
  fillStart: number;
  fillEnd: number;
};
// Named options make the placement and fill interval explicit at each call site.
export const createCup = ({ id, x, y, scale, fillStart, fillEnd }: CupOptions) =>
  group(
    id,
    [
      asset('shell', 'cup-shell'),
      group(
        'fill',
        [
          rect('liquid', 310, 300, '$coffee', {
            colorTracks: [
              {
                property: 'fill',
                easing: 'smooth',
                keys: [
                  { time: fillStart, value: '$coffee' },
                  { time: fillEnd, value: '#4d2c22' },
                ],
              },
            ],
            x: -155,
            y: 180,
            rx: 0,
            tracks: [tween('y', fillStart, fillEnd - fillStart, 180, -72)],
          }),
          ellipse('crema', 144, 34, '$gold', {
            y: 180,
            tracks: [tween('y', fillStart, fillEnd - fillStart, 180, -72)],
          }),
          path('surface-ripple', 'M -115 0 C -45 -7 45 7 115 0', 'none', {
            stroke: '$cream',
            strokeWidth: 3,
            tracks: [tween('y', fillStart, fillEnd - fillStart, 180, -72)],
            morph: {
              from: 'M -115 0 C -45 -7 45 7 115 0',
              to: 'M -115 0 C -45 0 45 0 115 0',
              start: fillStart,
              duration: fillEnd - fillStart,
            },
          }),
          ...Array.from({ length: 17 }, (_, i) =>
            ellipse(`bubble-${i}`, 2 + (i % 4), 2 + (i % 3), '$cream', {
              x: -110 + ((i * 41) % 220),
              y: 0,
              tracks: [tween('y', fillStart, fillEnd - fillStart, 173 + (i % 20), -85 + (i % 26))],
            }),
          ),
        ],
        { clip: 'cup-interior' },
      ),
      asset('rim', 'cup-rim'),
    ],
    { x, y, scaleX: scale, scaleY: scale },
  );
export const cupClip = {
  id: 'cup-interior',
  nodes: [path('interior', 'M -144 -105 L -119 112 Q0 179 119 112 L144 -105 Z', 'white')],
};
