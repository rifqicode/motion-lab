import React, {useEffect, useRef} from 'react';
import {StoryboardSchema, type Storyboard, type StoryboardState} from '@studio/studio-core/storyboard';

interface StoryboardPanelProps {
  draft: Storyboard | null;
  state: StoryboardState;
  dirty: boolean;
  conflicted: boolean;
  contextDirty: boolean;
  contextApproved: boolean;
  locked: boolean;
  hasCandidate: boolean;
  agentReady: boolean;
  runnerReady: boolean;
  directing: boolean;
  onChange: (value: Storyboard) => void;
  onSave: () => void;
  onReset: () => void;
  onDirect: () => void;
  onApproveGenerate: () => void;
  onDiscuss: () => void;
  selectedShotId: string | null;
  onSelectShot: (id: string | null) => void;
  onDiscussShot: (id: string) => void;
  onCancel?: () => void;
}

const list = (value: string) => value.trim() ? value.split(',').map(item => item.trim()) : [];

export function StoryboardPanel({draft, state, dirty, conflicted, contextDirty, contextApproved, locked,
  hasCandidate, agentReady, runnerReady, directing, onChange, onSave, onReset, onDirect,
  onApproveGenerate, onDiscuss, selectedShotId, onSelectShot, onDiscussShot, onCancel}: StoryboardPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const shotButtons = useRef(new Map<string, HTMLButtonElement>());
  const shot = draft?.shots.find(item => item.id === selectedShotId);
  useEffect(() => {
    const node = dialog.current;
    if (!shot || !node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const row = shotButtons.current.get(shot.id);
    if (!node.open) node.showModal();
    return () => {
      if (node?.open) node.close();
      const target = opener?.isConnected && !node?.contains(opener) ? opener : row;
      if (target?.isConnected) target.focus({preventScroll: true});
    };
  }, [shot?.id]);
  const validation = draft ? StoryboardSchema.safeParse(draft) : null;
  const issues = validation && !validation.success ? validation.error.issues : [];
  const approved = Boolean(state.hash && state.hash === state.approvedHash && contextApproved && !contextDirty && !dirty);
  const status = approved ? 'Disetujui' : state.approvedHash ? 'Ada perubahan' : 'Draft';
  const editingLocked = locked || hasCandidate;
  const canDirect = !editingLocked && !dirty && !contextDirty && agentReady;
  const disabledReason = hasCandidate ? 'Terapkan atau buang kandidat sebelum mengubah storyboard.'
    : contextDirty ? 'Simpan draft Brief + Style terlebih dahulu.'
    : dirty ? 'Simpan perubahan storyboard sebelum menyetujui atau menyusun ulang.'
    : !agentReady ? 'Hubungkan agent untuk menyusun storyboard dan menghasilkan shot.'
    : !runnerReady ? 'Runtime preview diperlukan untuk generate shot.' : '';
  const updateShot = (value: Partial<Storyboard['shots'][number]>) => {
    if (draft && shot) onChange({...draft, shots: draft.shots.map(item => item.id === shot.id ? {...item, ...value} : item)});
  };
  const moveShot = (direction: -1 | 1) => {
    if (!draft || !shot) return;
    const from = draft.shots.findIndex(item => item.id === shot.id);
    const to = from + direction;
    if (to < 0 || to >= draft.shots.length) return;
    const shots = [...draft.shots];
    [shots[from], shots[to]] = [shots[to], shots[from]];
    onChange({...draft, shots});
  };
  const addShot = () => {
    if (!draft || draft.shots.length >= 12) return;
    const id = `shot-${crypto.randomUUID()}`;
    onChange({...draft, shots: [...draft.shots, {id, title: 'Shot baru', durationFrames: 90,
      intent: '', visualDirection: '', motionInstructions: '', transition: 'cut', dependencies: [], sharedComponents: []}]});
    onSelectShot(id);
  };
  const removeShot = () => {
    if (!draft || !shot || draft.shots.length <= 1) return;
    onChange({...draft, shots: draft.shots.filter(item => item.id !== shot.id).map(item => ({...item, dependencies: item.dependencies.filter(id => id !== shot.id)}))});
    onSelectShot(null);
  };

  return <section className="storyboard-panel" aria-label="Storyboard video">
    <div className="section-head"><h2>Rencana video</h2><span className={approved ? 'status-ok' : 'muted'}>{status}</span></div>
    <p className="muted small">Pilih shot untuk membuka detail atau membahasnya bersama Director.</p>
    {directing && <div className="storyboard-notice" role="status"><p>Director sedang menyusun storyboard…</p>{onCancel && <button type="button" onClick={onCancel}>Batalkan Director</button>}</div>}
    {disabledReason && <p className="muted small">{disabledReason}</p>}
    {conflicted && <p className="storyboard-notice" role="alert">Storyboard tersimpan berubah saat draft ini diedit. Draft lo tetap ada; muat versi tersimpan sebelum menyimpan lagi.</p>}
    {!draft && <div className="button-row storyboard-actions">
      <button type="button" disabled={!canDirect} onClick={onDirect}>{draft ? 'Susun ulang storyboard' : 'Susun storyboard'}</button>
      <button type="button" onClick={onDiscuss}>Diskusi dengan Director</button>
    </div>}
    {!draft ? <div className="storyboard-empty"><h3>Belum ada storyboard.</h3><p className="muted">Diskusikan ide dengan Director, lalu pilih &quot;Susun storyboard&quot;.</p></div> : <>
      <div className="section-head"><h3>Urutan shot</h3><span className="muted">{draft.shots.length} shot · {(draft.shots.reduce((sum, item) => sum + item.durationFrames, 0) / 30).toFixed(1)} dtk</span></div>
      <ol className="storyboard-shots" aria-label="Urutan shot">
        {draft.shots.map((item, index) => <li key={item.id}>
          <button type="button" aria-haspopup="dialog" ref={node => { if (node) shotButtons.current.set(item.id, node); else shotButtons.current.delete(item.id); }} onClick={() => onSelectShot(item.id)}>
            <span className="storyboard-shot-heading"><span>{String(index + 1).padStart(2, '0')} · {item.title || 'Tanpa judul'}</span><span>{(item.durationFrames / 30).toFixed(1)} dtk</span></span>
          </button>
        </li>)}
      </ol>
      <button type="button" disabled={editingLocked || draft.shots.length >= 12} onClick={addShot}>Tambah shot</button>
      <details className="storyboard-concept-style">
        <summary className="storyboard-section-summary">
          <span>Konsep &amp; Visual Style</span>
          <span className="muted small">({draft.shots.length} shot · {(draft.shots.reduce((sum, item) => sum + item.durationFrames, 0) / 30).toFixed(1)} dtk)</span>
        </summary>
        <div className="button-row storyboard-actions"><button type="button" disabled={!canDirect} onClick={onDirect}>Susun ulang storyboard</button><button type="button" onClick={onDiscuss}>Diskusi seluruh cerita</button></div>
        <div className="storyboard-overview">
          <label htmlFor="storyboard-concept">Konsep video</label>
          <textarea id="storyboard-concept" rows={2} value={draft.concept} disabled={editingLocked} onChange={event => onChange({...draft, concept: event.target.value})} maxLength={4000} />
          <label htmlFor="storyboard-hook">Hook pembuka</label>
          <textarea id="storyboard-hook" rows={2} value={draft.hook} disabled={editingLocked} onChange={event => onChange({...draft, hook: event.target.value})} maxLength={4000} />
          <label htmlFor="storyboard-narrative">Alur cerita</label>
          <textarea id="storyboard-narrative" rows={3} value={draft.narrative} disabled={editingLocked} onChange={event => onChange({...draft, narrative: event.target.value})} maxLength={8000} />
          <p className="storyboard-duration">{draft.shots.length} shot <span>·</span> {(draft.shots.reduce((sum, item) => sum + item.durationFrames, 0) / 30).toFixed(1)} detik <span>·</span> 30 fps</p>
        </div>
        <div className="storyboard-design-inner">
          <label htmlFor="storyboard-colors">Warna (pisahkan dengan koma)</label>
          <input id="storyboard-colors" disabled={editingLocked} value={draft.designSystem.colors.join(', ')} onChange={event => onChange({...draft, designSystem: {...draft.designSystem, colors: list(event.target.value)}})} />
          <label htmlFor="storyboard-typography">Tipografi</label>
          <textarea id="storyboard-typography" rows={2} disabled={editingLocked} value={draft.designSystem.typography} onChange={event => onChange({...draft, designSystem: {...draft.designSystem, typography: event.target.value}})} maxLength={4000} />
          <label htmlFor="storyboard-spacing">Spacing dan safe area</label>
          <textarea id="storyboard-spacing" rows={2} disabled={editingLocked} value={draft.designSystem.spacing} onChange={event => onChange({...draft, designSystem: {...draft.designSystem, spacing: event.target.value}})} maxLength={4000} />
          <label htmlFor="storyboard-motion">Gaya gerakan</label>
          <textarea id="storyboard-motion" rows={2} disabled={editingLocked} value={draft.designSystem.motionStyle} onChange={event => onChange({...draft, designSystem: {...draft.designSystem, motionStyle: event.target.value}})} maxLength={4000} />
        </div>
      </details>
      {shot && <dialog ref={dialog} className="shot-dialog" aria-labelledby="shot-dialog-title" onCancel={event => { event.preventDefault(); onSelectShot(null); }} onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onSelectShot(null);
      }}>
        <header className="shot-dialog-header"><div><span className="muted small">Detail storyboard</span><h2 id="shot-dialog-title">Shot {String(draft.shots.findIndex(item => item.id === shot.id) + 1).padStart(2, '0')} · {shot.title || 'Tanpa judul'}</h2></div><button type="button" onClick={() => onSelectShot(null)} aria-label="Tutup detail shot">Tutup</button></header>
        <p className="shot-dialog-intro">Edit arahan shot ini atau bahas bersama Director dalam percakapan yang sama.</p>
        <fieldset className="storyboard-shot-detail" disabled={editingLocked}>
        <legend>Detail shot {draft.shots.findIndex(item => item.id === shot.id) + 1}</legend>
        <label htmlFor="shot-title">Judul shot</label>
        <input id="shot-title" value={shot.title} onChange={event => updateShot({title: event.target.value})} maxLength={160} />
        <label htmlFor="shot-intent">Isi cerita dan tujuan</label>
        <textarea id="shot-intent" rows={3} value={shot.intent} onChange={event => updateShot({intent: event.target.value})} maxLength={8000} />
        <label htmlFor="shot-visual">Arahan visual</label>
        <textarea id="shot-visual" rows={3} value={shot.visualDirection} onChange={event => updateShot({visualDirection: event.target.value})} maxLength={8000} />
        <label htmlFor="shot-motion">Urutan animasi / motion</label>
        <textarea id="shot-motion" rows={3} value={shot.motionInstructions} onChange={event => updateShot({motionInstructions: event.target.value})} maxLength={8000} />
        <label htmlFor="shot-duration">Durasi (frame)</label>
        <div className="storyboard-frame-input"><input id="shot-duration" type="number" min={1} max={2700} step={1} value={shot.durationFrames} onChange={event => updateShot({durationFrames: Number(event.target.value)})} /><output htmlFor="shot-duration">{(shot.durationFrames / 30).toFixed(2)} detik</output></div>
        <label htmlFor="shot-transition">Transisi ke shot berikutnya</label>
        <select id="shot-transition" value={shot.transition} onChange={() => updateShot({transition: 'cut'})}><option value="cut">Cut langsung</option></select>
        <div className="button-row storyboard-reorder">
          <button type="button" disabled={draft.shots[0].id === shot.id} onClick={() => moveShot(-1)}>Geser ke atas</button>
          <button type="button" disabled={draft.shots[draft.shots.length - 1].id === shot.id} onClick={() => moveShot(1)}>Geser ke bawah</button>
        </div>
        <button type="button" disabled={draft.shots.length <= 1} onClick={removeShot}>Hapus shot dari draft</button>
        <p className="muted small">Menghapus shot juga melepas dependency yang merujuknya. Versi yang sudah diterapkan tetap tersimpan.</p>
        <details className="storyboard-technical"><summary>Dependency dan identitas shot</summary>
          <p className="muted small">ID tetap: <code>{shot.id}</code></p>
          <label htmlFor="shot-dependencies">Dependency shot (ID, pisahkan dengan koma)</label>
          <input id="shot-dependencies" value={shot.dependencies.join(', ')} onChange={event => updateShot({dependencies: list(event.target.value)})} />
          <label htmlFor="shot-shared">Shared components (ID, pisahkan dengan koma)</label>
          <input id="shot-shared" value={shot.sharedComponents.join(', ')} onChange={event => updateShot({sharedComponents: list(event.target.value)})} />
          <p className="muted small">Definisi komponen bersama:</p>
          {draft.sharedComponents.length ? draft.sharedComponents.map(component => <div className="storyboard-shared" key={component.id}><strong>{component.id}</strong><label htmlFor={`shared-${component.id}`}>Deskripsi komponen</label><textarea id={`shared-${component.id}`} rows={2} value={component.description} onChange={event => onChange({...draft, sharedComponents: draft.sharedComponents.map(item => item.id === component.id ? {...item, description: event.target.value} : item)})} /></div>) : <p className="muted small">Tidak ada shared component.</p>}
        </details>
      </fieldset>
        <footer className="shot-dialog-footer"><button type="button" disabled={editingLocked || !dirty || conflicted || issues.length > 0} onClick={onSave}>Simpan perubahan</button><button type="button" className="shot-discuss" onClick={() => { onSelectShot(null); onDiscussShot(shot.id); }}>Diskusikan shot ini</button><p className="muted small">Diskusi memakai detail saat ini, termasuk draft yang belum disimpan. Chat tidak otomatis mengubah storyboard.</p></footer>
      </dialog>}
      {issues.length > 0 && <div className="storyboard-validation" role="alert"><h3>Periksa storyboard</h3><ul>{issues.map((issue, index) => <li key={index}>{issue.path.join('.') || 'Storyboard'}: {issue.message}</li>)}</ul></div>}
      <div className="storyboard-save">
        {(dirty || conflicted) && <div className="button-row"><button type="button" disabled={editingLocked || !dirty || conflicted || issues.length > 0} onClick={onSave}>Simpan storyboard</button><button type="button" disabled={locked || (!dirty && !conflicted)} onClick={onReset}>Muat versi tersimpan</button></div>}
        <button type="button" className="primary" disabled={editingLocked || dirty || conflicted || contextDirty || !state.hash || !agentReady || !runnerReady || issues.length > 0} onClick={onApproveGenerate}>{approved ? 'Generate dari storyboard disetujui' : 'Setujui storyboard & generate'}</button>
        <p className="muted small">Hasil generate masuk sebagai kandidat untuk direview.</p>
      </div>
    </>}
  </section>;
}
