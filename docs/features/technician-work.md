# Tugas Teknisi

Semua endpoint memerlukan session cookie `__Host-sid`; kirim request browser dengan `credentials: 'include'`. Daftar tugas menggunakan `GET /api/reports` dan hanya menampilkan laporan yang ditugaskan kepada Teknisi yang sedang login. Pagination, urutan, dan bentuk respons dijelaskan dalam [panduan laporan](reports.md).

## Mulai pekerjaan

Teknisi yang ditugaskan mengisi estimasi tanggal dan waktu kedatangan/pengerjaan saat memulai pekerjaan:

```http
POST /api/reports/{id}/start
Content-Type: application/json
```

```json
{
  "estimatedArrivalAt": "2026-10-04T14:30:00+07:00"
}
```

`estimatedArrivalAt` wajib berupa timestamp ISO 8601 lengkap dengan zona waktu, baik `Z` maupun offset seperti `+07:00`. Timestamp disimpan sebagai waktu UTC dan respons detail menampilkannya dalam UTC. Waktu lampau diperbolehkan. Field tambahan ditolak.

Sukses mengembalikan `200` dan detail laporan terbaru dengan status `IN_PROGRESS`. Nilai estimasi tersimpan pada assignment dan tampil di `assignment.estimatedArrivalAt` bagi setiap aktor yang berhak membaca laporan.

Hanya Teknisi yang ditugaskan pada laporan berstatus `ASSIGNED` dapat memulai pekerjaan. Status lain dan request mulai berulang menghasilkan `409 CONFLICT`; request tersebut tidak mengubah estimasi. Laporan hilang, di luar properti Phase 1, atau ditugaskan kepada Teknisi lain menghasilkan `404 NOT_FOUND`. Admin/Resident mendapat `403 FORBIDDEN`, sesi hilang mendapat `401 UNAUTHORIZED`, dan body/timestamp invalid mendapat `400 VALIDATION_ERROR`.

Contoh browser:

```ts
const response = await fetch(`/api/reports/${reportId}/start`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    estimatedArrivalAt: new Date(estimateInput).toISOString(),
  }),
});

if (!response.ok) throw await response.json();
const report = await response.json();
// report.status === 'IN_PROGRESS'
// report.assignment.estimatedArrivalAt berisi timestamp UTC.
```

## Menyimpan hasil dan biaya

Teknisi yang ditugaskan dapat menyimpan atau mengganti hasil saat laporan berstatus `IN_PROGRESS`:

```http
PUT /api/reports/{id}/result
Content-Type: application/json
```

```json
{
  "inspectionResult": "Pipa diperiksa dan ditemukan bocor.",
  "problemFound": "Sambungan pipa longgar.",
  "repairAction": "Sambungan dikencangkan dan seal diganti.",
  "additionalNotes": null
}
```

Hasil pemeriksaan, masalah yang ditemukan, dan tindakan perbaikan wajib berisi teks. Catatan tambahan opsional; `null`, teks kosong, atau field yang tidak dikirim disimpan sebagai `null`. Hasil tunggal dapat diperbarui dengan mengirim PUT lagi.

Daftar biaya dapat diganti seluruhnya. Array kosong menghapus seluruh baris biaya:

```http
PUT /api/reports/{id}/cost-items
Content-Type: application/json
```

```json
{
  "items": [
    {
      "type": "SERVICE",
      "description": "Jasa teknisi",
      "quantity": "1.500",
      "unitPrice": "125000.00"
    },
    {
      "type": "MATERIAL",
      "description": "Seal pipa",
      "quantity": "2",
      "unitPrice": "15000.00"
    }
  ]
}
```

`type` adalah `SERVICE` atau `MATERIAL`. `quantity` menerima maksimum 9 digit integer dan 3 digit pecahan, harus lebih besar dari nol. `unitPrice` menerima maksimum 12 digit integer dan 2 digit pecahan, serta tidak boleh negatif. Kedua nilai harus berupa string desimal biasa tanpa eksponen. Backend menghitung subtotal dan total; klien tidak mengirim nilai tersebut. Nilai uang pada respons adalah string dua desimal. Total dihitung dari perkalian presisi penuh, sehingga dapat berbeda satu sen dari jumlah subtotal item yang masing-masing telah dibulatkan.

## Upload bukti dan submit completion

Simpan hasil dan biaya, unggah foto hasil bila diperlukan, lalu unggah tepat satu nota dengan endpoint BE-11 `PUT /api/reports/{id}/receipt` (multipart field `file`, gambar atau PDF maksimal 5 MiB). Nota wajib meski tidak ada baris biaya. Foto hasil opsional diunggah melalui `POST /api/reports/{id}/repair-photos`.

Setelah ketiganya siap, submit:

```http
POST /api/reports/{id}/complete
```

Request body boleh kosong atau `{}`. Sukses mengembalikan `200` dan detail laporan terbaru berstatus `COMPLETED`. Hasil, biaya, attachment nota, dan status diperiksa/diperbarui secara konsisten di database. Jika hasil atau nota belum tersedia, atau status sudah berubah, API mengembalikan `409 CONFLICT`; laporan tetap `IN_PROGRESS` dan teknisi dapat melengkapi data lalu mencoba kembali. Submit ulang setelah `COMPLETED` juga menghasilkan `409`.

Setelah memeriksa pekerjaan, Admin menutup laporan `COMPLETED` melalui `POST /api/reports/{id}/close`. Status `CLOSED` menjadi akhir alur Phase 1 dan laporan muncul pada riwayat unit. Lihat [panduan riwayat dan dashboard](dashboard-history.md).

Semua perubahan hanya diizinkan untuk Teknisi pemilik assignment dan laporan `IN_PROGRESS`. Role lain menerima `403`, laporan/assignment di luar cakupan menerima `404`, serta body invalid menerima `400 VALIDATION_ERROR`. Detail laporan menampilkan hasil dan total biaya bagi Resident yang berhak mengaksesnya; rincian biaya hanya terlihat oleh Admin dan Teknisi. Nota disembunyikan dari Resident.

Contoh request browser menggunakan cookie sesi:

```ts
const response = await fetch(`/api/reports/${reportId}/complete`, {
  method: 'POST',
  credentials: 'include',
});
if (!response.ok) throw await response.json();
const completedReport = await response.json();
```
