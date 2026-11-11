import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export type AntigravityRole = 'brainstorm' | 'implementor';

export interface AntigravityStatus {
  connected: boolean;
  authenticated: boolean;
  model: string;
  accountLabel: string;
}

export interface AntigravityTurnOptions {
  threadId: string;
  prompt: string;
  outputSchema?: unknown;
  images?: string[];
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}

export interface AntigravityTurnResult {
  threadId: string;
  turnId: string;
  text: string;
  status: 'completed' | 'interrupted';
}

export interface AntigravityRuntimeOptions {
  cwd?: string;
  executable?: string;
  defaultModel?: string;
}

export class AntigravityRuntimeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AntigravityRuntimeError';
  }
}

interface ActiveTurnRecord {
  threadId: string;
  turnId: string;
  child: ChildProcess;
  interrupted: boolean;
}

function resolveExecutable(customPath?: string): string {
  if (customPath) return customPath;
  if (process.env.AGY_PATH) return process.env.AGY_PATH;
  const candidates = [
    '/home/rifqicode/.local/bin/agy',
    path.join(os.homedir(), '.local', 'bin', 'agy'),
    '/usr/local/bin/agy',
    '/usr/bin/agy',
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return 'agy';
}

export function cleanJsonOutput(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

export function sanitizeJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map(sanitizeJsonSchema);
  }

  const obj = { ...(schema as Record<string, unknown>) };

  const isNumericType =
    obj.type === 'integer' ||
    obj.type === 'number' ||
    (Array.isArray(obj.type) && (obj.type.includes('integer') || obj.type.includes('number')));

  if (isNumericType && 'enum' in obj) {
    delete obj.enum;
  }

  for (const [key, value] of Object.entries(obj)) {
    obj[key] = sanitizeJsonSchema(value);
  }

  return obj;
}

export class AntigravityRuntime {
  public readonly cwd: string;
  public readonly executable: string;
  public readonly defaultModel: string;

  private threads = new Map<string, { role: AntigravityRole; instructions?: string; hasCompletedFirstTurn?: boolean }>();
  private activeTurns = new Map<string, ActiveTurnRecord>();
  private closing = false;

  constructor(options: AntigravityRuntimeOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.executable = resolveExecutable(options.executable);
    this.defaultModel = options.defaultModel ?? 'gemini-3.8-flash-medium';
  }

  async status(): Promise<AntigravityStatus> {
    return new Promise<AntigravityStatus>((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(this.executable, ['--version'], {
          cwd: this.cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
        });
      } catch {
        return resolve({
          connected: false,
          authenticated: false,
          model: this.defaultModel,
          accountLabel: 'Antigravity CLI (Not installed)',
        });
      }

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr?.on('data', chunk => { stderr += chunk.toString(); });

      child.on('error', () => {
        resolve({
          connected: false,
          authenticated: false,
          model: this.defaultModel,
          accountLabel: 'Antigravity CLI (Unavailable)',
        });
      });

      child.on('exit', (code) => {
        if (code === 0) {
          const version = stdout.trim() || 'active';
          resolve({
            connected: true,
            authenticated: true,
            model: this.defaultModel,
            accountLabel: `Antigravity CLI (${version})`,
          });
        } else {
          resolve({
            connected: false,
            authenticated: false,
            model: this.defaultModel,
            accountLabel: 'Antigravity CLI (Error check)',
          });
        }
      });
    });
  }

  async createThread(options: { role: AntigravityRole; cwd?: string; developerInstructions?: string }): Promise<string> {
    const threadId = randomUUID();
    this.threads.set(threadId, {
      role: options.role,
      instructions: options.developerInstructions,
      hasCompletedFirstTurn: false,
    });
    return threadId;
  }

  async resumeThread(threadId: string): Promise<string> {
    if (!this.threads.has(threadId)) {
      this.threads.set(threadId, { role: 'brainstorm', hasCompletedFirstTurn: false });
    }
    return threadId;
  }

  async runTurn(options: AntigravityTurnOptions): Promise<AntigravityTurnResult> {
    if (this.closing) {
      throw new AntigravityRuntimeError('SHUTTING_DOWN', 'Antigravity runtime is closing.');
    }
    if (options.signal?.aborted) {
      throw new AntigravityRuntimeError('CANCELLED', 'Antigravity turn cancelled.');
    }
    if (this.activeTurns.has(options.threadId)) {
      throw new AntigravityRuntimeError('TURN_BUSY', 'A turn is already running for this thread.');
    }

    const turnId = randomUUID();
    let schemaFilePath: string | null = null;

    try {
      let thread = this.threads.get(options.threadId);
      if (!thread) {
        thread = { role: 'brainstorm', hasCompletedFirstTurn: false };
        this.threads.set(options.threadId, thread);
      }

      const args: string[] = [
        '--model', this.defaultModel,
        '--output-format', 'json',
        '--dangerously-skip-permissions',
      ];

      if (thread.hasCompletedFirstTurn) {
        args.unshift('--conversation', options.threadId);
      }

      if (options.outputSchema) {
        schemaFilePath = path.join(os.tmpdir(), `agy-schema-${turnId}.json`);
        const sanitized = sanitizeJsonSchema(options.outputSchema);
        await fsp.writeFile(schemaFilePath, JSON.stringify(sanitized, null, 2), 'utf8');
        args.push('--json-schema', schemaFilePath);
      }

      args.push(`--print=${options.prompt}`);

      const child = spawn(this.executable, args, {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      const activeRecord: ActiveTurnRecord = {
        threadId: options.threadId,
        turnId,
        child,
        interrupted: false,
      };
      this.activeTurns.set(options.threadId, activeRecord);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        options.onDelta?.(text);
      });

      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const onAbort = () => {
        activeRecord.interrupted = true;
        child.kill('SIGTERM');
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });

      const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        child.on('error', (err) => {
          options.signal?.removeEventListener('abort', onAbort);
          reject(err);
        });
        child.on('exit', (code, signal) => {
          options.signal?.removeEventListener('abort', onAbort);
          resolve({ code, signal });
        });
      });

      if (activeRecord.interrupted || options.signal?.aborted) {
        return {
          threadId: options.threadId,
          turnId,
          text: '',
          status: 'interrupted',
        };
      }

      if (exitResult.code !== 0) {
        throw new AntigravityRuntimeError(
          'EXECUTION_FAILED',
          `Antigravity process exited with code ${exitResult.code}: ${stderr.slice(0, 1000)}`
        );
      }

      thread.hasCompletedFirstTurn = true;

      let parsed: { response?: string; structured_output?: unknown; status?: string } | null = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        // Fallback if stdout contains other logs before JSON
        const firstBrace = stdout.indexOf('{');
        const lastBrace = stdout.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
          } catch {
            parsed = null;
          }
        }
      }

      let finalText = parsed?.response ?? stdout;
      if (options.outputSchema) {
        const cleaned = cleanJsonOutput(finalText);
        try {
          JSON.parse(cleaned);
          finalText = cleaned;
        } catch {
          if (parsed?.structured_output) {
            if (typeof parsed.structured_output === 'string') {
              finalText = cleanJsonOutput(parsed.structured_output);
            } else {
              finalText = JSON.stringify(parsed.structured_output);
            }
          }
        }
      }

      return {
        threadId: options.threadId,
        turnId,
        text: finalText,
        status: 'completed',
      };
    } finally {
      this.activeTurns.delete(options.threadId);
      if (schemaFilePath) {
        await fsp.unlink(schemaFilePath).catch(() => {});
      }
    }
  }

  async interrupt(threadId: string, turnId?: string): Promise<void> {
    const active = this.activeTurns.get(threadId);
    if (!active) return;
    if (turnId && active.turnId !== turnId) return;
    active.interrupted = true;
    active.child.kill('SIGTERM');
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const active of this.activeTurns.values()) {
      active.interrupted = true;
      active.child.kill('SIGTERM');
    }
    this.activeTurns.clear();
  }
}
