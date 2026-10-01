# Authentication API

Panduan integrasi autentikasi untuk frontend CP. API menggunakan session cookie yang dikelola server dan disimpan di PostgreSQL. Frontend tidak menerima atau menyimpan access token di JavaScript.

## Konfigurasi

- Base URL lokal: `http://localhost:3001/api` (port dapat berubah melalui `PORT`).
- Tambahkan origin frontend ke `CORS_ORIGINS` backend, misalnya `http://localhost:5173`.
- Request dari browser harus mengirim credentials agar cookie sesi ikut dikirim.
- Jangan membaca atau menyimpan `__Host-sid` di `localStorage`; cookie tersebut `HttpOnly`.

Contoh inisialisasi client:

```ts
const API_BASE_URL = 'http://localhost:3001/api';

async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}
```

## Endpoint

### Login

`POST /auth/login`

Request JSON:

```json
{
  "loginIdentifier": "admin@example.test",
  "password": "<password dari konfigurasi seed>"
}
```

Respons `200 OK`:

```json
{
  "id": "<user-id>",
  "name": "Initial Admin",
  "loginIdentifier": "admin@example.test",
  "role": "ADMIN"
}
```

Server juga mengirim `Set-Cookie` untuk cookie `__Host-sid`. Browser mengelolanya otomatis. Jangan mencoba membaca cookie dari JavaScript.

Contoh:

```ts
const response = await apiFetch('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ loginIdentifier, password }),
});

if (response.status === 401) {
  // Tampilkan pesan kredensial tidak valid.
}

if (!response.ok) {
  throw new Error('Login gagal');
}

const actor = await response.json();
```

### Current user

`GET /auth/me`

Mengembalikan objek aktor dengan bentuk yang sama seperti respons login. Gunakan saat aplikasi dimulai atau halaman dimuat ulang untuk mengetahui apakah sesi masih berlaku.

- `200 OK`: sesi valid; respons berisi aktor.
- `401 Unauthorized`: belum login, sesi kedaluwarsa, sesi sudah dihapus, atau akun nonaktif.

```ts
const response = await apiFetch('/auth/me');

if (response.status === 401) {
  // Anggap pengguna sebagai guest dan arahkan ke halaman login bila perlu.
} else if (!response.ok) {
  throw new Error('Tidak dapat memeriksa sesi');
} else {
  const actor = await response.json();
}
```

### Logout

`POST /auth/logout`

- Kirim request dengan `credentials: 'include'`.
- `204 No Content`: sesi server sudah dihapus. Kosongkan state pengguna di frontend.

```ts
const response = await apiFetch('/auth/logout', { method: 'POST' });
if (!response.ok) {
  throw new Error('Logout gagal');
}
```

## Error dan akses

| Kondisi | Status |
| --- | ---: |
| Login berhasil | `200` |
| Identifier atau password salah / akun tidak aktif | `401` |
| Body login tidak valid atau berisi field tambahan | `400` |
| Origin tidak dipercaya untuk request yang dilindungi CSRF | `403` |
| `/auth/me` tanpa sesi yang valid | `401` |
| Logout berhasil | `204` |

Login memberikan pesan generik untuk identifier yang tidak dikenal dan password yang salah. Jangan mengandalkan pesan error untuk membedakan kondisi tersebut.

Login, logout, dan health check adalah endpoint publik. Endpoint lain dilindungi autentikasi secara default. Pemeriksaan role hanya berlaku pada endpoint yang secara eksplisit menerapkan decorator `@Roles(...)`.

## Masa berlaku sesi

- Sesi tidak aktif kedaluwarsa setelah 1 hari.
- Sesi kedaluwarsa maksimal 7 hari setelah login.
- Logout menghapus sesi di server; cookie lama tidak lagi memberikan akses.
- Akun yang dinonaktifkan tidak bisa menggunakan sesi yang sudah ada.

## Integrasi lintas origin

Origin frontend harus dicantumkan persis di `CORS_ORIGINS` backend. Request browser akan membawa header `Origin`; frontend tidak perlu membuat header `Cookie` sendiri. `credentials: 'include'` harus digunakan juga pada request `/auth/me` dan endpoint privat, bukan hanya pada login.

Cookie disetel `Secure` dan `SameSite=Lax`. Jika frontend dan API ditempatkan pada site yang berbeda, uji perilaku cookie pada deployment sebenarnya dan sesuaikan strategi domain/cookie serta CSRF sebelum rilis. Jangan menghapus atribut keamanan cookie hanya untuk mengatasi masalah integrasi.

Tidak tersedia endpoint registrasi mandiri. Akun awal Admin dibuat melalui proses seed backend.
