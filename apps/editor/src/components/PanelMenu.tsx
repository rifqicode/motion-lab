import React, {useRef} from 'react';

export function PanelMenu({label, items}: {label: string; items: {label: string; active: boolean; onSelect: () => void}[]}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (!menu.current) return;
    menu.current.open = false;
    menu.current.querySelector('summary')?.focus();
  };
  return <details className="context-menu" ref={menu} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
  }}>
    <summary aria-label={label}>···</summary>
    <div>{items.map(item => <button key={item.label} type="button" aria-pressed={item.active} onClick={() => { item.onSelect(); close(); }}>{item.label}</button>)}</div>
  </details>;
}
