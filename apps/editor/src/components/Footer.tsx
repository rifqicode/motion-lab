import React from 'react';
import type {Job} from '../api.js';

export interface FooterProps {
  latestJob: Job | undefined;
  activeJob?: Job | undefined;
  busy?: boolean;
  onCancelJob?: () => void;
}

export function Footer({latestJob}: FooterProps) {
  const statusLabel =
    latestJob?.status === 'failed'
      ? 'Job gagal'
      : latestJob?.status === 'cancelled'
      ? 'Job dibatalkan'
      : 'Studio lokal';

  const statusMessage =
    latestJob?.status === 'failed'
      ? (latestJob.error ?? latestJob.message)
      : latestJob?.status === 'cancelled'
      ? 'Job dibatalkan.'
      : 'Brief, kode, dan revisi disimpan sebagai file lokal.';

  return (
    <footer className="job-bar">
      <div>
        <span className="muted">{statusLabel}</span>
        <p role="status">{statusMessage}</p>
      </div>
    </footer>
  );
}
