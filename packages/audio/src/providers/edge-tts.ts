import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TTSProvider, TTSOptions, TTSResult } from '../types.js';
import { probeAudioDurationMs } from '../probe.js';
import { MockTTSProvider } from './mock-tts.js';

const execFileAsync = promisify(execFile);

export interface EdgeTTSProviderOptions {
  defaultVoice?: string;
}

export class EdgeTTSProvider implements TTSProvider {
  public readonly id = 'edge-tts';
  private defaultVoice: string;
  private fallbackProvider: MockTTSProvider;

  constructor(options: EdgeTTSProviderOptions = {}) {
    this.defaultVoice = options.defaultVoice || 'id-ID-ArdiNeural';
    this.fallbackProvider = new MockTTSProvider();
  }

  public async synthesize(
    text: string,
    outputFilePath: string,
    options?: TTSOptions
  ): Promise<TTSResult> {
    const voice = options?.voice || this.defaultVoice;
    const speed = options?.speed ?? 1.0;
    const absOutput = path.resolve(outputFilePath);
    fs.mkdirSync(path.dirname(absOutput), { recursive: true });

    const baseName = path.basename(absOutput, path.extname(absOutput));
    const vttFilePath = path.join(path.dirname(absOutput), `${baseName}.vtt`);

    // Cache check
    const useCache = options?.useCache ?? true;
    const hash = crypto
      .createHash('sha256')
      .update(`${text}_${voice}_${speed}`)
      .digest('hex')
      .slice(0, 16);

    const cacheDir = options?.cacheDir
      ? path.resolve(options.cacheDir)
      : path.dirname(absOutput);
    const cachedAudio = path.join(cacheDir, `${hash}.mp3`);
    const cachedVtt = path.join(cacheDir, `${hash}.vtt`);

    if (useCache && fs.existsSync(cachedAudio)) {
      if (cachedAudio !== absOutput) {
        fs.copyFileSync(cachedAudio, absOutput);
      }
      if (fs.existsSync(cachedVtt) && cachedVtt !== vttFilePath) {
        fs.copyFileSync(cachedVtt, vttFilePath);
      }
      const durationMs = await probeAudioDurationMs(absOutput);
      return {
        audioFilePath: absOutput,
        vttFilePath: fs.existsSync(vttFilePath) ? vttFilePath : undefined,
        durationMs,
        cached: true,
        voice,
      };
    }

    // Build speed string for edge-tts (e.g. "+0%", "+10%", "-10%")
    const ratePercent = Math.round((speed - 1.0) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    const args = [
      '--voice',
      voice,
      '--text',
      text,
      '--rate',
      rateStr,
      '--write-media',
      absOutput,
      '--write-subtitles',
      vttFilePath,
    ];

    try {
      await execFileAsync('edge-tts', args);

      // Verify file was generated and has non-zero size
      if (!fs.existsSync(absOutput) || fs.statSync(absOutput).size === 0) {
        throw new Error('edge-tts finished but output audio file is missing or empty');
      }

      const durationMs = await probeAudioDurationMs(absOutput);

      if (useCache && cachedAudio !== absOutput) {
        fs.mkdirSync(path.dirname(cachedAudio), { recursive: true });
        fs.copyFileSync(absOutput, cachedAudio);
        if (fs.existsSync(vttFilePath)) {
          fs.copyFileSync(vttFilePath, cachedVtt);
        }
      }

      return {
        audioFilePath: absOutput,
        vttFilePath: fs.existsSync(vttFilePath) ? vttFilePath : undefined,
        durationMs,
        cached: false,
        voice,
      };
    } catch (err: any) {
      console.warn(`[edge-tts] Synthesis failed or CLI unavailable (${err.message}). Using mock TTS fallback.`);
      return this.fallbackProvider.synthesize(text, absOutput, options);
    }
  }
}
