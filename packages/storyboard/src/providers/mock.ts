import type { LLMMessage, LLMProvider, LLMResponse, LLMGenerateOptions } from '../types.js';
import type { Project } from '@studio/schema';

export const DEFAULT_MOCK_PROJECT: Project = {
  id: 'postgres-cdc-mock',
  title: 'PostgreSQL CDC Architecture',
  sourceText: 'PostgreSQL CDC with WAL and Debezium',
  language: 'id-ID',
  aspectRatio: '9:16',
  fps: 30,
  themeId: 'midnight-tech',
  sceneIds: ['scene-1', 'scene-2'],
  scenes: [
    {
      id: 'scene-1',
      order: 1,
      type: 'data-flow',
      title: 'Write-Ahead Log (WAL)',
      narrationText: 'Setiap transaksi PostgreSQL disimpan lebih dahulu ke Write-Ahead Log.',
      durationFrames: 150,
      nodes: [
        { id: 'client', kind: 'client', label: 'Client App' },
        { id: 'pg', kind: 'database', label: 'PostgreSQL' },
        { id: 'wal', kind: 'log', label: 'WAL Engine' },
      ],
      edges: [
        { id: 'e-client-pg', from: 'client', to: 'pg', kind: 'data-flow', label: 'SQL Mutation' },
        { id: 'e-pg-wal', from: 'pg', to: 'wal', kind: 'data-flow', label: 'Append WAL' },
      ],
      animationCues: [
        { id: 'cue-client', preset: 'node-reveal', targetId: 'client', startFrame: 0, durationFrames: 24, easing: 'spring' },
        { id: 'cue-pg', preset: 'node-reveal', targetId: 'pg', startFrame: 20, durationFrames: 24, easing: 'spring' },
        { id: 'cue-wal', preset: 'node-reveal', targetId: 'wal', startFrame: 40, durationFrames: 24, easing: 'spring' },
        { id: 'cue-draw-1', preset: 'connector-draw', targetId: 'e-client-pg', startFrame: 15, durationFrames: 25, easing: 'ease-out' },
        { id: 'cue-draw-2', preset: 'connector-draw', targetId: 'e-pg-wal', startFrame: 35, durationFrames: 25, easing: 'ease-out' },
      ],
      cameraCues: [],
      subtitleSettings: {
        enabled: true,
        position: 'bottom',
        fontSize: 38,
        highlightColor: '#38bdf8',
      },
      revision: 1,
    },
    {
      id: 'scene-2',
      order: 2,
      type: 'data-flow',
      title: 'Debezium Replication',
      narrationText: 'Debezium menangkap rekaman perubahan dari WAL dan mempublikasikannya ke streaming broker.',
      durationFrames: 150,
      nodes: [
        { id: 'wal', kind: 'log', label: 'WAL Engine' },
        { id: 'debezium', kind: 'service', label: 'Debezium Connector' },
        { id: 'kafka', kind: 'queue', label: 'Apache Kafka' },
      ],
      edges: [
        { id: 'e-wal-deb', from: 'wal', to: 'debezium', kind: 'data-flow', label: 'Replication' },
        { id: 'e-deb-kafka', from: 'debezium', to: 'kafka', kind: 'data-flow', label: 'CDC Events' },
      ],
      animationCues: [
        { id: 'cue-wal2', preset: 'node-reveal', targetId: 'wal', startFrame: 0, durationFrames: 24, easing: 'spring' },
        { id: 'cue-deb', preset: 'node-reveal', targetId: 'debezium', startFrame: 20, durationFrames: 24, easing: 'spring' },
        { id: 'cue-kafka', preset: 'node-reveal', targetId: 'kafka', startFrame: 40, durationFrames: 24, easing: 'spring' },
        { id: 'cue-draw-wal-deb', preset: 'connector-draw', targetId: 'e-wal-deb', startFrame: 15, durationFrames: 25, easing: 'ease-out' },
        { id: 'cue-draw-deb-kafka', preset: 'connector-draw', targetId: 'e-deb-kafka', startFrame: 35, durationFrames: 25, easing: 'ease-out' },
      ],
      cameraCues: [],
      subtitleSettings: {
        enabled: true,
        position: 'bottom',
        fontSize: 38,
        highlightColor: '#38bdf8',
      },
      revision: 1,
    },
  ],
  revision: 1,
};

export interface MockLLMProviderOptions {
  mockProject?: Project;
  failAttempts?: number;
  invalidJsonPayload?: string;
}

export class MockLLMProvider implements LLMProvider {
  public readonly id = 'mock';
  private callCount = 0;
  private failAttempts: number;
  private mockProject: Project;
  private invalidJsonPayload: string;

  constructor(options: MockLLMProviderOptions = {}) {
    this.failAttempts = options.failAttempts ?? 0;
    this.mockProject = options.mockProject ?? DEFAULT_MOCK_PROJECT;
    this.invalidJsonPayload =
      options.invalidJsonPayload ??
      JSON.stringify({
        ...DEFAULT_MOCK_PROJECT,
        // Introduce deliberate validation error (duplicate node id or missing edge target)
        scenes: [
          {
            ...DEFAULT_MOCK_PROJECT.scenes[0],
            edges: [{ id: 'bad-edge', from: 'nonexistent-1', to: 'nonexistent-2', kind: 'data-flow' }],
          },
        ],
      });
  }

  public async generate(
    messages: LLMMessage[],
    _options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    this.callCount++;

    // If failAttempts is configured and we haven't reached it, return invalid output
    if (this.callCount <= this.failAttempts) {
      return {
        content: this.invalidJsonPayload,
        usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
      };
    }

    // Extract title from prompt or sourceText if present
    const userMsg = messages.find((m) => m.role === 'user')?.content || '';
    const project = { ...this.mockProject };
    if (userMsg.includes('SOURCE TEXT:')) {
      const match = userMsg.match(/SOURCE TEXT:\s*\n([^\n]+)/);
      if (match && match[1]) {
        project.title = match[1].slice(0, 50).trim();
      }
    }

    return {
      content: JSON.stringify(project, null, 2),
      usage: { promptTokens: 250, completionTokens: 600, totalTokens: 850 },
    };
  }

  public getCallCount(): number {
    return this.callCount;
  }
}
