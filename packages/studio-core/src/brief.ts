import type {StyleBrief} from './style.js';

export const STYLE_BRIEF_KEYS = ['avoid', 'colorPalette', 'mood', 'pacing', 'referenceNotes', 'transitions', 'typography', 'visualDirection'] as const;

export function serializeBrief(brief: string, style?: Partial<StyleBrief>): string {
  const entries = STYLE_BRIEF_KEYS.flatMap(key => {
    const value = style?.[key]?.trim() ?? '';
    return value ? [[key, value]] : [];
  });
  return entries.length ? JSON.stringify({brief: brief.trim(), style: Object.fromEntries(entries)}) : brief.trim();
}
