# ShiftIn — Sistem Absensi Karyawan

Login username/password, absen selfie + GPS + geofence, lembur otomatis, izin/cuti dengan persetujuan,
rekap bulanan, export Excel, kelola akun karyawan oleh admin. Tanpa dependensi (hanya Node.js 22.13+).

## 1. Jalankan di komputer
```bash
node server.js          # buka http://localhost:3000
```
Saat pertama jalan, terminal menampilkan **username & password admin**. Atur sendiri lewat
`ADMIN_USER=admin ADMIN_PASS=SandiKuat123 node server.js` (hanya dipakai saat database masih kosong).

## 2. Publish ke internet (VPS + HTTPS otomatis)
1. Sewa VPS Ubuntu (1 vCPU / 1–2 GB cukup), arahkan domain (A record) ke IP VPS.
2. Install Docker, salin folder ini ke VPS.
3. `cp .env.example .env`, isi `DOMAIN`, `ADMIN_USER`, `ADMIN_PASS`.
4. `docker compose up -d --build` — HTTPS Let's Encrypt diurus Caddy otomatis.
5. Buka `https://domain-anda`, login admin, ganti password (ikon kunci).

## 3. Mulai dipakai karyawan
1. Admin → tab **Admin → Pengaturan**: isi jam kerja, toleransi, lalu **Pakai lokasi saya** di kantor + radius.
2. Admin → **Karyawan** → buat akun (username + password awal). Bagikan ke karyawan.
3. Karyawan buka link → login → **Absen**. Di HP: menu browser → **Tambahkan ke layar utama**
   (terpasang seperti aplikasi, ikon ShiftIn, layar penuh).

## 4. Aplikasi Play Store / App Store (opsional)
Sudah berupa PWA. Bungkus dengan PWABuilder.com (Android .aab / iOS) memakai URL HTTPS Anda.

## Penyimpanan data
- Database: `data/shiftin.db` (SQLite: tabel `users` + `docs`).
- Foto: file JPEG `data/uploads/<id-karyawan>/<tanggal>-in|out.jpg` — hanya bisa dibuka pemilik & admin.
- Backup: salin seluruh folder `data/` (Docker: volume `shiftin-data`) tiap hari, mis. cron + `rclone`.
- Hapus foto lama sesuai kebijakan retensi (mis. > 90 hari) — data pribadi, UU PDP No. 27/2022.

## Keamanan yang sudah ada
Password di-hash scrypt; sesi cookie HttpOnly/Secure/SameSite; batas 5x salah login/15 menit;
waktu absen diambil dari **server** (jam HP tidak dipercaya); absen hanya untuk hari ini; geofence dicek server;
absen tidak bisa diubah setelah tercatat; karyawan hanya melihat datanya sendiri; CSP & header keamanan.

## Catatan
Skala nyaman untuk ratusan karyawan pada satu server. Untuk ribuan, pindahkan database ke PostgreSQL dan foto ke S3/R2.
