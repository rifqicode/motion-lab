import React, {useEffect, useRef} from 'react';

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
  onSubmit: () => void;
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
}: ChatPanelProps) {
  const messagesEnd = useRef<HTMLDivElement>(null);
  const agentLabel = agentProvider === 'antigravity' ? 'Antigravity' : 'Codex';

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({block: 'nearest'});
  }, [messages.length, stream, isChatting]);

  return (
    <div className="chat-panel">
      <div className="messages" aria-label="Percakapan">
        <p className="chat-intro">
          Ulik hook, alur cerita, dan visual sebelum masuk ke kode. Percakapan memakai Brief + Style yang sudah disimpan.
        </p>
        {messages.map(message => (
          <article key={message.id} className={`message ${message.role}`}>
            <span className="message-author">{message.role === 'user' ? 'Lo' : agentLabel}</span>
            <p>{message.content}</p>
          </article>
        ))}
        {isChatting && !stream && (
          <article className="message assistant thinking">
            <span className="message-author">{agentLabel} · berpikir</span>
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
            <p>{stream}</p>
          </article>
        )}
        <div ref={messagesEnd} />
      </div>
      <form
        className="chat-compose"
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="chat-message">Diskusikan ide</label>
        <textarea
          id="chat-message"
          rows={3}
          placeholder="Apa hook yang paling pas buat cerita ini?"
          value={chat}
          onChange={event => onChatChange(event.target.value)}
          maxLength={12000}
          disabled={locked}
        />
        {isChatting ? (
          <>
            <div className="chat-status-bar" role="status">
              <span className="pulse-indicator" />
              <span>{stream ? `${agentLabel} sedang menulis jawaban…` : `${agentLabel} sedang memproses ide…`}</span>
            </div>
            <div className="chat-actions">
              <button className="primary chat-loading-btn" disabled type="button">
                <span className="btn-spinner" /> {agentLabel} sedang berpikir…
              </button>
              {onCancelChat && (
                <button type="button" className="chat-cancel-btn" onClick={onCancelChat}>
                  Batal
                </button>
              )}
            </div>
          </>
        ) : (
          <button className="primary" disabled={locked || !chat.trim() || !agentAuthenticated}>
            Kirim ke {agentLabel}
          </button>
        )}
      </form>
    </div>
  );
}
