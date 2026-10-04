# Riwayat maintenance dan dashboard Admin

Semua endpoint memerlukan session cookie `__Host-sid`. Browser harus mengirim request dengan `credentials: 'include'`.

## Menutup pekerjaan

Admin dapat menutup laporan `COMPLETED` setelah memeriksa hasil, biaya, dan nota:

```http
POST /api/reports/{id}/close
```

Body boleh kosong atau `{}`. Sukses mengembalikan `200` dan detail laporan dengan status `CLOSED`, `closedAt`, serta `closedBy`. Penutupan menyimpan aktor Admin dan waktu server secara atomik. Laporan harus memiliki hasil kerja dan nota. Status selain `COMPLETED`, termasuk penutupan ulang, menghasilkan `409 CONFLICT`; laporan tidak ditemukan atau di luar properti Phase 1 menghasilkan `404 NOT_FOUND`. Hanya Admin yang boleh menutup.

## Membaca riwayat unit

Admin dapat melihat riwayat unit properti Phase 1, termasuk unit arsip. Resident hanya dapat melihat riwayat unit non-arsip yang saat ini terhubung dengan akunnya. Teknisi tidak memiliki akses. Unit yang tidak ditemukan atau tidak dapat diakses menghasilkan `404 NOT_FOUND`.

```http
GET /api/units/{unitId}/history?page=1&pageSize=20
```

Pagination mengikuti endpoint laporan: `page` default `1`, `pageSize` default `20` dengan batas maksimum `100`. Hasil hanya berisi laporan `CLOSED`, urut `closedAt` terbaru lalu ID terbaru. Halaman kosong mengembalikan `data: []` dan metadata total.

Setiap item berisi `id`, `reportNumber`, `title`, `category`, `reportedAt`, `closedAt`, `technician`, `maintenanceResult`, `totalCost`, dan `status`. Teknisi atau hasil bernilai `null` bila data terkait tidak tersedia. Contoh:

```json
{
  "data": [
    {
      "id": "55000000-0000-4000-8000-000000000001",
      "reportNumber": "RPT-0000000001",
      "title": "Sambungan pipa bocor",
      "category": "PLUMBING",
      "reportedAt": "2026-10-01T02:00:00.000Z",
      "closedAt": "2026-10-03T08:00:00.000Z",
      "technician": {
        "id": "33000000-0000-4000-8000-000000000002",
        "name": "Teknisi"
      },
      "maintenanceResult": {
        "id": "66000000-0000-4000-8000-000000000001",
        "inspectionResult": "Pipa diperiksa",
        "problemFound": "Seal aus",
        "repairAction": "Seal diganti",
        "additionalNotes": null,
        "createdAt": "2026-10-03T07:00:00.000Z",
        "updatedAt": "2026-10-03T07:00:00.000Z"
      },
      "totalCost": "125000.00",
      "status": "CLOSED"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

Riwayat menyembunyikan identitas pembuat/pelapor, catatan internal Admin, nota, dan rincian biaya. `totalCost` adalah jumlah presisi penuh biaya laporan yang dibulatkan dua desimal.

## Ringkasan dashboard

Hanya Admin dapat membaca:

```http
GET /api/dashboard/summary
```

Respons berisi `totalUnits`, `totalReports`, `activeReports`, `inProgressReports`, `closedReportsThisMonth`, dan `totalClosedCost`. `activeReports` mengecualikan status `CLOSED` dan `REJECTED`. `totalUnits` mengecualikan unit arsip; metrik laporan dan biaya tetap menghitung laporan pada unit arsip. Biaya adalah penjumlahan total per laporan `CLOSED`, masing-masing dibulatkan dua desimal, dan dikirim sebagai string dua desimal. Data kosong bernilai nol.

`closedReportsThisMonth` memakai waktu `closedAt` dalam bulan kalender `Asia/Jakarta`, dari awal bulan inklusif sampai awal bulan berikutnya eksklusif. Timestamp API tetap dalam UTC.

```json
{
  "totalUnits": 18,
  "totalReports": 42,
  "activeReports": 7,
  "inProgressReports": 3,
  "closedReportsThisMonth": 5,
  "totalClosedCost": "12500000.50"
}
```

Gunakan `401 UNAUTHORIZED` untuk sesi tidak valid dan `403 FORBIDDEN` untuk role yang tidak diizinkan. Body/query atau UUID invalid menghasilkan `400 VALIDATION_ERROR`.
