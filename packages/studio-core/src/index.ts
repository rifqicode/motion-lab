import {createHash, randomUUID} from 'node:crypto';
import {z} from 'zod';
import {StyleBriefSchema, type StyleBrief} from './style.js';
import {serializeBrief} from './brief.js';

export {StyleBriefSchema, type StyleBrief} from './style.js';
export {serializeBrief, STYLE_BRIEF_KEYS} from './brief.js';

export const IdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/, 'Invalid record ID');
const TimestampSchema = z.string().datetime();
const TextSchema = z.string().trim().min(1).max(100_000);

export class StudioError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'StudioError';
  }
}

export function createId(): string { return randomUUID(); }
export function sha256(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
export function briefHash(brief: string, style?: Partial<StyleBrief>): string { return sha256(serializeBrief(brief, style)); }

export function validateSourcePath(value: string): string {
  if (value.length > 240 || !value.startsWith('src/') || !/\.(tsx?|jsx?)$/.test(value)
      || value.includes('\\') || value.includes(':') || value.includes('\0')
      || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new StudioError('INVALID_SOURCE_PATH', 'Source files must be relative JavaScript/TypeScript paths inside src/.');
  }
  return value;
}

export const SourcePathSchema = z.string().superRefine((value, ctx) => {
  try { validateSourcePath(value); }
  catch { ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Invalid source path'}); }
});

export const AgentProviderSchema = z.enum(['codex', 'antigravity']);
export type AgentProvider = z.infer<typeof AgentProviderSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  agentProvider: z.enum(['codex', 'antigravity']).default('codex'),
  fps: z.literal(30),
  width: z.literal(720),
  height: z.literal(1280),
  currentRevisionId: IdSchema.nullable(),
  openCandidateId: IdSchema.nullable(),
  brief: z.string().max(100_000),
  style: StyleBriefSchema.default({}),
  approvedBriefHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();
export type Project = z.infer<typeof ProjectSchema>;

export const ShotSpecSchema = z.object({
  id: IdSchema,
  durationFrames: z.number().int().min(1).max(2700),
  intent: TextSchema,
  visualDirection: TextSchema,
  narrationText: z.string().max(20_000).optional(),
}).strict();
export type ShotSpec = z.infer<typeof ShotSpecSchema>;

export const SourceProposalSchema = z.object({
  baseRevisionId: IdSchema.nullable(),
  summary: z.string().trim().min(1).max(4000),
  shots: z.array(ShotSpecSchema).min(1).max(12),
  changedFiles: z.array(z.object({path: SourcePathSchema, content: z.string().max(65_536)}).strict()).max(20),
  deletedFiles: z.array(SourcePathSchema).max(20),
}).strict().superRefine((proposal, ctx) => {
  const paths = proposal.changedFiles.map((file) => file.path);
  if (new Set(paths).size !== paths.length || new Set(proposal.deletedFiles).size !== proposal.deletedFiles.length
      || proposal.deletedFiles.some((path) => paths.includes(path))) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Source changes contain duplicate or conflicting paths'});
  }
  if (proposal.changedFiles.reduce((bytes, file) => bytes + Buffer.byteLength(file.content), 0) > 524_288
      || proposal.changedFiles.some((file) => Buffer.byteLength(file.content) > 65_536)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Source proposal exceeds byte limits'});
  }
  if (new Set(proposal.shots.map((shot) => shot.id)).size !== proposal.shots.length) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Shot IDs must be unique'});
  }
});
export type SourceProposal = z.infer<typeof SourceProposalSchema>;

export const FrameAnchorSchema = z.object({
  revisionId: IdSchema,
  shotId: IdSchema,
  localFrame: z.number().int().nonnegative(),
  fps: z.literal(30),
  elementId: z.string().min(1).max(150).optional(),
}).strict();
export type FrameAnchor = z.infer<typeof FrameAnchorSchema>;

export const RevisionSchema = z.object({
  id: IdSchema,
  parentRevisionId: IdSchema.nullable(),
  sourceId: IdSchema,
  buildId: IdSchema,
  summary: z.string().min(1).max(4000),
  shots: z.array(ShotSpecSchema).min(1).max(12),
  createdAt: TimestampSchema,
}).strict();
export type Revision = z.infer<typeof RevisionSchema>;

export const CandidateStatusSchema = z.enum(['generating', 'validating', 'building', 'smoke-checking', 'ready', 'failed', 'cancelled', 'applied', 'discarded', 'stale']);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;
export const CandidateSchema = z.object({
  id: IdSchema,
  baseRevisionId: IdSchema.nullable(),
  sourceId: IdSchema.nullable(),
  buildId: IdSchema.nullable(),
  status: CandidateStatusSchema,
  summary: z.string().max(4000),
  shots: z.array(ShotSpecSchema).max(12),
  error: z.string().max(16_000).optional(),
  createdAt: TimestampSchema,
}).strict();
export type Candidate = z.infer<typeof CandidateSchema>;

export const JobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export const JobSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  kind: z.enum(['chat', 'generate', 'revise', 'build', 'screenshot']),
  status: JobStatusSchema,
  message: z.string().max(4000),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  candidateId: IdSchema.optional(),
  error: z.string().max(16_000).optional(),
}).strict();
export type Job = z.infer<typeof JobSchema>;

export const CommentSchema = z.object({
  id: IdSchema,
  anchor: FrameAnchorSchema,
  body: z.string().trim().min(1).max(8000),
  status: z.enum(['open', 'resolved']),
  createdAt: TimestampSchema,
  screenshot: z.string().max(300).optional(),
}).strict();
export type Comment = z.infer<typeof CommentSchema>;

export const MessageSchema = z.object({
  id: IdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(200_000),
  createdAt: TimestampSchema,
}).strict();
export type Message = z.infer<typeof MessageSchema>;
export const ThreadBindingsSchema = z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), z.string().min(1).max(200));
export type ThreadBindings = z.infer<typeof ThreadBindingsSchema>;

export interface ProjectSnapshot {
  project: Project;
  revisions: Revision[];
  candidates: Candidate[];
  comments: Comment[];
  messages: Message[];
  jobs: Job[];
}

export const candidateTerminalStatuses = new Set<CandidateStatus>(['failed', 'cancelled', 'applied', 'discarded', 'stale']);

export function assertCandidateTransition(from: CandidateStatus, to: CandidateStatus): void {
  if (from === to) return;
  const next: Record<CandidateStatus, CandidateStatus[]> = {
    generating: ['validating', 'failed', 'cancelled', 'stale'],
    validating: ['building', 'failed', 'cancelled', 'stale'],
    building: ['smoke-checking', 'failed', 'cancelled', 'stale'],
    'smoke-checking': ['ready', 'failed', 'cancelled', 'stale'],
    ready: ['applied', 'discarded', 'stale'],
    failed: [], cancelled: [], applied: [], discarded: [], stale: [],
  };
  if (!next[from].includes(to)) throw new StudioError('INVALID_STATE', `Cannot transition candidate from ${from} to ${to}.`, 409);
}
