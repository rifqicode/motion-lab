import { MOBILE_VIDEO } from '../../render/config';
import { beanIllustration } from './shots/beans';
import { extractionIllustration } from './shots/extraction';
import { espressoIllustration } from './shots/espresso';
import { extractionCues, espressoCues } from './cues';
import { referenceIllustration } from '../../storyboard/timeline';
export const storyboard = {
  version: '1.0',
  video: { ...MOBILE_VIDEO, durationSeconds: 15 },
  title: 'Dari biji ke espresso',
  premise:
    'Biji kopi disangrai dan digiling; air panas bertekanan mengekstrak bubuknya menjadi espresso.',
  shots: [
    {
      id: 'bean',
      narration: 'Biji kopi yang sudah disangrai digiling halus agar mudah diekstrak.',
      purpose: 'hook',
      visual: 'illustrated',
      illustration: beanIllustration,
      durationSeconds: 5,
      headline: 'Dari biji,\nmenjadi rasa.',
      subline: 'Biji sangrai digiling halus.\nLuas permukaan bertambah.',
      assets: [
        {
          id: 'coffee-bean',
          type: 'svg',
          description: 'Shaded roasted beans and fine coffee grounds',
        },
      ],
      direction: { camera: 'push', energy: 'calm', transition: 'fade' },
    },
    {
      id: 'extraction',
      cues: extractionCues,
      narration: 'Air panas bertekanan melewati bubuk kopi, melarutkan rasa dan aroma.',
      purpose: 'explain',
      visual: 'illustrated',
      illustration: referenceIllustration(extractionIllustration, extractionCues, [
        { path: 'machine-rig/machine', cue: 'pressure' },
        { path: 'machine-rig/basket-rig', cue: 'dock' },
        { path: 'machine-rig/basket-rig/grounds', cue: 'load' },
        { path: 'machine-rig/scoop-rig', cue: 'load' },
        { path: 'machine-rig/stream', cue: 'flow' },
        ...[0, 1, 2].map((i) => ({ path: `machine-rig/drop-rig-${i}`, cue: 'pressure' })),
        { path: 'collecting-cup', cue: 'collect', subtree: true },
        { path: 'pressure-pointer', cue: 'pressure' },
      ]),
      durationSeconds: 5,
      headline: 'Tekanan\nmembuka rasa.',
      subline: 'Air panas melewati bubuk kopi,\nmembawa rasa dan aroma.',
      assets: [
        {
          id: 'espresso-machine',
          type: 'svg',
          description: 'Cutaway of portafilter showing hot water through grounds',
        },
      ],
      direction: { camera: 'push', energy: 'medium', transition: 'fade' },
    },
    {
      id: 'espresso',
      cues: espressoCues,
      narration: 'Hasilnya espresso pekat, dengan lapisan crema di permukaannya.',
      purpose: 'payoff',
      visual: 'illustrated',
      illustration: referenceIllustration(espressoIllustration, espressoCues, [
        { path: 'pour', cue: 'pour', property: 'draw' },
        { path: 'pour', cue: 'stop', property: 'opacity' },
        { path: 'hero-cup', cue: 'fill', subtree: true },
        ...[0, 1, 2].map((i) => ({ path: `steam-rig-${i}`, cue: 'steam' })),
        { path: 'crema-callout', cue: 'label', subtree: true },
      ]),
      durationSeconds: 5,
      headline: 'Kecil. Pekat.\nEspresso.',
      subline: 'Ekstrak pekat terkumpul di cangkir.\nCrema terbentuk di permukaan.',
      assets: [
        {
          id: 'cup-shell',
          type: 'svg',
          description: 'Glass cup of espresso topped with golden crema',
        },
      ],
      direction: { camera: 'push', energy: 'calm', transition: 'fade' },
    },
  ],
};
