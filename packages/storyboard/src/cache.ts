import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '@studio/schema';

export function computeStoryboardHash(
  sourceText: string,
  promptVersion: string,
  modelParams: Record<string, unknown> = {}
): string {
  const payload = JSON.stringify({
    sourceText: sourceText.trim(),
    promptVersion,
    modelParams,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class StoryboardCache {
  private baseDir: string;

  constructor(baseDir = '.cache/storyboard') {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  public get(key: string): Project | null {
    const filePath = path.join(this.baseDir, `${key}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as Project;
    } catch {
      return null;
    }
  }

  public set(key: string, project: Project): void {
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      const filePath = path.join(this.baseDir, `${key}.json`);
      fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[storyboard-cache] Failed to write cache: ${(err as Error).message}`);
    }
  }

  public clear(): void {
    try {
      if (fs.existsSync(this.baseDir)) {
        fs.rmSync(this.baseDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
}
