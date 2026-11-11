import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {z} from 'zod';
import {IdSchema, ShotSpecSchema, SourcePathSchema, SourceProposalSchema, StudioError, VoiceoverTrackSchema, sourceFingerprint, createId, sha256, validateSourcePath, type VoiceoverTrack, type ShotSpec, type SourceProposal} from '@studio/studio-core';

export interface SourceFile {path: string; content: string}
export interface SourceManifest {
  schemaVersion: 1;
  sourceId: string;
  sourceHash: string;
  shots: ShotSpec[];
  files: Array<{path: string; hash: string}>;
  voiceovers?: VoiceoverTrack[];
}
const SourceManifestSchema = z.object({schemaVersion: z.literal(1), sourceId: IdSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/), shots: z.array(ShotSpecSchema).min(1).max(12),
  files: z.array(z.object({path: SourcePathSchema, hash: z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(20),
  voiceovers: z.array(VoiceoverTrackSchema).max(12).optional(),
}).strict();

const allowedPackages = new Set(['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'remotion']);
const forbiddenNames = new Set(['eval', 'Function', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'Worker', 'SharedWorker', 'importScripts', 'require', 'process', 'module', 'global', 'globalThis',
  'window', 'document', 'navigator', 'location', 'parent', 'top', 'opener', 'localStorage', 'sessionStorage',
  'indexedDB', 'caches', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'Date', 'performance', 'crypto']);
const forbiddenJsx = new Set(['script', 'iframe', 'object', 'embed', 'link', 'style', 'a', 'foreignObject']);
const forbiddenProperties = new Set(['constructor', '__proto__', 'prototype', 'dangerouslySetInnerHTML']);

function reject(message: string): never { throw new StudioError('SOURCE_POLICY', message); }

function importTarget(sourcePath: string, specifier: string): string | null {
  if (allowedPackages.has(specifier)) return null;
  if (!specifier.startsWith('.')) reject(`Import '${specifier}' is not allowed in ${sourcePath}.`);
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier));
  validateSourcePath(/\.[jt]sx?$/.test(target) ? target : `${target}.tsx`);
  return target;
}

function inspectFile(file: SourceFile): void {
  validateSourcePath(file.path);
  const ast = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true,
    file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const parseDiagnostics = (ast as ts.SourceFile & {parseDiagnostics?: ts.Diagnostic[]}).parseDiagnostics ?? [];
  if (parseDiagnostics.length) throw new StudioError('SOURCE_SYNTAX', ts.flattenDiagnosticMessageText(parseDiagnostics[0].messageText, '\n'));
  const visit = (node: ts.Node): void => {
    const isObjectKey = ts.isIdentifier(node) && (ts.isPropertyAssignment(node.parent) || ts.isPropertySignature(node.parent)) && node.parent.name === node;
    if (ts.isIdentifier(node) && forbiddenNames.has(node.text) && !isObjectKey) reject(`'${node.text}' is not permitted in generated code (${file.path}).`);
    if (ts.isIdentifier(node) && forbiddenProperties.has(node.text)) reject(`'${node.text}' is not permitted in generated code (${file.path}).`);
    if (ts.isStringLiteralLike(node)) {
      if (forbiddenProperties.has(node.text)) reject(`Unsafe property '${node.text}' in ${file.path}.`);
      if (/(?:https?:|file:|javascript:|wss?:|\/\/)/i.test(node.text)) reject(`External URL is not permitted in ${file.path}.`);
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) reject('Imports must use literal module paths.');
        importTarget(file.path, node.moduleSpecifier.text);
      }
    }
    if (ts.isImportEqualsDeclaration(node) || ts.isMetaProperty(node)) reject(`Unsupported module construct in ${file.path}.`);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) reject('Dynamic imports are not permitted.');
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Math' && node.name.text === 'random') reject('Use deterministic frame math instead of Math.random().');
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Math') reject('Use explicit deterministic Math methods rather than computed Math properties.');
    if (ts.isCallExpression(node) && node.arguments.length && (ts.isIdentifier(node.expression) && node.expression.text === 'createElement'
        || ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'createElement')) {
      const tag = node.arguments[0];
      if (ts.isStringLiteralLike(tag) && forbiddenJsx.has(tag.text)) reject(`Element '${tag.text}' is not permitted.`);
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && forbiddenJsx.has(node.tagName.getText(ast))) reject(`Element '${node.tagName.getText(ast)}' is not permitted.`);
    if (ts.isJsxAttribute(node) && ['src', 'href', 'xlinkHref', 'srcDoc'].includes(node.name.getText(ast))) reject('External media and navigation attributes are unavailable in the first milestone.');
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'style' && node.initializer && /(?:transition\s*:|animation\s*:)/.test(node.initializer.getText(ast))) reject('Drive animation from frame props rather than CSS transitions/animations.');
    ts.forEachChild(node, visit);
  };
  visit(ast);
}

export function validateSourceFiles(input: SourceProposal): void {
  const proposal = SourceProposalSchema.parse(input);
  for (const file of proposal.changedFiles) inspectFile(file);
}

async function assertDirectory(directory: string, create = false): Promise<void> {
  if (create) await fs.mkdir(directory, {recursive: true});
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Source directory must be a regular directory.');
}

async function readRegularFile(base: string, relative: string): Promise<string> {
  validateSourcePath(relative);
  const parts = relative.split('/');
  let current = base;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    await assertDirectory(current);
  }
  const target = path.join(base, relative);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65_536) throw new StudioError('INVALID_SOURCE', 'Invalid source snapshot file.');
  return fs.readFile(target, 'utf8');
}

export async function readSourceFiles(projectDir: string, sourceId: string): Promise<SourceFile[]> {
  IdSchema.parse(sourceId);
  await assertDirectory(projectDir);
  await assertDirectory(path.join(projectDir, 'source'));
  const base = path.join(projectDir, 'source', sourceId);
  await assertDirectory(base);
  const manifestPath = path.join(base, 'manifest.json');
  const stat = await fs.lstat(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100_000) throw new StudioError('INVALID_SOURCE', 'Invalid source manifest.');
  let manifest: SourceManifest;
  try { manifest = SourceManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, 'utf8'))); }
  catch { throw new StudioError('INVALID_SOURCE', 'Source manifest does not match its schema.'); }
  if (manifest.sourceId !== sourceId) throw new StudioError('INVALID_SOURCE', 'Source manifest does not match this snapshot.');
  const files = await Promise.all(manifest.files.map(async (entry) => {
    const content = await readRegularFile(base, entry.path);
    if (sha256(content) !== entry.hash) throw new StudioError('SOURCE_CHANGED', 'A saved source file no longer matches its snapshot.');
    return {path: entry.path, content};
  }));
  if (new Set(files.map((file) => file.path)).size !== files.length) throw new StudioError('INVALID_SOURCE', 'Source manifest has duplicate paths.');
  if (sourceFingerprint(files, manifest.shots, manifest.voiceovers) !== manifest.sourceHash) throw new StudioError('SOURCE_CHANGED', 'Source manifest no longer matches its snapshot hash.');
  await verifiedVoiceovers(base, manifest);
  return files;
}

async function verifiedVoiceovers(base: string, manifest: SourceManifest): Promise<VoiceoverTrack[]> {
  const tracks = manifest.voiceovers ?? [];
  if (new Set(tracks.map(track => track.shotId)).size !== tracks.length || new Set(tracks.map(track => track.assetId)).size !== tracks.length)
    throw new StudioError('INVALID_AUDIO', 'Duplicate voice-over tracks.');
  for (const track of tracks) {
    const shot = manifest.shots.find(shot => shot.id === track.shotId);
    if (!shot || Math.ceil(track.durationMs * 30 / 1000) > shot.durationFrames) throw new StudioError('INVALID_AUDIO', 'Voice-over does not fit its shot.');
    await assertDirectory(path.join(base, 'audio'));
    const file = path.join(base, 'audio', `${track.assetId}.wav`);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 44 || stat.size > 24_000_000) throw new StudioError('INVALID_AUDIO', 'Invalid voice-over file.');
    const bytes = await fs.readFile(file);
    if (sha256(bytes) !== track.hash || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
      throw new StudioError('SOURCE_CHANGED', 'Voice-over file no longer matches its snapshot.');
  }
  return tracks;
}

export async function readSourceVoiceovers(projectDir: string, sourceId: string): Promise<VoiceoverTrack[]> {
  await readSourceFiles(projectDir, sourceId);
  return SourceManifestSchema.parse(JSON.parse(await fs.readFile(path.join(projectDir, 'source', sourceId, 'manifest.json'), 'utf8'))).voiceovers ?? [];
}

export async function materializeSource(projectDir: string, input: SourceProposal, baseSourceId?: string,
  replacementAudio?: {track: VoiceoverTrack; file: string}): Promise<{sourceId: string; files: SourceFile[]}> {
  const proposal = SourceProposalSchema.parse(input);
  validateSourceFiles(proposal);
  await assertDirectory(projectDir);
  const filesByPath = new Map((baseSourceId ? await readSourceFiles(projectDir, baseSourceId) : []).map((file) => [file.path, file.content]));
  const inherited = baseSourceId ? await readSourceVoiceovers(projectDir, baseSourceId) : [];
  const voiceovers = inherited.filter(track => proposal.shots.some(shot => shot.id === track.shotId) && track.shotId !== replacementAudio?.track.shotId);
  if (replacementAudio) voiceovers.push(VoiceoverTrackSchema.parse(replacementAudio.track));
  voiceovers.sort((a, b) => a.shotId.localeCompare(b.shotId));
  for (const deleted of proposal.deletedFiles) {
    if (!filesByPath.delete(deleted)) throw new StudioError('INVALID_SOURCE', `Cannot delete unknown source file '${deleted}'.`);
  }
  for (const file of proposal.changedFiles) filesByPath.set(file.path, file.content);
  const files = [...filesByPath].map(([filePath, content]) => ({path: filePath, content})).sort((a, b) => a.path.localeCompare(b.path));
  if (!files.length || files.length > 20 || files.reduce((total, file) => total + Buffer.byteLength(file.content), 0) > 524_288) throw new StudioError('INVALID_SOURCE', 'Complete source snapshot exceeds limits.');
  for (const file of files) {
    inspectFile(file);
    const ast = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = importTarget(file.path, node.moduleSpecifier.text);
        if (target !== null) {
          const candidates = /\.[jt]sx?$/.test(target)
            ? [target, target.replace(/\.jsx?$/, '.ts'), target.replace(/\.jsx?$/, '.tsx')]
            : [target + '.tsx', target + '.ts', target + '.jsx', target + '.js'];
          if (!candidates.some((candidate) => filesByPath.has(candidate))) throw new StudioError('INVALID_SOURCE', `Missing relative source import '${node.moduleSpecifier.text}' in ${file.path}.`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  for (const shot of proposal.shots) {
    const file = files.find((item) => item.path === `src/shots/${shot.id}.tsx`);
    if (!file) throw new StudioError('INVALID_SOURCE', `Missing entry src/shots/${shot.id}.tsx.`);
    const ast = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const hasDefault = ast.statements.some((node) => ts.isExportAssignment(node) && !node.isExportEquals
      || (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
    if (!hasDefault) throw new StudioError('INVALID_SOURCE', `Shot '${shot.id}' needs a default component export.`);
  }
  const sourceId = createId();
  const sourceRoot = path.join(projectDir, 'source');
  await assertDirectory(sourceRoot, true);
  const temporary = path.join(sourceRoot, `.pending-${sourceId}`);
  await fs.mkdir(temporary, {mode: 0o700});
  for (const file of files) {
    const destination = path.join(temporary, file.path);
    await fs.mkdir(path.dirname(destination), {recursive: true, mode: 0o700});
    await fs.writeFile(destination, file.content, {flag: 'wx', mode: 0o600});
  }
  for (const track of voiceovers) {
    await fs.mkdir(path.join(temporary, 'audio'), {recursive: true, mode: 0o700});
    const from = replacementAudio?.track.assetId === track.assetId ? replacementAudio.file : path.join(projectDir, 'source', baseSourceId!, 'audio', `${track.assetId}.wav`);
    await fs.copyFile(from, path.join(temporary, 'audio', `${track.assetId}.wav`));
  }
  const manifest: SourceManifest = {schemaVersion: 1, sourceId, sourceHash: sourceFingerprint(files, proposal.shots, voiceovers),
    shots: proposal.shots, files: files.map((file) => ({path: file.path, hash: sha256(file.content)})), ...(voiceovers.length ? {voiceovers} : {})};
  await verifiedVoiceovers(temporary, manifest);
  await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  await fs.rename(temporary, path.join(sourceRoot, sourceId));
  return {sourceId, files};
}
