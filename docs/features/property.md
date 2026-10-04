# Profil Properti

Panduan integrasi frontend untuk profil Phase 1. Prefix API `/api`; autentikasi menggunakan session cookie. Semua request browser memakai `credentials: 'include'`. Origin frontend harus tercantum pada `CORS_ORIGINS`.

## Endpoint

| Method | Path            | Akses                 | Sukses                 |
| ------ | --------------- | --------------------- | ---------------------- |
| GET    | `/api/property` | Semua role yang login | 200, profil            |
| PATCH  | `/api/property` | ADMIN                 | 200, profil diperbarui |

## Membaca profil

`GET /api/property` mengembalikan:

```json
{
  "id": "11000000-0000-4000-8000-000000000001",
  "name": "Properti Lokal",
  "address": "Alamat properti lokal",
  "logoUrl": null,
  "createdAt": "2026-10-02T10:00:00.000Z",
  "updatedAt": "2026-10-02T10:00:00.000Z"
}
```

Semua role terautentikasi dapat membaca profil. API hanya menyediakan profil properti Phase 1 yang dikonfigurasi.

## Mengubah profil

Contoh body `PATCH /api/property`:

```json
{
  "name": "Nama Baru",
  "address": "Alamat Baru"
}
```

PATCH bersifat parsial dan wajib memuat minimal satu field. Nama dan alamat di-trim dan tidak boleh kosong; nama maksimal 160 karakter. Field tambahan ditolak. Untuk menghapus logo, kirim `{ "logoUrl": null }`.

String URL dari klien ditolak dengan `400 VALIDATION_ERROR`. Gunakan endpoint multipart di bawah untuk mengunggah atau mengganti logo. Jika upload gagal, logo lama tetap digunakan.

## Properti Phase 1

ID properti yang dilayani sama dengan ID yang dibuat seed. Jika properti belum di-seed, endpoint mengembalikan `404 NOT_FOUND`; API tidak memilih properti lain secara otomatis. Klien tidak mengirim `propertyId` untuk mengubah profil.

Untuk pengelolaan unit milik properti ini, lihat [panduan unit](units.md). Bentuk error API tersedia di [kontrak API](../api-contracts.md).

## Contoh request browser

```ts
const response = await fetch('http://localhost:3001/api/property', {
  credentials: 'include',
});
const property = await response.json();
```

```ts
await fetch('http://localhost:3001/api/property', {
  method: 'PATCH',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Nama Baru' }),
});
```

## Integrasi upload logo

Admin dapat mengunggah atau mengganti logo melalui `PUT /api/property/logo` dengan `multipart/form-data` berisi satu field `file`. Backend menerima JPEG, PNG, atau WebP hingga 5 MiB, memvalidasi isi gambar, mengunggahnya ke UploadThing, lalu memperbarui `logoUrl` sebelum mengembalikan profil. Gunakan `FormData` dan jangan menetapkan header `Content-Type` sendiri agar browser menyertakan multipart boundary. URL logo dari payload JSON tetap ditolak; gunakan `logoUrl: null` pada `PATCH /api/property` untuk menghapus referensi logo. Upload memakai token backend `UPLOADTHING_TOKEN`; frontend tidak memakai UploadThing React SDK dan tidak pernah menerima token tersebut.
