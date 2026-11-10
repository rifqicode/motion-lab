import type { WordTiming, Scene } from '@studio/schema';

export type { WordTiming };

export interface TTSOptions {
  voice?: string;
  speed?: number; // e.g. 1.0 (or percentage string like "+0%")
  pitch?: string;
  cacheDir?: string;
  useCache?: boolean;
}

export interface TTSResult {
  audioFilePath: string;
  durationMs: number;
  vttFilePath?: string;
  cached?: boolean;
  voice: string;
}

export interface TTSProvider {
  readonly id: string;
  synthesize(
    text: string,
    outputFilePath: string,
    options?: TTSOptions
  ): Promise<TTSResult>;
}

export interface AlignmentResult {
  words: WordTiming[];
  audioDurationMs: number;
}

export interface AlignmentOptions {
  vttFilePath?: string;
}

export interface AlignmentProvider {
  readonly id: string;
  align(
    text: string,
    audioFilePath: string,
    durationMs: number,
    options?: AlignmentOptions
  ): Promise<AlignmentResult>;
}
