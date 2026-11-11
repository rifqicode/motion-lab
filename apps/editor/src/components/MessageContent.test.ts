import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {MessageContent} from './MessageContent.js';

const render = (text: string) => renderToStaticMarkup(React.createElement(MessageContent, {text}));

describe('Director message formatting', () => {
  it('formats headings and keeps inline emphasis together within list text', () => {
    const html = render('### Langkah berikutnya\n\n1. Perbarui **Creative Brief** dengan `#0F4C5C`.');
    expect(html).toContain('<h3>Langkah berikutnya</h3>');
    expect(html).toContain('<span>Perbarui <strong>Creative Brief</strong> dengan <code>#0F4C5C</code>.</span>');
  });

  it('escapes agent HTML and leaves unrecognized link syntax inert', () => {
    const html = render('<img src=x onerror=alert(1)>\n\n[open](javascript:alert(1))');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a');
  });
});
