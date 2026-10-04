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

Respons sukses `201` mengembalikan detail laporan. Nomor laporan dibuat backend dengan format `RPT-0000000001`. Upload foto adalah langkah terpisah setelah laporan tercipta melalui BE-11. Kirim URL file lewat alur upload yang disediakan; jangan mengirimnya pada body create. Detail laporan memuat foto ber-tujuan `DAMAGE_PHOTO` yang sudah tersimpan.

## Daftar dan detail

`GET /api/reports` mendukung pagination:

| Query      | Default | Batas                              |
| ---------- | ------- | ---------------------------------- |
| `page`     | `1`     | integer positif dengan offset aman |
| `pageSize` | `20`    | `1` sampai `100`                   |

Respons berbentuk `{ "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 } }`. Urutan adalah `reportedAt` terbaru, lalu ID terbaru. Halaman di luar hasil mengembalikan `data: []`. Query yang tidak dikenal, berulang, atau invalid ditolak dengan `400 VALIDATION_ERROR`.

Admin melihat semua laporan properti Phase 1, Resident melihat laporan unit yang ditempatinya saat ini, dan Technician melihat laporan yang ditugaskan kepadanya. Pencarian dan filter ditambahkan pada BE-14.

`GET /api/reports/:id` menggunakan cakupan yang sama. Laporan yang tidak ditemukan dan laporan di luar cakupan sama-sama menghasilkan `404 NOT_FOUND`. Detail memuat unit, deskripsi, status/prioritas, foto, dan assignment beserta estimasi bila tersedia. Respons Admin turut memuat identitas pembuat/pelapor/reviewer/closer dan pemberi assignment. Respons Resident dan Technician tidak memuat identitas audit tersebut atau pemberi assignment.

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

Sukses mengembalikan `200` dengan status `ASSIGNED` dan detail assignment (`technician`, `assignedBy`, `assignedAt`, `estimatedArrivalAt`, `note`). Estimasi awal bernilai `null`. Catatan assignment ditampilkan untuk semua aktor yang berhak melihat detail laporan; identitas `assignedBy` hanya tersedia pada respons Admin. Teknisi yang ditugaskan dapat membaca laporan pada daftar dan detail. Teknisi lain mendapat `404`.

Laporan yang hilang/di luar properti dan akun Teknisi yang tidak ditemukan menghasilkan `404 NOT_FOUND`. Akun nonaktif atau bukan Teknisi, laporan yang belum `VERIFIED`, dan laporan yang sudah memiliki assignment menghasilkan `409 CONFLICT`. Request assignment berulang juga menghasilkan konflik; ambil ulang detail laporan untuk melihat keadaan terbaru.

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
