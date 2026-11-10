#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeValidateProject, type Project, type Scene } from '@studio/schema';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import {
  generateStoryboard,
  MockLLMProvider,
  GeminiLLMProvider,
  OpenAILLMProvider,
  type LLMProvider,
} from '@studio/storyboard';
import {
  EdgeTTSProvider,
  MockTTSProvider,
  normalizePronunciation,
  probeAudioDurationMs,
  syncSceneDuration,
  VttAlignmentProvider,
  type TTSProvider,
} from '@studio/audio';

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
  .command('storyboard')
  .description('Generate an AI storyboard project from source text or markdown')
  .requiredOption('-i, --input <file>', 'Path to input markdown/text file')
  .requiredOption('-o, --out <dir>', 'Output project directory')
  .option('--provider <provider>', 'LLM provider (mock, gemini, openai)', 'mock')
  .option('--model <model>', 'LLM model name')
  .action(async (options) => {
    try {
      const inputPath = path.resolve(process.cwd(), options.input);
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      const sourceText = fs.readFileSync(inputPath, 'utf-8');
      const outDir = path.resolve(process.cwd(), options.out);
      fs.mkdirSync(outDir, { recursive: true });

      let provider: LLMProvider;
      if (options.provider === 'gemini') {
        provider = new GeminiLLMProvider({ model: options.model });
      } else if (options.provider === 'openai') {
        provider = new OpenAILLMProvider({ model: options.model });
      } else {
        provider = new MockLLMProvider();
      }

      console.log(`[studio] Generating storyboard using provider: ${provider.id}...`);
      const result = await generateStoryboard({
        sourceText,
        provider,
        options: {
          cacheDir: path.join(outDir, '.cache'),
          modelParams: options.model ? { model: options.model } : undefined,
        },
      });

      const projectFilePath = path.join(outDir, 'project.json');
      fs.writeFileSync(projectFilePath, JSON.stringify(result.project, null, 2), 'utf-8');

      // Create a basic package.json if not present
      const packageJsonPath = path.join(outDir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        const pkg = {
          name: `@example/${result.project.id}`,
          version: '0.1.0',
          private: true,
        };
        fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2), 'utf-8');
      }

      const summary = {
        status: 'success',
        projectId: result.project.id,
        title: result.project.title,
        scenesCount: result.project.scenes.length,
        cached: result.cached,
        retries: result.retries,
        provider: result.providerId,
        projectFile: projectFilePath,
      };

      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
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
  .command('narrate')
  .description('Synthesize voice narration audio for each scene in a project')
  .requiredOption('-p, --project <path>', 'Path to project directory or project.json')
  .option('--voice <voice>', 'TTS voice (e.g. id-ID-ArdiNeural or id-ID-GadisNeural)', 'id-ID-ArdiNeural')
  .option('--provider <provider>', 'TTS provider (edge, mock)', 'edge')
  .action(async (options) => {
    try {
      const { data, path: resolvedPath } = loadProjectFile(options.project);
      const validation = safeValidateProject(data);
      if (!validation.success) {
        console.error('Project validation failed before narration:');
        console.error(validation.error.issues);
        process.exit(1);
      }

      const project: Project = validation.data;
      const projectDir = path.dirname(resolvedPath);
      const audioDir = path.join(projectDir, 'assets', 'audio');
      fs.mkdirSync(audioDir, { recursive: true });

      let ttsProvider: TTSProvider;
      if (options.provider === 'mock') {
        ttsProvider = new MockTTSProvider();
      } else {
        ttsProvider = new EdgeTTSProvider({ defaultVoice: options.voice });
      }

      console.log(
        `[studio] Narrating ${project.scenes.length} scene(s) with ${ttsProvider.id} (voice: ${options.voice})...`
      );

      const updatedScenes: Scene[] = [];

      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        console.log(`[studio] Processing scene [${i + 1}/${project.scenes.length}]: "${scene.title}"`);

        // 1. Normalize pronunciation of technical terms for Indonesian speech
        const normalizedNarration = normalizePronunciation(scene.narrationText);

        // 2. Output audio destination
        const audioFileName = `${scene.id}.mp3`;
        const audioFilePath = path.join(audioDir, audioFileName);

        // 3. Synthesize audio
        const ttsResult = await ttsProvider.synthesize(normalizedNarration, audioFilePath, {
          voice: options.voice,
          cacheDir: audioDir,
        });

        console.log(
          `[studio] Scene "${scene.id}" audio ready: ${ttsResult.durationMs}ms (cached: ${!!ttsResult.cached})`
        );

        // 4. Sync scene duration with probed audio duration
        const syncedScene = syncSceneDuration(scene, ttsResult.durationMs, project.fps);
        syncedScene.audioFile = path.join('assets', 'audio', audioFileName);
        syncedScene.audioAssetId = audioFileName;

        updatedScenes.push(syncedScene);
      }

      const updatedProject: Project = {
        ...project,
        scenes: updatedScenes,
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(resolvedPath, JSON.stringify(updatedProject, null, 2), 'utf-8');

      const totalDurationFrames = updatedProject.scenes.reduce((acc, s) => acc + s.durationFrames, 0);

      const summary = {
        status: 'success',
        projectId: updatedProject.id,
        scenesCount: updatedProject.scenes.length,
        totalDurationFrames,
        durationSeconds: (totalDurationFrames / updatedProject.fps).toFixed(2),
        voice: options.voice,
        provider: ttsProvider.id,
        projectFile: resolvedPath,
      };

      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
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
  .command('align')
  .description('Generate word-level timestamp alignment for each scene narration')
  .requiredOption('-p, --project <path>', 'Path to project directory or project.json')
  .action(async (options) => {
    try {
      const { data, path: resolvedPath } = loadProjectFile(options.project);
      const validation = safeValidateProject(data);
      if (!validation.success) {
        console.error('Project validation failed before alignment:');
        console.error(validation.error.issues);
        process.exit(1);
      }

      const project: Project = validation.data;
      const projectDir = path.dirname(resolvedPath);
      const audioDir = path.join(projectDir, 'assets', 'audio');
      const aligner = new VttAlignmentProvider();

      console.log(`[studio] Aligning word timestamps for ${project.scenes.length} scene(s)...`);

      const updatedScenes: Scene[] = [];

      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        console.log(`[studio] Aligning scene [${i + 1}/${project.scenes.length}]: "${scene.title}"`);

        const audioRel = scene.audioFile || path.join('assets', 'audio', `${scene.id}.mp3`);
        const audioAbs = path.isAbsolute(audioRel) ? audioRel : path.join(projectDir, audioRel);

        if (!fs.existsSync(audioAbs)) {
          throw new Error(
            `Audio file not found for scene "${scene.id}": ${audioAbs}. Run 'studio narrate' first.`
          );
        }

        const durationMs = await probeAudioDurationMs(audioAbs);
        const vttCandidate = path.join(audioDir, `${scene.id}.vtt`);

        const alignment = await aligner.align(scene.narrationText, audioAbs, durationMs, {
          vttFilePath: fs.existsSync(vttCandidate) ? vttCandidate : undefined,
        });

        // Save alignment asset JSON
        const alignFileName = `${scene.id}-align.json`;
        const alignFilePath = path.join(audioDir, alignFileName);
        fs.writeFileSync(
          alignFilePath,
          JSON.stringify(
            {
              sceneId: scene.id,
              audioDurationMs: durationMs,
              words: alignment.words,
            },
            null,
            2
          ),
          'utf-8'
        );

        const updatedScene: Scene = {
          ...scene,
          wordTimings: alignment.words,
          alignmentAssetId: alignFileName,
        };

        updatedScenes.push(updatedScene);
        console.log(`[studio] Scene "${scene.id}": aligned ${alignment.words.length} words`);
      }

      const updatedProject: Project = {
        ...project,
        scenes: updatedScenes,
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(resolvedPath, JSON.stringify(updatedProject, null, 2), 'utf-8');

      const summary = {
        status: 'success',
        projectId: updatedProject.id,
        scenesAligned: updatedScenes.length,
        totalWords: updatedScenes.reduce((acc, s) => acc + (s.wordTimings?.length || 0), 0),
        projectFile: resolvedPath,
      };

      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
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

export function getBgmDataUri(customBgmPath?: string, projectDir?: string): string | undefined {
  const candidates = [
    ...(customBgmPath
      ? [
          path.isAbsolute(customBgmPath)
            ? customBgmPath
            : projectDir
            ? path.join(projectDir, customBgmPath)
            : path.resolve(process.cwd(), customBgmPath),
        ]
      : []),
    path.resolve(process.cwd(), 'assets/audio/bgm-tech.mp3'),
    path.resolve(__dirname, '../../../assets/audio/bgm-tech.mp3'),
    path.resolve(__dirname, '../../assets/audio/bgm-tech.mp3'),
    path.resolve(__dirname, '../../../packages/renderer/public/bgm-tech.mp3'),
  ];

  const found = candidates.find((c) => fs.existsSync(c));
  if (found) {
    const base64 = fs.readFileSync(found).toString('base64');
    return `data:audio/mp3;base64,${base64}`;
  }
  return undefined;
}

export function tryCopyToDownloads(outputPath: string): string | null {
  const winDownloads = '/mnt/c/Users/muham/Downloads';
  if (fs.existsSync(winDownloads)) {
    try {
      const dest = path.join(winDownloads, path.basename(outputPath));
      fs.copyFileSync(outputPath, dest);
      return dest;
    } catch (e: any) {
      console.warn(`[studio] Note: Could not copy to Windows Downloads: ${e.message}`);
    }
  }
  return null;
}

export async function executeRender(params: {
  project: Project;
  projectDir: string;
  outputPath: string;
  frameRange?: [number, number];
  copyToDownloads?: boolean;
}): Promise<{
  outputPath: string;
  copiedPath: string | null;
  durationFrames: number;
  fps: number;
  dimensions: string;
}> {
  const { project, projectDir, outputPath, frameRange, copyToDownloads } = params;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const bgmDataUri = getBgmDataUri(project.bgmFile, projectDir);

  const renderProject: Project = {
    ...project,
    bgmFile: bgmDataUri || project.bgmFile,
    scenes: project.scenes.map((scene) => {
      if (!scene.audioFile) return scene;
      const audioAbs = path.isAbsolute(scene.audioFile)
        ? scene.audioFile
        : path.join(projectDir, scene.audioFile);

      if (fs.existsSync(audioAbs)) {
        const base64 = fs.readFileSync(audioAbs).toString('base64');
        const mimeType = audioAbs.endsWith('.wav') ? 'audio/wav' : 'audio/mp3';
        return {
          ...scene,
          audioFile: `data:${mimeType};base64,${base64}`,
        };
      }
      return scene;
    }),
  };

  console.log(`[studio] Preparing render for project: "${renderProject.title}"`);
  console.log(`[studio] Destination: ${outputPath}`);

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
  const bundleDir = await bundle({
    entryPoint,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {
          '.js': ['.ts', '.tsx', '.js'],
          ...config.resolve?.extensionAlias,
        },
      },
    }),
  });

  console.log(`[studio] Selecting composition 'Main'...`);
  const composition = await selectComposition({
    serveUrl: bundleDir,
    id: 'Main',
    inputProps: {
      project: renderProject,
    },
  });

  console.log(
    `[studio] Composition loaded. Duration: ${composition.durationInFrames} frames (${(
      composition.durationInFrames / composition.fps
    ).toFixed(1)}s) @ ${composition.fps}fps, ${composition.width}x${composition.height}`
  );

  console.log(`[studio] Starting media render...`);
  await renderMedia({
    composition,
    serveUrl: bundleDir,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: {
      project: renderProject,
    },
    frameRange,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r[studio] Progress: ${(progress * 100).toFixed(1)}%`);
    },
  });

  console.log(`\n[studio] Render complete! Successfully written to ${outputPath}`);

  let copiedPath: string | null = null;
  if (copyToDownloads !== false) {
    copiedPath = tryCopyToDownloads(outputPath);
    if (copiedPath) {
      console.log(`🚀 [studio] Copied video to Windows Downloads folder: ${copiedPath}`);
      console.log(`   You can open and play it directly in Windows!`);
    }
  }

  return {
    outputPath,
    copiedPath,
    durationFrames: frameRange ? frameRange[1] - frameRange[0] + 1 : composition.durationInFrames,
    fps: composition.fps,
    dimensions: `${composition.width}x${composition.height}`,
  };
}

program
  .command('render')
  .description('Render a project storyboard into an MP4 video')
  .requiredOption('-p, --project <path>', 'Path to project directory or project.json')
  .requiredOption('-o, --out <path>', 'Output file path (e.g. ./out/cdc.mp4)')
  .option('-f, --frames <range>', 'Frame range to render, e.g. 0-60')
  .option('--copy-to-downloads', 'Copy the rendered MP4 to Windows Downloads folder')
  .action(async (options) => {
    try {
      const { data, path: resolvedPath } = loadProjectFile(options.project);
      const validation = safeValidateProject(data);

      if (!validation.success) {
        console.error('Validation failed before render:');
        console.error(validation.error.issues);
        process.exit(1);
      }

      const project: Project = validation.data;
      const projectDir = path.dirname(resolvedPath);
      const outputPath = path.resolve(process.cwd(), options.out);

      let frameRange: [number, number] | undefined = undefined;
      if (options.frames) {
        const [start, end] = options.frames.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          frameRange = [start, end];
          console.log(`[studio] Rendering frame range: ${start} to ${end}`);
        }
      }

      const result = await executeRender({
        project,
        projectDir,
        outputPath,
        frameRange,
        copyToDownloads: options.copyToDownloads,
      });

      console.log(
        JSON.stringify(
          {
            status: 'success',
            ...result,
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

program
  .command('run')
  .description('Unified one-step pipeline: generate/load storyboard, synthesize Indonesian voice, sync alignment, and render polished MP4')
  .requiredOption('-i, --input <file>', 'Path to input markdown/text file or project directory or project.json')
  .requiredOption('-o, --out <path>', 'Output video path (e.g. ./out/explainer.mp4)')
  .option('--voice <voice>', 'TTS voice (e.g. id-ID-ArdiNeural or id-ID-GadisNeural)', 'id-ID-ArdiNeural')
  .option('--theme <theme>', 'Theme override (e.g. midnight-tech, cyberpunk-neon, clean-light)')
  .option('--copy-to-downloads', 'Copy the rendered MP4 to Windows Downloads folder')
  .action(async (options) => {
    try {
      const inputPath = path.resolve(process.cwd(), options.input);
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file/path does not exist: ${inputPath}`);
      }

      let project: Project;
      let projectDir: string;
      let projectJsonPath: string;

      const isMarkdownOrText = inputPath.endsWith('.md') || inputPath.endsWith('.txt');

      if (isMarkdownOrText) {
        console.log(`[studio run] Step 1/4: Generating storyboard from text: ${inputPath}`);
        const sourceText = fs.readFileSync(inputPath, 'utf-8');
        const runProjectDir = path.resolve(process.cwd(), '.cache/studio-run');
        fs.mkdirSync(runProjectDir, { recursive: true });

        let provider: LLMProvider;
        if (process.env.GEMINI_API_KEY) {
          provider = new GeminiLLMProvider();
        } else if (process.env.OPENAI_API_KEY) {
          provider = new OpenAILLMProvider();
        } else {
          provider = new MockLLMProvider();
        }

        const sbResult = await generateStoryboard({
          sourceText,
          provider,
          options: { cacheDir: path.join(runProjectDir, '.cache') },
        });

        project = sbResult.project;
        projectDir = runProjectDir;
        projectJsonPath = path.join(runProjectDir, 'project.json');
        fs.writeFileSync(projectJsonPath, JSON.stringify(project, null, 2), 'utf-8');
      } else {
        console.log(`[studio run] Step 1/4: Loading existing project from: ${inputPath}`);
        const loaded = loadProjectFile(options.input);
        const val = safeValidateProject(loaded.data);
        if (!val.success) {
          console.error('[studio run] Project validation failed:');
          console.error(val.error.issues);
          process.exit(1);
        }
        project = val.data;
        projectJsonPath = loaded.path;
        projectDir = path.dirname(loaded.path);
      }

      // Theme override
      if (options.theme) {
        project.themeId = options.theme;
      }

      // Step 2: Voice Narration
      console.log(`[studio run] Step 2/4: Synthesizing voice narration (voice: ${options.voice || 'id-ID-ArdiNeural'})...`);
      const audioDir = path.join(projectDir, 'assets', 'audio');
      fs.mkdirSync(audioDir, { recursive: true });
      const ttsProvider = new EdgeTTSProvider({ defaultVoice: options.voice || 'id-ID-ArdiNeural' });

      const narratedScenes: Scene[] = [];
      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        const audioFileName = `${scene.id}.mp3`;
        const audioFilePath = path.join(audioDir, audioFileName);

        const normalizedNarration = normalizePronunciation(scene.narrationText);
        const ttsResult = await ttsProvider.synthesize(normalizedNarration, audioFilePath, {
          voice: options.voice || 'id-ID-ArdiNeural',
          cacheDir: audioDir,
        });

        const syncedScene = syncSceneDuration(scene, ttsResult.durationMs, project.fps);
        syncedScene.audioFile = path.join('assets', 'audio', audioFileName);
        syncedScene.audioAssetId = audioFileName;
        narratedScenes.push(syncedScene);
      }
      project.scenes = narratedScenes;

      // Step 3: Alignment Sync
      console.log(`[studio run] Step 3/4: Computing word-level timestamp alignment...`);
      const aligner = new VttAlignmentProvider();
      const alignedScenes: Scene[] = [];

      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        const audioAbs = path.join(projectDir, scene.audioFile!);
        const durationMs = await probeAudioDurationMs(audioAbs);
        const vttCandidate = path.join(audioDir, `${scene.id}.vtt`);

        const alignment = await aligner.align(scene.narrationText, audioAbs, durationMs, {
          vttFilePath: fs.existsSync(vttCandidate) ? vttCandidate : undefined,
        });

        alignedScenes.push({
          ...scene,
          wordTimings: alignment.words,
          alignmentAssetId: `${scene.id}-align.json`,
        });
      }
      project.scenes = alignedScenes;
      project.updatedAt = new Date().toISOString();
      fs.writeFileSync(projectJsonPath, JSON.stringify(project, null, 2), 'utf-8');

      // Step 4: Render Polished Video
      console.log(`[studio run] Step 4/4: Rendering polished video with Remotion...`);
      const outputPath = path.resolve(process.cwd(), options.out);
      const renderRes = await executeRender({
        project,
        projectDir,
        outputPath,
        copyToDownloads: options.copyToDownloads !== undefined ? options.copyToDownloads : true,
      });

      console.log(`\n🎉 [studio run] Pipeline completed successfully!`);
      console.log(JSON.stringify({ status: 'success', ...renderRes }, null, 2));
      process.exit(0);
    } catch (err: any) {
      console.error(`\n❌ [studio run] Pipeline failed: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
