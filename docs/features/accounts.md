# Pengelolaan akun

Panduan integrasi Admin untuk akun Admin, Teknisi, dan Penghuni. Semua request browser memakai session cookie dengan `credentials: 'include'`; autentikasi, cookie, dan trusted origins mengikuti [panduan autentikasi](authentication.md). Seluruh route di bawah memerlukan role `ADMIN`.

## Daftar akun dan Teknisi aktif

`GET /api/accounts` mengembalikan `{ data, meta }`. Default mencakup akun aktif dan nonaktif. Gunakan `role=TECHNICIAN&isActive=true` untuk pilihan Teknisi aktif pada form assignment.

| Query      | Default         | Batas                                                               |
| ---------- | --------------- | ------------------------------------------------------------------- |
| `page`     | `1`             | integer positif, offset aman                                        |
| `pageSize` | `20`            | integer 1–100                                                       |
| `q`        | tanpa pencarian | substring literal name/loginIdentifier, trim, maksimal 254 karakter |
| `role`     | semua role      | `ADMIN`, `TECHNICIAN`, `RESIDENT`                                   |
| `isActive` | semua status    | string tepat `true` atau `false`                                    |

Pencarian `q` tidak membedakan huruf besar/kecil dan mencocokkan potongan `name` atau `loginIdentifier`. Nilai kosong/spasi berarti tanpa pencarian; `%`, `_`, dan `\` diperlakukan literal. Semua filter berlaku dengan AND sebelum count dan pagination.

Akun terbaru ditampilkan dahulu. Urutan deterministik adalah `createdAt DESC`, lalu `id DESC`. Halaman di luar rentang mengembalikan `data: []`. Query tak dikenal atau parameter berulang menghasilkan `400 VALIDATION_ERROR`.

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

Nama di-trim dan harus 1–160 karakter. Identifier login di-trim, diubah menjadi huruf kecil, dan harus 1–254 karakter setelah normalisasi; nilainya unik termasuk akun nonaktif. Password pada create/update harus 4–30 karakter tanpa trim dan disimpan sebagai hash Argon2id. Respons akun hanya berisi `id`, `name`, `loginIdentifier`, `role`, `isActive`, `activeUnit`, `createdAt`, dan `updatedAt`; password maupun hash tidak pernah dikembalikan.

Perubahan password atau deaktivasi mencabut semua sesi akun. Jika Admin mengganti password sendiri, request tersebut berhasil tetapi sesi cookie saat ini ikut dicabut; login kembali dengan password baru. Perubahan role berlaku pada validasi request berikutnya.

## Penempatan Penghuni

`unitId` hanya menerima UUID atau `null`. Saat PATCH, field yang tidak dikirim mempertahankan penempatan; `null` melepas penghuni; UUID memindahkan penghuni ke unit tujuan. Pada create, `unitId` opsional berarti akun dibuat tanpa unit.

Penempatan hanya berlaku untuk akun `RESIDENT` aktif dan unit tidak diarsipkan. Penghuni aktif boleh belum memiliki unit. Perubahan akun dan penempatan berada dalam satu transaksi; jika unit hilang, diarsipkan, atau sudah ditempati, request gagal tanpa menerapkan perubahan akun. Menonaktifkan Penghuni atau mengganti rolenya melepas penempatan secara atomik. Aktivasi ulang tidak memulihkan penempatan otomatis.

Akun Teknisi dengan laporan berstatus `ASSIGNED` atau `IN_PROGRESS` belum dapat dinonaktifkan atau diganti role; selesaikan tugasnya terlebih dahulu. Histori laporan dan assignment tetap disimpan.

## Akses Admin

Admin dapat memperbarui dirinya, tetapi tidak dapat menurunkan role atau menonaktifkan akun sendiri. Deaktivasi sendiri melalui POST deactivate atau PATCH `isActive: false` menghasilkan `403 FORBIDDEN`; frontend menonaktifkan aksinya. Sistem mempertahankan minimal satu Admin aktif dan menyimpan akun nonaktif untuk referensi historis.

Error memakai envelope bersama pada [kontrak API](../api-contracts.md): validasi `400`, akses ditolak `401/403`, akun/unit hilang `404`, serta identifier duplikat atau konflik state `409`.

Login tetap menerima rentang credential sebelumnya (1–1024 karakter) agar akun dengan password lama tetap dapat masuk. Batas 4–30 berlaku saat menetapkan password melalui create, update, dan initial Admin seed.

### Resident Placement tanpa perpindahan

Gunakan `GET /api/accounts?role=RESIDENT&isActive=true&unassignedOnly=true` untuk memilih penghuni aktif tanpa unit. `unassignedOnly` menerima tepat string `true`/`false`; filter diterapkan sebelum count/pagination. Tanpa parameter atau `false`, daftar tidak dibatasi penempatan.

Kirim `{ residentUserId, unassignedOnly: true }` ke `PUT /api/units/:id/resident` agar pilihan yang sudah ditempatkan di unit lain ditolak dengan `409`, tanpa memindahkannya. Unit yang sama tetap idempoten. Field body ini boolean; tanpa field atau `false`, perpindahan tetap diizinkan. Tidak memerlukan migrasi.
