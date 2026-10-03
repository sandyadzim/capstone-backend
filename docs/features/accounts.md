# Pengelolaan akun

Panduan integrasi Admin untuk akun Admin, Teknisi, dan Penghuni. Semua request browser memakai session cookie dengan `credentials: 'include'`; autentikasi, cookie, dan trusted origins mengikuti [panduan autentikasi](authentication.md). Seluruh route di bawah memerlukan role `ADMIN`.

## Daftar akun dan Teknisi aktif

`GET /api/accounts` mengembalikan `{ data, meta }`. Default mencakup akun aktif dan nonaktif. Gunakan `role=TECHNICIAN&isActive=true` untuk pilihan Teknisi aktif pada form assignment.

| Query | Default | Batas |
| --- | --- | --- |
| `page` | `1` | integer positif, offset aman |
| `pageSize` | `20` | integer 1–100 |
| `role` | semua role | `ADMIN`, `TECHNICIAN`, `RESIDENT` |
| `isActive` | semua status | string tepat `true` atau `false` |

Urutan deterministik adalah `name ASC`, lalu `id ASC`. Halaman di luar rentang mengembalikan `data: []`. Query tak dikenal atau parameter berulang menghasilkan `400 VALIDATION_ERROR`.

```ts
const response = await fetch(
  '/api/accounts?role=TECHNICIAN&isActive=true&page=1&pageSize=20',
  { credentials: 'include' },
);
```

## Detail dan perubahan akun

- `GET /api/accounts/:id` membaca akun aktif maupun nonaktif.
- `POST /api/accounts` membuat akun. Wajib mengirim `name`, `loginIdentifier`, `password`, dan `role`; `isActive` default `true`; `unitId` opsional.
- `PATCH /api/accounts/:id` menerima satu atau lebih field: `name`, `loginIdentifier`, `password`, `role`, `isActive`, `unitId`.
- `POST /api/accounts/:id/deactivate` menonaktifkan akun secara idempoten tanpa menghapus histori.

Nama di-trim dan harus 1–160 karakter. Identifier login di-trim, diubah menjadi huruf kecil, dan harus 1–254 karakter setelah normalisasi; nilainya unik termasuk akun nonaktif. Password harus 12–1024 karakter dan disimpan sebagai hash Argon2id. Respons akun hanya berisi `id`, `name`, `loginIdentifier`, `role`, `isActive`, `activeUnit`, `createdAt`, dan `updatedAt`; password maupun hash tidak pernah dikembalikan.

Perubahan password atau deaktivasi mencabut semua sesi akun. Jika Admin mengganti password sendiri, request tersebut berhasil tetapi sesi cookie saat ini ikut dicabut; login kembali dengan password baru. Perubahan role berlaku pada validasi request berikutnya.

## Penempatan Penghuni

`unitId` hanya menerima UUID atau `null`. Saat PATCH, field yang tidak dikirim mempertahankan penempatan; `null` melepas penghuni; UUID memindahkan penghuni ke unit tujuan. Pada create, `unitId` opsional berarti akun dibuat tanpa unit.

Penempatan hanya berlaku untuk akun `RESIDENT` aktif dan unit tidak diarsipkan. Penghuni aktif boleh belum memiliki unit. Perubahan akun dan penempatan berada dalam satu transaksi; jika unit hilang, diarsipkan, atau sudah ditempati, request gagal tanpa menerapkan perubahan akun. Menonaktifkan Penghuni atau mengganti rolenya melepas penempatan secara atomik. Aktivasi ulang tidak memulihkan penempatan otomatis.

Untuk mengubah ketersediaan teknisi, query daftar dengan `role=TECHNICIAN&isActive=true`. Akun Teknisi dengan laporan berstatus `ASSIGNED` atau `IN_PROGRESS` belum dapat dinonaktifkan atau diganti role; selesaikan tugasnya terlebih dahulu. Histori laporan dan assignment tetap disimpan.

## Akses Admin

Admin dapat memperbarui data dirinya, tetapi tidak dapat menurunkan role atau menonaktifkan akunnya sendiri. Sistem menjaga setidaknya satu Admin aktif. Akun tetap tersimpan saat dinonaktifkan agar laporan dan assignment historis tetap merujuk pada identitas yang sama.

Error memakai envelope bersama pada [kontrak API](../api-contracts.md): validasi `400`, akses ditolak `401/403`, akun/unit hilang `404`, serta identifier duplikat atau konflik state `409`.
