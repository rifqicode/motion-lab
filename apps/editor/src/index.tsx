import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {api, events, hashBrief, type Candidate, type Project, type ProjectSnapshot, type Revision, type StyleBrief} from './api.js';
import {Preview, type PreviewHandle} from './Preview.js';
import {emptyStyle, StylePanel} from './StylePanel.js';
import {Header} from './components/Header.js';
import {BriefPanel} from './components/BriefPanel.js';
import {ChatPanel} from './components/ChatPanel.js';
import {ReviewColumn} from './components/ReviewColumn.js';
import {Footer} from './components/Footer.js';
import type {ReviewTab, SourceFile, Status} from './components/types.js';
import './style.css';

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Terjadi kesalahan.';
const short = (id: string) => id.slice(0, 7);
const storedProject = () => { try { return localStorage.getItem('studio-project'); } catch { return null; } };
const rememberProject = (id: string) => { try { localStorage.setItem('studio-project', id); } catch { /* Selection persistence is optional. Project files remain on the server. */ } };

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const selectedId = useRef(projectId); selectedId.current = projectId;
  const snapshotRequest = useRef(0);
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState('');
  const [newProject, setNewProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [newProjectAgent, setNewProjectAgent] = useState<'codex' | 'antigravity'>('antigravity');
  const [brief, setBrief] = useState('');
  const [leftTab, setLeftTab] = useState<'brief' | 'style' | 'chat'>('brief');
  const [styleDraft, setStyleDraft] = useState<StyleBrief>({...emptyStyle});
  const styleSync = useRef({projectId: '', saved: JSON.stringify(emptyStyle)});
  const [reviewTab, setReviewTab] = useState<ReviewTab>('comments');
  const [chat, setChat] = useState('');
  const [stream, setStream] = useState('');
  const [comment, setComment] = useState('');
  const [frame, setFrame] = useState(0);
  const [view, setView] = useState('current');
  const [source, setSource] = useState<{before: SourceFile[]; after: SourceFile[]} | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [seekTarget, setSeekTarget] = useState<{frame: number; nonce: number} | null>(null);
  const preview = useRef<PreviewHandle>(null);

  const refresh = useCallback(async (id: string) => {
    const request = ++snapshotRequest.current;
    const next = await api<ProjectSnapshot>(`/projects/${id}`);
    if (selectedId.current === id && request === snapshotRequest.current) {
      setSnapshot(next);
      setProjects(current => current.map(project => project.id === id ? next.project : project));
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try { setStatus(await api<Status>('/status?refresh=1')); }
    catch (cause) { setError(messageOf(cause)); }
  }, []);

  useEffect(() => {
    void api<{projects: Project[]}>('/projects').then(result => {
      setProjects(result.projects);
      const saved = storedProject();
      setProjectId(result.projects.find(project => project.id === saved)?.id ?? result.projects[0]?.id ?? '');
      if (!result.projects.length) setNewProject(true);
    }).catch(cause => setError(messageOf(cause))).finally(() => setLoading(false));
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    setSnapshot(null); setStream(''); setView('current'); setSource(null); setComment(''); setConnection(''); setStyleDraft({...emptyStyle});
    if (!projectId) return;
    rememberProject(projectId);
    let stopped = false;
    const controller = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let after = 0;
    const update = () => { void refresh(projectId).catch(cause => { if (!stopped) setError(messageOf(cause)); }); };
    update();
    const connect = async () => {
      try {
        setConnection('');
        await events(projectId, controller.signal, event => {
          if (stopped) return;
          after = event.id;
          if (event.kind === 'chat.delta') setStream(current => current + (event.payload.text ?? ''));
          if (event.kind === 'chat.completed' || event.kind === 'job.failed' || event.kind === 'job.cancelled') setStream('');
          if (event.kind !== 'chat.delta') update();
        }, after);
      } catch (cause) { if (!stopped) setConnection('Pembaruan langsung terputus. Mencoba menyambung kembali…'); }
      if (!stopped) reconnectTimer = setTimeout(() => { update(); void connect(); }, 2500);
    };
    void connect();
    const fallback = setInterval(update, 5000);
    return () => { stopped = true; controller.abort(); clearTimeout(reconnectTimer); clearInterval(fallback); };
  }, [projectId, refresh]);

  useEffect(() => { if (snapshot) setBrief(snapshot.project.brief); }, [snapshot?.project.id, snapshot?.project.brief]);

  const savedStyleText = JSON.stringify({...emptyStyle, ...snapshot?.project.style});
  useEffect(() => {
    if (!snapshot) return;
    const saved = JSON.parse(savedStyleText) as StyleBrief;
    const previous = styleSync.current;
    setStyleDraft(current => previous.projectId !== snapshot.project.id || JSON.stringify(current) === previous.saved ? saved : current);
    styleSync.current = {projectId: snapshot.project.id, saved: savedStyleText};
  }, [snapshot?.project.id, savedStyleText]);

  const project = snapshot?.project;
  const activeJob = snapshot?.jobs.find(job => job.status === 'running' || job.status === 'queued');
  const latestJob = snapshot?.jobs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const locked = busy || Boolean(activeJob);
  const candidate = snapshot?.candidates.find(item => item.id === project?.openCandidateId);
  const readyCandidate = candidate?.status === 'ready' ? candidate : null;
  const currentRevision = snapshot?.revisions.find(item => item.id === project?.currentRevisionId);
  const shownRevision = view === 'current' ? currentRevision : snapshot?.revisions.find(item => item.id === view);
  const shown: Candidate | Revision | undefined = view === 'current' && readyCandidate ? readyCandidate : shownRevision;
  const buildId = shown?.buildId ?? null;
  const candidateView = view === 'current' && Boolean(readyCandidate);
  const commentAllowed = Boolean(shownRevision && !candidateView && buildId);
  const dirty = brief !== project?.brief;
  const styleDirty = JSON.stringify(styleDraft) !== savedStyleText;
  const approved = Boolean(project?.approvedBriefHash && !dirty && !styleDirty);
  const currentView = Boolean(shownRevision?.id === project?.currentRevisionId && !candidateView);
  const base = `/projects/${projectId}`;

  const currentProvider = project?.agentProvider ?? 'codex';
  const isAntigravity = currentProvider === 'antigravity';
  const agentStatus = isAntigravity ? status?.antigravity : status?.codex;
  const agentLabel = isAntigravity ? 'Antigravity' : 'Codex';
  const agentAuthenticated = Boolean(agentStatus?.authenticated);

  useEffect(() => {
    if (reviewTab !== 'source' || !shown || !projectId) { setSource(null); return; }
    let stopped = false;
    setSource(null); setSourceError('');
    const load = candidateView
      ? api<{before: SourceFile[]; after: SourceFile[]}>(`/projects/${projectId}/candidates/${shown.id}`)
      : api<{files: SourceFile[]}>(`/projects/${projectId}/revisions/${shown.id}/source`).then(result => ({before: [], after: result.files}));
    void load.then(result => { if (!stopped) setSource(result); }).catch(cause => { if (!stopped) setSourceError(messageOf(cause)); });
    return () => { stopped = true; };
  }, [reviewTab, shown?.id, candidateView, projectId]);

  const perform = async (operation: () => Promise<unknown>, then?: () => void) => {
    if (busy) return;
    const id = projectId;
    setBusy(true); setError('');
    try { await operation(); then?.(); if (id && selectedId.current === id) await refresh(id); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const createProject = () => perform(async () => {
    const created = await api<Project>('/projects', 'POST', {name: projectName.trim(), agentProvider: newProjectAgent});
    setProjects(current => [created, ...current]); setProjectId(created.id); setNewProject(false); setProjectName('');
  });

  const changeAgent = (provider: 'codex' | 'antigravity') => perform(async () => {
    await api(`/projects/${projectId}/agent`, 'PUT', {provider});
    await refresh(projectId);
  });

  const generate = (commentId?: string) => perform(() => api(`${base}${commentId ? `/comments/${commentId}/revisions` : '/generations'}`, 'POST', {requestId: crypto.randomUUID(), expectedRevisionId: project?.currentRevisionId ?? null}), () => { setView('current'); setStream(''); });

  const jump = (revisionId: string, targetFrame: number) => { setView(revisionId); preview.current?.pause(); setSeekTarget({frame: targetFrame, nonce: Date.now()}); };

  return <div className="app-shell">
    <a className="skip-link" href="#workspace">Ke workspace</a>
    <Header
      projects={projects}
      projectId={projectId}
      busy={busy}
      status={status}
      currentAgent={currentProvider}
      onSelectProject={setProjectId}
      onSelectAgent={changeAgent}
      onToggleNewProject={() => setNewProject(value => !value)}
      onRefreshStatus={() => void refreshStatus()}
    />
    {newProject && <form className="new-project" onSubmit={event => { event.preventDefault(); void createProject(); }}>
      <label htmlFor="project-name">Nama project</label>
      <input id="project-name" autoFocus value={projectName} onChange={event => setProjectName(event.target.value)} maxLength={120} placeholder="Judul konten" required />
      <label htmlFor="new-project-agent">Agent Engine</label>
      <select id="new-project-agent" value={newProjectAgent} onChange={event => setNewProjectAgent(event.target.value as 'codex' | 'antigravity')}>
        <option value="antigravity">Antigravity</option>
        <option value="codex">Codex</option>
      </select>
      <button className="primary" disabled={busy || !projectName.trim()}>Buat project</button>
      <button type="button" onClick={() => setNewProject(false)}>Tutup</button>
    </form>}
    {error && <div className="notice error" role="alert"><span>{error}</span><button onClick={() => setError('')}>Tutup</button></div>}
    {connection && <div className="notice" role="status">{connection}</div>}
    {status && (!agentAuthenticated || !status.runner.available) && <details className="runtime-details"><summary>Kesiapan runtime</summary>{!agentAuthenticated && <p>{agentStatus?.error ?? `Koneksi/login ${agentLabel} di komputer ini diperlukan sebelum berbicara dengan AI.`}</p>}{!status.runner.available && <p>{status.runner.reason ?? 'Runtime render belum tersedia.'}</p>}</details>}
    {loading ? <main className="welcome" role="status">Membuka studio…</main> : !projectId ? <main className="welcome"><span className="eyebrow">Dari cerita ke komposisi</span><h1>Ruang kerja buat ide lo.</h1><p>Buat project untuk menyusun brief, ngobrol dengan Codex, dan mengulas satu shot pertama.</p><button className="primary" onClick={() => setNewProject(true)}>Buat project pertama</button></main> : !snapshot ? <main className="welcome" role="status">Memuat project…<button onClick={() => void refresh(projectId).catch(cause => setError(messageOf(cause)))}>Muat ulang</button></main> : <>
      <div className="workspace-meta"><h1>{project?.name}</h1><span>Remotion · 2D · 15–30 detik · tanpa audio</span><span className="local-label">Tersimpan di komputer ini</span></div>
      <main className="workspace" id="workspace">
        <section className="idea-column" aria-label="Brief, style, dan percakapan">
          <div className="tab-bar" role="group" aria-label="Pengembangan ide">
            <button aria-pressed={leftTab === 'brief'} onClick={() => setLeftTab('brief')}>Brief</button>
            <button aria-pressed={leftTab === 'style'} onClick={() => setLeftTab('style')}>Style{styleDirty ? ' *' : ''}</button>
            <button aria-pressed={leftTab === 'chat'} onClick={() => setLeftTab('chat')}>Brainstorm</button>
          </div>
          {leftTab === 'brief' ? <BriefPanel
            brief={brief}
            onBriefChange={setBrief}
            locked={locked}
            dirty={dirty}
            styleDirty={styleDirty}
            approved={approved}
            hasCandidate={Boolean(candidate)}
            hasCurrentRevision={Boolean(currentRevision)}
            status={status}
            agentProvider={currentProvider}
            activeJob={activeJob}
            onCancelJob={activeJob ? () => void perform(() => api(`/jobs/${activeJob.id}/cancel`, 'POST')) : undefined}
            onSaveBrief={() => void perform(() => api(`${base}/brief`, 'PUT', {brief}))}
            onApprove={() => void perform(async () => api(`${base}/storyboard/approve`, 'POST', {briefHash: await hashBrief(brief, styleDraft)}))}
            onGenerate={() => void generate()}
          /> : leftTab === 'style' ? <StylePanel
            style={styleDraft} dirty={styleDirty} locked={locked} hasCandidate={Boolean(candidate)} approved={Boolean(project?.approvedBriefHash)} hasRevision={Boolean(currentRevision)}
            onChange={setStyleDraft}
            onSave={() => { void perform(async () => { const saved = await api<Project>(`${base}/style`, 'PUT', {style: styleDraft}); setStyleDraft({...emptyStyle, ...saved.style}); }); }}
            onReset={() => setStyleDraft(JSON.parse(savedStyleText) as StyleBrief)}
          /> : <ChatPanel
            messages={snapshot.messages}
            stream={stream}
            chat={chat}
            onChatChange={setChat}
            locked={locked}
            agentAuthenticated={agentAuthenticated}
            agentProvider={currentProvider}
            isChatting={Boolean(activeJob && activeJob.kind === 'chat')}
            onCancelChat={activeJob && activeJob.kind === 'chat' ? () => void perform(() => api(`/jobs/${activeJob.id}/cancel`, 'POST')) : undefined}
            onSubmit={() => void perform(() => api(`${base}/messages`, 'POST', {requestId: crypto.randomUUID(), text: chat}), () => { setChat(''); setStream(''); })}
          />}
        </section>
        <Preview
          ref={preview}
          projectId={projectId}
          buildId={buildId}
          shots={shown?.shots ?? []}
          label={candidateView ? 'Kandidat · belum diterapkan' : shownRevision ? `Versi ${short(shownRevision.id)}` : 'Belum ada komposisi'}
          onFrame={setFrame}
          seekTarget={seekTarget}
          activeJob={activeJob}
          onCancelJob={activeJob ? () => void perform(() => api(`/jobs/${activeJob.id}/cancel`, 'POST')) : undefined}
        />
        <ReviewColumn
          readyCandidate={readyCandidate}
          locked={locked}
          busy={busy}
          onApplyCandidate={() => void perform(() => api(`${base}/candidates/${readyCandidate!.id}/apply`, 'POST', {expectedRevisionId: project?.currentRevisionId ?? null}), () => setView('current'))}
          onDiscardCandidate={() => void perform(() => api(`${base}/candidates/${readyCandidate!.id}/discard`, 'POST', {expectedRevisionId: project?.currentRevisionId ?? null}), () => setView('current'))}
          onViewCodeChanges={() => { setView('current'); setReviewTab('source'); }}
          reviewTab={reviewTab}
          onTabChange={setReviewTab}
          frame={frame}
          comment={comment}
          onCommentChange={setComment}
          commentAllowed={commentAllowed}
          candidateView={candidateView}
          shownRevision={shownRevision}
          comments={snapshot.comments}
          currentRevisionId={project?.currentRevisionId}
          hasCandidate={Boolean(candidate)}
          codexAuthenticated={agentAuthenticated}
          agentAuthenticated={agentAuthenticated}
          agentProvider={currentProvider}
          runnerAvailable={Boolean(status?.runner.available)}
          onSaveComment={() => {
            if (!shownRevision || !commentAllowed) return;
            void perform(() => api(`${base}/comments`, 'POST', {anchor: {revisionId: shownRevision.id, shotId: shownRevision.shots[0].id, localFrame: frame, fps: 30}, body: comment}), () => setComment(''));
          }}
          onJump={jump}
          onGenerateRevision={commentId => void generate(commentId)}
          onToggleCommentStatus={(commentId, currentStatus) => {
            void perform(() => api(`${base}/comments/${commentId}`, 'PATCH', {status: currentStatus === 'open' ? 'resolved' : 'open'}));
          }}
          currentView={currentView}
          hasCurrentRevision={Boolean(currentRevision)}
          revisions={snapshot.revisions}
          onViewCurrent={() => setView('current')}
          onViewRevision={revisionId => { setView(revisionId); setSeekTarget({frame: 0, nonce: Date.now()}); }}
          onRestoreRevision={revisionId => void perform(() => api(`${base}/revisions/${revisionId}/restore`, 'POST', {expectedRevisionId: project?.currentRevisionId ?? null}), () => setView('current'))}
          shown={shown}
          source={source}
          sourceError={sourceError}
        />
      </main>
      <Footer
        latestJob={latestJob}
      />
    </>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
