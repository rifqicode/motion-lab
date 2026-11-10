import fs from 'node:fs';
import type { WordTiming, AlignmentResult, AlignmentProvider, AlignmentOptions } from '../types.js';
import { DeterministicAlignmentProvider } from './deterministic.js';

function parseTimestampMs(timestamp: string): number {
  // Format: HH:MM:SS.mmm or MM:SS.mmm or with comma
  const normalized = timestamp.replace(',', '.').trim();
  const parts = normalized.split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  } else {
    seconds = parseFloat(normalized);
  }
  return Math.round(seconds * 1000);
}

export class VttAlignmentProvider implements AlignmentProvider {
  public readonly id = 'vtt-alignment';
  private fallback: DeterministicAlignmentProvider;

  constructor() {
    this.fallback = new DeterministicAlignmentProvider();
  }

  public async align(
    text: string,
    audioFilePath: string,
    durationMs: number,
    options?: AlignmentOptions
  ): Promise<AlignmentResult> {
    const vttFile = options?.vttFilePath;
    if (!vttFile || !fs.existsSync(vttFile)) {
      return this.fallback.align(text, audioFilePath, durationMs);
    }

    try {
      const content = fs.readFileSync(vttFile, 'utf-8');
      const cueRegex = /(\d{2}:\d{2}[:.]\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}[:.]\d{2}[,.]\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n\d+|$)/g;

      const cues: Array<{ startMs: number; endMs: number; text: string }> = [];
      let match: RegExpExecArray | null;

      while ((match = cueRegex.exec(content)) !== null) {
        const startMs = parseTimestampMs(match[1]);
        const endMs = parseTimestampMs(match[2]);
        const cueText = match[3].replace(/<[^>]+>/g, '').trim();
        if (cueText) {
          cues.push({ startMs, endMs, text: cueText });
        }
      }

      if (cues.length === 0) {
        return this.fallback.align(text, audioFilePath, durationMs);
      }

      // Map words across cues
      const allWords: WordTiming[] = [];
      for (const cue of cues) {
        const cueWords = cue.text.split(/\s+/).filter(Boolean);
        if (cueWords.length === 0) continue;

        const cueDuration = Math.max(100, cue.endMs - cue.startMs);
        const perWord = cueDuration / cueWords.length;

        cueWords.forEach((w, idx) => {
          allWords.push({
            text: w,
            startMs: Math.round(cue.startMs + idx * perWord),
            endMs: Math.round(cue.startMs + (idx + 1) * perWord),
            confidence: 0.98,
          });
        });
      }

      return {
        words: allWords,
        audioDurationMs: durationMs,
      };
    } catch {
      return this.fallback.align(text, audioFilePath, durationMs);
    }
  }
}
