<div align="center">

# 🌌 ChronoStar X — Cyber Security Suite v5.0

**Web-based Cyber Security Suite, Utility Tools, and Member Management Platform**

[fitur] • [dokumentasi] • [supabase]

</div>

---

## 🚀 Tentang Proyek

**ChronoStar X** adalah platform berbasis web modern yang menggabungkan kumpulan *tools* keamanan siber (defensive & educational), utilitas pengembang, enkripsi data lokal, serta sistem manajemen profil berbasis **Supabase**[span_0](start_span)[span_0](end_span)[span_1](start_span)[span_1](end_span)[span_2](start_span)[span_2](end_span). Dirancang dengan estetika *cyberpunk/dark mode* yang elegan, responsif, dan ramah pengguna seluler maupun desktop.

---

## ✨ Fitur Utama

### 🛡️ 1. Modul Keamanan & Enkripsi
* **Analisis & Generator Password**: Cek tingkat kekuatan password secara *real-time* dan buat password acak yang aman[span_3](start_span)[span_3](end_span).
* **Pengecek Kebocoran (HIBP)**: Validasi keamanan password menggunakan protokol privasi *k-anonymity*[span_4](start_span)[span_4](end_span).
* **Enkripsi AES-256 (GCM)**: Amankan catatan dan teks privat langsung di browser dengan kunci sandi pribadi[span_5](start_span)[span_5](end_span).
* **Generator & Verifikator Hash**: Mendukung SHA-1, SHA-256, SHA-384, SHA-512, HMAC, hingga *File Hash* lokal[span_6](start_span)[span_6](end_span).

### 🔍 2. Analisis Web & Jaringan
* **Pemindai Pola Injeksi**: Deteksi pola teks mencurigakan untuk validasi formulir (SQLi & XSS Detector)[span_7](start_span)[span_7](end_span).
* **Analisis URL & Status Situs**: Pemeriksaan pola domain phishing dan status respons website (*best-effort*)[span_8](start_span)[span_8](end_span).
* **Monitor Jaringan**: Pengecekan latensi (*ping* real-time) dan informasi koneksi perangkat[span_9](start_span)[span_9](end_span).

### 🛠️ 3. Utilitas Dev & Enkoding
* **Konverter & Enkoder**: Base64, URL Encode, HTML Entity, Teks ke Biner/Hex/Morse, serta Case Converter[span_10](start_span)[span_10](end_span).
* **Alat Pengembang**: JSON Formatter, Regex Tester, Text Diff Checker, UUID Generator, hingga Markdown Previewer[span_11](start_span)[span_11](end_span).
* **QR Code Suite**: Pembuatan QR Code instan dan pemindai (*scanner*) QR menggunakan kamera perangkat[span_12](start_span)[span_12](end_span).

### 👤 4. Sistem Pengguna & CMS (Supabase)
* **Autentikasi & Profil**: Sistem Masuk/Daftar aman yang terhubung dengan Supabase Auth[span_13](start_span)[span_13](end_span).
* **Bio Links & Log Aktivitas**: Personalisasi tautan profil dan pencatatan riwayat aktivitas pengguna secara transparan[span_14](start_span)[span_14](end_span).
* **Panel Admin / Owner**: Fitur manajemen siaran Berita & Informasi (*CMS*) serta pemantauan log global secara *real-time*[span_15](start_span)[span_15](end_span).

---

## 🛠️ Tumpukan Teknologi (Tech Stack)

* **Frontend**: HTML5, CSS3 (Custom Properties / Variables), JavaScript (ES6+)
* **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, Realtime Presence, RLS)
* **Pustaka Pendukung**: 
  * `@supabase/supabase-js`[span_16](start_span)[span_16](end_span)
  * `qrcode.js` & `jsQR`[span_17](start_span)[span_17](end_span)

---

## 📦 Struktur Proyek

```text
├── index.html       # Kerangka antarmuka utama, navigasi, modal, & halaman auth
├── tools.js         # Logika seluruh modul tools keamanan & utilitas (30+ fitur)
└── app.js           # Core sistem: Supabase Auth, CMS berita, aktivitas, & presence
