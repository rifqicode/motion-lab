import React from 'react';
import type {StyleBrief} from './api.js';

export const emptyStyle: StyleBrief = {mood: '', colorPalette: '', typography: '', pacing: '', transitions: '', visualDirection: '', referenceNotes: '', avoid: ''};
export const styleFields: {key: keyof StyleBrief; label: string; hint: string}[] = [
  {key: 'mood', label: 'Mood', hint: 'Suasana dan rasa yang ingin ditampilkan.'},
  {key: 'colorPalette', label: 'Warna', hint: 'Palet, warna utama, atau kontras yang lo inginkan.'},
  {key: 'typography', label: 'Tipografi', hint: 'Karakter huruf, ukuran, dan hierarki teks.'},
  {key: 'pacing', label: 'Pacing', hint: 'Tempo cerita dan seberapa cepat visual berganti.'},
  {key: 'transitions', label: 'Transisi', hint: 'Cara elemen masuk, bergerak, dan berpindah.'},
  {key: 'visualDirection', label: 'Komposisi & bahasa visual', hint: 'Tata letak, bentuk, ilustrasi, atau gaya diagram.'},
  {key: 'referenceNotes', label: 'Catatan referensi', hint: 'Tulis bagian referensi yang ingin diikuti. Teks atau link hanya menjadi catatan; video dan halaman tidak dianalisis otomatis.'},
  {key: 'avoid', label: 'Hindari', hint: 'Warna, gerakan, elemen, atau kebiasaan visual yang tidak lo mau.'},
];
interface Props {
  style: StyleBrief;
  dirty: boolean;
  locked: boolean;
  hasCandidate: boolean;
  approved: boolean;
  hasRevision: boolean;
  onChange: (style: StyleBrief) => void;
  onSave: () => void;
  onReset: () => void;
}
export function StylePanel({style, dirty, locked, hasCandidate, approved, hasRevision, onChange, onSave, onReset}: Props) {
  return <form className="style-panel" onSubmit={event => { event.preventDefault(); if (dirty && !locked && !hasCandidate) onSave(); }}>
    <div className="section-head"><h2>Arah visual</h2><span className={dirty ? 'muted' : 'status-ok'}>{dirty ? 'Draft lokal' : 'Tersimpan'}</span></div>
    <p className="muted">Style ini berlaku untuk project ini. Isi bagian yang penting buat lo; sisanya boleh kosong.</p>
    {hasCandidate && <p className="style-notice" role="status">Terapkan atau buang kandidat terlebih dahulu sebelum menyimpan perubahan style.</p>}
    {!dirty && !approved && <p className="style-notice">Tinjau Brief + Style, lalu setujui di tab Brief sebelum generate.</p>}
    {hasRevision && <p className="muted small">Style yang disimpan dipakai pada generate atau revisi berikutnya. Preview versi yang sudah ada tetap memakai kode sebelumnya.</p>}
    <div className="style-fields">{styleFields.map(field => <div className="style-field" key={field.key}>
      <label htmlFor={`style-${field.key}`}>{field.label}</label>
      <p id={`style-${field.key}-hint`} className="muted">{field.hint}</p>
      <textarea id={`style-${field.key}`} aria-describedby={`style-${field.key}-hint`} rows={field.key === 'referenceNotes' ? 4 : 2} value={style[field.key]} onChange={event => onChange({...style, [field.key]: event.target.value})} disabled={locked} maxLength={field.key === 'referenceNotes' ? 8000 : 4000} />
    </div>)}</div>
    <div className="style-actions"><div className="button-row"><button className="primary" disabled={!dirty || locked || hasCandidate}>Simpan style</button><button type="button" disabled={!dirty || locked} onClick={onReset}>Buang draft</button></div><p className="muted">{dirty ? 'Draft belum dipakai AI. Simpan style atau buang draft untuk melanjutkan persetujuan.' : 'Perubahan style membatalkan persetujuan Brief + Style sebelumnya.'}</p></div>
  </form>;
}
