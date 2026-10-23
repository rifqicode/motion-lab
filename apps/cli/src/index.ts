#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeValidateProject, type Project } from '@studio/schema';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('studio')
  .description('AI Technical Explainer Studio CLI')
  .version('0.1.0');

export function resolveProjectPath(targetPath: string): string {
  const candidates = [
    path.resolve(process.cwd(), targetPath),
    ...(process.env.INIT_CWD ? [path.resolve(process.env.INIT_CWD, targetPath)] : []),
  ];

  const resolved = candidates.find((p) => fs.existsSync(p));
  if (!resolved) {
    throw new Error(`Path does not exist: ${targetPath} (checked ${candidates.join(', ')})`);
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const candidate = path.join(resolved, 'project.json');
    if (!fs.existsSync(candidate)) {
      throw new Error(`No project.json found in directory: ${resolved}`);
    }
    return candidate;
  }
  return resolved;
}

export function loadProjectFile(filePath: string): { data: unknown; path: string } {
  const resolved = resolveProjectPath(filePath);
  const raw = fs.readFileSync(resolved, 'utf-8');
  try {
    const data = JSON.parse(raw);
    return { data, path: resolved };
  } catch (err: any) {
    throw new Error(`Failed to parse JSON at ${resolved}: ${err.message}`);
  }
}

program
  .command('validate')
  .description('Validate a project storyboard JSON file against the canonical schema')
  .requiredOption('-p, --project <path>', 'Path to project directory or project.json')
  .action((options) => {
    try {
      const { data, path: resolvedPath } = loadProjectFile(options.project);
      const validation = safeValidateProject(data);

      if (validation.success) {
        const project = validation.data;
        const totalDuration = project.scenes.reduce((acc, s) => acc + s.durationFrames, 0);
        const result = {
          status: 'valid',
          projectId: project.id,
          title: project.title,
          aspectRatio: project.aspectRatio,
          fps: project.fps,
          themeId: project.themeId,
          scenesCount: project.scenes.length,
          totalDurationFrames: totalDuration,
          durationSeconds: (totalDuration / project.fps).toFixed(2),
          file: resolvedPath,
        };
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      } else {
        const issues = validation.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));
        const result = {
          status: 'invalid',
          errorCount: issues.length,
          issues,
          file: resolvedPath,
        };
        console.error(JSON.stringify(result, null, 2));
        process.exit(1);
      }
    } catch (err: any) {
      console.error(
        JSON.stringify(
          {
            status: 'error',
            message: err.message,
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  });

program
  .command('render')
  .description('Render a project storyboard into an MP4 video')
  .requiredOption('-p, --project <path>', 'Path to project directory or project.json')
  .requiredOption('-o, --out <path>', 'Output file path (e.g. ./out/cdc.mp4)')
  .option('-f, --frames <range>', 'Frame range to render, e.g. 0-60')
  .action(async (options) => {
    let bundleDir: string | null = null;
    try {
      const { data, path: resolvedPath } = loadProjectFile(options.project);
      const validation = safeValidateProject(data);

      if (!validation.success) {
        console.error('Validation failed before render:');
        console.error(validation.error.issues);
        process.exit(1);
      }

      const project: Project = validation.data;
      const outputPath = path.resolve(process.cwd(), options.out);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      console.log(`[studio] Preparing render for project: "${project.title}"`);
      console.log(`[studio] Destination: ${outputPath}`);

      // Locate Root.tsx in packages/renderer
      // When run from dist/index.js, Root.tsx is in ../../../packages/renderer/src/Root.tsx
      const rootCandidates = [
        path.resolve(__dirname, '../../../packages/renderer/src/Root.tsx'),
        path.resolve(__dirname, '../../renderer/src/Root.tsx'),
        path.resolve(process.cwd(), 'packages/renderer/src/Root.tsx'),
      ];

      const entryPoint = rootCandidates.find((c) => fs.existsSync(c));
      if (!entryPoint) {
        throw new Error(
          `Could not locate Root.tsx entryPoint. Checked:\n${rootCandidates.join('\n')}`
        );
      }

      console.log(`[studio] Bundling Remotion composition from: ${entryPoint}`);
      bundleDir = await bundle({
        entryPoint,
        webpackOverride: (config) => {
          return {
            ...config,
            resolve: {
              ...config.resolve,
              extensionAlias: {
                '.js': ['.ts', '.tsx', '.js'],
                ...config.resolve?.extensionAlias,
              },
            },
          };
        },
      });

      console.log(`[studio] Selecting composition 'Main'...`);
      const composition = await selectComposition({
        serveUrl: bundleDir,
        id: 'Main',
        inputProps: {
          project,
        },
      });

      console.log(
        `[studio] Composition loaded. Duration: ${composition.durationInFrames} frames (${(
          composition.durationInFrames / composition.fps
        ).toFixed(1)}s) @ ${composition.fps}fps, ${composition.width}x${composition.height}`
      );

      let frameRange: [number, number] | undefined = undefined;
      if (options.frames) {
        const [start, end] = options.frames.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          frameRange = [start, end];
          console.log(`[studio] Rendering frame range: ${start} to ${end}`);
        }
      }

      console.log(`[studio] Starting media render...`);
      await renderMedia({
        composition,
        serveUrl: bundleDir,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: {
          project,
        },
        frameRange,
        onProgress: ({ progress }) => {
          process.stdout.write(
            `\r[studio] Progress: ${(progress * 100).toFixed(1)}%`
          );
        },
      });

      console.log(`\n[studio] Render complete! Successfully written to ${outputPath}`);

      console.log(
        JSON.stringify(
          {
            status: 'success',
            outputFile: outputPath,
            durationFrames: frameRange
              ? frameRange[1] - frameRange[0] + 1
              : composition.durationInFrames,
            fps: composition.fps,
            dimensions: `${composition.width}x${composition.height}`,
          },
          null,
          2
        )
      );

      process.exit(0);
    } catch (err: any) {
      console.error(`\n[studio] Render failed: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
