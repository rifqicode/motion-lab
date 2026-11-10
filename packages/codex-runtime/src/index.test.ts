import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CodexRuntime, type CodexEvent} from './index.js';

type Scenario = 'normal' | 'hold' | 'approval' | 'exit' | 'malformed' | 'failed' | 'wrong-resume' | 'api-login' | 'tools-unrestricted';

describe('Codex stdio runtime protocol', () => {
  let directory: string;
  const runtimes: CodexRuntime[] = [];

  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-codex-test-')); });
  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
    await fs.rm(directory, {recursive: true, force: true});
  });

  async function fixture(scenario: Scenario, onEvent?: (event: CodexEvent) => void) {
    const executable = path.join(directory, `${scenario}.mjs`);
    const trace = path.join(directory, `${scenario}.jsonl`);
    const source = `#!/usr/bin/env node
import readline from 'node:readline';
import {appendFileSync} from 'node:fs';
const scenario = ${JSON.stringify(scenario)};
const trace = ${JSON.stringify(trace)};
let wire = Promise.resolve();
let activeThread = 'thread-fixture';
let activeTurn = 'turn-fixture';
function send(value) {
  const bytes = Buffer.from(JSON.stringify(value) + '\\n');
  const unicode = bytes.indexOf(Buffer.from('界'));
  const cut = unicode >= 0 ? unicode + 1 : Math.max(1, Math.floor(bytes.length / 2));
  wire = wire.then(() => new Promise(resolve => {
    process.stdout.write(bytes.subarray(0, cut));
    setImmediate(() => {process.stdout.write(bytes.subarray(cut)); resolve();});
  }));
  return wire;
}
function reply(id, result) {return send({id, result});}
function notify(method, params) {return send({method, params});}
function complete(status = 'completed', text = 'Komposisi 世界 siap.') {
  notify('item/completed', {threadId:activeThread,turnId:activeTurn,item:{id:'answer',type:'agentMessage',text}});
  return notify('turn/completed', {threadId:activeThread,turn:{id:activeTurn,status,items:[]}});
}
const input = readline.createInterface({input:process.stdin});
input.on('line', line => {
  const message = JSON.parse(line);
  appendFileSync(trace, JSON.stringify(message) + '\\n');
  if (message.method === 'initialize') reply(message.id, {userAgent:'studio-test',platformFamily:'unix',platformOs:'linux'});
  else if (message.method === 'config/read') reply(message.id, {config:{features:{shell_tool:scenario === 'tools-unrestricted',unified_exec:false,code_mode_host:false,apps:false,plugins:false,hooks:false},mcp_servers:{fixtureConnector:{enabled:true}}}});
  else if (message.method === 'account/read') reply(message.id, {account:{type:scenario === 'api-login' ? 'apiKey' : 'chatgpt',email:'fixture@example.invalid',planType:'plus'}});
  else if (message.method === 'model/list') reply(message.id, {data:[{id:'model-fixture',model:'model-fixture',displayName:'Fixture model',isDefault:true}]});
  else if (message.method === 'thread/start') reply(message.id, {thread:{id:activeThread}});
  else if (message.method === 'thread/resume') {
    activeThread = message.params.threadId;
    reply(message.id, {thread:{id:scenario === 'wrong-resume' ? 'thread-other-project' : activeThread}});
  }
  else if (message.method === 'turn/start') {
    activeThread = message.params.threadId;
    if (scenario === 'exit') process.exit(7);
    else if (scenario === 'malformed') {process.stdout.write('{invalid json}\\n');}
    else {
      reply(message.id, {turn:{id:activeTurn,status:'inProgress',items:[]}});
      notify('turn/started', {threadId:activeThread,turn:{id:activeTurn,status:'inProgress',items:[]}});
      if (scenario === 'approval') send({id:'approval-fixture',method:'item/commandExecution/requestApproval',params:{threadId:activeThread,turnId:activeTurn,itemId:'command',startedAtMs:0,command:'do-not-run'}});
      else if (scenario === 'failed') notify('turn/completed',{threadId:activeThread,turn:{id:activeTurn,status:'failed',error:{message:'Provider unavailable'},items:[]}});
      else {
        notify('item/agentMessage/delta',{threadId:activeThread,turnId:activeTurn,itemId:'answer',delta:'Komposisi 世界 '});
        if (scenario !== 'hold') {
          notify('item/agentMessage/delta',{threadId:activeThread,turnId:activeTurn,itemId:'answer',delta:'siap.'});
          // A different thread or stale turn must never contaminate this response.
          notify('item/agentMessage/delta',{threadId:'unrelated-project',turnId:activeTurn,itemId:'other',delta:'WRONG PROJECT'});
          notify('item/agentMessage/delta',{threadId:activeThread,turnId:'stale-turn',itemId:'other',delta:'STALE TURN'});
          complete();
        }
      }
    }
  }
  else if (message.method === 'turn/interrupt') {
    reply(message.id, {});
    complete('interrupted', 'Cancelled output must not be applied.');
  }
  else if (message.id === 'approval-fixture') {
    complete('completed', message.result?.decision === 'decline' ? 'Permission declined safely.' : 'UNSAFE APPROVAL');
  }
});
input.on('close', () => {wire.finally(() => process.exit(0));});
`;
    await fs.writeFile(executable, source, {mode: 0o700});
    const runtime = new CodexRuntime({cwd: directory, executable, onEvent, requestTimeoutMs: 2000, turnTimeoutMs: 4000});
    runtimes.push(runtime);
    const requests = async (): Promise<Array<Record<string, unknown>>> => (await fs.readFile(trace, 'utf8'))
      .trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    return {runtime, requests};
  }

  it('handles split JSONL/UTF-8, waits for turn completion and ignores events from other projects or turns', async () => {
    const {runtime, requests} = await fixture('normal');
    const status = await runtime.status();
    expect(status).toMatchObject({connected: true, authenticated: true, authMode: 'chatgpt', accountLabel: 'ChatGPT (plus)'});
    expect(JSON.stringify(status)).not.toContain('fixture@example.invalid');
    const threadId = await runtime.createThread({role: 'implementor'});
    const deltas: string[] = [];
    const outputSchema = {type: 'object', properties: {summary: {type: 'string'}}, required: ['summary'], additionalProperties: false};
    const result = await runtime.runTurn({threadId, prompt: 'Write a cache shot.', outputSchema, onDelta: (delta) => deltas.push(delta)});
    expect(result).toMatchObject({threadId, turnId: 'turn-fixture', text: 'Komposisi 世界 siap.', status: 'completed'});
    expect(deltas.join('')).toBe('Komposisi 世界 siap.');
    const calls = await requests();
    expect(calls[0].method).toBe('initialize');
    expect(calls[1].method).toBe('initialized');
    const start = calls.find((call) => call.method === 'thread/start') as {params: {config: Record<string, unknown>}};
    expect(start.params.config['features.shell_tool']).toBe(false);
    expect(start.params.config['mcp_servers.fixtureConnector.enabled']).toBe(false);
    const turnStart = calls.find((call) => call.method === 'turn/start') as {params: {outputSchema: unknown}};
    expect(turnStart.params.outputSchema).toEqual(outputSchema);
  });

  it('interrupts an acknowledged active turn and suppresses all cancelled output', async () => {
    const {runtime, requests} = await fixture('hold');
    const threadId = await runtime.createThread({role: 'brainstorm'});
    const controller = new AbortController();
    const result = await runtime.runTurn({threadId, prompt: 'Brainstorm one idea.', signal: controller.signal,
      onDelta: () => controller.abort()});
    expect(result).toMatchObject({status: 'interrupted', text: ''});
    const calls = await requests();
    expect(calls.find((call) => call.method === 'turn/interrupt')).toMatchObject({
      params: {threadId, turnId: 'turn-fixture'},
    });
  });

  it('refuses a second turn on the same thread until cancellation is confirmed', async () => {
    const {runtime} = await fixture('hold');
    const threadId = await runtime.createThread({role: 'brainstorm'});
    let onFirstDelta!: () => void;
    const firstDelta = new Promise<void>((resolve) => { onFirstDelta = resolve; });
    const controller = new AbortController();
    const firstTurn = runtime.runTurn({threadId, prompt: 'First idea', signal: controller.signal, onDelta: onFirstDelta});
    await firstDelta;
    await expect(runtime.runTurn({threadId, prompt: 'Second idea'})).rejects.toMatchObject({code: 'TURN_BUSY'});
    controller.abort();
    expect((await firstTurn).status).toBe('interrupted');
  });

  it('declines unexpected command approvals rather than running a model-provided host command', async () => {
    const events: CodexEvent[] = [];
    const {runtime, requests} = await fixture('approval', (event) => events.push(event));
    const threadId = await runtime.createThread({role: 'implementor'});
    const result = await runtime.runTurn({threadId, prompt: 'Write source only.'});
    expect(result.text).toBe('Permission declined safely.');
    expect((await requests()).find((call) => call.id === 'approval-fixture')).toMatchObject({result: {decision: 'decline'}});
    expect(events).toContainEqual({kind: 'approval.denied', method: 'item/commandExecution/requestApproval'});
  });

  it.each([
    ['exit', 'CODEX_EXITED'], ['malformed', 'PROTOCOL_ERROR'], ['failed', 'TURN_FAILED'],
  ] as const)('propagates %s failure instead of reporting a successful generation', async (scenario, code) => {
    const {runtime} = await fixture(scenario);
    const threadId = await runtime.createThread({role: 'implementor'});
    await expect(runtime.runTurn({threadId, prompt: 'Write source.'})).rejects.toMatchObject({code});
  });

  it('rejects a resume response for another project thread', async () => {
    const {runtime} = await fixture('wrong-resume');
    await expect(runtime.resumeThread('saved-project-thread')).rejects.toMatchObject({code: 'PROTOCOL_ERROR'});
  });

  it('refuses to resume a saved project when tool restrictions were not confirmed', async () => {
    const {runtime, requests} = await fixture('tools-unrestricted');
    await expect(runtime.resumeThread('saved-project-thread')).rejects.toMatchObject({code: 'TOOLS_UNRESTRICTED'});
    expect((await requests()).some(call => call.method === 'thread/resume')).toBe(false);
  });

  it('requires ChatGPT login instead of silently treating API-key auth as subscription access', async () => {
    const {runtime, requests} = await fixture('api-login');
    expect((await runtime.status()).authenticated).toBe(false);
    await expect(runtime.createThread({role: 'brainstorm'})).rejects.toMatchObject({code: 'LOGIN_REQUIRED'});
    expect((await requests()).some((call) => call.method === 'thread/start')).toBe(false);
  });

  it('fails closed when effective Codex tool restrictions were not confirmed', async () => {
    const {runtime, requests} = await fixture('tools-unrestricted');
    expect((await runtime.status()).toolsRestricted).toBe(false);
    await expect(runtime.createThread({role: 'implementor'})).rejects.toMatchObject({code: 'TOOLS_UNRESTRICTED'});
    expect((await requests()).some((call) => call.method === 'thread/start')).toBe(false);
  });
});
