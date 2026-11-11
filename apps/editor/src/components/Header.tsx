import React from 'react';
import type {Project} from '../api.js';
import type {Status} from './types.js';

export interface HeaderProps {
  projects: Project[];
  projectId: string;
  busy: boolean;
  status: Status | null;
  currentAgent?: 'codex' | 'antigravity';
  onSelectProject: (id: string) => void;
  onSelectAgent?: (provider: 'codex' | 'antigravity') => void;
  onToggleNewProject: () => void;
  onRefreshStatus: () => void;
}

export function Header({
  projects,
  projectId,
  busy,
  status,
  currentAgent = 'codex',
  onSelectProject,
  onSelectAgent,
  onToggleNewProject,
  onRefreshStatus,
}: HeaderProps) {
  const isAntigravity = currentAgent === 'antigravity';
  const agentStatus = isAntigravity ? status?.antigravity : status?.codex;
  const agentLabel = isAntigravity ? 'Antigravity' : 'Codex';
  const agentOk = Boolean(agentStatus?.authenticated);

  return (
    <header className="app-header">
      <div className="brand">Studio Lokal<span>Creative workspace</span></div>
      <div className="project-picker">
        <label className="picker-field" htmlFor="project-picker"><span>Project</span>
        <select
          id="project-picker"
          value={projectId}
          disabled={busy || !projects.length}
          onChange={event => onSelectProject(event.target.value)}
        >
          <option value="" disabled>Pilih project</option>
          {projects.map(item => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select></label>
        <label className="picker-field engine-field" htmlFor="agent-picker"><span>Engine</span>
        <select
          id="agent-picker"
          value={currentAgent}
          disabled={busy || !projectId}
          onChange={event => onSelectAgent?.(event.target.value as 'codex' | 'antigravity')}
          title="Pilih Engine AI untuk project aktif"
          aria-label="Pilih engine agent"
        >
          <option value="antigravity">Antigravity</option>
          <option value="codex">Codex</option>
        </select></label>
        <button onClick={onToggleNewProject}><span aria-hidden="true">＋</span> Project baru</button>
      </div>
      <div className="runtime-status">
        <span className={agentOk ? 'status-ok' : 'muted'}>
          {agentLabel} {status ? (agentOk ? 'terhubung' : 'belum siap') : 'diperiksa…'}
        </span>
        <span className={status?.runner.available ? 'status-ok' : 'muted'}>
          Render {status ? (status.runner.available ? 'siap' : 'belum siap') : 'diperiksa…'}
        </span>
        <button aria-label={`Periksa koneksi ${agentLabel} dan render`} onClick={onRefreshStatus}>
          Periksa
        </button>
      </div>
    </header>
  );
}
