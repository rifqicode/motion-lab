import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;
type RpcId = string | number;

export type CodexRole = 'brainstorm' | 'implementor';
export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  isDefault: boolean;
}

export interface CodexStatus {
  connected: boolean;
  authenticated: boolean;
  authMode: string | null;
  accountLabel: string | null;
  models: CodexModel[];
  toolsRestricted: boolean;
}

export interface CodexEvent {
  kind: 'connected' | 'disconnected' | 'turn.started' | 'turn.completed' | 'message.delta' | 'approval.denied' | 'error';
  threadId?: string;
  turnId?: string;
  text?: string;
  method?: string;
}

export interface CodexRuntimeOptions {
  cwd?: string;
  executable?: string;
  onEvent?: (event: CodexEvent) => void;
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
}

export interface CodexTurnOptions {
  threadId: string;
  prompt: string;
  outputSchema?: unknown;
  images?: string[];
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}

export interface CodexTurnResult {
  threadId: string;
  turnId: string;
  text: string;
  status: 'completed' | 'interrupted';
}

export class CodexRuntimeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CodexRuntimeError';
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ActiveTurn {
  threadId: string;
  turnId: string | null;
  text: string;
  messages: Map<string, string>;
  cancelled: boolean;
  resolve: (result: CodexTurnResult) => void;
  reject: (error: Error) => void;
  onDelta?: (text: string) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
}

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
const stringField = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;

const redact = (text: string): string => text
  .replace(/\b(?:sk-[A-Za-z0-9_-]+|Bearer\s+[^\s"']+)/gi, '[redacted]')
  .replace(/((?:access_token|refresh_token|api_key|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[redacted]')
  .slice(0, 2400);

// These are actual 0.167.0 config switches, not prompt-only restrictions.
const DISABLED_FEATURES = [
  'shell_tool', 'unified_exec', 'code_mode_host', 'code_mode', 'apps', 'plugins',
  'hooks', 'multi_agent', 'browser_use', 'computer_use', 'image_generation',
  'view_image', 'skill_search', 'shell_snapshot', 'sleep_tool',
] as const;

const restrictedConfig = (): JsonRecord => ({
  ...Object.fromEntries(DISABLED_FEATURES.map(feature => [`features.${feature}`, false])),
  'web_search': 'disabled',
  'skills.include_instructions': false,
  'skills.bundled.enabled': false,
  'apps._default.enabled': false,
});

/** Stdio app-server adapter. Project persistence belongs to the caller. */
export class CodexRuntime {
  private child: ChildProcessWithoutNullStreams | null = null;
  private started: Promise<void> | null = null;
  private pending = new Map<RpcId, PendingRequest>();
  private active = new Map<string, ActiveTurn>();
  private resumed = new Set<string>();
  private nextId = 0;
  private connected = false;
  private closing = false;
  private toolsRestricted = false;
  private stderr = '';
  private config: JsonRecord = restrictedConfig();
  private requestTimeoutMs: number;
  private turnTimeoutMs: number;

  constructor(private readonly options: CodexRuntimeOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.turnTimeoutMs = options.turnTimeoutMs ?? 300_000;
  }

  start(): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.started) return this.started;
    this.started = this.open().catch(error => {
      this.started = null;
      throw error;
    });
    return this.started;
  }

  private async open(): Promise<void> {
    this.closing = false;
    this.stderr = '';
    this.config = restrictedConfig();
    const args = ['app-server', '--listen', 'stdio://'];
    for (const [key, value] of Object.entries(this.config)) {
      args.push('-c', `${key}=${JSON.stringify(value)}`);
    }
    args.push('-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="on-request"');
    // A local subscription must never silently fall back to inherited API billing.
    const env = { ...process.env };
    delete env.CODEX_API_KEY;
    delete env.OPENAI_API_KEY;
    const child = spawn(this.options.executable ?? 'codex', args, {
      cwd: this.options.cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env,
    });
    this.child = child;
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer, 'utf8') > 4 * 1024 * 1024) {
        this.failConnection(new CodexRuntimeError('PROTOCOL_LIMIT', 'Codex returned an oversized protocol message.'));
        child.kill('SIGTERM');
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) this.receive(line);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString('utf8')).slice(-16_384);
    });
    child.on('error', error => this.failConnection(new CodexRuntimeError('CODEX_START_FAILED', redact(error.message))));
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      const diagnostics = redact(this.stderr.trim()).slice(-1200);
      const detail = this.closing ? 'Codex disconnected.' : `Codex exited (${code ?? signal ?? 'unknown'}).${diagnostics ? ` ${diagnostics}` : ''}`;
      this.failConnection(new CodexRuntimeError('CODEX_EXITED', detail));
    });
    child.stdin.on('error', error => this.failConnection(new CodexRuntimeError('CODEX_PIPE_FAILED', redact(error.message))));
    try {
      await this.request('initialize', {
        clientInfo: { name: 'local_creative_studio', title: 'Local Creative Studio', version: '0.1.0' },
      });
      this.send({ method: 'initialized', params: {} });
      // Read names only and disable every configured MCP server for these threads.
      const effective = asRecord(await this.request('config/read', {
        includeLayers: false,
        cwd: this.options.cwd ?? process.cwd(),
      }));
      const values = asRecord(effective?.config);
      const features = asRecord(values?.features);
      this.toolsRestricted = ['shell_tool', 'unified_exec', 'code_mode_host', 'apps', 'plugins', 'hooks']
        .every(feature => features?.[feature] === false);
      const servers = asRecord(values?.mcp_servers);
      for (const name of Object.keys(servers ?? {})) {
        if (!/^[A-Za-z0-9_-]+$/.test(name)) {
          throw new CodexRuntimeError('UNSUPPORTED_MCP_NAME', 'An MCP server name cannot be safely disabled through this Codex protocol version.');
        }
        this.config[`mcp_servers.${name}.enabled`] = false;
      }
      this.connected = true;
      this.emit({ kind: 'connected' });
    } catch (error) {
      child.kill('SIGTERM');
      throw error;
    }
  }

  async status(): Promise<CodexStatus> {
    await this.start();
    const accountResult = asRecord(await this.request('account/read', { refreshToken: false }));
    const account = asRecord(accountResult?.account);
    const type = stringField(account?.type) ?? null;
    const plan = stringField(account?.planType);
    const modelResult = asRecord(await this.request('model/list', { includeHidden: false }));
    const models = (Array.isArray(modelResult?.data) ? modelResult.data : []).flatMap(value => {
      const model = asRecord(value);
      if (!model || typeof model.model !== 'string') return [];
      return [{
        id: stringField(model.id) ?? model.model,
        model: model.model,
        displayName: stringField(model.displayName) ?? model.model,
        isDefault: model.isDefault === true,
      }];
    });
    return {
      connected: this.connected,
      authenticated: type === 'chatgpt',
      authMode: type,
      accountLabel: type === 'chatgpt' ? `ChatGPT${plan ? ` (${plan})` : ''}` : null,
      models,
      toolsRestricted: this.toolsRestricted,
    };
  }

  async createThread(options: { role: CodexRole; cwd?: string; developerInstructions?: string }): Promise<string> {
    const status = await this.status();
    if (!status.authenticated) {
      throw new CodexRuntimeError('LOGIN_REQUIRED', 'Login to Codex with ChatGPT before using the studio.');
    }
    if (!status.toolsRestricted) {
      throw new CodexRuntimeError('TOOLS_UNRESTRICTED', 'Codex did not confirm the required disabled tool configuration.');
    }
    const selected = status.models.find(model => model.isDefault) ?? status.models[0];
    if (!selected) throw new CodexRuntimeError('MODEL_UNAVAILABLE', 'No Codex model is available for this account.');
    const response = asRecord(await this.request('thread/start', {
      cwd: options.cwd ?? this.options.cwd ?? process.cwd(),
      model: selected.model,
      modelProvider: 'openai',
      sandbox: 'read-only',
      approvalPolicy: 'on-request',
      config: this.config,
      developerInstructions: [
        'You are working inside a local creative studio. All context is supplied in the conversation.',
        'Do not use shell, filesystem, tools, plugins, network or external services. Return the requested text or structured source proposal.',
        options.role === 'brainstorm'
          ? 'Discuss creative direction in Indonesian. Do not implement code or claim a preview exists.'
          : 'Write deterministic React/Remotion shot source as the requested structured proposal. The host validates, writes and builds your source.',
        options.developerInstructions ?? '',
      ].join('\n'),
    }));
    const thread = asRecord(response?.thread);
    const id = stringField(thread?.id);
    if (!id) throw new CodexRuntimeError('PROTOCOL_ERROR', 'Codex did not return a thread ID.');
    this.resumed.add(id);
    return id;
  }

  async resumeThread(threadId: string): Promise<string> {
    await this.start();
    if (!this.toolsRestricted) {
      throw new CodexRuntimeError('TOOLS_UNRESTRICTED', 'Codex did not confirm the required disabled tool configuration.');
    }
    if (this.resumed.has(threadId)) return threadId;
    const response = asRecord(await this.request('thread/resume', {
      threadId,
      excludeTurns: true,
      sandbox: 'read-only',
      approvalPolicy: 'on-request',
      config: this.config,
    }));
    const id = stringField(asRecord(response?.thread)?.id);
    if (id !== threadId) throw new CodexRuntimeError('PROTOCOL_ERROR', 'Codex resumed an unexpected thread.');
    this.resumed.add(id);
    return id;
  }

  async runTurn(options: CodexTurnOptions): Promise<CodexTurnResult> {
    if (options.signal?.aborted) throw new CodexRuntimeError('CANCELLED', 'Codex request cancelled.');
    await this.resumeThread(options.threadId);
    if (this.active.has(options.threadId)) throw new CodexRuntimeError('TURN_BUSY', 'A Codex turn is already running for this thread.');
    const result = new Promise<CodexTurnResult>((resolve, reject) => {
      const onAbort = () => {
        const turn = this.active.get(options.threadId);
        if (!turn) return;
        turn.cancelled = true;
        if (turn.turnId) {
          void this.interrupt(turn.threadId, turn.turnId).catch(error => this.finishFailed(turn.threadId, error));
        }
      };
      const timer = setTimeout(() => {
        const turn = this.active.get(options.threadId);
        if (!turn) return;
        turn.cancelled = true;
        if (turn.turnId) void this.interrupt(turn.threadId, turn.turnId).catch(() => {});
        this.finishFailed(options.threadId, new CodexRuntimeError('TURN_TIMEOUT', 'Codex turn exceeded the configured time limit.'));
        this.child?.kill('SIGTERM');
      }, this.turnTimeoutMs);
      this.active.set(options.threadId, {
        threadId: options.threadId,
        turnId: null,
        text: '',
        messages: new Map(),
        cancelled: false,
        resolve,
        reject,
        onDelta: options.onDelta,
        timer,
        cleanup: () => options.signal?.removeEventListener('abort', onAbort),
      });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
    });
    // Attach the rejection handler before asynchronous request processing can fail.
    const handled = result.catch(error => { throw error; });
    const input: JsonRecord[] = [{ type: 'text', text: options.prompt }];
    for (const image of options.images ?? []) input.push({ type: 'localImage', path: path.resolve(image) });
    void this.request('turn/start', {
      threadId: options.threadId,
      input,
      ...(options.outputSchema === undefined ? {} : { outputSchema: options.outputSchema }),
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      approvalPolicy: 'on-request',
    }).then(response => {
      const value = asRecord(response);
      const turn = asRecord(value?.turn);
      const active = this.active.get(options.threadId);
      if (!active) return;
      const id = stringField(turn?.id);
      if (!id) {
        this.finishFailed(options.threadId, new CodexRuntimeError('PROTOCOL_ERROR', 'Codex did not return a turn ID.'));
        return;
      }
      active.turnId = id;
      if (active.cancelled) void this.interrupt(active.threadId, id).catch(error => this.finishFailed(active.threadId, error));
    }).catch(error => {
      this.finishFailed(options.threadId, error);
      if (error instanceof CodexRuntimeError && error.code === 'REQUEST_TIMEOUT') this.child?.kill('SIGTERM');
    });
    return handled;
  }

  async interrupt(threadId: string, turnId: string): Promise<void> {
    const turn = this.active.get(threadId);
    if (turn && turn.turnId !== null && turn.turnId !== turnId) throw new CodexRuntimeError('TURN_MISMATCH', 'Cannot interrupt a different turn.');
    if (turn) turn.cancelled = true;
    try {
      await this.request('turn/interrupt', { threadId, turnId });
    } catch (error) {
      this.child?.kill('SIGTERM');
      throw error;
    }
    if (!turn || !this.active.has(threadId)) return;
    clearTimeout(turn.timer);
    turn.timer = setTimeout(() => {
      this.finishFailed(threadId, new CodexRuntimeError('INTERRUPT_TIMEOUT', 'Codex did not confirm cancellation. Restart the runtime before continuing.'));
      this.child?.kill('SIGTERM');
    }, Math.min(this.requestTimeoutMs, 10_000));
  }

  async close(): Promise<void> {
    this.closing = true;
    const child = this.child;
    if (!child) return;
    this.failConnection(new CodexRuntimeError('CODEX_CLOSED', 'Codex runtime closed.'));
    child.stdin.end();
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        const force = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
        force.unref();
        child.once('exit', () => { clearTimeout(force); resolve(); });
      }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    if (this.child === child) this.child = null;
  }

  private request(method: string, params: JsonRecord): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexRuntimeError('REQUEST_TIMEOUT', `Codex request timed out: ${method}.`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private send(message: JsonRecord): void {
    if (!this.child || !this.child.stdin.writable) throw new CodexRuntimeError('CODEX_DISCONNECTED', 'Codex is not connected.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let message: JsonRecord | null;
    try { message = asRecord(JSON.parse(line)); }
    catch {
      this.failConnection(new CodexRuntimeError('PROTOCOL_ERROR', 'Codex returned invalid JSON.'));
      this.child?.kill('SIGTERM');
      return;
    }
    if (!message) return;
    const id = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : undefined;
    const method = stringField(message.method);
    if (id !== undefined && method) {
      this.denyRequest(id, method);
      return;
    }
    if (id !== undefined) {
      const pending = this.pending.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      const rpcError = asRecord(message.error);
      if (rpcError) pending.reject(new CodexRuntimeError('CODEX_REQUEST_FAILED', redact(stringField(rpcError.message) ?? 'Codex request failed.')));
      else pending.resolve(message.result);
      return;
    }
    if (method) this.notification(method, asRecord(message.params) ?? {});
  }

  private denyRequest(id: RpcId, method: string): void {
    this.emit({ kind: 'approval.denied', method });
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      this.send({ id, result: { decision: 'decline' } });
    } else if (method === 'item/permissions/requestApproval') {
      this.send({ id, result: { permissions: {}, scope: 'turn' } });
    } else if (method === 'item/tool/requestUserInput') {
      this.send({ id, result: { answers: {} } });
    } else if (method === 'item/tool/call') {
      this.send({ id, result: { success: false, contentItems: [{ type: 'inputText', text: 'Tool execution is disabled in this studio.' }] } });
    } else {
      this.send({ id, error: { code: -32601, message: 'This studio does not allow this server request.' } });
    }
  }

  private notification(method: string, params: JsonRecord): void {
    const threadId = stringField(params.threadId);
    const turn = threadId ? this.active.get(threadId) : undefined;
    const turnData = asRecord(params.turn);
    const turnId = stringField(params.turnId) ?? stringField(turnData?.id);
    if (method === 'turn/started' && turn && turnId) {
      turn.turnId = turnId;
      this.emit({ kind: 'turn.started', threadId, turnId });
      return;
    }
    if (!turn || (turn.turnId && turnId && turn.turnId !== turnId)) return;
    if (method === 'item/agentMessage/delta' && typeof params.delta === 'string' && !turn.cancelled) {
      turn.text += params.delta;
      try { turn.onDelta?.(params.delta); }
      catch { /* Display listeners cannot interrupt a Codex turn. */ }
      this.emit({ kind: 'message.delta', threadId, turnId, text: params.delta });
    } else if (method === 'item/completed') {
      const item = asRecord(params.item);
      if (item?.type === 'agentMessage' && typeof item.text === 'string') {
        turn.messages.set(stringField(item.id) ?? `${turn.messages.size}`, item.text);
      }
    } else if (method === 'turn/completed' && turnData && turnId && threadId) {
      const status = turnData.status;
      const error = asRecord(turnData.error);
      if (status !== 'completed' && status !== 'interrupted') {
        this.finishFailed(threadId, new CodexRuntimeError('TURN_FAILED', redact(stringField(error?.message) ?? 'Codex turn failed.')));
        return;
      }
      clearTimeout(turn.timer);
      turn.cleanup();
      this.active.delete(threadId);
      const resultStatus = turn.cancelled || status === 'interrupted' ? 'interrupted' : 'completed';
      const text = resultStatus === 'interrupted' ? '' : Array.from(turn.messages.values()).at(-1) ?? turn.text;
      turn.resolve({ threadId, turnId, text, status: resultStatus });
      this.emit({ kind: 'turn.completed', threadId, turnId });
    }
  }

  private finishFailed(threadId: string, error: unknown): void {
    const turn = this.active.get(threadId);
    if (!turn) return;
    clearTimeout(turn.timer);
    turn.cleanup();
    this.active.delete(threadId);
    turn.reject(error instanceof Error ? error : new CodexRuntimeError('TURN_FAILED', 'Codex turn failed.'));
  }

  private failConnection(error: Error): void {
    this.connected = false;
    this.toolsRestricted = false;
    this.started = null;
    this.resumed.clear();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    for (const threadId of this.active.keys()) this.finishFailed(threadId, error);
    this.emit({ kind: 'disconnected', text: redact(error.message) });
  }

  private emit(event: CodexEvent): void {
    try { this.options.onEvent?.(event); }
    catch { /* A UI event listener cannot invalidate protocol state. */ }
  }
}
