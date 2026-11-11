import React from 'react';

// Agent text stays escaped by React; only these inline delimiters become markup.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part);
}

export function MessageContent({text}: {text: string}) {
  const blocks = text.split(/\n\s*\n/);
  return <div className="message-content">{blocks.map((block, index) => {
    if (/^\s*---+\s*$/.test(block)) return <hr key={index} />;
    const lines = block.split('\n');
    return <div className="message-block" key={index}>{lines.map((line, lineIndex) => {
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
      if (heading) return <h3 key={lineIndex}>{inline(heading[1])}</h3>;
      if (bullet) return <p className="message-list-item" key={lineIndex}><span aria-hidden="true">·</span><span>{inline(bullet[1])}</span></p>;
      return <p key={lineIndex}>{inline(line)}</p>;
    })}</div>;
  })}</div>;
}
