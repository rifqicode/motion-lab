import React, {type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {ChatPanel} from './ChatPanel.js';

const baseProps: ComponentProps<typeof ChatPanel> = {
  messages: [{id: 'm1', role: 'user', content: 'Halo'}],
  stream: '',
  chat: '',
  onChatChange: vi.fn(),
  locked: false,
  agentAuthenticated: true,
  agentProvider: 'antigravity',
  isChatting: false,
  onSubmit: vi.fn(),
  onDirect: vi.fn(),
  canDirect: true,
};

const render = (overrides: Partial<typeof baseProps> = {}) =>
  renderToStaticMarkup(React.createElement(ChatPanel, {...baseProps, ...overrides}));

describe('ChatPanel storyboard integration', () => {
  it('provides separate discussion and video-revision actions without changing the default chat behavior', () => {
    const html = render();
    expect(html).toContain('aria-label="Aksi Director"');
    expect(html).toContain('Diskusi</button>');
    expect(html).toContain('Revisi video</button>');
    expect(html).toContain('aria-label="Kirim ke Antigravity"');
  });
  it('renders the persistent storyboard action', () => {
    const html = render();
    expect(html).toContain('chat-storyboard-sticky-bar');
    expect(html).toContain('Susun storyboard');
    const buttonMatch = html.match(/<button[^>]*class="[^"]*chat-generate-storyboard-btn[^"]*"[^>]*>/)?.[0];
    expect(buttonMatch).toBeDefined();
    expect(buttonMatch).not.toContain('disabled');
  });

  it('disables the storyboard action when canDirect is false', () => {
    const html = render({canDirect: false});
    const buttonMatch = html.match(/<button[^>]*class="[^"]*chat-generate-storyboard-btn[^"]*"[^>]*>/)?.[0];
    expect(buttonMatch).toBeDefined();
    expect(buttonMatch).toContain('disabled');
  });

  it('labels a shot discussion while preserving the existing message history', () => {
    const html = render({shotContext: {position: 2, draft: true, shot: {id: 'two', title: 'Penjelasan', durationFrames: 90, intent: 'Jelaskan', visualDirection: 'Diagram', motionInstructions: 'Geser', transition: 'cut', dependencies: [], sharedComponents: []}}, onOpenShotDetail: vi.fn(), onClearShotContext: vi.fn()});
    expect(html).toContain('Halo');
    expect(html).toContain('Diskusi shot 02');
    expect(html).toContain('Penjelasan');
    expect(html).toContain('Memakai draft lokal');
    expect(html).toContain('Bahas seluruh video');
    expect(html).not.toContain('chat-generate-storyboard-btn');
  });

  it('recognizes storyboard creation intent regex correctly', () => {
    const regex = /(?:buat|bikin|susun|generate).*storyboard/i;
    expect(regex.test('buat storyboard')).toBe(true);
    expect(regex.test('tolong buatkan storyboard dong')).toBe(true);
    expect(regex.test('bikin storyboard')).toBe(true);
    expect(regex.test('susun storyboard sekarang')).toBe(true);
    expect(regex.test('generate the storyboard')).toBe(true);
    expect(regex.test('halo apa kabar')).toBe(false);
    expect(regex.test('gimana menurut lo hooknya?')).toBe(false);
  });
});
