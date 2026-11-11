import React, {type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {VoiceoverPanel} from './VoiceoverPanel.js';

const props: ComponentProps<typeof VoiceoverPanel> = {
  projectId: 'project', sourceId: 'source', active: true, locked: false, busy: false,
  candidateView: false,
  shots: [{id: 'hook', durationFrames: 90, intent: 'Introduction', visualDirection: 'Heading'}, {id: 'explain', durationFrames: 150, intent: 'Explanation', visualDirection: 'Diagram'}],
  loadState: vi.fn(), loadAudio: vi.fn(), onGenerate: vi.fn(),
};
const render = (overrides: Partial<typeof props> = {}) => renderToStaticMarkup(React.createElement(VoiceoverPanel, {...props, ...overrides}));
const job = {id: 'job', projectId: 'project', kind: 'voiceover', status: 'running', message: 'Membuat narasi lokal', createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z'} as unknown as NonNullable<typeof props.job>;

describe('local per-shot voice-over controls', () => {
  it('labels shot scope, script limit, volume and duration policy explicitly', () => {
    const html = render();
    expect(html).toContain('Shot 01 · hook');
    expect(html).toContain('Shot 02 · explain');
    expect(html).toContain('Durasi shot: 3.00 detik');
    expect(html).toContain('for="voiceover-script"');
    expect(html).toContain('maxLength="3000"');
    expect(html).toContain('Volume narasi · 100%');
    expect(html).toContain('Perpanjang shot jika narasi tidak muat');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
    expect(html).toContain('kandidat');
    expect(html).not.toContain('Codex');
    expect(html).not.toContain('Antigravity');
  });
  it('blocks generation while runtime state is being loaded or no applied shots exist', () => {
    const html = render();
    expect(html).toContain('Memeriksa audio dan runtime lokal');
    expect(html.match(/<button[^>]*>Buat narasi shot ini<\/button>/)?.[0]).toContain('disabled');
    const empty = render({sourceId: undefined, shots: []});
    expect(empty).toContain('Terapkan video terlebih dahulu');
    expect(empty).not.toContain('voiceover-script');
  });
  it('shows the candidate audio scope and explicit reasons for blocked execution', () => {
    const html = render({candidateView: true, blockedReason: 'Terapkan atau buang kandidat sebelum membuat narasi lain.'});
    expect(html).toContain('Audio dari kandidat yang sedang ditampilkan.');
    expect(html).toContain('Terapkan atau buang kandidat sebelum membuat narasi lain.');
  });
  it('offers cancellation only for a running voice-over job and reports real errors', () => {
    const running = render({job, locked: true, onCancel: vi.fn()});
    expect(running).toContain('Membuat narasi lokal');
    expect(running.match(/<button[^>]*>Batalkan voice-over<\/button>/)?.[0]).not.toContain('disabled');
    expect(render({job: {...job, status: 'failed', error: 'GPU out of memory'}, onCancel: vi.fn()})).toContain('GPU out of memory');
    expect(render({job: {...job, status: 'failed'}, onCancel: vi.fn()})).not.toContain('Batalkan voice-over');
    expect(render({job: {...job, status: 'cancelled'}})).toContain('Pembuatan narasi dibatalkan.');
  });
  it('keeps the panel mounted but hidden when another review tab is active', () => {
    const html = render({active: false});
    expect(html).toContain('aria-label="Voice-over per shot" hidden=""');
  });
});
