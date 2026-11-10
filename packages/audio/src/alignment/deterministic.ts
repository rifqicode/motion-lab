import type { WordTiming, AlignmentResult, AlignmentProvider } from '../types.js';

export class DeterministicAlignmentProvider implements AlignmentProvider {
  public readonly id = 'deterministic';

  public async align(
    text: string,
    _audioFilePath: string,
    durationMs: number
  ): Promise<AlignmentResult> {
    const rawWords = text.trim().split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) {
      return { words: [], audioDurationMs: durationMs };
    }

    const leadInMs = Math.min(150, Math.floor(durationMs * 0.05));
    const trailingMs = Math.min(250, Math.floor(durationMs * 0.08));
    const speechSpanMs = Math.max(100, durationMs - leadInMs - trailingMs);

    // Calculate weight for each word based on length + punctuation
    const weights = rawWords.map((word) => {
      let weight = Math.max(2, word.replace(/[^a-zA-Z0-9]/g, '').length);
      if (word.endsWith(',') || word.endsWith(';')) {
        weight += 2; // slight pause
      } else if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
        weight += 3; // sentence pause
      }
      return weight;
    });

    const totalWeight = weights.reduce((acc, w) => acc + w, 0);

    let currentMs = leadInMs;
    const words: WordTiming[] = rawWords.map((word, i) => {
      const share = (weights[i] / totalWeight) * speechSpanMs;
      // Leave a tiny gap between words (e.g. 20ms) for natural boundary
      const gap = Math.min(30, Math.floor(share * 0.1));
      const wordDuration = Math.max(80, Math.round(share - gap));

      const startMs = Math.round(currentMs);
      const endMs = Math.round(startMs + wordDuration);
      currentMs = endMs + gap;

      // Clean punctuation for display if needed, but keep word text
      return {
        text: word,
        startMs,
        endMs,
        confidence: 0.95,
      };
    });

    return {
      words,
      audioDurationMs: durationMs,
    };
  }
}
