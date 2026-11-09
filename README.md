# MotionLab

Engine video explainer berbasis ilustrasi berlapis, dengan dukungan scene Three.js. Default output: **1080×1920, 9:16, 60 FPS** untuk konten HP.

Panduan untuk pengguna:

- [Workflow: fungsi dan cara pakai](docs/WORKFLOW.md)
- [Peta kode: bagian yang perlu diedit](docs/BACA-KODE.md)

Panduan agent ada di [skill MotionLab](skills/motionlab/SKILL.md), lengkap dengan referensi internalnya.

Mulai dengan `npm ci`. Gunakan `npm run studio` untuk preview interaktif atau `npm run preview:report` untuk review PNG. Jalankan `npm run check` setelah perubahan. Ekspor MP4 terpisah lewat `npm run render` ketika siap.

Frame preview, laporan QA dan ekspor berada di `out/` yang diabaikan Git. Arsip dokumentasi/QA lokal sebelumnya berada di `out/archive/`.
