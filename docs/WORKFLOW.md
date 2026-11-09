# Workflow MotionLab

MotionLab dipakai untuk membuat video explainer dari ilustrasi berlapis. Agent menulis cerita, menggambar aset yang diperlukan, dan mengatur gerakan. Engine memvalidasi data lalu menampilkan hasilnya lewat Remotion.

Default video adalah **portrait 1080×1920, 9:16, 60 FPS**, untuk konten HP seperti TikTok, Shorts dan Reels. Durasi bisa diatur; contoh kopi berdurasi 15 detik. Square dan landscape tersedia sebagai pilihan.

## Alur membuat video

1. **Kasih brief.** Tentukan topik, audiens, bahasa, durasi dan gaya. Agent menyusun script dan storyboard: apa yang dijelaskan serta apa yang terlihat di setiap shot.
2. **Buat ilustrasi.** Agent memakai aset yang sudah ada atau menggambar SVG baru. Bagian yang bergerak sendiri dibuat sebagai layer terpisah, misalnya jarum mesin, cairan dan uap.
3. **Atur urutan aksi.** Cue menghubungkan kejadian: basket terkunci → tekanan mulai → kopi mengalir. Mengubah waktu aksi awal bisa menggeser aksi berikutnya.
4. **Lihat preview.** Studio bisa dipakai untuk scrub/playback. Report PNG bisa dipakai untuk memeriksa frame, contact sheet dan perbandingan sebelum/sesudah tanpa menyalakan Studio.
5. **Revisi dan cek.** Periksa bentuk objek, teks, timing, kamera dan area aman HP. Jalankan pemeriksaan kode. Render berhasil saja belum membuktikan tampilannya bagus.
6. **Ekspor saat siap.** Setelah preview disetujui, minta MP4 secara eksplisit. Preview tidak otomatis mengekspor video atau mempublikasikannya.

Contoh brief untuk agent:

```text
Pakai skill MotionLab di skills/motionlab/SKILL.md.
Buat explainer 20 detik tentang cara kerja panel surya, bahasa Indonesia,
untuk pemula. Pakai ilustrasi berlapis dan default ukuran konten HP.
Kerjakan preview dulu, periksa frame dan jalankan npm run check.
Jangan render MP4 sebelum gue minta.
```

## Perintah yang dipakai

Gunakan Node 22 seperti konfigurasi CI, lalu `npm ci` untuk memasang dependency.

| Perintah                 | Fungsinya                                                       |
| ------------------------ | --------------------------------------------------------------- |
| `npm run studio`         | Membuka preview interaktif; jalankan kalau ingin memakai Studio |
| `npm run preview:report` | Membuat frame PNG, contact sheet, HTML review dan manifest      |
| `npm run preview:assets` | Memeriksa aset, palet, bounds dan layer                         |
| `npm run check`          | Memeriksa lint, format, TypeScript dan tes engine               |
| `npm run lint:fix`       | Menerapkan perbaikan lint yang tersedia                         |
| `npm run format`         | Merapikan format kode dan dokumen                               |
| `npm run render`         | Mengekspor MP4 saat memang sudah ingin ekspor                   |

Untuk membandingkan revisi, pakai `npm run preview:report -- --baseline out/preview/<run-sebelumnya>`. Tambahkan `--variants` jika ingin memeriksa square/landscape juga. Pakai `--only MotionLab` untuk membatasi preview ke film utama.

## Hasilnya disimpan di mana?

- `src/`: source video dan engine.
- `public/`: file media eksternal jika diperlukan.
- `out/preview/index.html`: pintu masuk report terbaru dari perintah preview default.
- `out/`: PNG, report, catatan QA dan hasil ekspor. Folder ini diabaikan Git.

Galeri aset membantu mengecek gambar sebelum dipakai dalam shot. Contact sheet memperlihatkan beberapa titik waktu sekaligus. Slider before/after membantu membandingkan revisi yang punya frame pasangan.

## Yang perlu dipahami

Ini belum sistem satu prompt yang menjamin video bagus tanpa revisi. Ilustrasi baru dan koreografi tetap perlu diarahkan. Contoh kopi sekarang tanpa suara; teks narasi belum otomatis menjadi voiceover. Ruang aman HP adalah panduan komposisi internal, jadi tampilan akhir tetap perlu dicek dengan overlay aplikasi tujuan.

Untuk mengedit sendiri, lanjut ke [panduan baca kode](BACA-KODE.md). Instruksi operasional agent disimpan terpisah di `skills/motionlab/SKILL.md` dan `references/` milik skill; dua file di folder ini adalah panduan untuk kamu.
