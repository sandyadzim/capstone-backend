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

| Method   | Path                      | Akses                                                     | Sukses                                            |
| -------- | ------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| `POST`   | `/api/auth/login`         | Publik; memerlukan origin tepercaya untuk request browser | `200`, aktor dikembalikan dan cookie sesi disetel |
| `GET`    | `/api/auth/me`            | Session cookie                                            | `200`, aktor aktif                                |
| `POST`   | `/api/auth/logout`        | Publik; menghapus sesi saat tersedia                      | `204`                                             |
| `GET`    | `/api/health`             | Publik                                                    | `200`, `{ "status": "ok" }`                       |
| `GET`    | `/api/property`           | Semua role dengan sesi                                    | `200`, profil                                     |
| `PATCH`  | `/api/property`           | ADMIN                                                     | `200`, profil diperbarui                          |
| `GET`    | `/api/units`              | ADMIN                                                     | `200`, `{ data, meta }`                           |
| `POST`   | `/api/units`              | ADMIN                                                     | `201`, unit                                       |
| `GET`    | `/api/units/:id`          | ADMIN                                                     | `200`, detail unit                                |
| `PATCH`  | `/api/units/:id`          | ADMIN                                                     | `200`, unit diperbarui                            |
| `POST`   | `/api/units/:id/archive`  | ADMIN                                                     | `200`, unit diarsipkan                            |
| `PUT`    | `/api/units/:id/resident` | ADMIN                                                     | `200`, unit tujuan dengan penghuni                |
| `DELETE` | `/api/units/:id/resident` | ADMIN                                                     | `200`, unit setelah pelepasan                     |

Detail profil ada di [panduan property](features/property.md); payload unit, status hunian, penempatan, dan arsip ada di [panduan unit](features/units.md). Mutasi memakai body strict, PATCH minimal satu field, dan parameter unit UUID. Profil hanya menerima `logoUrl: null` untuk penghapusan; unggah/ganti logo ditambahkan BE-11.

Detail payload auth dan contoh pemakaian browser ada di [panduan autentikasi](features/authentication.md). Login gagal memakai `401 UNAUTHORIZED` dengan pesan generik, baik identifier tidak dikenal maupun password salah. Input login invalid memakai `400 VALIDATION_ERROR`.

## Enum domain

Nilai enum berikut menggunakan bentuk wire uppercase dan ditetapkan sebagai konstanta runtime di schema backend:

| Enum               | Nilai                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| Role               | `ADMIN`, `TECHNICIAN`, `RESIDENT`                                                    |
| Status laporan     | `REPORTED`, `VERIFIED`, `REJECTED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED` |
| Kategori kerusakan | `AC`, `ELECTRICAL`, `PLUMBING`, `FURNITURE`, `BUILDING`, `OTHER`                     |
| Prioritas          | `LOW`, `MEDIUM`, `HIGH`                                                              |

Status tampilan unit dihitung dari maintenance flag dan relasi RESIDENT aktif: `MAINTENANCE`, `OCCUPIED`, atau `VACANT`, dengan maintenance sebagai prioritas. Arsip ditampilkan terpisah melalui `isArchived`.

## Cookie dan CORS

- Nama cookie sesi: `__Host-sid`; atributnya `HttpOnly`, `Secure`, dan `SameSite=Lax`.
- Frontend browser mengirim request dengan `credentials: 'include'`; JavaScript tidak membaca nilai cookie.
- Origin frontend harus dicantumkan persis pada `CORS_ORIGINS`. Backend mengizinkan credentials dan menggunakan daftar origin tersebut sebagai trusted origins untuk CSRF.
- Production harus memakai HTTPS dan menentukan `CORS_ORIGINS` secara eksplisit.
- Swagger mendokumentasikan cookie auth pada operasi yang memerlukan sesi; login, logout, dan health tetap publik.

## Pagination dan filter

`GET /api/units` menerima `page` (default 1), `pageSize` (default 20, maksimum 100), serta `isArchived` (tepat string `true`/`false`, default `false`). Integer harus positif, berupa digit, dan menghasilkan offset dalam rentang integer aman JavaScript. Query tambahan atau berulang ditolak. Respons adalah `{ data, meta: { page, pageSize, total, totalPages } }`; halaman melampaui hasil mengembalikan daftar kosong. Urutan: `unitNumber ASC`, lalu `id ASC`. Filter arsip memilih hanya unit dengan nilai arsip tersebut pada properti Phase 1.

Format pagination, batas, urutan hasil, pencarian, dan filter **laporan** akan ditetapkan dan didokumentasikan pada BE-14 bersamaan dengan implementasi daftar laporan.
