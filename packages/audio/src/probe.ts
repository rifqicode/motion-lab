import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

/**
 * Probes the duration of an audio file in milliseconds using ffprobe.
 */
export async function probeAudioDurationMs(filePath: string): Promise<number> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    const seconds = parseFloat(stdout.trim());
    if (isNaN(seconds) || seconds <= 0) {
      throw new Error(`Invalid ffprobe duration returned: "${stdout}"`);
    }

    return Math.round(seconds * 1000);
  } catch (err: any) {
    throw new Error(`Failed to probe audio duration for ${filePath}: ${err.message}`);
  }
}
