import type { CueDefinitions } from '../../storyboard/timeline';
export const extractionCues: CueDefinitions = {
  load: { at: 0.2, duration: 0.75 },
  dock: { after: 'load', offset: 0.15, duration: 0.65 },
  pressure: { after: 'dock', offset: 0.05, duration: 0.5 },
  flow: { after: 'pressure', edge: 'start', offset: 0.3, duration: 0.35 },
  collect: { after: 'flow', edge: 'start', offset: 0.3, duration: 1.85 },
};
export const espressoCues: CueDefinitions = {
  pour: { at: 0.2, duration: 0.45 },
  fill: { after: 'pour', duration: 2 },
  stop: { after: 'fill', offset: -0.2, duration: 0.35 },
  steam: { after: 'fill', duration: 1.5 },
  label: { after: 'fill', offset: 0.45, duration: 0.45 },
};
