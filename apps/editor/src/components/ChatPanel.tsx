import React, {useEffect, useRef, useState} from 'react';
import {MessageContent} from './MessageContent.js';
import type {ShotDiscussionContext} from '@studio/studio-core/storyboard';

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  stream: string;
  chat: string;
  onChatChange: (value: string) => void;
  locked: boolean;
  agentAuthenticated: boolean;
  agentProvider?: 'codex' | 'antigravity';
  isChatting?: boolean;
  onCancelChat?: () => void;
  onSubmit: (mode: 'discuss' | 'revise') => void;
  onDirect: () => void;
  canDirect: boolean;
  shotContext?: ShotDiscussionContext;
  onClearShotContext?: () => void;
  onOpenShotDetail?: () => void;
  canRevise?: boolean;
  revisionBlockedReason?: string;
  revisionLabel?: string;
  isRevising?: boolean;
  activityMessage?: string;
}

export function ChatPanel({
  messages,
  stream,
  chat,
  onChatChange,
  locked,
  agentAuthenticated,
  agentProvider = 'codex',
  isChatting,
  onCancelChat,
  onSubmit,
  onDirect,
  canDirect,
  shotContext,
  onClearShotContext,
  onOpenShotDetail,
  canRevise = false,
  revisionBlockedReason = 'Terapkan hasil generate terlebih dahulu sebelum merevisi video.',
  revisionLabel,
  isRevising = false,
  activityMessage,
}: ChatPanelProps) {
  const [mode, setMode] = useState<'discuss' | 'revise'>('discuss');
  const messagesEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const previousScope = useRef(shotContext?.shot.id);
  const agentLabel = agentProvider === 'antigravity' ? 'Antigravity' : 'Codex';

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({block: 'nearest'});
  }, [messages.length, stream, isChatting]);

  useEffect(() => {
    if (shotContext || previousScope.current) composer.current?.focus({preventScroll: true});
    previousScope.current = shotContext?.shot.id;
  }, [shotContext?.shot.id]);

  return (
    <div className="chat-panel">
      {shotContext && <section className="shot-chat-context" aria-label="Konteks diskusi shot"><div><span>Diskusi shot {String(shotContext.position).padStart(2, '0')}</span><strong>{shotContext.shot.title || 'Tanpa judul'}</strong></div><p>Thread Director yang sama · {shotContext.draft ? 'Memakai draft lokal' : 'Detail tersimpan'}</p><div className="button-row"><button type="button" onClick={onOpenShotDetail}>Lihat detail shot</button><button type="button" onClick={onClearShotContext}>Bahas seluruh video</button></div></section>}
      <div className="messages" aria-label="Percakapan">
        {!messages.length && <div className="director-intro"><h2>{canRevise ? 'Mau ubah bagian mana?' : 'Ceritain ide lo.'}</h2><p className="chat-intro">{canRevise ? 'Bahas arahnya bersama Director. Pilih Revisi video untuk menerapkan perubahan dari versi aktif.' : 'Ulik hook, alur cerita, dan visual bersama Director. Kalau arahnya sudah pas, pilih Susun storyboard.'}</p></div>}
        {messages.map(message => (
          <article key={message.id} className={`message ${message.role}`}>
            <span className="message-author">{message.role === 'user' ? 'Lo' : `Director · ${agentLabel}`}</span>
            <MessageContent text={message.content} />
          </article>
        ))}
        {isChatting && !stream && (
          <article className="message assistant thinking">
            <span className="message-author">{isRevising ? 'Revisi video berjalan' : `${agentLabel} · berpikir`}</span>
            {isRevising && <p className="muted small">{activityMessage || 'Director menyiapkan revisi dari versi aktif.'}</p>}
            <div className="typing-indicator" aria-label={`${agentLabel} sedang berpikir`}>
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </article>
        )}
        {stream && (
          <article className="message assistant">
            <span className="message-author">{agentLabel} · menulis</span>
            <MessageContent text={stream} />
          </article>
        )}
        <div ref={messagesEnd} />
      </div>
      {!shotContext && mode === 'discuss' && <div className="chat-storyboard-sticky-bar">
        <button
          type="button"
          className="chat-generate-storyboard-btn"
          disabled={!canDirect}
          onClick={onDirect}
          title={!canDirect ? 'Kandidat atau perubahan lain perlu diselesaikan sebelum menyusun storyboard' : 'Susun storyboard terstruktur dari ide ini'}
        >
          Susun storyboard
        </button>
      </div>}
      <form
        className="chat-compose"
        onSubmit={event => {
          event.preventDefault();
          const trimmed = chat.trim();
          if (!trimmed) return;
          if (mode === 'revise' && !canRevise) return;
          if (mode === 'discuss' && !shotContext && canDirect && /(?:buat|bikin|susun|generate).*storyboard/i.test(trimmed)) {
            onChatChange('');
            onDirect();
            return;
          }
          onSubmit(mode);
        }}
      >
        <div className="director-mode" role="group" aria-label="Aksi Director"><button type="button" aria-pressed={mode === 'discuss'} disabled={locked} onClick={() => setMode('discuss')}>Diskusi</button><button type="button" aria-pressed={mode === 'revise'} disabled={locked} onClick={() => setMode('revise')}>Revisi video</button></div>
        {mode === 'discuss' && canRevise && <p className="revision-context">Diskusi untuk membahas arahan. Pilih Revisi video untuk menerapkannya.</p>}
        {mode === 'revise' && <p className="revision-context" role="status">{isRevising ? 'Merevisi versi aktif. Hasil akan tersedia sebagai kandidat untuk direview.' : canRevise ? `${revisionLabel || 'Versi aktif'} · ${shotContext ? `hanya shot ${shotContext.position}` : 'seluruh video'}. Hasil masuk sebagai kandidat; versi awal tetap tersimpan.` : revisionBlockedReason}</p>}
        <label htmlFor="chat-message">{mode === 'revise' ? 'Perubahan yang ingin diterapkan' : shotContext ? `Diskusikan shot ${shotContext.position}` : 'Diskusikan ide'}</label>
        <textarea
          ref={composer}
          id="chat-message"
          rows={3}
          placeholder={mode === 'revise' ? shotContext ? 'Contoh: perlambat animasi dan tambah durasi shot ini menjadi 5 detik.' : 'Contoh: turunkan pacing seluruh video, pertahankan visual dan isi cerita.' : shotContext ? 'Apa yang ingin lo bahas dari shot ini?' : 'Apa hook yang paling pas buat cerita ini?'}
          value={chat}
          onChange={event => onChatChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={12000}
          disabled={locked}
        />
        {isChatting ? (
          <>
            <div className="chat-status-bar" role="status">
              <span className="pulse-indicator" />
              <span>{isRevising ? activityMessage || 'Revisi sedang berjalan…' : stream ? `${agentLabel} sedang menulis jawaban…` : `${agentLabel} sedang memproses ide…`}</span>
            </div>
            <div className="chat-actions">
              <button className="primary chat-loading-btn" disabled type="button">
                <span className="btn-spinner" /> {isRevising ? 'Merevisi versi aktif…' : `${agentLabel} sedang berpikir…`}
              </button>
              {onCancelChat && (
                <button type="button" className="chat-cancel-btn" onClick={onCancelChat}>
                  Batal
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="chat-send-row"><span>Enter untuk kirim · Shift + Enter untuk baris baru</span><button className={`chat-send${mode === 'revise' ? ' is-revision' : ''}`} aria-label={mode === 'revise' ? shotContext ? 'Revisi shot ini' : 'Revisi seluruh video' : `Kirim ke ${agentLabel}`} disabled={locked || !chat.trim() || !agentAuthenticated || mode === 'revise' && !canRevise}>{mode === 'revise' ? shotContext ? 'Revisi shot ini' : 'Revisi video' : 'Kirim'} <span aria-hidden="true">↗</span></button></div>
        )}
      </form>
    </div>
  );
}
