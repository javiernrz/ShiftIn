# ShiftIn — panduan untuk Claude

Sistem absensi karyawan (selfie + GPS + geofence, lembur, izin/cuti, rekap, export Excel).
Bahasa antarmuka: **Bahasa Indonesia**. Pemilik proyek bukan programmer senior: jelaskan perubahan dengan sederhana.

## Struktur
- `server.js` — backend Node.js murni (>= 22.13), tanpa dependensi, SQLite bawaan (`node:sqlite`).
- `public/index.html` — seluruh frontend (vanilla JS, satu file). `public/sw.js` + `manifest.webmanifest` = PWA.
- `data/` — database + foto (TIDAK di-commit). `reset-admin.js` — reset password admin.

## Menjalankan & menguji
```
DATA_DIR=/tmp/uji PORT=3055 ADMIN_PASS=Test12345 node server.js
```
Uji dengan curl: login, buat akun, absen, cek akses lintas karyawan harus 403. Cek sintaks: `node --check server.js`.

## Aturan yang JANGAN dilanggar
1. Jangan melemahkan validasi di server: waktu absen dari server, absen hanya hari ini, geofence dicek server,
   absen tidak bisa diubah setelah tercatat, karyawan hanya akses datanya sendiri (fungsi `can()`).
2. Jangan pernah commit `.env`, folder `data/`, password, atau API key.
3. Jangan tambah dependensi npm kecuali benar-benar perlu; tanyakan dulu.
4. Semua teks dari pengguna harus di-escape (`esc()`) sebelum masuk innerHTML.
5. Foto & data karyawan = data pribadi (UU PDP): jangan buat endpoint yang membukanya ke publik.
6. Perubahan besar: buat pull request, jangan langsung ke branch utama. Jelaskan apa yang diuji dan apa yang belum.
