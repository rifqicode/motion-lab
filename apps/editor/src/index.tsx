import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {api, downloadExport, events, hashBrief, loadVoiceovers, voiceoverAudioBlob, type Candidate, type Project, type Revision, type StyleBrief} from './api.js';
import {sortGenerationRuns, type StudioSnapshot} from './studio-state.js';
import {Preview, type PreviewHandle} from './Preview.js';
import {emptyStyle, StylePanel} from './StylePanel.js';
import {BriefPanel} from './components/BriefPanel.js';
import {PanelMenu} from './components/PanelMenu.js';
import {Header} from './components/Header.js';
import {ChatPanel} from './components/ChatPanel.js';
import {ReviewColumn} from './components/ReviewColumn.js';
import {VoiceoverPanel} from './components/VoiceoverPanel.js';
import {Footer} from './components/Footer.js';
import {StoryboardPanel} from './StoryboardPanel.js';
import {syncStoryboardDraft, type StoryboardDraftBase} from './storyboard-draft.js';
import {resolveFrame, shotGlobalFrame, type Storyboard, type StoryboardState} from '@studio/studio-core/storyboard';
import type {ReviewTab, SourceFile, Status} from './components/types.js';
import './style.css';
import './workspace.css';

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Terjadi kesalahan.';
const short = (id: string) => id.slice(0, 7);
const storedProject = () => { try { return localStorage.getItem('studio-project'); } catch { return null; } };
const rememberProject = (id: string) => { try { localStorage.setItem('studio-project', id); } catch { /* Selection persistence is optional. Project files remain on the server. */ } };

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const selectedId = useRef(projectId); selectedId.current = projectId;
  const snapshotRequest = useRef(0);
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState('');
  const [newProject, setNewProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [newProjectAgent, setNewProjectAgent] = useState<'codex' | 'antigravity'>('antigravity');
  const [brief, setBrief] = useState('');
  const [leftTab, setLeftTab] = useState<'chat' | 'storyboard' | 'brief' | 'style'>('chat');
  const [workspacePane, setWorkspacePane] = useState<'idea' | 'preview' | 'review'>('preview');
  const [storyboardExpanded, setStoryboardExpanded] = useState(false);
  const [selectedStoryboardShotId, setSelectedStoryboardShotId] = useState<string | null>(null);
  const [shotDiscussionId, setShotDiscussionId] = useState<string | null>(null);
  const [styleDraft, setStyleDraft] = useState<StyleBrief>({...emptyStyle});
  const styleSync = useRef({projectId: '', saved: JSON.stringify(emptyStyle)});
  const [storyboardDraft, setStoryboardDraft] = useState<Storyboard | null>(null);
  const storyboardSync = useRef<StoryboardDraftBase>({projectId: '', saved: 'null', hash: null});
  const [reviewTab, setReviewTab] = useState<ReviewTab>('versions');
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
    const next = await api<StudioSnapshot>(`/projects/${id}`);
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
    setSelectedStoryboardShotId(null); setShotDiscussionId(null);
    setSnapshot(null); setStream(''); setView('current'); setSource(null); setComment(''); setConnection(''); setStyleDraft({...emptyStyle}); setStoryboardDraft(null); setChat(''); setFrame(0); setSeekTarget(null);
    if (!projectId) return;
    rememberProject(projectId);
    let stopped = false;
    const controller = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    let after = 0;
    const update = () => {
      if (stopped || updateTimer) return;
      updateTimer = setTimeout(() => {
        updateTimer = undefined;
        void refresh(projectId).catch(cause => { if (!stopped) setError(messageOf(cause)); });
      }, 80);
    };
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
      if (!stopped) reconnectTimer = setTimeout(() => { after = 0; setStream(''); update(); void connect(); }, 2500);
    };
    void connect();
    const fallback = setInterval(update, 5000);
    return () => { stopped = true; controller.abort(); clearTimeout(reconnectTimer); clearTimeout(updateTimer); clearInterval(fallback); };
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

  const savedStoryboardText = JSON.stringify(snapshot?.storyboard?.draft ?? null);
  const savedStoryboardHash = snapshot?.storyboard?.hash ?? null;
  useEffect(() => {
    if (!snapshot) return;
    const next = syncStoryboardDraft(storyboardDraft, storyboardSync.current, snapshot.project.id, savedStoryboardText, savedStoryboardHash);
    storyboardSync.current = next.base;
    if (next.draft !== storyboardDraft) setStoryboardDraft(next.draft);
  }, [snapshot?.project.id, savedStoryboardText, savedStoryboardHash, storyboardDraft]);

  const project = snapshot?.project;
  const activeJob = snapshot?.jobs.find(job => job.status === 'running' || job.status === 'queued');
  const latestJob = snapshot?.jobs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const locked = busy || Boolean(activeJob);
  const runs = sortGenerationRuns(snapshot?.generationRuns ?? []);
  const latestRun = runs[runs.length - 1];
  const candidate = snapshot?.candidates.find(item => item.id === project?.openCandidateId);
  const readyCandidate = candidate?.status === 'ready' ? candidate : null;
  const partialCandidate = candidate?.buildId && snapshot?.preview?.candidateId === candidate.id ? candidate : null;
  const failedCandidate = latestRun?.buildId && latestRun.baseRevisionId === project?.currentRevisionId
    && latestRun.shots.some(shot => shot.status === 'failed' || shot.status === 'cancelled')
    ? snapshot?.candidates.find(item => item.id === latestRun.candidateId && (item.status === 'failed' || item.status === 'cancelled' || item.status === 'stale')) : null;
  const failedRunCandidate = failedCandidate && latestRun?.buildId ? {...failedCandidate, buildId: latestRun.buildId, sourceId: latestRun.sourceId ?? failedCandidate.sourceId} : null;
  const previewCandidate = readyCandidate ?? partialCandidate ?? (!candidate ? failedRunCandidate : null);
  const currentRevision = snapshot?.revisions.find(item => item.id === project?.currentRevisionId);
  const shownRevision = view === 'current' ? currentRevision : snapshot?.revisions.find(item => item.id === view);
  const shown: Candidate | Revision | undefined = view === 'current' && previewCandidate ? previewCandidate : shownRevision;
  const buildId = shown?.buildId ?? null;
  const candidateView = view === 'current' && Boolean(previewCandidate);
  const livePreview = snapshot?.preview;
  const previewSessionId = candidateView && livePreview && livePreview.candidateId === shown?.id ? livePreview.sessionId : null;
  const commentAllowed = Boolean(shownRevision && !candidateView && buildId);
  const dirty = brief !== project?.brief;
  const styleDirty = JSON.stringify(styleDraft) !== savedStyleText;
  const storyboardState: StoryboardState = snapshot?.storyboard ?? {draft: null, hash: null, approvedHash: null, briefHash: null};
  const storyboardDirty = JSON.stringify(storyboardDraft) !== savedStoryboardText;
  const storyboardConflicted = storyboardDirty && storyboardSync.current.hash !== storyboardState.hash;
  const discussionShot = storyboardDraft?.shots.find(shot => shot.id === shotDiscussionId);
  const shotDiscussion = discussionShot && storyboardDraft ? {shot: discussionShot, position: storyboardDraft.shots.findIndex(shot => shot.id === discussionShot.id) + 1, draft: storyboardDirty} : undefined;
  const approved = Boolean(project?.approvedBriefHash && !dirty && !styleDirty);
  const currentView = Boolean(shownRevision?.id === project?.currentRevisionId && !candidateView);
  const storyboardApproved = Boolean(storyboardState.hash && storyboardState.hash === storyboardState.approvedHash && !storyboardDirty && !dirty && !styleDirty && project?.approvedBriefHash === storyboardState.briefHash);
  const base = `/projects/${projectId}`;
  const generationRun = runs.find(run => run.candidateId === candidate?.id)
    ?? (candidateView ? runs.find(run => run.candidateId === shown?.id) : undefined) ?? latestRun;
  const exportJob = snapshot?.jobs.filter(job => String(job.kind) === 'export').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const voiceoverJob = snapshot?.jobs.filter(job => String(job.kind) === 'voiceover').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const voiceoverBlockedReason = !currentRevision ? 'Terapkan video terlebih dahulu.'
    : candidate ? 'Terapkan atau buang kandidat sebelum membuat narasi lain.'
    : !currentView ? 'Kembali ke versi aktif untuk membuat narasi.'
    : dirty || styleDirty || storyboardDirty ? 'Simpan atau buang perubahan Brief, Style, dan Storyboard terlebih dahulu.'
    : !status?.runner.available ? 'Runtime preview belum siap.' : undefined;

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
  }, [reviewTab, shown?.id, shown?.sourceId, shown?.buildId, candidateView, projectId]);

  const perform = async (operation: () => Promise<unknown>, then?: () => void) => {
    if (busy) return;
    const id = projectId;
    setBusy(true); setError('');
    try { await operation(); if (selectedId.current === id) { then?.(); if (id) await refresh(id); } }
    catch (cause) { if (selectedId.current === id) setError(messageOf(cause)); }
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

  const generate = (commentId?: string) => perform(() => api(`${base}${commentId ? `/comments/${commentId}/revisions` : '/generations'}`, 'POST', {requestId: crypto.randomUUID(), expectedRevisionId: project?.currentRevisionId ?? null, ...(!commentId && storyboardState.hash ? {approvedStoryboardHash: storyboardState.hash} : {})}), () => { setView('current'); setStream(''); setReviewTab('activity'); });

  const resetStoryboard = () => {
    storyboardSync.current = {projectId, saved: savedStoryboardText, hash: savedStoryboardHash};
    setStoryboardDraft(JSON.parse(savedStoryboardText) as Storyboard | null);
  };
  const saveStoryboard = () => perform(async () => {
    const id = projectId;
    const saved = await api<StoryboardState>(`${base}/storyboard`, 'PUT', {storyboard: storyboardDraft, expectedHash: storyboardSync.current.hash});
    if (selectedId.current !== id) return;
    storyboardSync.current = {projectId: id, saved: JSON.stringify(saved.draft), hash: saved.hash};
    setStoryboardDraft(saved.draft);
  });
  const direct = () => perform(() => api(`${base}/director`, 'POST', {requestId: crypto.randomUUID(), expectedHash: storyboardState.hash}), () => setLeftTab('storyboard'));
  const openStoryboard = () => { setLeftTab('storyboard'); setWorkspacePane('idea'); };
  const openExport = () => { setReviewTab('export'); setWorkspacePane('review'); setStoryboardExpanded(false); };
  const approveGenerate = () => perform(async () => {
    const id = projectId;
    const storyboardHash = storyboardState.hash;
    if (!storyboardHash || storyboardDirty || dirty || styleDirty) throw new Error('Simpan storyboard, Brief, dan Style sebelum menyetujui.');
    await api(`${base}/storyboard/approve`, 'POST', {storyboardHash});
    if (selectedId.current !== id) return;
    await api(`${base}/generations`, 'POST', {requestId: crypto.randomUUID(), expectedRevisionId: project?.currentRevisionId ?? null, approvedStoryboardHash: storyboardHash});
  }, () => { setView('current'); setStream(''); setReviewTab('activity'); });

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
    {loading ? <main className="welcome" role="status">Membuka studio…</main> : !projectId ? <main className="welcome"><span className="eyebrow">Dari cerita ke komposisi</span><h1>Ruang kerja buat ide lo.</h1><p>Buat project untuk menyusun ide bersama Director dan mereview storyboard sebelum shot dibuat.</p><button className="primary" onClick={() => setNewProject(true)}>Buat project pertama</button></main> : !snapshot ? <main className="welcome" role="status">Memuat project…<button onClick={() => void refresh(projectId).catch(cause => setError(messageOf(cause)))}>Muat ulang</button></main> : <>
      <div className="project-toolbar">
        <div className="project-heading"><h1>{project?.name}</h1><div className="project-metadata"><span>Remotion</span><span>2D</span><span>30 fps</span><span className="local-save">Tersimpan di komputer ini</span></div></div>
        <nav className="workflow-nav" aria-label="Tahapan video">
          <button className={approved ? 'step-complete' : ''} aria-pressed={leftTab === 'brief'} onClick={() => { setLeftTab('brief'); setWorkspacePane('idea'); }}><span aria-hidden="true">{approved ? '✓ ' : ''}</span>Brief</button>
          <button className={storyboardApproved ? 'step-complete' : ''} aria-pressed={leftTab === 'storyboard'} onClick={openStoryboard}><span aria-hidden="true">{storyboardApproved ? '✓ ' : ''}</span>Storyboard</button>
          <button className={buildId ? 'step-preview' : ''} aria-pressed={workspacePane === 'preview'} onClick={() => { setWorkspacePane('preview'); setStoryboardExpanded(false); }}>Preview</button>
          <button aria-pressed={reviewTab === 'export'} onClick={openExport}>Export</button>
        </nav>
        <button className="primary export-entry" onClick={openExport}>↓ <span>Export video</span></button>
      </div>
      <nav className="workspace-switcher" aria-label="Area workspace">
        <button aria-pressed={workspacePane === 'idea'} onClick={() => setWorkspacePane('idea')}>Director &amp; cerita</button>
        <button aria-pressed={workspacePane === 'preview'} onClick={() => setWorkspacePane('preview')}>Preview</button>
        <button aria-pressed={workspacePane === 'review'} onClick={() => setWorkspacePane('review')}>Review</button>
      </nav>
      <main className={`workspace${storyboardExpanded && leftTab === 'storyboard' ? ' storyboard-expanded' : ''}`} data-pane={workspacePane} id="workspace">
        <section className="idea-column" aria-label="Director dan storyboard">
          <div className="tab-bar idea-tabs" role="group" aria-label="Pengembangan ide">
            <button aria-pressed={leftTab === 'chat'} onClick={() => setLeftTab('chat')}>Director</button>
            <button aria-pressed={leftTab === 'storyboard'} onClick={() => setLeftTab('storyboard')}>Storyboard{storyboardDraft ? <span className="tab-count">{storyboardDraft.shots.length}</span> : null}{storyboardDirty ? ' *' : ''}</button>
            <PanelMenu label="Konteks project" items={[{label: 'Brief', active: leftTab === 'brief', onSelect: () => setLeftTab('brief')}, {label: 'Style', active: leftTab === 'style', onSelect: () => setLeftTab('style')}]} />
          </div>
          {leftTab === 'storyboard' && <button className="storyboard-expand" onClick={() => setStoryboardExpanded(value => !value)}>{storyboardExpanded ? 'Kembali ke preview' : 'Perluas storyboard'}</button>}
          {leftTab === 'storyboard' ? <StoryboardPanel
            key={projectId}
            draft={storyboardDraft}
            state={storyboardState}
            dirty={storyboardDirty}
            conflicted={storyboardConflicted}
            contextDirty={dirty || styleDirty}
            contextApproved={Boolean(project?.approvedBriefHash && storyboardState.briefHash === project.approvedBriefHash)}
            locked={locked}
            hasCandidate={Boolean(candidate)}
            agentReady={agentAuthenticated}
            runnerReady={Boolean(status?.runner.available)}
            directing={activeJob?.kind === 'director'}
            onChange={setStoryboardDraft}
            onSave={() => void saveStoryboard()}
            onReset={resetStoryboard}
            onDirect={() => void direct()}
            onApproveGenerate={() => void approveGenerate()}
            onDiscuss={() => { setShotDiscussionId(null); setLeftTab('chat'); }}
            selectedShotId={selectedStoryboardShotId}
            onSelectShot={setSelectedStoryboardShotId}
            onDiscussShot={id => { setShotDiscussionId(id); setLeftTab('chat'); setWorkspacePane('idea'); }}
            onCancel={activeJob ? () => void perform(() => api(`/jobs/${activeJob.id}/cancel`, 'POST')) : undefined}
          /> : leftTab === 'brief' ? <BriefPanel
            brief={brief} onBriefChange={setBrief} locked={locked || Boolean(candidate)} dirty={dirty} styleDirty={styleDirty} approved={approved}
            hasCandidate={Boolean(candidate)} hasCurrentRevision={Boolean(currentRevision)} status={status} agentProvider={currentProvider}
            onSaveBrief={() => void perform(() => api(`${base}/brief`, 'PUT', {brief}))}
            onApprove={() => void perform(async () => api(`${base}/storyboard/approve`, 'POST', {briefHash: await hashBrief(brief, styleDraft)}))}
            onGenerate={openStoryboard}
          /> : leftTab === 'style' ? <StylePanel style={styleDraft} dirty={styleDirty} locked={locked} hasCandidate={Boolean(candidate)} approved={approved} hasRevision={Boolean(currentRevision)} onChange={setStyleDraft}
            onSave={() => void perform(() => api(`${base}/style`, 'PUT', {style: styleDraft}))}
            onReset={() => setStyleDraft(JSON.parse(savedStyleText) as StyleBrief)}
          /> : <ChatPanel
            messages={snapshot.messages}
            stream={stream}
            chat={chat}
            onChatChange={setChat}
            locked={locked}
            agentAuthenticated={agentAuthenticated}
            agentProvider={currentProvider}
            isChatting={Boolean(activeJob && (activeJob.kind === 'chat' || activeJob.kind === 'revise'))}
            isRevising={activeJob?.kind === 'revise'}
            activityMessage={activeJob?.message}
            onDirect={() => { setLeftTab('storyboard'); void direct(); }}
            canDirect={!locked && !candidate && !dirty && !styleDirty && !storyboardDirty && agentAuthenticated}
            shotContext={shotDiscussion}
            onClearShotContext={() => setShotDiscussionId(null)}
            onOpenShotDetail={() => { if (discussionShot) { setSelectedStoryboardShotId(discussionShot.id); setLeftTab('storyboard'); } }}
            canRevise={Boolean(currentRevision && currentView && !candidate && !dirty && !styleDirty && !storyboardDirty && agentAuthenticated && status?.runner.available && (!shotDiscussion || currentRevision.shots.some(shot => shot.id === shotDiscussion.shot.id)))}
            revisionLabel={currentRevision ? `Versi aktif ${short(currentRevision.id)}` : undefined}
            revisionBlockedReason={!currentRevision ? 'Terapkan hasil generate sebelum merevisi video.' : candidate ? 'Terapkan atau buang kandidat yang terbuka dahulu.' : !currentView ? 'Buka versi aktif sebelum merevisi.' : dirty || styleDirty || storyboardDirty ? 'Simpan atau buang draft Brief, Style, dan Storyboard terlebih dahulu.' : !agentAuthenticated ? 'Hubungkan agent sebelum merevisi.' : !status?.runner.available ? 'Runtime preview belum siap.' : 'Shot ini belum ada di versi aktif. Generate dan terapkan dahulu.'}
            onCancelChat={activeJob && (activeJob.kind === 'chat' || activeJob.kind === 'revise') ? () => void perform(() => api(`/jobs/${activeJob.id}/cancel`, 'POST')) : undefined}
            onSubmit={mode => void perform(() => api(`${base}/messages`, 'POST', {requestId: crypto.randomUUID(), text: chat,
              ...(mode === 'revise' ? {mode, expectedRevisionId: currentRevision?.id} : {}), ...(shotDiscussion ? {shotContext: shotDiscussion} : {})}), () => { setChat(''); setStream(''); if (mode === 'revise') {setView('current'); setReviewTab('activity');} })}
          />}
        </section>
        <Preview
          ref={preview}
          projectId={projectId}
          buildId={buildId}
          previewSessionId={previewSessionId}
          shots={shown?.shots ?? []}
          label={candidateView ? failedRunCandidate?.id === shown?.id ? 'Draft sebagian · belum diterapkan' : 'Kandidat · belum diterapkan' : shownRevision ? `Versi ${short(shownRevision.id)}` : 'Belum ada komposisi'}
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
            const anchor = resolveFrame(shownRevision.shots, frame);
            if (!anchor) return;
            void perform(() => api(`${base}/comments`, 'POST', {anchor: {revisionId: shownRevision.id, shotId: anchor.shotId, localFrame: anchor.localFrame, fps: 30}, body: comment}), () => setComment(''));
          }}
          onJump={(revisionId, localFrame, shotId) => {
            const revision = snapshot.revisions.find(item => item.id === revisionId);
            if (!revision) return;
            try { jump(revisionId, shotGlobalFrame(revision.shots, shotId, localFrame)); }
            catch (cause) { setError(messageOf(cause)); }
          }}
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
          activityJob={activeJob ?? latestJob}
          generationRun={generationRun}
          qaReports={(snapshot.qaReports ?? []).filter(report => report.buildId === buildId)}
          canRetryShots={agentAuthenticated && Boolean(status?.runner.available) && generationRun?.baseRevisionId === project?.currentRevisionId}
          onRetryShot={(candidateId, shotId) => void perform(() => api(`${base}/generation-runs/${candidateId}/shots/${shotId}/retry`, 'POST', {requestId: crypto.randomUUID()}), () => { setView('current'); setReviewTab('activity'); })}
          onCancelShot={(candidateId, shotId) => void perform(() => api(`${base}/generation-runs/${candidateId}/shots/${shotId}/cancel`, 'POST'))}
          exports={snapshot.exports ?? []}
          exportRevision={currentRevision}
          exportJob={exportJob}
          onExport={() => {
            if (currentRevision) void perform(() => api(`${base}/exports`, 'POST', {requestId: crypto.randomUUID(), revisionId: currentRevision.id}));
          }}
          onDownloadExport={exportId => void perform(() => downloadExport(projectId, exportId))}
          onCancelExport={activeJob && String(activeJob.kind) === 'export' ? () => void perform(() => api(`/jobs/${activeJob.id}/cancel`, 'POST')) : undefined}
          voiceoverPanel={<VoiceoverPanel
            projectId={projectId}
            sourceId={shown?.sourceId ?? undefined}
            shots={shown?.shots ?? []}
            active={reviewTab === 'voiceover'}
            locked={locked}
            busy={busy}
            blockedReason={voiceoverBlockedReason}
            candidateView={candidateView}
            job={voiceoverJob}
            loadState={loadVoiceovers}
            loadAudio={voiceoverAudioBlob}
            onGenerate={input => {
              if (currentRevision && !voiceoverBlockedReason) void perform(() => api(`${base}/voiceovers`, 'POST', {requestId: crypto.randomUUID(), expectedRevisionId: currentRevision.id, ...input}), () => setView('current'));
            }}
            onCancel={activeJob && String(activeJob.kind) === 'voiceover' ? () => void perform(() => api(`/jobs/${activeJob.id}/cancel`, 'POST')) : undefined}
          />}
          canVisualQa={Boolean(buildId && agentAuthenticated)}
          onVisualQa={() => {
            if (buildId) void perform(() => api(`${base}/visual-qa`, 'POST', {requestId: crypto.randomUUID(), buildId}), () => setReviewTab('activity'));
          }}
        />
      </main>
      <Footer
        latestJob={latestJob}
      />
    </>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
