# Laporan kerusakan

Semua route laporan memerlukan session cookie `__Host-sid`. Frontend harus mengirim request browser dengan `credentials: 'include'`. Aktor diambil dari sesi backend; body tidak boleh mengirim status atau identitas pelapor.

## Membuat laporan

`POST /api/reports` menerima body berikut:

```json
{
  "unitId": "11000000-0000-4000-8000-000000000001",
  "title": "AC tidak dingin",
  "description": "AC menyala tetapi tidak mengeluarkan udara dingin.",
  "category": "AC",
  "priority": "MEDIUM"
}
```

Kategori: `AC`, `ELECTRICAL`, `PLUMBING`, `FURNITURE`, `BUILDING`, `OTHER`. Prioritas: `LOW`, `MEDIUM`, `HIGH`. Judul dipangkas dan maksimal 160 karakter; deskripsi serta judul wajib berisi teks. Field tambahan ditolak.

Resident hanya dapat memilih unit non-arsip yang sedang ditempatinya. Status awal menjadi `REPORTED`, prioritas disimpan sebagai `proposedPriority`, sedangkan `finalPriority` bernilai `null`. Admin dapat memilih unit non-arsip di properti yang dikonfigurasi, termasuk unit kosong; status awal menjadi `VERIFIED` dan prioritas menjadi `finalPriority`. Technician menerima `403`.

Respons sukses `201` mengembalikan detail laporan. Nomor laporan dibuat backend dengan format `RPT-0000000001`. Foto diunggah setelah laporan tercipta menggunakan `POST /api/reports/:id/damage-photos` dengan `multipart/form-data` berisi field `file`. Backend menyimpan URL UploadThing dan relasinya sebelum mengembalikan `{ id, fileUrl, createdAt }`. Jangan mengirim URL file lewat body create.

Client dapat menampilkan URL yang tersimpan dengan `<img src={photo.fileUrl} alt="Foto laporan" />`. Detail laporan mengembalikan `damagePhotos`, `repairPhotos`, dan `receipt`; nota berisi URL hanya untuk Admin dan Teknisi pemilik assignment.

```ts
const form = new FormData();
form.append('file', imageFile);
const response = await fetch(`/api/reports/${reportId}/damage-photos`, {
  method: 'POST',
  credentials: 'include',
  body: form,
});
if (!response.ok) throw await response.json();
const attachment: { id: string; fileUrl: string; createdAt: string } =
  await response.json();
```

Gunakan proxy `/api` menuju backend saat menjalankan Vite dan reverse proxy origin yang sama saat deployment. Backend menerima satu file JPEG/PNG/WebP maksimal 5 MiB; Teknisi juga dapat mengunggah PDF sebagai nota. Batas foto adalah lima untuk setiap tujuan per laporan. Upload foto hasil dan nota tersedia pada laporan `IN_PROGRESS` bagi Teknisi pemilik assignment.

## Daftar dan detail

`GET /api/reports` mendukung pagination:

| Query      | Default | Batas                              |
| ---------- | ------- | ---------------------------------- |
| `page`     | `1`     | integer positif dengan offset aman |
| `pageSize` | `20`    | `1` sampai `100`                   |

Respons berbentuk `{ "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 } }`. Urutan default (`sort=latest` atau tanpa parameter) adalah `reportedAt` terbaru, lalu ID terbaru. Halaman di luar hasil mengembalikan `data: []`. Query yang tidak dikenal, berulang, atau invalid ditolak dengan `400 VALIDATION_ERROR`.

Pencarian dan filter dapat digabungkan pada himpunan laporan yang boleh dilihat aktor:

| Query         | Perilaku                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`           | Potongan nomor laporan atau judul, case-insensitive; trim spasi tepi, maksimum 160 karakter. Kosong berarti tidak mencari.                                                                  |
| `status`      | Satu status laporan yang valid.                                                                                                                                                             |
| `ongoingOnly` | Opsional, tepat `true`/`false`. `true` mencakup `REPORTED`, `VERIFIED`, `ASSIGNED`, `IN_PROGRESS`, dan `COMPLETED`; default/tanpa parameter atau `false` tidak membatasi status.            |
| `historyOnly` | Opsional, tepat `true`/`false`. `true` mencakup `CLOSED` dan `REJECTED`; default/tanpa parameter atau `false` tidak membatasi status.                                                       |
| `category`    | Satu kategori laporan yang valid.                                                                                                                                                           |
| `priority`    | `LOW`, `MEDIUM`, atau `HIGH`; memakai prioritas final, atau prioritas usulan selama laporan belum ditinjau.                                                                                 |
| `sort`        | Opsional `latest` (default) atau `priority`. Priority mengurutkan prioritas efektif HIGH → MEDIUM → LOW → tanpa prioritas, lalu `reportedAt` terlama dan ID ascending sebagai pemecah seri. |
| `dateFrom`    | Tanggal `YYYY-MM-DD` inklusif berdasarkan `reportedAt` dalam kalender `Asia/Jakarta`.                                                                                                       |
| `dateTo`      | Tanggal `YYYY-MM-DD` inklusif berdasarkan `reportedAt` dalam kalender `Asia/Jakarta`.                                                                                                       |

Sorting berlaku pada seluruh hasil yang cocok setelah pembatasan akses/filter dan sebelum pagination, bukan hanya isi halaman. Prioritas efektif memakai `finalPriority` bila tersedia, selain itu `proposedPriority`. Sorting tidak mengubah `meta.total` atau visibilitas per role.

Filter berlaku dengan AND sebelum count/pagination; `ongoingOnly=true&historyOnly=true` atau `ongoingOnly=true&status=CLOSED` menghasilkan daftar kosong. Pencarian memperlakukan `%`, `_`, dan `\\` secara literal. Batas tanggal boleh dikirim sendiri; jika lengkap, `dateFrom` tidak boleh melewati `dateTo`.

Resident memakai `ongoingOnly=true` untuk Ongoing dan `historyOnly=true` untuk History (`pageSize=10`). Keduanya mencakup laporan unit aktif saat ini, termasuk pembuat lain; bukan riwayat pribadi lintas unit. Homepage mengambil halaman pertama Ongoing.

Contoh pencarian dan filter gabungan:

```http
GET /api/reports?q=AC%20tidak%20dingin&status=IN_PROGRESS&category=AC&priority=HIGH&dateFrom=2026-10-01&dateTo=2026-10-04&page=1&pageSize=20
```

Admin melihat semua laporan properti Phase 1, Resident melihat laporan unit yang ditempatinya saat ini, dan Technician melihat laporan yang ditugaskan kepadanya. Pencarian dan filter tidak memperluas cakupan ini; `meta.total` hanya menghitung hasil yang bisa diakses dan cocok dengan filter.

`GET /api/reports/:id` menggunakan cakupan yang sama. Laporan yang tidak ditemukan dan laporan di luar cakupan sama-sama menghasilkan `404 NOT_FOUND`. Detail memuat unit, deskripsi, status/prioritas, foto, dan assignment beserta estimasi bila tersedia. Respons Admin turut memuat identitas pembuat/pelapor/reviewer/closer dan pemberi assignment. Respons Resident dan Technician tidak memuat identitas audit tersebut atau pemberi assignment.

Detail juga memuat `maintenanceResult` (atau `null`) dan `totalCost` sebagai string dua desimal. Admin dan Teknisi melihat `costItems`; Resident tidak menerima rincian biaya. Resident tetap dapat melihat hasil pekerjaan dan total pada laporan yang dapat diaksesnya. Nota tetap disembunyikan dari Resident. `totalCost` adalah penjumlahan langsung `price` setiap baris menggunakan PostgreSQL NUMERIC, sehingga sama dengan jumlah harga item yang ditampilkan.

Baris biaya berisi `id`, `type` (`SERVICE` atau `MATERIAL`), `description`, `price`, `createdAt`, dan `updatedAt`. Harga merupakan jumlah penuh per item dan dikembalikan sebagai string dua desimal agar presisi PostgreSQL tidak hilang pada JavaScript. Tidak ada quantity, unitPrice atau subtotal.

## Review laporan oleh Admin

Hanya Admin dapat mengambil keputusan atas laporan `REPORTED`. Setiap operasi mengembalikan `200` dan detail laporan terbaru. Bila laporan tidak lagi `REPORTED`, server mengembalikan `409 CONFLICT`; `message` menyebutkan status saat ini. Ambil ulang detail dengan `GET /api/reports/:id` sebelum menentukan tindakan berikutnya. Laporan yang dibuat Admin sudah `VERIFIED` dan tidak dapat direview.

Verifikasi menetapkan prioritas final dan menerima catatan internal opsional:

```http
POST /api/reports/{id}/verify
Content-Type: application/json
```

```json
{
  "finalPriority": "HIGH",
  "reviewNote": "Foto menunjukkan kerusakan yang perlu segera ditangani."
}
```

Penolakan juga wajib menetapkan prioritas final dan alasan yang akan terlihat oleh pelapor:

```http
POST /api/reports/{id}/reject
Content-Type: application/json
```

```json
{
  "finalPriority": "LOW",
  "rejectionReason": "Laporan ini duplikat dari RPT-0000000001.",
  "reviewNote": "Diperiksa terhadap laporan unit yang sama."
}
```

`finalPriority` harus berupa `LOW`, `MEDIUM`, atau `HIGH`. `rejectionReason` wajib berisi teks setelah spasi tepi dibuang. `reviewNote` boleh dihilangkan; bila dikirim, isinya juga harus berupa teks non-kosong setelah trimming. Field tambahan seperti `status` dan `reviewedByUserId` ditolak. Respons Admin mencakup `reviewNote` dan `reviewedBy`; Resident dan Technician tidak menerima kedua field tersebut. `rejectionReason` tersedia pada detail laporan sesuai cakupan akses aktor.

## Menugaskan Teknisi

Admin dapat menugaskan satu Teknisi aktif pada laporan `VERIFIED`:

```http
POST /api/reports/{id}/assign
Content-Type: application/json
```

```json
{
  "technicianUserId": "33000000-0000-4000-8000-000000000002",
  "note": "Periksa sambungan pipa di bawah wastafel."
}
```

`technicianUserId` wajib berupa UUID akun dengan role `TECHNICIAN` yang aktif. `note` opsional; bila dikirim, teks dipangkas dan tidak boleh kosong. Field tambahan seperti `status`, `assignedByUserId`, dan `assignedAt` ditolak. Pilihan Teknisi aktif tersedia melalui `GET /api/accounts?role=TECHNICIAN&isActive=true`.

Sukses mengembalikan `200` dengan status `ASSIGNED` dan detail assignment (`technician`, `assignedBy`, `assignedAt`, `estimatedArrivalAt`, `note`). Estimasi awal bernilai `null`. Catatan assignment hanya dikirim ke Admin dan Teknisi yang ditugaskan (Resident menerima note null); identitas `assignedBy` hanya tersedia pada respons Admin. Teknisi yang ditugaskan dapat membaca laporan pada daftar dan detail. Teknisi lain mendapat `404`.

Laporan yang hilang/di luar properti dan akun Teknisi yang tidak ditemukan menghasilkan `404 NOT_FOUND`. Akun nonaktif atau bukan Teknisi, laporan yang belum `VERIFIED`, dan laporan yang sudah memiliki assignment menghasilkan `409 CONFLICT`. Request assignment berulang juga menghasilkan konflik; ambil ulang detail laporan untuk melihat keadaan terbaru.

Teknisi memulai laporan berstatus `ASSIGNED` melalui `POST /api/reports/:id/start` dengan estimasi timestamp ISO 8601 yang menyertakan zona waktu. Aksi ini menyimpan estimasi dan mengubah status menjadi `IN_PROGRESS` secara atomik. Lihat [panduan tugas Teknisi](technician-work.md) untuk format body, otorisasi, dan contoh frontend.

Setelah Teknisi menyelesaikan pekerjaan, Admin menutup laporan melalui `POST /api/reports/:id/close`. Riwayat laporan `CLOSED` dan metrik dashboard Admin dijelaskan di [panduan riwayat dan dashboard](dashboard-history.md).

## Contoh frontend

```ts
const created = await fetch('/api/reports', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    unitId,
    title,
    description,
    category: 'AC',
    priority: 'MEDIUM',
  }),
});

if (!created.ok) {
  // Tangani envelope API bersama; gunakan details.issues untuk error field.
  throw await created.json();
}

const report = await created.json();
// Gunakan report.id untuk langkah upload foto opsional BE-11.
```
