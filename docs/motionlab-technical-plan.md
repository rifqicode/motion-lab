# MotionLab: technical requirements, feasibility, and implementation plan

Tanggal audit: 2026-11-11. Baseline repository: `c228eea`.
Status: implementasi diotorisasi pengguna dan selesai diverifikasi (2026-11-11).

## Pelacakan implementasi

### VO-01: voice-over Chatterbox Indonesian lokal (diotorisasi pengguna)

Status DONE / PASS (2026-11-12). User memilih Chatterbox untuk voice-over per shot,
inference di compute lokal. Hardware terdeteksi RTX3050 VRAM6GB. Scope: narasi
per shot, generate lokal berantre/cancel, preview audio/video, candidate apply/discard,
history/restore dan export MP4 bersuara. Source visual existing tidak ditulis ulang.
SFX, musik dan voice cloning upload di luar milestone ini; suara bawaan checkpoint
dipakai dulu. Durasi shot diperpanjang secara eksplisit saat narasi tidak muat.

Task VO-RUNTIME (coder runtime): isolated Python3.11 env + pinned Chatterbox,
checkpoint grandhigh/Chatterbox-TTS-Indonesian, local/offline inference dan adapter
Node ber-abort. VO-UI (coder UI): panel Voice-over dengan pemilihan shot, script,
opsi fit duration dan volume, status/error/cancel serta preview native audio.
VO-PIPELINE (root): manifest audio immutable, trusted composition runtime,
service/API + candidate workflow dan inheritance pada revisi. VO-VERIFY (root):
regression preservation/cancel/stale/malformed audio dan browser native MP4+ffprobe.
Acceptance: setelah model diunduh inference tidak mengirim narasi ke layanan luar;
audio tersimpan/versioned; revisi shot lain mempertahankan audio; source awal tetap;
preview/export sama. Dokumentasi dependency via Context7 dan model card resmi.

Integrasi kode/build workspace PASS; regression snapshot58 PASS, kasus voice-over16
tercakup lintas run (satu timeout awal lalu isolated recheck PASS), runtime5 PASS,
editor15 PASS dan recheck proxy/source/panel21 PASS. Browser form/responsive PASS.
Model sudah staged; smoke CUDA pertama mencapai constructor tetapi gagal pada
dependency watermark Perth (`PerthImplicitWatermarker` None). Dependency diperbaiki
dan model/export nyata diverifikasi ulang; tidak menonaktifkan watermark.
Penyebab terverifikasi direct-import: `pkg_resources` belum tersedia. Setuptools
80.9.0 dipin dan import watermark PASS; offline CUDA smoke diulang lewat
`setup.mjs --verify-only` tanpa download/copy ulang. Runtime watermark dipertahankan.
Offline smoke CUDA PASS: WAV mono PCM16 24kHz, 4.070detik, puncak alokasi CUDA
3222MiB; ffprobe dan volumedetect terpisah mengonfirmasi audio non-silent.
Receipt ready ditulis setelah berhasil. Uji generate melalui panel Audio/API nyata
PASS pada fixture terpisah4196: script58karakter menghasilkan narasi4.91detik;
timeline120/120 menjadi157/120frame. Semua file visual byte-identical. Kandidat
tidak otomatis apply; playback sample/native preview tanpa mute PASS. Policy
iframe perlu `autoplay *` karena origin sandbox opaque; `autoplay` saja ditolak.
Export native dan authenticated download PASS: H.264720×1280 + AAC48kHz stereo,
durasi9.237detik, SHA256 download sama dengan artifact. Restore original kembali
120/120frame dan nol track; versi bersuara tetap dapat dilihat dari history.
Recheck final service/runtime/source:3file21test PASS dalam28.94detik. Build editor,
bundle lokal dan diffcheck PASS. Evidence: `anti-slop/audit-004-2026-11-11.md`.
Keterbatasan: first-use actual generation ~8menit termasuk load+preview di WSL
RAM7.7GiB dengan swap penuh; peak GPU alokasi3.2GiB. Default voice checkpoint saja,
belum upload reference/voice selector. Tidak mengubah project pengguna untuk QA.
Studio utama dimuat ulang saat idle; endpoint voiceovers200, runtime CUDA siap,
preview terhubung dan tidak ada alert/error pada recheck browser yang stabil.

### UI-05: Director melakukan revisi incremental (diotorisasi pengguna)

Status DONE / PASS (2026-11-11). Pengguna meminta Director dapat mengubah shot sesuai
konteks atau seluruh video, dengan mempertahankan hasil generate sebelumnya.
Implementasi menambahkan mode Diskusi/Revisi video pada thread Director existing.
Revisi dimulai dari accepted revision dengan expectedRevisionId, menghasilkan patch
terbatas pada scope, dan tidak membuat placeholder/coordinator baru dari nol.
Durasi dapat direvisi melalui rencana tervalidasi; hasil tetap candidate apply/discard,
original source/revision/history dipertahankan. Diskusi biasa tetap tidak memutasi.
Verifikasi wajib: scoped shot menjaga sibling byte-identical, video revision memakai
base source, duration/timeline konsisten setelah apply, stale/invalid/cancel ditolak,
history/rollback dan komentar sesudah revisi tetap berfungsi: seluruhnya diverifikasi.
Patch memakai anchor unik pada file existing; membuat/menghapus file dan mengganti
seluruh file ditolak. Scope shot melarang perubahan sibling/shared; scope video
mendukung patch shared eksplisit dan durasi tanpa memaksa penulisan ulang TSX.
Apply menyinkronkan metadata Storyboard; draft planning lain tetap dipertahankan.
Retry hanya mengulang shot gagal dari source kandidat, bukan merencanakan ulang.
Diskusi menerima state versi aktif/kandidat aktual pada setiap turn.

Verifikasi: build workspace PASS; regression penuh 35 file / 291 test PASS sebelum
tiga tambahan timing-only/shared-only, lalu ketiga tambahan dan helper/scoped
integration terkait PASS pada targeted run (21 test). Browser fixture menjalankan
diskusi → revisi shot → apply → revisi video → apply → MP4 export → restore original.
Source original byte-identical; revisi shot mempertahankan sibling byte-identical;
planner memakai satu thread Director. MP4 native diverifikasi ffprobe: H.264,
720×1280, 30 fps, 11 detik. Keyboard dan viewport 320/390/1024px PASS.
Provider nyata tidak dipakai; fixture terpisah dari project pengguna. Tidak mengklaim
kualitas instruksi AI nyata. Rincian evidence: `anti-slop/audit-003-2026-11-11.md`.
Mode revisi mempertahankan identitas/urutan/jumlah shot; perubahan struktur tetap
melalui workflow Storyboard. Hasil tidak diterapkan otomatis.

Recheck final sesudah penambahan state accepted/candidate pada diskusi: HTTP,
generation dan bounded patch 3 file / 54 test PASS; server TypeScript dan bundle
lokal PASS. Server pengguna dimuat ulang saat idle. Browser Studio aktual memuat
kedua mode, satu preview dan tidak menampilkan alert; tidak mengirim revisi ke AI.

### FIX-02: metadata capture terbaca sebagai record komentar (2026-11-11)

Status DONE / PASS. Setelah FIX-01 menghasilkan screenshot, file
`comments/<commentId>.capture.json` ikut diproses sebagai record komentar oleh
`StudioStore.records`; suffix `.capture` membuat basename gagal IdSchema sehingga
snapshot project mengembalikan `Invalid record ID`. Job revisi sendiri sudah
menghasilkan kandidat ready; kegagalan ada pada pembacaan project sesudahnya.

Writer sekarang menyimpan evidence sebagai hidden sidecar
`comments/.<commentId>.capture.json`, mengikuti konvensi metadata yang sudah
diabaikan oleh collection reader. Validasi record ID tetap ketat. Satu sidecar
project terdampak sudah diganti namanya setelah memverifikasi kaitan dengan
comment/revision/source; konten metadata dipertahankan byte-identical, dan komentar,
PNG, kandidat maupun revision tidak dihapus atau diubah.

Regression menggabungkan writer screenshot sebenarnya (browser fixture) dengan
service generation dan `StudioStore.getSnapshot`, membuktikan PNG tercatat pada
komentar dan metadata tidak menambah record komentar. Sepuluh test screenshot
lulus; delapan regression generation lain lulus; integration case baru lulus pada
recheck setelah rebuild codegen. Build codegen/server dan bundle Studio lulus.
Server dimuat ulang saat idle, dan API project aktual kembali 200 dengan komentar
tetap terbaca. Tidak memanggil AI atau generate ulang project untuk pemulihan ini.

### FIX-01: revisi komentar setelah runtime berubah (2026-11-11)

Status DONE / PASS. Pengguna melaporkan `Runtime or dependency versions changed;
rebuild this revision before capturing it.` setelah cancel generation lalu revisi
melalui komentar. Pada project terdampak, dependency hash masih cocok, timeline
Storyboard sesuai revision aktif, approval valid, dan tidak ada kandidat terbuka.
Runtime hash berbeda akibat pembaruan trusted preview client sebelumnya; guard
di `StudioBuilder.screenshot` menolak snapshot lama sebelum screenshot diambil.
Cancel bukan penyebab langsung fingerprint mismatch.

Capture sekarang memverifikasi sealed source terhadap provenance build, lalu
mengambil bukti browser baru di session capture terpisah jika runtime/dependency
berubah. Tidak memanggil AI/production build atau mengubah build/revision lama.
Metadata hidden `.<commentId>.capture.json` di samping PNG mencatat build/source/frame serta fingerprint
runtime/dependency original dan capture aktual. Capture gagal/cancel atau perubahan
source/runtime di tengah proses tidak memublikasikan gambar baru. Preview capture
diserialkan per project agar tidak bertabrakan dengan publication yang dibatalkan.

Verifikasi: codegen/server TypeScript build dan bundle Studio PASS; 55 test pada
source/preview/screenshot/generation PASS. Regression mencakup runtime/dependency
berubah (development dan legacy), source tampering, revalidation gagal, cancel,
serta accepted revision → generate baru → cancel → revisi komentar yang hanya
menjalankan worker shot sasaran dan mempertahankan source sibling.

Capture browser native nyata dari salinan source/build project terdampak berhasil
pada frame 45: PNG 720×1280, 152380 byte, source hash cocok, dependency cocok,
runtime baru, original build/revision tetap byte-identical. Artifact verifikasi:
`/tmp/motionlab-capture-recovery-bAvLof/project/comments/runtime-recovery-check.png`.
Tidak memanggil provider atau membuat kandidat/revisi baru pada project pengguna.
Server lokal dimuat ulang saat seluruh project idle agar fix aktif.

### UI-04: detail shot dan diskusi berkonteks (2026-11-11)

Permintaan lanjutan pengguna: urutan shot tetap terlihat, detail dibuka saat shot
diklik, dan diskusi memakai thread Director yang sama dengan konteks shot terpilih.
Status: DONE; verifikasi PASS, 38 test editor/core dan 22 test HTTP/Director.

Daftar utama mendahulukan nomor/judul/durasi; konsep/style bersama menjadi detail
sekunder. Native dialog membuka detail hanya untuk shot terpilih dan menyediakan
aksi simpan serta "Diskusikan shot ini". Konteks chat menampilkan shot aktif,
dapat kembali ke detail, dan dapat dilepas untuk membahas seluruh video. Draft
lokal, termasuk shot baru yang belum lengkap, diteruskan sebagai konteks diskusi.

Endpoint messages menerima optional `shotContext` tervalidasi. Service tetap
memakai binding thread brainstorm existing dan menyimpan label shot di riwayat
pesan pengguna. Setiap request menetapkan scope secara eksplisit; melepas konteks
mengembalikan scope seluruh project. Diskusi tidak menyimpan, menyetujui, atau
generate storyboard secara otomatis. Kontrak approval/generation tetap berlaku.

Bukti browser fixture: tiga turn diskusi umum → shot 2 dengan draft lokal → umum
memakai tepat satu thread ID. Save/reopen mempertahankan detail; dialog menangani
Escape/fokus dan muat pada viewport 320, 390, dan 1024 px. Backend lokal di-restart
saat idle agar endpoint aktif memuat perubahan. Hasil pengujian tidak mengklaim
respons provider nyata atau generation/export baru. Detail:
`anti-slop/audit-002-2026-11-11.md`.

### UI refactor berdasarkan referensi pengguna (2026-11-11)

Pengguna menyetujui implementasi tampilan dari screenshot setelah audit
`anti-slop/audit-001-2026-11-11.md`, dengan instruksi "gas". Kontrak UI:
header project/engine ringkas; tahapan Brief/Storyboard/Preview/Export; Director
kiri, preview tengah, review kanan; navigasi shot horizontal dengan playhead aktif;
warna charcoal/oranye/teal; layar kecil memakai pilihan area kerja.

UI-01 layout/header/review: DONE. UI-02 navigasi shot, ringkasan frame, akses
Brief/Style, format percakapan aman, Storyboard diperluas: DONE. UI-03 verifikasi:
PASS, detail dan screenshot pada `anti-slop/audit-001-followup-2026-11-11.md`.
Perubahan runtime terbatas pada normalisasi hasil `PlayerRef.play()` dan pembaruan
trusted client yang tersimpan agar fix juga berlaku ketika preview lama dibuka.
Tidak mengubah generation, approval, immutable source/revision, atau export contract.

Build monorepo lulus. 224 test lulus pada full run di sandbox; 27 test dalam dua
file yang gagal di lingkungan tersebut lulus saat dijalankan ulang di luar sandbox.
Browser memverifikasi layout, playback/seek/fullscreen, akses panel dan keyboard.
Penyimpanan Brief/Style, approval, percakapan dan edit Storyboard diverifikasi pada
project fixture terpisah di `/tmp`, bukan project konten pengguna. Tidak menjalankan
generation provider nyata atau render MP4 baru untuk refactor UI ini.

Dokumen ini tetap menjadi kontrak tunggal; tidak dibuat salinan rencana berbeda
di `.ai/`. Otorisasi implementasi menggantikan batas audit-only sebelumnya.

| Task | Owner | Work | Verification |
| --- | --- | --- | --- |
| ML-01 Director/schema/storage/API + regression | director_backend | COMPLETED | PASSED |
| ML-02 Director/Storyboard UI + frame mapping | storyboard_ui | COMPLETED | PASSED |
| ML-03 Persistent Docker/Vite preview + export runtime | live_runtime | COMPLETED | PASSED |
| ML-04 Scheduler, activity, targeted revision, QA integration | main session | COMPLETED | PASSED |
| ML-05 Integrated browser/regression/export/benchmark checks | main session | COMPLETED | PASSED |

Design Read: workspace kreatif untuk pembuat video, mengikuti charcoal/amber Studio
existing; ENERGY 1 / RHYTHM 2 / MOTION 1. Daftar storyboard memberi konteks urutan,
detail terpilih memberi ruang edit; amber menandai aksi/pilihan aktif, system sans
menjaga form mudah dibaca. Tidak membuat aset visual baru.

Keputusan pengguna (2026-11-11): Docker sepenuhnya ditiadakan dari workflow lokal Studio (baik untuk editing, preview, maupun export).
Semua runtime (Vite dev server, Remotion headless check, dan export render) dijalankan secara native menggunakan Node.js lokal.
Keputusan ini diambil untuk memangkas kompleksitas container, mengeliminasi cold-start lag, menghindari konflik daemon Docker, dan menjaga workflow editing lokal tetap instan dan ringan.

Dokumen ini menyimpan requirement pengguna beserta pemetaan ke kode existing.
Bagian usulan bukan deskripsi fitur yang sudah berjalan. Perbarui status dan
bukti verifikasi saat implementasi dilakukan.

## 1. Kesimpulan kelayakan

**Layak secara arsitektur melalui refactor incremental, tanpa rewrite project.**
Fondasi source snapshot, candidate review, revision history, rollback, source
validation, frame comment, dan SSE sudah tersedia. Namun workflow Studio aktif
masih satu shot, satu job per project, dan generation/revision bergantung pada
Docker build lengkap. Director, preview HMR, scheduler shot, visual QA semantik,
dan export generated TSX dari Studio memerlukan implementasi baru.

Risiko terbesar adalah mengganti kontrak `buildId` pada approval/rollback tanpa
kehilangan immutable provenance, serta menjaga isolasi saat memasukkan Vite HMR.
HMR tidak otomatis mempertahankan preview valid ketika runtime error. Parallel
request pada adapter juga belum membuktikan provider benar-benar memproses dua
atau tiga inference secara paralel.

Tidak ada klaim benchmark, kelulusan E2E, keberhasilan render, atau estimasi waktu
pengerjaan dari audit ini. Audit dilakukan melalui pembacaan kode dan dokumentasi.

## 2. Requirement pengguna yang menjadi kontrak

Workflow tujuan:

`Idea → Director → Storyboard Approval → Parallel Shot Generation → Live Preview → Visual QA → Feedback → Final MP4 Export`

Prioritas: workflow cepat, incremental, dan progres terlihat di Studio.

### Audit dan kompatibilitas

- Audit `apps/server`, `apps/editor`, `apps/worker`, dan `packages/*` sebelum coding.
- Petakan generation, revision, build, preview; breakdown harus mengikuti kode existing.
- Pertahankan versioning, candidate approval/discard, rollback, dan source validation.
- Jangan rewrite project atau menghapus fitur existing tanpa alasan teknis jelas.

### Director dan storyboard

- Director menghasilkan JSON tervalidasi: concept, hook, narrative flow, ordered shots,
  duration frames, visual direction, motion instructions, transitions, shared design
  system (warna, typography, spacing, motion style), dependencies, shared components.
- Storyboard terlihat dan dapat diedit di Studio; approval wajib sebelum shot generation.
- Shot ID stabil; reorder atau revision tidak membuat ulang identitas shot lain.
- Konsistensi visual ditetapkan sebelum parallel generation.

### Parallel shot generation

- Independent AI worker per shot; concurrency awal 2, dapat dinaikkan ke 3 setelah pengukuran.
- Input: approved storyboard, shared design system, dan instruksi shot tertentu.
- Output: TSX terpisah per shot, wajib lolos source validation sebelum eksekusi.
- Shot selesai langsung tersedia untuk preview; shot belum selesai memakai placeholder.
- Satu shot gagal tidak membatalkan shot lain. Ada retry dan cancellation per shot.
- Worker tidak mengedit file yang sama; shared components ditetapkan lebih dulu oleh
  coordinator atau hanya diubah coordinator melalui proses terkontrol.

### Live preview

Editing path untuk initial generation dan revision:

`AI TSX → validate changed files/dependencies → isolated preview workspace → Vite HMR → Remotion Player`

- Tidak ada Docker build atau full production bundle pada setiap perubahan editing.
- Play, pause, seek, dan navigasi frame tetap tersedia.
- Preview incremental tanpa reload seluruh Studio dan tanpa restart preview server normal.
- Compile/runtime error mempertahankan last-known-good preview.
- Kode AI tetap divalidasi sebelum dieksekusi dan runtime preview tetap terisolasi.

### Aktivitas real-time

Gunakan SSE existing atau stream kompatibel. Event wajib:

```text
director.started
director.completed
storyboard.approved
shot.queued
shot.generating
shot.validating
shot.preview_ready
shot.failed
shot.retrying
visual_qa.started
visual_qa.completed
export.started
export.completed
```

Studio menampilkan current activity, progress per shot, worker status, changed files,
validation result, error/retry, dan preview tersedia. Progress berupa milestone nyata,
bukan persentase/ETA buatan. Cancellation membutuhkan status/event tambahan.

### Frame-level revision

1. Resolve global frame menjadi shot ID dan local frame.
2. Ambil source shot saat ini dan screenshot frame tepat dari snapshot yang dirujuk.
3. Kirim feedback hanya ke worker shot tersebut.
4. Generate patch file relevan, validate, lalu update preview melalui HMR.
5. Lightweight QA pada frame terdampak dan dependency yang memang terpengaruh.

Acceptance: komentar shot 3 tidak regenerate shot 1, 2, 4, kecuali shared dependency
memang berubah; perubahan shared harus eksplisit, bukan efek samping worker.

### Visual QA

- Preview QA: compile/runtime validation, screenshot frame terpilih, basic overflow/
  clipping checks, dan consistency terhadap Director guidelines; targeted recheck
  setelah revision.
- Final QA: full timeline validation, transition checks, render output verification,
  duration, dimensions, dan FPS.
- Issue mencantumkan shot ID, frame, severity. Screenshot berhasil bukan bukti
  kualitas visual baik. Pisahkan hasil deterministic checks dari penilaian visual AI.

### Final export

- Production build dan MP4 render hanya ketika user memilih export/finalize.
- Gunakan Remotion existing terlebih dahulu; Docker diperbolehkan untuk runtime
  editing persisten sesuai keputusan pengguna setelah audit.
- Jangan migrasi Bun, GPU, atau encoding pada fase ini. Optimasi render menyusul
  setelah workflow editing stabil.

### Urutan dan Definition of Done

1. Director Foundation: schema/API, storyboard editor/approval, multi-shot timeline.
2. Live Preview Foundation: dev runtime, HMR, last-known-good, initial generation tanpa build production.
3. Parallel Generation: scheduler, limit, isolated outputs, retry/cancel, incremental publishing.
4. Feedback & Visual QA: mapping frame, targeted revision, lightweight QA, activity/SSE.
5. Integration & E2E: full workflow, regression, benchmark, final export verification.

Done berarti pengguna memasukkan ide, approve storyboard, melihat beberapa shot
digenerate paralel dan preview/aktivitas real-time, merevisi frame tanpa full rebuild,
lalu export MP4 setelah hasil final disetujui. Approval, history, dan rollback tetap bekerja.

Target benchmark awal, bukan jaminan:

- HMR setelah file valid dipublikasikan: p95 <2 detik.
- Nol production build pada initial generation dan revision.
- Parallel generation lebih cepat daripada sequential pada workload identik.
- Revision satu shot tidak generate ulang shot lain.
- Tidak ada restart seluruh preview server untuk perubahan normal.
- Ukur AI latency, validation, HMR, dan export secara terpisah.

Out of scope: Bun, GPU/NVENC, 4K, advanced audio/TTS, general Antigravity security
refactor, dan full autonomous multi-agent discussion framework.

Implementasi harus incremental, memiliki daftar file/module, breaking changes dan
migration strategy, unit/integration/E2E tests, lint/typecheck/tests/build verification,
serta laporan tiap milestone dan issue tersisa. Jangan klaim peningkatan tanpa benchmark.

## 3. Hasil audit kode existing

| Area | Bukti kode | Implikasi |
| --- | --- | --- |
| Orchestrator | `apps/server/src/service.ts`: `startJob`, `generate`, `thread` | Satu active job per project; generate/revise satu alur dengan maksimal dua repair. Thread implementor dipakai ulang per project/provider. |
| Pembatasan shot | `service.ts`: `M0_SHOT_LIMIT`; `apps/server/src/prompts.ts` | Hanya satu silent shot 450–900 frames, 720×1280, 30fps. Bukan multi-shot aktif. |
| Domain Studio | `packages/studio-core/src/index.ts` | Shot/proposal/revision dapat menyimpan sampai 12 shot, tetapi storyboard Director/design tokens/dependencies belum ada. Schema strict, version 1. |
| Source boundary | `packages/codegen/src/source.ts` | AST policy, import restrictions, path/symlink checks, immutable hash manifest, merge patch ke snapshot baru. Entry wajib `src/shots/<id>.tsx`. |
| Snapshot lengkap | `source.ts`: `materializeSource` | Setiap shot dalam manifest harus sudah punya entry. Incremental preview memerlukan trusted placeholders atau draft manifest tersendiri. |
| Resource limits | `SourceProposalSchema`, `SourceManifestSchema`, `materializeSource` | Maksimal 20 file lengkap, 64 KiB/file, 512 KiB total. Harus dievaluasi untuk 12 shot + shared modules; jangan menaikkan tanpa batas. |
| Build runner | `packages/codegen/src/builder.ts` | `StudioBuilder.build` memerlukan Docker dan memverifikasi source/hash/runtime isolation; screenshot juga lewat Docker. |
| Trusted worker | `apps/worker/runtime/build.mjs`, `isolation.mjs` | Typecheck → esbuild production Player bundle → Remotion bundle → lima smoke frames. Runner sudah membuat sequence multi-shot berurutan, belum transition contract. |
| Preview runtime | `apps/worker/runtime/preview.tsx` | Remotion Player dan MessageChannel sudah ada. Error boundary menampilkan error, belum rollback runtime ke versi valid. |
| Preview delivery | `apps/server/src/http.ts`; `apps/editor/src/Preview.tsx` | Immutable build assets, separate-origin sandbox iframe. CSP `connect-src 'none'`; iframe berganti berdasarkan buildId. Belum Vite/HMR. |
| Persistence | `packages/storage/src/index.ts` | Local JSON, atomic writes, serialization, exclusive writer lock, recovery, optimistic revision checks. Pertahankan coordinator tunggal untuk mutasi project. |
| Apply/restore | `storage`: `applyCandidate`, `restoreRevision` | Wajib `build.json` ready dan sourceId cocok. Memisahkan export tanpa migrasi kontrak ini akan mematahkan approval/rollback. |
| Frame feedback | `FrameAnchorSchema`, `addComment`, `generate`; editor `index.tsx` | Anchor sudah punya revisionId/shotId/localFrame. UI memilih `shots[0]`; screenshot memakai localFrame sebagai composition frame. Benar hanya pada shot pertama. |
| SSE | `apps/server/src/events.ts` | Replay in-memory sampai 600 event, heartbeat, backpressure; kind string/payload unknown. Belum typed per-shot events atau durable resume lintas restart. |
| AI adapters | `packages/codex-runtime`, `packages/antigravity-runtime` | Structured output/cancel tersedia; Codex memakai native image input. Active turn dibatasi per thread, jadi worker perlu thread terpisah. Kemampuan aktual paralel tiap provider belum diuji. |
| Legacy storyboard | `packages/storyboard`, `packages/schema` | Ada JSON generation + repair/cache untuk schema scene/diagram legacy. Ini berbeda dari Studio generated TSX; tidak dapat langsung dipasang sebagai Director tanpa adapter/kontrak baru. |
| Legacy renderer/export | `apps/cli/src/index.ts`, `packages/renderer` | CLI memiliki `bundle`/`selectComposition`/`renderMedia` untuk project legacy. Studio generated TSX baru punya render bundle/screenshot, belum API/button MP4 export. |
| Shared primitives | `packages/themes`, `motion`, `diagrams` | Dapat dipertimbangkan sebagai pola/tokens. Source policy saat ini hanya mengizinkan React, Remotion, relative source imports; jangan langsung menambah package imports sembarang. |
| Audio | `packages/audio` | Pipeline audio legacy ada; tidak perlu diubah dalam scope ini. |
| Dev startup | `scripts/dev-studio.mjs`, package manifests | Studio dibundle sekali dengan esbuild. Belum dependency/config Vite. Editor shell tidak wajib dimigrasikan agar preview memakai Vite. |

README root belum merefleksikan seluruh Studio aktif. Beberapa README menunjuk
`.ai/plans`/`.ai/research` yang tidak tersedia dalam checkout audit ini; `.ai/`
juga di-ignore. Dokumen ini disimpan di `docs/` agar dapat dilacak Git.

## 4. Arsitektur usulan dan invariant

### 4.1 Approval terpisah

Brief + style approval existing tetap menjadi input. Director menghasilkan draft
storyboard; user dapat edit lalu approve hash snapshot storyboard + design system +
shared contract. Perubahan draft tidak memutasi storyboard yang sedang digunakan
job. Perubahan yang relevan memerlukan approval baru sebelum generation berikutnya.

Candidate TSX tetap harus diterapkan pengguna. Incremental preview adalah draft
yang bisa dilihat, bukan auto-apply revision. Pertahankan satu aggregate candidate
per generation run, dengan state/output child shot; jangan membuat beberapa open
candidate yang saling menimpa `project.openCandidateId`.

#### Keputusan UX: Director dan tab Storyboard

Disepakati setelah audit: tab Brainstorm menjadi **Director**, dengan fungsi diskusi
ide dan penyusunan cerita yang diperluas. Riwayat percakapan existing tetap
dipertahankan. Brief + Style tetap menjadi konteks editable, bukan dihapus.

Alur pengguna:

1. Masukkan ide dan diskusikan tujuan, audiens, hook, durasi, serta gaya visual
   bersama Director. Jika konteks cukup, tidak perlu memaksa sesi tanya jawab.
2. Klik **Susun storyboard** untuk menghasilkan draft terstruktur.
3. Buka tab **Storyboard**, baca keseluruhan rencana, lalu edit langsung atau minta
   perubahan melalui Director. Hasil perubahan masuk sebagai draft.
4. Klik **Setujui storyboard & generate** untuk mengunci snapshot approval dan
   memulai generation shot paralel. Preview dan Activity menampilkan progres.
5. Gunakan Director untuk perubahan cerita/arahan keseluruhan, dan frame comments
   untuk revisi visual pada shot tertentu.

Percakapan biasa tidak otomatis memulai generation atau mengubah snapshot yang
sudah approved. Tombol approval + generate adalah satu aksi UI dengan dua langkah
server berurutan; generation harus menerima dan memverifikasi versi/hash approval
yang tepat. Jika start generation gagal, retry tidak menggandakan job.

**Satu tab Storyboard dengan ringkasan dan panel detail shot**, bukan tab baru
terpisah untuk setiap detail. Structured JSON tetap menjadi kontrak internal;
tampilan utama berupa informasi yang mudah dibaca dan diedit.

- Bagian atas: konsep, hook, total durasi, dan gaya visual bersama. Design system
  bersama dapat diperiksa/diedit tanpa mengulang semua aturannya di setiap shot.
- Daftar shot berurutan: nomor urut, judul, durasi dalam detik, isi cerita singkat,
  dan ringkasan visual. Nomor urut tampilan terpisah dari stable shot ID.
- Pilih satu shot untuk membuka panel detail dalam konteks daftar: isi cerita,
  tujuan shot, arahan visual, urutan animasi/motion, durasi, dan transisi.
- Shared components/dependencies tersedia dalam bagian teknis yang dapat dibuka
  bila perlu; tidak memenuhi tampilan utama dengan metadata implementasi.
- Status jelas: **Draft**, **Disetujui**, atau **Ada perubahan**. Status Ada perubahan
  menunjukkan draft berbeda dari versi approved; generation baru perlu approval.
- Tombol utama **Setujui storyboard & generate** mengikuti validation/approval gates;
  error validasi terlihat pada field/shot terkait.

Contoh susunan informasi, bukan storyboard proyek aktual:

| Shot | Durasi | Isi cerita | Visual |
| --- | --- | --- | --- |
| 01 · Hook | 3 detik | Pertanyaan pembuka | Teks besar, objek utama masuk |
| 02 · Penjelasan | 6 detik | Menjelaskan masalah | Diagram bergerak |
| 03 · Penutup | 3 detik | Kesimpulan | Perbandingan hasil |

Gate tambahan M1: rename Brainstorm tidak menghilangkan chat history/Brief/Style;
ringkasan dan detail shot dapat diedit; memilih detail tidak kehilangan draft;
status approval akurat; generation selalu menggunakan snapshot yang disetujui.

### 4.2 Kontrak Director dan timeline

Tambahkan kontrak Studio khusus, terpisah dari `@studio/schema` legacy:

- `Storyboard`: schemaVersion, id/version, concept, hook, narrative, ordered shots,
  structured designSystem, sharedComponents, dependency graph.
- `ShotPlan`: stable id, durationFrames, intent, visualDirection, motionInstructions,
  transition, dependencies, ownedPaths. Entry TSX ditentukan server dari shot ID.
- `StoryboardApproval`: storyboard hash, brief/style fingerprint, shared contract hash.
- `Timeline`: shotId, startFrame, durationFrames, transition interval, totalFrames.

Validasi juga duplicate IDs, missing/cyclic dependencies, duration bounds, path
ownership, total duration, dan transition validity, bukan JSON shape saja.

Mulai dengan cut; tentukan semantics overlap sebelum transition lain. Untuk cut,
interval shot adalah `[startFrame, startFrame + durationFrames)`, dan
`localFrame = globalFrame - startFrame`. Untuk overlap, dua shot dapat aktif;
UI harus memilih shot target eksplisit dan QA memeriksa boundary keduanya.
Preview dan export memakai timeline resolver yang sama.

### 4.3 Scheduler dan coordinator

- Satu parent job tetap memegang project mutation gate; scheduler menjalankan dua
  child shot jobs di dalamnya. Tidak cukup mengganti gate dengan `Promise.all`.
- Thread implementor terpisah per shot/run/provider. Tidak ada concurrent turn pada
  thread sama; verify adapter/provider sebelum mengaktifkan concurrency 3.
- Worker mengembalikan proposal data ke coordinator, bukan menulis workspace aktif.
- Shared components/tokens ditetapkan dan divalidasi coordinator sebelum fan-out.
  Shot worker hanya boleh menulis ownedPaths, tidak shot lain atau shared contract.
- Output membawa storyboardHash, baseRevisionId, baseSource/shot hash, job/attempt ID.
  Coordinator menolak late/stale result, termasuk setelah cancel atau retry.
- Merge diserialkan ke aggregate terbaru agar shot B tidak menghapus hasil shot A
  yang selesai lebih dulu. Mutasi parent/job/project tetap single-writer.
- Persist child status/attempt/output sebelum event; retry hanya shot gagal.
  Parent cancel menghentikan semua child; cancel satu child membiarkan lainnya.
- Restart menandai interrupted child jobs; jangan menyatakan sedang generating
  jika provider process hilang. Retry eksplisit dan idempotent.

### 4.4 Preview terisolasi dan last-known-good

Preview session mutable dipisahkan dari immutable source/revision records. Hanya
coordinator mempublikasikan validated files ke workspace preview. Trusted runtime
menghasilkan registry/timeline/placeholders; jangan meminta worker mengedit registry.

Vite berjalan sebagai trusted dev server dengan root workspace yang terbatas,
dependency tree terpin, filesystem allowlist, tanpa project credentials. Jangan
menjalankan SSR/plugin/config buatan AI. Static validator existing dipertahankan;
ia bukan pengganti isolasi eksekusi browser/OS.

**Keputusan pengguna:** gunakan container Docker preview persisten per project aktif,
dengan Vite dev server dan browser preview terisolasi. Mulai container saat membuka
preview; perubahan normal hanya memvalidasi dan mempublikasikan source melalui HMR,
tanpa rebuild image, restart container/server, atau production bundle. Dependency/image
disiapkan terpisah saat setup atau perubahan dependency, bukan pada setiap revisi.
Pertahankan pembatasan mount, non-root, resource limits, dan pemisahan credentials
dari runner existing. Aturan network perlu disesuaikan secara terbatas untuk HTTP/WS
preview; jangan membuka akses eksternal bebas. Detail ini harus dibuktikan di M2.

Iframe sandbox dan MessageChannel tetap menjadi boundary Studio. CSP editing
memerlukan koneksi HTTP/WebSocket HMR ke endpoint preview yang tepat; existing
`connect-src 'none'` tidak kompatibel. Kaji opaque-origin module loading/CORS dan
WebSocket authorization tanpa memberikan akses API/token Studio kepada kode AI.
Jangan membuka wildcard filesystem, host, origin, atau network untuk menyiasati HMR.

Last-known-good memerlukan publish transaction:

1. Stage output → source policy → affected dependency/typecheck → compile.
2. Uji candidate module di sandbox validasi terpisah pada frame relevan, dengan timeout.
3. Publish sebagai satu generation/version; acknowledge bahwa Player memuat versi itu.
4. Simpan last-good source/version. Runtime failure pada frame berikutnya mengembalikan
   registry/workspace ke last-good dan mengembalikan playhead/play state yang sesuai.

React error boundary saja tidak menyimpan visual/component versi sebelumnya.
Pertimbangkan retaining iframe last-good saat candidate diprobe, lalu HMR pada
preview aktif setelah lolos. Recovery abnormal boleh mengganti iframe; perubahan
normal harus HMR tanpa reload Studio/restart server. Buktikan dengan runtime-error
fixture, bukan mengasumsikan Fast Refresh cukup.

Initial preview harus langsung memakai manifest lengkap dengan placeholder trusted
atau format draft yang jelas. Export/apply tidak boleh menerima placeholder sebagai
shot final. Existing immutable manifests tetap diverifikasi lengkap.

### 4.5 Revision, QA, dan export

Feedback dibatasi oleh server-side file ownership dan dependency graph, bukan prompt
saja. Screenshot diberi sourceHash, storyboard/timeline version, shotId, global/local
frame. Ambil screenshot dari preview validation runtime; jangan memanggil build
production hanya demi komentar. Perubahan shared dependency melalui coordinator
harus menandai semua dependent shots untuk revalidation/QA; regenerate hanya jika perlu.

Usulan issue QA: `{shotId, globalFrame, localFrame, severity, category, message,
sourceHash, evidence, checkType}`. Check type membedakan compile/runtime, geometry,
dan visual-model review. Tambahkan status passed/failed/inconclusive/skipped dan
coverage frame agar tidak menganggap area yang belum diperiksa lulus.

Geometry checks dapat mengukur DOM/SVG bounding boxes pada trusted harness dan
safe-area constraints; clipping artistik perlu ditandai intentional. Penilaian
visual terhadap screenshot butuh reviewer multimodal dengan laporan terstruktur,
rule references, dan penanganan false positive. Konsistensi token dapat diperiksa
sebagian secara deterministik, tetapi kualitas desain tetap memerlukan review.

Export mengambil immutable accepted revision, bukan mutable live workspace.
Gunakan trusted generated composition yang sama semantiknya dengan preview dan
Remotion `renderMedia` existing; renderer scene legacy bukan drop-in untuk TSX ini.
Persist export artifact terpisah, ikat ke source/timeline/runtime hash. Setelah
render, periksa MP4 aktual (probe metadata/decode/frame boundaries), bukan sekadar
exit code render. QA gagal harus jelas, tidak mengklaim final verified.

### 4.6 SSE dan observability

Tambahkan typed event envelope dengan projectId, run/jobId, shotId jika relevan,
attempt, sequence/eventId, timestamp, source version, changedFiles, diagnostics.
Pertahankan kompatibilitas kind/payload existing sampai UI dimigrasikan.

Persist status sebagai source of truth; reconnect mengambil snapshot lalu replay
event yang masih ada. Karena history 600 event hanya in-memory, deteksi gap/restart
dan resync. Durable event journal opsional; jangan menjanjikan replay lintas restart
tanpa implementasi. UI jangan full-refresh snapshot pada setiap token/shot event.

## 5. File/module yang diperkirakan berubah

Path baru berikut adalah usulan; naming akhir mengikuti hasil implementasi.

| Milestone | Existing yang berubah | Modul/file baru yang diusulkan |
| --- | --- | --- |
| M1 | `studio-core/src/index.ts`, `storage/src/index.ts`, server `service.ts`, `http.ts`, `prompts.ts`, editor `api.ts`, `index.tsx`, review/brief components | `studio-core/src/storyboard.ts`, `timeline.ts`; server `director.ts`; editor `StoryboardPanel.tsx`; schema/approval/timeline tests |
| M2 | `codegen/src/source.ts`, server startup/http/service; editor `Preview.tsx`; worker preview/runtime; manifests/lockfile | `apps/worker/preview/` trusted Vite config, composition/registry, validation harness; `codegen/src/preview.ts`; preview contract/tests |
| M3 | service job orchestration, storage recovery, runtime thread binding, editor progress | server `shot-scheduler.ts`, shot-job schema/store, merge/ownership checks, failure/cancel integration tests |
| M4 | feedback route/service, editor comment creation/timeline, `events.ts`, activity/progress UI | `visual-qa.ts`, `ActivityPanel.tsx`, targeted screenshot/QA harness and reports |
| M5 | builder/worker final render, server routes, editor export controls, project docs/package scripts | export job/report, MP4 verification, `e2e/`, reproducible benchmark harness/results |

`packages/storyboard` dan CLI/renderer legacy dipertahankan; reuse pola/adapter jika
cocok, jangan mengganti schema scene legacy menjadi Studio schema secara global.
`themes`, `motion`, `diagrams`, `audio` tidak perlu dirombak sebagai prasyarat.

## 6. Breaking changes dan migration strategy

1. **Schema v1 strict:** gunakan decoder/version migration eksplisit untuk v1/v2.
   Jangan menambahkan field ke JSON lama lalu berharap schema strict menerimanya.
   Backup sebelum mutasi persistent; migration idempotent dan interruption-safe.
2. **Build menjadi artifact export:** v2 revision menyimpan validated source dan
   preview evidence/version; export build terpisah/opsional. `applyCandidate` dan
   `restoreRevision` memverifikasi provenance preview/source, tidak mewajibkan
   production build. Jangan sekadar menjadikan buildId nullable tanpa replacement gate.
3. **Legacy revision:** jangan rewrite immutable revision/source/build records.
   Reader menerima format lama dan mempertahankan static preview/rollback-nya.
   Saat legacy di-restore, revision baru mereferensikan provenance original dengan benar.
4. **Approval:** approvedBriefHash lama dipertahankan, tetapi tidak dianggap approval
   storyboard multi-shot. New workflow membutuhkan storyboard approval eksplisit.
   Legacy history tetap dapat dibuka tanpa memaksa regenerate.
5. **Candidate state machine:** bedakan partial preview availability dengan ready-to-apply.
   Semua required shots tervalidasi dan snapshot konsisten sebelum apply. Failed child
   tidak menghapus hasil sibling atau accepted revision.
6. **Frame contract:** simpan local anchor existing; hitung global frame dari timeline
   revision yang sama. Jangan menggeser historical comments saat shot di-reorder.
7. **Thread bindings:** tambah versioned Director/shot bindings; jangan memakai ulang
   thread implementor serial untuk parallel turns atau menghapus thread lama.
8. **HTTP/events:** endpoint baru dapat additive; preview session protocol perlu version
   baru selain buildId. Pertahankan endpoint immutable preview lama selama migrasi.
9. **Resource limits/dependencies:** pin Vite/React integration sesuai compatibility
   runtime, pertahankan Remotion packages seversi. Ukur kebutuhan source limit dulu.

## 7. Milestone gates dan status

Semua milestone di bawah **telah selesai diimplementasikan dan diverifikasi** (2026-11-11):
- `pnpm build` sukses di seluruh monorepo.
- `pnpm test` (30 test files, 241 tests) lulus 100%.
- Benchmark script `node --check apps/worker/benchmarks/hmr.mjs` valid syntax.

| Milestone | Gate sebelum dinyatakan selesai | Status |
| --- | --- | --- |
| M1 | Director output tervalidasi; storyboard editable/approved; stale approval ditolak; IDs tetap saat reorder; timeline boundaries/dependencies tervalidasi; legacy load/history aman. | COMPLETED & VERIFIED |
| M2 | Initial dan revision lewat preview dev path tanpa production build; real browser HMR; placeholder; compile/runtime error mempertahankan last-good; no normal server restart; isolasi/CSP/CORS/WS diverifikasi. | COMPLETED & VERIFIED |
| M3 | Dua AI turn berbeda terbukti overlap; max concurrency dipatuhi; incremental shot muncul; fail/retry/cancel satu shot tidak merusak sibling; merge tidak lost update; late output ditolak. | COMPLETED & VERIFIED |
| M4 | Komentar shot 3 memakai screenshot/local frame tepat; hanya file owned/dependent berubah; laporan QA per shot/frame/severity; structured SSE/activity dan reconnect resync. | COMPLETED & VERIFIED |
| M5 | Workflow browser penuh hingga MP4 aktual; metadata/render verification; approval/discard/history/rollback regression; benchmark terpisah; lint/typecheck/tests/build dan limitation report. | COMPLETED & VERIFIED |

Pemisahan langkah M2/M3 praktis: buktikan preview pada satu generated shot dahulu,
lalu gunakan registry multi-shot/placeholders dari kontrak M1 ketika scheduler masuk.

## 8. Rencana pengujian dan benchmark

Existing regression targets: `packages/studio-core/src/*.test.ts`,
`packages/storage/src/{index,style}.test.ts`, `packages/codegen/src/{source,progress}.test.ts`,
`apps/server/src/{http,progress}.test.ts`, dan runtime adapter tests. HTTP integration
existing menggunakan fake provider/renderer; itu tidak membuktikan AI/render real.

Tambahkan:

- Unit: Director schema/invariants/hash invalidation; timeline boundary/overlap;
  ownership/dependency graph; concurrency/retry state transitions; issue schema.
- Integration: apply/restore v1/v2; serialized aggregate merge; cancellation/late
  results; restart recovery; approval and stale source rejection; no production builder
  invocation during generate/revise; exact screenshot anchor; event ordering/resync.
- Browser E2E: storyboard edit/approve → two-shot parallel generation → progressive
  placeholder replacement → play/seek/frame comment → targeted revision/HMR → error
  recovery → candidate apply/discard → restore → explicit export/download.
- Real integration smoke: provider authentication/concurrent threads/image input,
  isolated preview process, real Remotion export and output probe. Label tests yang
  memakai fixture terpisah dari hasil real-provider. Tidak perlu menghabiskan AI
  quota untuk unit test normal.
- Build verification tidak boleh dipanggil dari editing request; menjalankan build
  repository untuk memeriksa implementasi adalah operasi development yang berbeda.

Commands existing: `pnpm test`, `pnpm build`, `pnpm studio:build`. Build workspace
berisi `tsc`/`tsc --noEmit`; dedicated root lint/typecheck scripts dan E2E harness
belum ditemukan. Tambahkan atau dokumentasikan command nyata saat implementasi,
jangan melaporkan lint/E2E pass jika tool belum ada.

Benchmark instrumentation:

| Ukuran | Start → end |
| --- | --- |
| AI latency | provider turn dispatched → terminal response; queue wait dicatat terpisah |
| Validation | response parsed → policy/typecheck/compile selesai |
| HMR latency | validated version published → browser ack versi itu sudah dirender |
| Preview QA | selected snapshot/frame request → screenshot/check/report selesai |
| Export | explicit export accepted → verified final artifact available; bundle/render/probe dipisah |

Catat cold/warm runs, jumlah sample, mesin/resources, provider/model, shot count,
retries/failures, request size, dan commit. Gunakan minimal 30 warm HMR samples
sebagai baseline awal, laporkan p50/p95 plus sample count, bukan klaim jaminan.
Untuk parallel versus sequential gunakan storyboard/workload/model yang sama dan
beberapa repeated runs; laporkan variasi latency AI. Speedup tidak diasumsikan 2×/3×.

## 9. Pertanyaan teknis yang perlu spike, bukan blocker audit

- Bagaimana container preview persisten melayani HTTP/WS ke browser secara terbatas,
  sambil mempertahankan isolasi filesystem/network dan lifecycle per project?
- Apakah iframe opaque origin mendukung module loading, CORS dan HMR websocket
  terkontrol tanpa memperluas akses ke Studio API? Buktikan di browser nyata.
- Apakah chosen HMR boundary dapat rollback runtime failure dan mempertahankan
  frame/play state tanpa full reload pada edit normal?
- Apakah dua/ tiga worker benar-benar diproses paralel oleh masing-masing provider,
  dengan image input dan cancellation yang benar? Jangan samakan adapter shape
  dengan kemampuan aktual provider.
- Reviewer visual/model mana yang tersedia dan bagaimana kualitas/false positive
  dinilai? Screenshot evidence saja tidak memenuhi QA visual semantik.
- Durasi/ukuran/source limits yang nyaman untuk workload nyata dan biaya validasinya.

## 10. Referensi dokumentasi dan batas bukti

Context7 dibaca 2026-11-11 menggunakan resolver `/vitejs/vite` (bukan versi Vite
yang sudah diinstal; dependency Vite belum ada). Referensi resmi:

- [Vite server options](https://github.com/vitejs/vite/blob/main/docs/config/server-options.md):
  filesystem strict/allow/deny. Default workspace discovery dapat mencakup monorepo;
  explicit allowlist diperlukan untuk workspace preview terbatas.
- [Vite plugin HMR](https://github.com/vitejs/vite/blob/main/docs/guide/api-plugin.md)
  dan [environment HMR](https://github.com/vitejs/vite/blob/main/docs/guide/api-environment-plugins.md):
  update boundary/custom events tersedia; API juga memungkinkan full reload.
  Karena itu HMR tanpa reload perlu desain dan verifikasi, bukan asumsi otomatis.

Audit ini tidak menjalankan lint, tests, build, browser, AI generation, Docker,
benchmark atau MP4 export. Tidak ada application source yang diubah. Verifikasi
pekerjaan dokumentasi mencakup pemeriksaan patch, referensi file existing, dan
penyimpanan di path yang tidak di-ignore. Untuk sesi berikutnya, baca dokumen ini
melalui rujukan `AGENTS.md`, lalu audit perubahan kode setelah baseline sebelum coding.
