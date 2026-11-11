import type {Storyboard} from '../src/storyboard.js';

export const board: Storyboard = {
  schemaVersion: 1, concept: 'Cache routing', hook: 'Tambah cache kok miss?', narrative: 'Show routing before and after a new server.',
  designSystem: {colors: ['#faf7ef', '#241a48'], typography: 'System sans', spacing: '48px safe area', motionStyle: 'Frame-based reveal'},
  sharedComponents: [{id: 'heading', description: 'Consistent top heading'}],
  shots: [
    {id: 'hook', title: 'Hook', durationFrames: 90, intent: 'Ask why', visualDirection: 'Large heading', motionInstructions: 'Reveal heading', transition: 'cut', dependencies: [], sharedComponents: ['heading']},
    {id: 'explain', title: 'Explain', durationFrames: 180, intent: 'Show rerouting', visualDirection: 'Two cache nodes', motionInstructions: 'Move key', transition: 'cut', dependencies: ['hook'], sharedComponents: ['heading']},
  ],
};
