import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizePronunciation, DEFAULT_TECHNICAL_LEXICON } from './lexicon.js';
import { probeAudioDurationMs } from './probe.js';
import { calculateSceneDurationFrames, syncSceneDuration } from './sync.js';
import { DeterministicAlignmentProvider } from './alignment/deterministic.js';
import { VttAlignmentProvider } from './alignment/vtt.js';
import { MockTTSProvider } from './providers/mock-tts.js';
import type { Scene } from '@studio/schema';

const TEST_DIR = path.resolve(process.cwd(), '.cache/test-audio');

describe('Audio Package', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Pronunciation Lexicon', () => {
    it('normalizes common technical terms for Indonesian pronunciation', () => {
      const input = 'PostgreSQL menulis data ke WAL untuk CDC dengan Debezium dan Kafka.';
      const output = normalizePronunciation(input);

      expect(output).toContain('Postgres Q L');
      expect(output).toContain('W-A-L');
      expect(output).toContain('C-D-C');
      expect(output).toContain('De-be-zi-um');
      expect(output).toContain('Kafka');
    });

    it('respects word boundaries so substrings are not erroneously replaced', () => {
      const input = 'Walkaway from WAL in CDC.';
      const output = normalizePronunciation(input);

      expect(output).toContain('Walkaway');
      expect(output).toContain('W-A-L');
      expect(output).toContain('C-D-C');
    });

    it('supports custom lexicon overrides', () => {
      const input = 'Using custom TermX with API';
      const output = normalizePronunciation(input, { TermX: 'Term-Cross' });

      expect(output).toBe('Using custom Term-Cross with A-P-I');
    });
  });

  describe('Scene Duration Synchronization', () => {
    it('calculates durationFrames = ceil((audioDurationMs + 1000) / 1000 * fps)', () => {
      // 4000ms audio + 1000ms pad = 5000ms = 5s * 30fps = 150 frames
      expect(calculateSceneDurationFrames(4000, 30)).toBe(150);
      // 4120ms audio + 1000ms pad = 5120ms = 5.12s * 30 = 153.6 -> ceil = 154 frames
      expect(calculateSceneDurationFrames(4120, 30)).toBe(154);
    });

    it('syncs scene duration and clamps overflowing animation cues', () => {
      const mockScene: Scene = {
        id: 'scene-1',
        order: 1,
        type: 'data-flow',
        title: 'Test Scene',
        narrationText: 'Test Narration',
        durationFrames: 200,
        nodes: [{ id: 'n1', kind: 'database', label: 'DB' }],
        edges: [],
        animationCues: [
          { id: 'c1', preset: 'node-reveal', targetId: 'n1', startFrame: 0, durationFrames: 30 },
          // Cue ending at 160
          { id: 'c2', preset: 'node-pulse', targetId: 'n1', startFrame: 120, durationFrames: 40 },
        ],
        cameraCues: [],
        subtitleSettings: { enabled: true, position: 'bottom', fontSize: 38, highlightColor: '#38bdf8' },
        revision: 1,
      };

      // Audio is 3000ms -> new duration is ceil((4000/1000)*30) = 120 frames
      const synced = syncSceneDuration(mockScene, 3000, 30);
      expect(synced.durationFrames).toBe(120);

      // Cue 1 is unchanged
      expect(synced.animationCues[0].durationFrames).toBe(30);

      // Cue 2 started at 120 which was >= 120, so startFrame is pulled back and ends <= 120
      const c2 = synced.animationCues[1];
      expect(c2.startFrame + c2.durationFrames).toBeLessThanOrEqual(synced.durationFrames);
    });
  });

  describe('Forced Alignment Providers', () => {
    it('deterministic alignment produces valid timestamps bounded within audio duration', async () => {
      const provider = new DeterministicAlignmentProvider();
      const text = 'PostgreSQL mencatat perubahan data ke WAL engine.';
      const durationMs = 4500;

      const result = await provider.align(text, '', durationMs);
      expect(result.words.length).toBe(7);
      expect(result.audioDurationMs).toBe(durationMs);

      for (let i = 0; i < result.words.length; i++) {
        const w = result.words[i];
        expect(w.startMs).toBeLessThan(w.endMs);
        expect(w.endMs).toBeLessThanOrEqual(durationMs);
        if (i > 0) {
          expect(w.startMs).toBeGreaterThanOrEqual(result.words[i - 1].startMs);
        }
      }
    });

    it('vtt alignment parses WebVTT cues properly', async () => {
      const vttPath = path.join(TEST_DIR, 'sample.vtt');
      fs.writeFileSync(
        vttPath,
        `WEBVTT\n\n1\n00:00:00.100 --> 00:00:01.500\nPostgreSQL mencatat\n\n2\n00:00:01.600 --> 00:00:03.000\nperubahan data\n`
      );

      const provider = new VttAlignmentProvider();
      const result = await provider.align('PostgreSQL mencatat perubahan data', '', 3200, {
        vttFilePath: vttPath,
      });

      expect(result.words.length).toBe(4);
      expect(result.words[0].text).toBe('PostgreSQL');
      expect(result.words[0].startMs).toBe(100);
      expect(result.words[3].text).toBe('data');
      expect(result.words[3].endMs).toBe(3000);
    });
  });

  describe('TTS Synthesis & Probing', () => {
    it('mock tts generates valid audio file and probes duration with ffprobe', async () => {
      const provider = new MockTTSProvider();
      const outPath = path.join(TEST_DIR, 'mock-audio.mp3');

      const result = await provider.synthesize(
        'PostgreSQL mencatat setiap transaksi perubahan data.',
        outPath,
        { cacheDir: TEST_DIR, useCache: false }
      );

      expect(fs.existsSync(outPath)).toBe(true);
      expect(result.durationMs).toBeGreaterThan(0);

      const probed = await probeAudioDurationMs(outPath);
      expect(probed).toBeGreaterThan(0);
      expect(Math.abs(probed - result.durationMs)).toBeLessThan(50);
    }, 15000);
  });
});
