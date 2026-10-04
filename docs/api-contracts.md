# Kontrak API

Dokumen ini menjelaskan aturan lintas endpoint dan route yang sudah tersedia. OpenAPI yang dihasilkan dari aplikasi adalah referensi payload dan respons untuk route aktif; endpoint fitur yang belum diimplementasikan tidak dicantumkan.

- Swagger UI: `GET /api/docs` pada `development` dan `test`.
- OpenAPI JSON: `GET /api/docs-json` pada `development` dan `test`.
- Prefix semua route REST: `/api`.

## Format error

Semua error dari route Nest memakai envelope berikut:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": {
    "issues": [
      {
        "path": ["loginIdentifier"],
        "message": "Too small: expected string to have >=1 characters"
      }
    ]
  }
}
```

`details` hanya disertakan bila tersedia. Error validasi berisi path dalam bentuk array agar frontend dapat memetakan masalah ke field form, termasuk field bersarang atau array. Error tidak mengandung nilai input.

|           Status | `code`             | Arti                                                                                               |
| ---------------: | ------------------ | -------------------------------------------------------------------------------------------------- |
|            `400` | `VALIDATION_ERROR` | Request tidak memenuhi skema input.                                                                |
|            `401` | `UNAUTHORIZED`     | Kredensial atau sesi tidak valid/tidak tersedia.                                                   |
|            `403` | `FORBIDDEN`        | Akses ditolak, termasuk origin yang tidak dipercaya.                                               |
|            `404` | `NOT_FOUND`        | Resource atau route tidak ditemukan.                                                               |
|            `409` | `CONFLICT`         | Operasi bertentangan dengan kondisi data saat ini, misalnya transisi status yang sudah berubah.    |
|            `500` | `INTERNAL_ERROR`   | Kegagalan server yang tidak diharapkan; detail hanya dicatat di log server.                        |
| Status HTTP lain | `HTTP_ERROR`       | Error HTTP lain yang tidak termasuk kategori di atas; `statusCode` tetap mengikuti status respons. |

Status HTTP dan `code` dapat dipakai untuk alur aplikasi. `message` ditujukan untuk tampilan umum; frontend sebaiknya memakai `details.issues` untuk kesalahan field.

## Route aktif

| Method   | Path                             | Akses                                                     | Sukses                                            |
| -------- | -------------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| `POST`   | `/api/auth/login`                | Publik; memerlukan origin tepercaya untuk request browser | `200`, aktor dikembalikan dan cookie sesi disetel |
| `GET`    | `/api/auth/me`                   | Session cookie                                            | `200`, aktor aktif                                |
| `POST`   | `/api/auth/logout`               | Publik; menghapus sesi saat tersedia                      | `204`                                             |
| `GET`    | `/api/health`                    | Publik                                                    | `200`, `{ "status": "ok" }`                       |
| `GET`    | `/api/property`                  | Semua role dengan sesi                                    | `200`, profil                                     |
| `PATCH`  | `/api/property`                  | ADMIN                                                     | `200`, profil diperbarui                          |
| `GET`    | `/api/units`                     | ADMIN                                                     | `200`, `{ data, meta }`                           |
| `POST`   | `/api/units`                     | ADMIN                                                     | `201`, unit                                       |
| `GET`    | `/api/units/:id`                 | ADMIN                                                     | `200`, detail unit                                |
| `PATCH`  | `/api/units/:id`                 | ADMIN                                                     | `200`, unit diperbarui                            |
| `POST`   | `/api/units/:id/archive`         | ADMIN                                                     | `200`, unit diarsipkan                            |
| `PUT`    | `/api/units/:id/resident`        | ADMIN                                                     | `200`, unit tujuan dengan penghuni                |
| `DELETE` | `/api/units/:id/resident`        | ADMIN                                                     | `200`, unit setelah pelepasan                     |
| `GET`    | `/api/accounts`                  | ADMIN                                                     | `200`, `{ data, meta }` daftar akun               |
| `POST`   | `/api/accounts`                  | ADMIN                                                     | `201`, akun dibuat                                |
| `GET`    | `/api/accounts/:id`              | ADMIN                                                     | `200`, detail akun                                |
| `PATCH`  | `/api/accounts/:id`              | ADMIN                                                     | `200`, akun diperbarui                            |
| `POST`   | `/api/accounts/:id/deactivate`   | ADMIN                                                     | `200`, akun dinonaktifkan                         |
| `GET`    | `/api/reports`                   | Session; data dibatasi menurut role                       | `200`, `{ data, meta }` daftar laporan            |
| `POST`   | `/api/reports`                   | ADMIN, RESIDENT                                           | `201`, laporan dibuat                             |
| `GET`    | `/api/reports/:id`               | Session; laporan harus berada dalam cakupan aktor         | `200`, detail laporan                             |
| `POST`   | `/api/reports/:id/verify`        | ADMIN                                                     | `200`, laporan terverifikasi                      |
| `POST`   | `/api/reports/:id/reject`        | ADMIN                                                     | `200`, laporan ditolak                            |
| `POST`   | `/api/reports/:id/assign`        | ADMIN                                                     | `200`, Teknisi ditugaskan                         |
| `POST`   | `/api/reports/:id/start`         | TECHNICIAN; harus pemilik assignment                      | `200`, estimasi disimpan dan status `IN_PROGRESS` |
| `PUT`    | `/api/reports/:id/result`        | TECHNICIAN; pemilik assignment, status `IN_PROGRESS`      | `200`, hasil tersimpan/diperbarui                 |
| `PUT`    | `/api/reports/:id/cost-items`    | TECHNICIAN; pemilik assignment, status `IN_PROGRESS`      | `200`, seluruh baris biaya diganti                |
| `POST`   | `/api/reports/:id/complete`      | TECHNICIAN; pemilik assignment, status `IN_PROGRESS`      | `200`, status menjadi `COMPLETED`                 |
| `POST`   | `/api/reports/:id/close`         | ADMIN; status `COMPLETED`, hasil dan nota tersedia        | `200`, status menjadi `CLOSED`                    |
| `GET`    | `/api/units/:id/history`         | ADMIN; properti Phase 1, termasuk arsip                   | `200`, `{ data, meta }` laporan `CLOSED`          |
| `GET`    | `/api/units/:id/history`         | RESIDENT; unit aktif yang terhubung ke akunnya            | `200`, `{ data, meta }` tanpa identitas pelapor   |
| `GET`    | `/api/dashboard/summary`         | ADMIN                                                     | `200`, enam metrik dashboard                      |
| `POST`   | `/api/reports/:id/damage-photos` | ADMIN atau RESIDENT sesuai akses laporan                  | `201`, URL dan relasi foto kerusakan tersimpan    |
| `POST`   | `/api/reports/:id/repair-photos` | TECHNICIAN pemilik assignment, laporan `IN_PROGRESS`      | `201`, URL dan relasi foto hasil tersimpan        |
| `PUT`    | `/api/reports/:id/receipt`       | TECHNICIAN pemilik assignment, laporan `IN_PROGRESS`      | `200`, nota dipasang atau diganti                 |
| `PUT`    | `/api/property/logo`             | ADMIN                                                     | `200`, profil dengan URL logo                     |

Detail profil ada di [panduan property](features/property.md); payload unit, status hunian, penempatan, dan arsip ada di [panduan unit](features/units.md); akun dan peran ada di [panduan akun](features/accounts.md). Mutasi memakai body strict; PATCH akun/unit minimal satu field. Profil hanya menerima `logoUrl: null` untuk penghapusan; unggah/ganti logo ditambahkan BE-11.

Detail payload auth dan contoh pemakaian browser ada di [panduan autentikasi](features/authentication.md). Login gagal memakai `401 UNAUTHORIZED` dengan pesan generik, baik identifier tidak dikenal maupun password salah. Input login invalid memakai `400 VALIDATION_ERROR`.

Create, review, detail, pagination laporan, pembatasan akses per role, dan bentuk respons tersedia di [panduan laporan](features/reports.md). Nomor laporan dialokasikan backend dari sequence PostgreSQL.

Daftar tugas, pencatatan hasil/biaya, dan pengiriman completion Teknisi tersedia di [panduan tugas Teknisi](features/technician-work.md). Upload file memakai multipart field `file`, sesi yang sama dengan REST API, dan mengembalikan URL publik setelah URL tersimpan. Nilai `UPLOADTHING_TOKEN` hanya disetel di environment backend.

Penutupan pekerjaan oleh Admin, akses riwayat per unit, bentuk DTO yang disamarkan, dan definisi metrik dashboard tersedia di [panduan riwayat dan dashboard](features/dashboard-history.md).

## Enum domain

Nilai enum berikut menggunakan bentuk wire uppercase dan ditetapkan sebagai konstanta runtime di schema backend:

| Enum               | Nilai                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| Role               | `ADMIN`, `TECHNICIAN`, `RESIDENT`                                                    |
| Status laporan     | `REPORTED`, `VERIFIED`, `REJECTED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED` |
| Kategori kerusakan | `AC`, `ELECTRICAL`, `PLUMBING`, `FURNITURE`, `BUILDING`, `OTHER`                     |
| Prioritas          | `LOW`, `MEDIUM`, `HIGH`                                                              |
| Jenis biaya        | `SERVICE`, `MATERIAL`                                                                |

Status tampilan unit dihitung dari maintenance flag dan relasi RESIDENT aktif: `MAINTENANCE`, `OCCUPIED`, atau `VACANT`, dengan maintenance sebagai prioritas. Arsip ditampilkan terpisah melalui `isArchived`.

## Cookie dan CORS

- Nama cookie sesi: `__Host-sid`; atributnya `HttpOnly`, `Secure`, dan `SameSite=Lax`.
- Frontend browser mengirim request dengan `credentials: 'include'`; JavaScript tidak membaca nilai cookie.
- Origin frontend harus dicantumkan persis pada `CORS_ORIGINS`. Backend mengizinkan credentials dan menggunakan daftar origin tersebut sebagai trusted origins untuk CSRF.
- Production harus memakai HTTPS dan menentukan `CORS_ORIGINS` secara eksplisit.
- Swagger mendokumentasikan cookie auth pada operasi yang memerlukan sesi; login, logout, dan health tetap publik.

## Pagination dan filter

`GET /api/units` menerima `page` (default 1), `pageSize` (default 20, maksimum 100), serta `isArchived` (tepat string `true`/`false`, default `false`). Integer harus positif, berupa digit, dan menghasilkan offset dalam rentang integer aman JavaScript. Query tambahan atau berulang ditolak. Respons adalah `{ data, meta: { page, pageSize, total, totalPages } }`; halaman melampaui hasil mengembalikan daftar kosong. Urutan: `unitNumber ASC`, lalu `id ASC`. Filter arsip memilih hanya unit dengan nilai arsip tersebut pada properti Phase 1.

Pagination laporan mengikuti parameter dan bentuk meta akun/unit (`page` default 1, `pageSize` default 20/maksimum 100), mengurutkan `reportedAt DESC` lalu `id DESC`. Pencarian serta filter laporan ditambahkan pada BE-14.

`GET /api/accounts` menerima `page` (default 1), `pageSize` (default 20, maksimum 100), serta filter opsional `role` dan `isActive` (tepat string `true`/`false`). Tanpa filter status, akun aktif dan nonaktif disertakan. Respons `{ data, meta }`, urutan `name ASC` lalu `id ASC`; halaman di luar hasil kosong. Gunakan `role=TECHNICIAN&isActive=true` untuk daftar teknisi aktif.
