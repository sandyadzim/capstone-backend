# CP Backend

NestJS REST API modular monolith for the property maintenance system.

## Requirements

- Bun 1.4.2+

## Run locally

```sh
bun install
cp .env.example .env
bun run start:dev
```

The API listens on `http://localhost:3001`; the health endpoint is `GET /api/health`.

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production`. |
| `PORT` | `3001` | HTTP port, from 1 to 65535. |
| `CORS_ORIGINS` | `http://localhost:5173` outside production | Comma-separated exact HTTP(S) origins. Required in production. |

CORS allows credentials for session cookies and only returns access headers to configured origins. Do not use `*` with credentialed requests.

## Commands

```sh
bun run start:dev
bun run build
bun run test
bun run test:e2e
bun run lint
```

Feature module boundaries are under `src/modules`. The database module is an empty boundary in this bootstrap; PostgreSQL and Drizzle setup belongs to BE-02.
