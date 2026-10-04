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

Pencatatan hasil perbaikan, biaya, dan bukti nota ditangani oleh tiket lanjutan.
