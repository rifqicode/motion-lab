import React, {type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {StoryboardPanel} from './StoryboardPanel.js';
import type {Storyboard} from '@studio/studio-core/storyboard';

const board: Storyboard = {
  schemaVersion: 1, concept: 'Cache routing', hook: 'Why did cache misses increase?', narrative: 'Question, mechanism, takeaway.',
  designSystem: {colors: ['#ffffff', '#222222'], typography: 'System sans', spacing: '32px safe area', motionStyle: 'Frame based reveals'},
  sharedComponents: [],
  shots: [
    {id: 'hook', title: 'Hook', durationFrames: 90, intent: 'Ask the question', visualDirection: 'Large question', motionInstructions: 'Reveal text', transition: 'cut', dependencies: [], sharedComponents: []},
    {id: 'mechanism', title: 'Mechanism', durationFrames: 180, intent: 'Explain routing', visualDirection: 'Diagram', motionInstructions: 'Move keys between nodes', transition: 'cut', dependencies: [], sharedComponents: []},
  ],
};
const hash = 'a'.repeat(64);
const base: ComponentProps<typeof StoryboardPanel> = {
  draft: board, state: {draft: board, hash, approvedHash: null, briefHash: 'b'.repeat(64)},
  dirty: false, conflicted: false, contextDirty: false, contextApproved: true, locked: false,
  hasCandidate: false, agentReady: true, runnerReady: true, directing: false,
  onChange: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onDirect: vi.fn(), onApproveGenerate: vi.fn(), onDiscuss: vi.fn(),
  selectedShotId: null, onSelectShot: vi.fn(), onDiscussShot: vi.fn(),
};
const render = (overrides: Partial<typeof base> = {}) => renderToStaticMarkup(React.createElement(StoryboardPanel, {...base, ...overrides}));
const approvalButton = (html: string) => html.match(/<button[^>]*>Setujui storyboard &amp; generate<\/button>/)?.[0];

describe('storyboard review gates', () => {
  it('presents an empty state and a Director action before any storyboard exists', () => {
    const html = render({draft: null, state: {draft: null, hash: null, approvedHash: null, briefHash: null}});
    expect(html).toContain('Belum ada storyboard.');
    expect(html).toContain('Susun storyboard</button>');
    expect(approvalButton(html)).toBeUndefined();
  });

  it('shows the ordered shots without opening a detail form initially', () => {
    const html = render();
    expect(html).toContain('2 shot');
    expect(html).toContain('9.0 detik');
    expect(html.indexOf('01 · Hook')).toBeLessThan(html.indexOf('02 · Mechanism'));
    expect(html).not.toContain('shot-title');
    expect(html).not.toContain('shot-dialog-title');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(approvalButton(html)).toBeDefined();
    expect(approvalButton(html)).not.toContain('disabled');
  });

  it('opens only the selected shot detail and offers discussion in Director', () => {
    const html = render({selectedShotId: 'mechanism'});
    expect(html).toContain('Shot 02 · Mechanism');
    expect(html).toContain('value="Mechanism"');
    expect(html).toContain('Dependency dan identitas shot');
    expect(html).toContain('Diskusikan shot ini');
    expect(html).not.toContain('value="Hook"');
  });

  it('renders Konsep & Visual Style accordion with concept and designSystem fields', () => {
    const html = render();
    expect(html).toContain('Konsep &amp; Visual Style');
    expect(html).toContain('storyboard-concept');
    expect(html).toContain('storyboard-hook');
    expect(html).toContain('storyboard-narrative');
    expect(html).toContain('storyboard-colors');
    expect(html).toContain('storyboard-typography');
    expect(html).toContain('storyboard-spacing');
    expect(html).toContain('storyboard-motion');
  });

  it.each([
    {dirty: true}, {conflicted: true}, {contextDirty: true}, {locked: true},
    {hasCandidate: true}, {agentReady: false}, {runnerReady: false},
  ])('blocks approval/generation when a prerequisite is missing: %j', overrides => {
    expect(approvalButton(render(overrides))).toContain('disabled');
  });

  it('blocks invalid shot duration and identifies the affected field instead of offering generation', () => {
    const invalid = {...board, shots: board.shots.map((shot, index) => index === 0 ? {...shot, durationFrames: 0} : shot)};
    const html = render({draft: invalid});
    expect(html).toContain('Periksa storyboard');
    expect(html).toContain('shots.0.durationFrames');
    expect(approvalButton(html)).toContain('disabled');
  });

  it('only labels approval valid when the saved storyboard and creative context are current', () => {
    const state = {...base.state, approvedHash: hash};
    expect(render({state})).toContain('Generate dari storyboard disetujui');
    expect(render({state, contextApproved: false})).toContain('Ada perubahan');
    expect(render({state, dirty: true})).toContain('Ada perubahan');
  });
});
