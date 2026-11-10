import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TTSProvider, TTSOptions, TTSResult } from '../types.js';
import { probeAudioDurationMs } from '../probe.js';

const execFileAsync = promisify(execFile);

export interface MockTTSProviderOptions {
  wordsPerMinute?: number;
}

export class MockTTSProvider implements TTSProvider {
  public readonly id = 'mock-tts';
  private wordsPerMinute: number;

  constructor(options: MockTTSProviderOptions = {}) {
    this.wordsPerMinute = options.wordsPerMinute ?? 130;
  }

  public async synthesize(
    text: string,
    outputFilePath: string,
    options?: TTSOptions
  ): Promise<TTSResult> {
    const voice = options?.voice || 'mock-id-voice';
    const speed = options?.speed || 1.0;
    const words = text.trim().split(/\s+/).filter(Boolean);

    // Calculate approximate duration: words / (wpm / 60) in seconds
    const rawSeconds = Math.max(1.2, (words.length / (this.wordsPerMinute / 60)) / speed);
    const durationSeconds = parseFloat(rawSeconds.toFixed(2));
    const expectedDurationMs = Math.round(durationSeconds * 1000);

    const absOutput = path.resolve(outputFilePath);
    fs.mkdirSync(path.dirname(absOutput), { recursive: true });

    // Check cache by hash if caching enabled
    const useCache = options?.useCache ?? true;
    const hash = crypto
      .createHash('sha256')
      .update(`${text}_${voice}_${speed}`)
      .digest('hex')
      .slice(0, 12);

    const cachedDir = options?.cacheDir
      ? path.resolve(options.cacheDir)
      : path.dirname(absOutput);
    const cachedFile = path.join(cachedDir, `mock_${hash}.mp3`);

    if (useCache && fs.existsSync(cachedFile)) {
      if (cachedFile !== absOutput) {
        fs.copyFileSync(cachedFile, absOutput);
      }
      const durationMs = await probeAudioDurationMs(absOutput).catch(() => expectedDurationMs);
      return {
        audioFilePath: absOutput,
        durationMs,
        cached: true,
        voice,
      };
    }

    // Generate tone audio with ffmpeg
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=320:duration=${durationSeconds}`,
        '-c:a',
        'libmp3lame',
        '-b:a',
        '64k',
        absOutput,
      ]);
    } catch {
      // Fallback: write a minimal silent WAV header + PCM
      this.writeMinimalWav(absOutput, durationSeconds);
    }

    if (useCache && cachedFile !== absOutput) {
      fs.mkdirSync(path.dirname(cachedFile), { recursive: true });
      fs.copyFileSync(absOutput, cachedFile);
    }

    const durationMs = await probeAudioDurationMs(absOutput).catch(() => expectedDurationMs);

    return {
      audioFilePath: absOutput,
      durationMs,
      cached: false,
      voice,
    };
  }

  private writeMinimalWav(filePath: string, durationSec: number): void {
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * durationSec);
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // subchunk1 size
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    fs.writeFileSync(filePath, buffer);
  }
}
