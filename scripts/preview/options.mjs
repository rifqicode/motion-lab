import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';

export function parsePreviewOptions(args) {
  const value = (flag, fallback = null) => {
    const index = args.indexOf(flag);
    if (index < 0) return fallback;
    if (!args[index + 1] || args[index + 1].startsWith('--'))
      throw new Error(`Missing ${flag} value`);
    return args[index + 1];
  };
  return {
    output: value('--out', 'out/preview'),
    reportOnly: value('--report-only'),
    baseline: value('--baseline'),
    only: value('--only'),
    assetsOnly: args.includes('--assets-only'),
    variants: args.includes('--variants'),
  };
}

export async function preparePreviewRun(options) {
  const previous = options.reportOnly
    ? JSON.parse(await readFile(join(resolve(options.reportOnly), 'manifest.json'), 'utf8'))
    : null;
  const root = options.reportOnly ? dirname(resolve(options.reportOnly)) : resolve(options.output);
  const runId = options.reportOnly
    ? basename(resolve(options.reportOnly))
    : new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join(root, runId);
  await mkdir(directory, { recursive: true });
  return {
    root,
    runId,
    directory,
    previous,
    baseline: options.baseline ? resolve(options.baseline) : (previous?.baseline ?? null),
  };
}
