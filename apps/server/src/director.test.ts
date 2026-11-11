import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Project, Storyboard} from '@studio/studio-core';
import {StudioService} from './service.js';
import {creativeContext, DEFAULT_BRIEF} from './prompts.js';
import {board as fixtureBoard} from '../../../packages/studio-core/test/storyboard-fixture.js';

describe('Director chat-first & auto-styling flow', () => {
  let root: string;
  let service: StudioService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-director-'));
    service = new StudioService({repoRoot: process.cwd(), projectRoot: root});
    await service.start();
  });

  afterEach(async () => {
    await service.close();
    vi.restoreAllMocks();
    await fs.rm(root, {recursive: true, force: true});
  });

  async function terminal(projectId: string, jobId: string) {
    return vi.waitFor(async () => {
      const job = await service.store.getJob(projectId, jobId);
      if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) throw new Error(`Still ${job.status}`);
      service.assertIdle(projectId);
      return job;
    }, {timeout: 10_000, interval: 25});
  }

  it('creativeContext uses fallback when brief is empty or matches DEFAULT_BRIEF', () => {
    const fallback = creativeContext({brief: '', style: {} as any});
    expect(fallback).toContain('(Brief not set separately; synthesize story entirely from creator\'s discussion)');

    const legacyDefault = creativeContext({brief: DEFAULT_BRIEF, style: {} as any});
    expect(legacyDefault).toContain('(Brief not set separately; synthesize story entirely from creator\'s discussion)');

    const custom = creativeContext({brief: 'My custom brief', style: {} as any});
    expect(custom).toContain('Creator story brief:\nMy custom brief');
    expect(custom).not.toContain('(Brief not set separately');
  });

  it('throws INVALID_BRIEF when both brief and messages are empty', async () => {
    const project = await service.store.createProject('Empty project', '');
    const {jobId} = await service.direct(project.id, 'req-1', null);
    const job = await terminal(project.id, jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('Kirim pesan ke Director atau tulis brief sebelum menyusun storyboard.');
  });

  it('auto-populates brief and style from storyboard draft when brief is empty but messages exist', async () => {
    const project = await service.store.createProject('Chat-first project', '');
    await service.store.saveMessage(project.id, {
      id: 'msg-1',
      role: 'user',
      content: 'Bikinin video tentang arsitektur distributed systems',
      createdAt: new Date().toISOString(),
    });

    const mockDraft: Storyboard = {
      ...fixtureBoard,
      concept: 'Distributed Systems 101',
      hook: 'Kenapa distributed system itu kompleks?',
      narrative: 'Penjelasan sistem terdistribusi dari sudut pandang latency dan consensus.',
      designSystem: {
        colors: ['#0A0A0A', '#3B82F6', '#10B981'],
        typography: 'Inter, system-ui, sans-serif',
        spacing: '8px baseline, 24px safe padding',
        motionStyle: 'Snappy cuts and minimal slide animations',
      },
    };

    vi.spyOn(service.codex, 'createThread').mockResolvedValue('thread-dir-1');
    vi.spyOn(service.codex, 'runTurn').mockResolvedValue({
      threadId: 'thread-dir-1',
      turnId: randomUUID(),
      status: 'completed',
      text: JSON.stringify(mockDraft),
    });

    const {jobId} = await service.direct(project.id, 'req-2', null);
    const job = await terminal(project.id, jobId);
    expect(job.status).toBe('succeeded');

    const updatedProject = await service.store.getProject(project.id);
    expect(updatedProject.brief).toBe('Penjelasan sistem terdistribusi dari sudut pandang latency dan consensus.');
    expect(updatedProject.style.colorPalette).toBe('#0A0A0A, #3B82F6, #10B981');
    expect(updatedProject.style.typography).toBe('Inter, system-ui, sans-serif');
    expect(updatedProject.style.pacing).toBe('Snappy cuts and minimal slide animations');
    expect(updatedProject.style.visualDirection).toBe('8px baseline, 24px safe padding');
    expect(updatedProject.style.mood).toBe('Kenapa distributed system itu kompleks?');

    const storyboard = await service.store.getStoryboard(project.id);
    expect(storyboard.draft).not.toBeNull();
    expect(storyboard.draft?.concept).toBe('Distributed Systems 101');
    // Storyboard can now be approved
    const approved = await service.store.approveStoryboard(project.id, storyboard.hash!);
    expect(approved.approvedHash).toBe(storyboard.hash);
  });

  it('preserves existing brief and custom style when already provided', async () => {
    const project = await service.store.createProject('Custom project', 'Brief saya yang sudah ada');
    await service.store.updateStyle(project.id, {
      mood: 'Dramatic',
      colorPalette: '#000000, #FFFFFF',
    });

    const mockDraft: Storyboard = {
      ...fixtureBoard,
      concept: 'Concept from Director',
      hook: 'Hook from Director',
      narrative: 'Narrative from Director',
      designSystem: {
        colors: ['#FF0000', '#00FF00'],
        typography: 'Roboto',
        spacing: '16px',
        motionStyle: 'Slow',
      },
    };

    vi.spyOn(service.codex, 'createThread').mockResolvedValue('thread-dir-2');
    vi.spyOn(service.codex, 'runTurn').mockResolvedValue({
      threadId: 'thread-dir-2',
      turnId: randomUUID(),
      status: 'completed',
      text: JSON.stringify(mockDraft),
    });

    const {jobId} = await service.direct(project.id, 'req-3', null);
    const job = await terminal(project.id, jobId);
    expect(job.status).toBe('succeeded');

    const updatedProject = await service.store.getProject(project.id);
    expect(updatedProject.brief).toBe('Brief saya yang sudah ada');
    expect(updatedProject.style.mood).toBe('Dramatic');
    expect(updatedProject.style.colorPalette).toBe('#000000, #FFFFFF');
  });
});
