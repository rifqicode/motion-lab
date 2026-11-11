import React from 'react';
import type {Job} from '../api.js';
import type {Status} from './types.js';

export interface BriefPanelProps {
  brief: string;
  onBriefChange: (value: string) => void;
  locked: boolean;
  dirty: boolean;
  styleDirty: boolean;
  approved: boolean;
  hasCandidate: boolean;
  hasCurrentRevision: boolean;
  status: Status | null;
  agentProvider?: 'codex' | 'antigravity';
  activeJob?: Job | null;
  onCancelJob?: () => void;
  onSaveBrief: () => void;
  onApprove: () => void;
  onGenerate: () => void;
}

export function BriefPanel({
  brief,
  onBriefChange,
  locked,
  dirty,
  styleDirty,
  approved,
  hasCandidate,
  hasCurrentRevision,
  status,
  agentProvider = 'codex',
  activeJob,
  onCancelJob,
  onSaveBrief,
  onApprove,
  onGenerate,
}: BriefPanelProps) {
  const isAntigravity = agentProvider === 'antigravity';
  const agentLabel = isAntigravity ? 'Antigravity' : 'Codex';
  const agentAuthenticated = isAntigravity ? Boolean(status?.antigravity?.authenticated) : Boolean(status?.codex.authenticated);
  const isGenerating = Boolean(
    activeJob && (activeJob.kind === 'generate' || activeJob.kind === 'revise' || activeJob.kind === 'build')
  );

  return (
    <div className="brief-panel">
      <div className="section-head">
        <h2>Arah cerita</h2>
        <span className={approved ? 'status-ok' : 'muted'}>
          {dirty || styleDirty ? 'Belum disimpan' : approved ? 'Disetujui' : 'Draft'}
        </span>
      </div>
      <p className="muted">
        Tentukan pesan, audiens, dan arah cerita. Director memakai Brief + Style tersimpan untuk menyusun storyboard.
      </p>
      {styleDirty && (
        <p className="style-notice">
          Ada draft Style yang belum disimpan. Simpan atau buang draft di tab Style sebelum menyetujui Brief + Style.
        </p>
      )}
      <label htmlFor="brief" className="sr-only">Brief konten</label>
      <textarea
        id="brief"
        className="brief-editor"
        value={brief}
        onChange={event => onBriefChange(event.target.value)}
        disabled={locked}
        maxLength={100000}
      />
      <div className="button-row">
        <button disabled={locked || !dirty} onClick={onSaveBrief}>
          Simpan brief
        </button>
        <button
          disabled={locked || dirty || styleDirty || approved || !brief.trim()}
          onClick={onApprove}
        >
          Setujui Brief + Style
        </button>
      </div>
      <div className="generate-section">
        <button
          className="primary generate-button"
          disabled={locked}
          onClick={onGenerate}
        >
          Buka storyboard
        </button>
        <p className="muted">
          {isGenerating
            ? 'Progres generation tersedia di preview.'
            : hasCandidate
            ? 'Selesaikan review kandidat sebelum generate lagi.'
            : dirty || styleDirty
            ? 'Simpan atau buang draft Brief + Style terlebih dahulu.'
            : !approved
            ? 'Periksa storyboard dan setujui sebelum shot dibuat.'
            : 'Lanjutkan ke storyboard untuk meninjau shot dan memulai generation.'}
        </p>
      </div>
    </div>
  );
}
