# Pengelolaan Unit

Panduan integrasi frontend untuk daftar, perubahan, penghuni, dan arsip unit. Prefix API `/api`; autentikasi menggunakan session cookie. Semua request browser memakai `credentials: 'include'`. Origin frontend harus tercantum pada `CORS_ORIGINS`.

## Endpoint

| Method | Path                      | Akses | Sukses                              |
| ------ | ------------------------- | ----- | ----------------------------------- |
| GET    | `/api/units`              | ADMIN | 200, daftar dan pagination          |
| GET    | `/api/units/:id`          | ADMIN | 200, detail                         |
| POST   | `/api/units`              | ADMIN | 201, unit baru                      |
| PATCH  | `/api/units/:id`          | ADMIN | 200, unit diperbarui                |
| POST   | `/api/units/:id/archive`  | ADMIN | 200, unit diarsipkan                |
| PUT    | `/api/units/:id/resident` | ADMIN | 200, unit tujuan setelah penempatan |
| DELETE | `/api/units/:id/resident` | ADMIN | 200, unit setelah pelepasan         |

`:id` harus UUID. Semua operasi unit hanya tersedia bagi ADMIN. Unit dibatasi pada properti Phase 1. Detail unit arsip masih dapat dibaca; tidak tersedia penghapusan fisik atau pemulihan arsip.

## Buat dan ubah unit

Body `POST /api/units`:

```json
{
  "unitNumber": "A-101",
  "floor": 1,
  "maintenanceFlag": false
}
```

`unitNumber` dan `floor` wajib. Nomor unit di-trim, tidak kosong, maksimal 40 karakter, dan unik di properti, termasuk nomor yang diarsipkan. Kapitalisasi dipertahankan: `A-101` berbeda dari `a-101`. `floor` adalah angka integer dari -32768 sampai 32767; lantai negatif diperbolehkan. `maintenanceFlag` opsional, default false.

Body `PATCH /api/units/:id` memakai field yang sama, seluruhnya opsional tetapi minimal satu field harus ada:

```json
{
  "floor": 2,
  "maintenanceFlag": true
}
```

Jangan kirim `id`, `propertyId`, `isArchived`, `activeResident`, atau field lain dalam body. Field tambahan ditolak dengan 400. Unit arsip tidak dapat diedit.

Semua respons unit memakai bentuk berikut:

```json
{
  "id": "55000000-0000-4000-8000-000000000001",
  "propertyId": "11000000-0000-4000-8000-000000000001",
  "unitNumber": "A-101",
  "floor": 1,
  "maintenanceFlag": false,
  "isArchived": false,
  "displayStatus": "OCCUPIED",
  "activeResident": {
    "id": "33000000-0000-4000-8000-000000000003",
    "name": "Penghuni",
    "loginIdentifier": "resident@example.test"
  },
  "createdAt": "2026-10-02T10:00:00.000Z",
  "updatedAt": "2026-10-02T10:00:00.000Z"
}
```

Unit baru memiliki `activeResident: null`, `isArchived: false`, dan `displayStatus: "VACANT"`, kecuali maintenance diaktifkan. `activeResident` hanya berisi identitas aman akun RESIDENT aktif; tidak ada password/hash atau token.

`displayStatus` dihitung saat membaca:

1. `MAINTENANCE` bila `maintenanceFlag` true.
2. `OCCUPIED` bila ada penghuni aktif dan maintenance false.
3. `VACANT` bila tidak ada penghuni aktif dan maintenance false.

Gunakan `isArchived` secara terpisah untuk menampilkan arsip. Status hunian tidak disimpan sebagai field yang dapat diubah klien.

## Daftar unit dan pagination

Contoh: `GET /api/units?page=1&pageSize=20&isArchived=false`.

| Query        | Default | Aturan                                                                                 |
| ------------ | ------- | -------------------------------------------------------------------------------------- |
| `page`       | 1       | Integer positif dalam bentuk digit; offset harus dalam rentang integer aman JavaScript |
| `pageSize`   | 20      | Integer positif, maksimal 100                                                          |
| `isArchived` | `false` | Tepat string `true` atau `false`                                                       |

Query tambahan, angka pecahan, nol, nilai berulang/array, dan boolean selain kedua string tersebut ditolak. Daftar default hanya memuat unit non-arsip. Untuk tab arsip, kirim `isArchived=true`; filter tersebut memilih hanya unit arsip. Hasil diurutkan menurut `unitNumber ASC`, lalu `id ASC`.

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

`data` berisi objek unit seperti contoh di atas. `total` adalah jumlah unit yang cocok dengan filter. Halaman melewati hasil mengembalikan `data: []` dengan metadata total tetap benar. Data dan total dibaca dari snapshot transaksi yang sama. Pagination/filter laporan akan ditetapkan pada BE-14.

## Penempatan dan pelepasan penghuni

Body `PUT /api/units/:id/resident`:

```json
{
  "residentUserId": "33000000-0000-4000-8000-000000000003"
}
```

Akun harus aktif dan memiliki role RESIDENT. Unit tujuan harus non-arsip pada properti Phase 1. Setiap akun maksimal memiliki satu unit dan setiap unit maksimal memiliki satu penghuni.

- Jika penghuni belum memiliki unit, operasi menempatkannya di tujuan.
- Jika sudah memiliki unit lain, operasi melepas relasi lama dan menempatkannya di tujuan dalam satu transaksi.
- Tujuan yang dihuni akun lain menghasilkan 409; penempatan sebelumnya tetap utuh.
- Menempatkan akun yang sama di unit yang sama berhasil secara idempoten.
- Akun RESIDENT aktif boleh belum memiliki unit.

`DELETE /api/units/:id/resident` tidak memerlukan body dan mengembalikan unit dengan `activeResident: null`. Pelepasan tidak menonaktifkan akun. Melepas unit kosong tetap berhasil.

Saat operasi bersaing dengan request lain, backend mengunci akun sebelum unit dan memvalidasi ulang penempatan. Jika relasi berubah, respons 409 meminta frontend memuat ulang data sebelum mencoba lagi.

## Arsip unit

Kirim `POST /api/units/:id/archive` tanpa body. Arsip hanya berhasil jika unit sudah kosong dan tidak memiliki laporan selain `CLOSED` atau `REJECTED`.

Jika unit dihuni, lepaskan penghuni terlebih dahulu. Jika ada laporan `REPORTED`, `VERIFIED`, `ASSIGNED`, `IN_PROGRESS`, atau `COMPLETED`, selesaikan alur laporan terlebih dahulu. Konflik mengembalikan 409 tanpa perubahan data.

Arsip mempertahankan unit dan seluruh relasi laporan historis. Mengarsipkan unit yang sudah diarsipkan tetap berhasil. Setelah sukses, refresh daftar non-arsip dan tab arsip.

## Contoh request browser

```ts
const apiBase = 'http://localhost:3001/api';

const response = await fetch(`${apiBase}/units`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ unitNumber: 'A-101', floor: 1 }),
});
const result = await response.json();

if (response.ok) {
  // result adalah UnitResponseDto; refresh daftar unit.
} else if (result.code === 'VALIDATION_ERROR') {
  // Petakan result.details.issues[].path ke field form.
} else if (result.code === 'CONFLICT') {
  // Tampilkan pesan aman result.message dan refresh data sebelum mencoba lagi.
}
```

## Error

Lihat [kontrak error](../api-contracts.md) untuk envelope lengkap.

| Status/kode            | Kondisi                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400 `VALIDATION_ERROR` | UUID/payload/query invalid, PATCH kosong, field tambahan                                                                                                  |
| 401 `UNAUTHORIZED`     | Sesi tidak tersedia/tidak valid atau akun sesi nonaktif                                                                                                   |
| 403 `FORBIDDEN`        | Role tidak diizinkan atau origin mutasi tidak tepercaya                                                                                                   |
| 404 `NOT_FOUND`        | Properti/unit/akun tidak ditemukan, termasuk unit di luar properti Phase 1                                                                                |
| 409 `CONFLICT`         | Nomor unit duplikat, akun bukan RESIDENT aktif, tujuan dihuni/arsip, edit unit arsip, arsip unit dihuni/laporan aktif, atau relasi berubah saat transaksi |
| 500 `INTERNAL_ERROR`   | Kegagalan server; detail internal tidak dikirim ke klien                                                                                                  |

## Integrasi backend tiket berikutnya

`UnitsModule` mengekspor `ResidentPlacementService`. `PropertyModule` mengekspor `PropertyService` untuk dipakai oleh modul unit.

- BE-05 dapat memanggil `place(unitId, residentUserId, transaction)` dan `release(unitId, transaction)` di transaksi akun yang sama. `releaseForResident(residentUserId, transaction)` membersihkan relasi sebelum perubahan role/penonaktifan. Semua kegagalan harus menyebabkan rollback transaksi milik pemanggil.
- Lock akun dilakukan sebelum lock unit; bila memproses beberapa akun, kunci berdasarkan ID berurutan. Unit dikunci berdasarkan ID berurutan. Hindari mendapatkan lock unit lalu memanggil layanan yang akan mengunci akun.
- BE-07 harus mengunci baris unit dengan `SELECT ... FOR UPDATE` sebelum memeriksa `isArchived` dan membuat laporan dalam transaksi yang sama. BE-06 mengunci baris itu saat memeriksa laporan aktif dan mengarsipkan.

## Menjalankan pengujian

```sh
bun run build
bun run test
bun run test:e2e
bun run lint
```

Uji HTTP memakai PGlite dan migrasi asli, sehingga pengujian tidak memerlukan koneksi database eksternal.
