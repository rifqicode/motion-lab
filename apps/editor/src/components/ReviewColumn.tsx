import React from 'react';
import type {Candidate, Revision, Comment} from '../api.js';
import {SourceViewer} from './SourceViewer.js';
import type {ReviewTab, SourceFile} from './types.js';

const short = (id: string) => id.slice(0, 7);

export interface ReviewColumnProps {
  readyCandidate: Candidate | null;
  locked: boolean;
  busy: boolean;
  onApplyCandidate: () => void;
  onDiscardCandidate: () => void;
  onViewCodeChanges: () => void;
  reviewTab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  // Comments tab
  frame: number;
  comment: string;
  onCommentChange: (val: string) => void;
  commentAllowed: boolean;
  candidateView: boolean;
  shownRevision: Revision | undefined;
  comments: Comment[];
  currentRevisionId?: string | null;
  hasCandidate: boolean;
  codexAuthenticated?: boolean;
  agentAuthenticated?: boolean;
  agentProvider?: 'codex' | 'antigravity';
  runnerAvailable: boolean;
  onSaveComment: () => void;
  onJump: (revisionId: string, localFrame: number) => void;
  onGenerateRevision: (commentId: string) => void;
  onToggleCommentStatus: (commentId: string, currentStatus: string) => void;
  // Versions tab
  currentView: boolean;
  hasCurrentRevision: boolean;
  revisions: Revision[];
  onViewCurrent: () => void;
  onViewRevision: (revisionId: string) => void;
  onRestoreRevision: (revisionId: string) => void;
  // Source tab
  shown: Candidate | Revision | undefined;
  source: {before: SourceFile[]; after: SourceFile[]} | null;
  sourceError: string;
}

export function ReviewColumn({
  readyCandidate,
  locked,
  busy,
  onApplyCandidate,
  onDiscardCandidate,
  onViewCodeChanges,
  reviewTab,
  onTabChange,
  frame,
  comment,
  onCommentChange,
  commentAllowed,
  candidateView,
  shownRevision,
  comments,
  currentRevisionId,
  hasCandidate,
  codexAuthenticated = false,
  agentAuthenticated,
  agentProvider = 'codex',
  runnerAvailable,
  onSaveComment,
  onJump,
  onGenerateRevision,
  onToggleCommentStatus,
  currentView,
  hasCurrentRevision,
  revisions,
  onViewCurrent,
  onViewRevision,
  onRestoreRevision,
  shown,
  source,
  sourceError,
}: ReviewColumnProps) {
  const isAntigravity = agentProvider === 'antigravity';
  const agentLabel = isAntigravity ? 'Antigravity' : 'Codex';
  const isAgentReady = agentAuthenticated !== undefined ? agentAuthenticated : codexAuthenticated;
  return (
    <section className="review-column" aria-label="Review komposisi">
      {readyCandidate && (
        <div className="candidate-review">
          <span className="eyebrow">Kandidat siap direview</span>
          <h2>Periksa hasilnya.</h2>
          <p>{readyCandidate.summary}</p>
          <div className="button-row">
            <button className="primary" disabled={locked} onClick={onApplyCandidate}>
              Terapkan
            </button>
            <button disabled={locked} onClick={onDiscardCandidate}>
              Buang kandidat
            </button>
          </div>
          <button className="text-button" onClick={onViewCodeChanges}>
            Lihat perubahan kode
          </button>
        </div>
      )}
      <div className="tab-bar" role="group" aria-label="Review">
        <button aria-pressed={reviewTab === 'comments'} onClick={() => onTabChange('comments')}>
          Komentar
        </button>
        <button aria-pressed={reviewTab === 'versions'} onClick={() => onTabChange('versions')}>
          Versi
        </button>
        <button aria-pressed={reviewTab === 'source'} onClick={() => onTabChange('source')}>
          Kode
        </button>
      </div>
      <div className="review-content">
        {reviewTab === 'comments' ? (
          <>
            <form
              className="comment-compose"
              onSubmit={event => {
                event.preventDefault();
                onSaveComment();
              }}
            >
              <div className="section-head">
                <h2>Catatan frame</h2>
                <span className="frame-tag">F{frame}</span>
              </div>
              <p className="muted">
                {candidateView
                  ? 'Terapkan kandidat dahulu untuk memberi komentar pada versinya.'
                  : !shownRevision
                  ? 'Komentar tersedia setelah ada versi yang diterapkan.'
                  : `Terikat ke versi ${short(shownRevision.id)} pada ${(frame / 30).toFixed(2)} detik.`}
              </p>
              <label htmlFor="frame-comment" className="sr-only">
                Komentar pada frame saat ini
              </label>
              <textarea
                id="frame-comment"
                rows={3}
                placeholder="Bagian mana yang perlu diubah?"
                value={comment}
                onChange={event => onCommentChange(event.target.value)}
                maxLength={8000}
                disabled={!commentAllowed || busy}
              />
              <button disabled={!commentAllowed || busy || !comment.trim()}>
                Simpan komentar
              </button>
            </form>
            <div className="comment-list">
              {!comments.length && (
                <p className="empty-copy">Pause di frame yang ingin lo bahas, lalu tinggalkan catatan.</p>
              )}
              {comments.slice().reverse().map(item => (
                <article className={`comment ${item.status}`} key={item.id}>
                  <div className="comment-meta">
                    <button
                      className="frame-link"
                      onClick={() => onJump(item.anchor.revisionId, item.anchor.localFrame)}
                    >
                      F{item.anchor.localFrame} · {(item.anchor.localFrame / 30).toFixed(2)}s
                    </button>
                    <span>{item.status === 'resolved' ? 'Selesai' : 'Terbuka'}</span>
                  </div>
                  <p>{item.body}</p>
                  <span className="muted small">
                    Versi {short(item.anchor.revisionId)}
                    {item.anchor.revisionId === currentRevisionId ? ' · aktif' : ' · riwayat'}
                  </span>
                  <div className="button-row">
                    <button
                      disabled={
                        locked ||
                        hasCandidate ||
                        item.status === 'resolved' ||
                        item.anchor.revisionId !== currentRevisionId ||
                        !isAgentReady ||
                        !runnerAvailable
                      }
                      onClick={() => onGenerateRevision(item.id)}
                    >
                      Revisi via {agentLabel}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onToggleCommentStatus(item.id, item.status)}
                    >
                      {item.status === 'open' ? 'Tandai selesai' : 'Buka lagi'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : reviewTab === 'versions' ? (
          <>
            <div className="section-head">
              <h2>Riwayat versi</h2>
              {!currentView && hasCurrentRevision && (
                <button onClick={onViewCurrent}>Ke versi aktif</button>
              )}
            </div>
            <p className="muted">Restore membuat versi baru. Riwayat sebelumnya tetap tersimpan.</p>
            {!revisions.length && (
              <p className="empty-copy">Versi pertama dibuat saat kandidat diterapkan.</p>
            )}
            {revisions.slice().reverse().map(item => (
              <article className="revision" key={item.id}>
                <span className="eyebrow">
                  {item.id === currentRevisionId ? 'Versi aktif' : `Versi ${short(item.id)}`}
                </span>
                <p>{item.summary}</p>
                <time className="muted small">{new Date(item.createdAt).toLocaleString('id-ID')}</time>
                <div className="button-row">
                  <button onClick={() => onViewRevision(item.id)}>Lihat</button>
                  <button
                    disabled={locked || hasCandidate || item.id === currentRevisionId}
                    onClick={() => onRestoreRevision(item.id)}
                  >
                    Restore
                  </button>
                </div>
              </article>
            ))}
          </>
        ) : (
          <>
            <div className="section-head">
              <h2>{candidateView ? 'Source sebelum / sesudah' : 'Source komposisi'}</h2>
            </div>
            {!shown ? (
              <p className="empty-copy">Kode akan tersedia setelah build berhasil.</p>
            ) : sourceError ? (
              <p className="error" role="alert">{sourceError}</p>
            ) : !source ? (
              <p role="status">Memuat source…</p>
            ) : (
              <SourceViewer before={source.before} after={source.after} compare={candidateView} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
