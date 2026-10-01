# CP Backend

NestJS REST API modular monolith for the property maintenance system.

## Requirements

- Bun 1.4.2+
- PostgreSQL 15+

## Run locally

```sh
bun install
cp .env.example .env
bun run db:migrate
bun run start:dev
```

The API listens on `http://localhost:3001`; the health endpoint is `GET /api/health`.

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production`. |
| `PORT` | `3001` | HTTP port, from 1 to 65535. |
| `CORS_ORIGINS` | `http://localhost:5173` outside production | Comma-separated exact HTTP(S) origins. Required in production. |
| `DATABASE_URL` | — | PostgreSQL connection URL. Required to start the API and run database commands. |
| `SEED_PROPERTY_NAME` | — | Initial property name used only by `db:seed`. |
| `SEED_PROPERTY_ADDRESS` | — | Initial property address used only by `db:seed`. |
| `SEED_ADMIN_NAME` | — | Initial Admin display name used only by `db:seed`. |
| `SEED_ADMIN_LOGIN_IDENTIFIER` | — | Initial Admin login, normalized to lowercase. |
| `SEED_ADMIN_PASSWORD` | — | Initial Admin password, at least 12 characters; stored as an Argon2id hash. |

CORS allows credentials for session cookies and only returns access headers to configured origins. Do not use `*` with credentialed requests.

Example `.env` for local development:

```dotenv
NODE_ENV=development
PORT=3001
CORS_ORIGINS=http://localhost:5173
DATABASE_URL=postgresql://<db_user>:<url_encoded_db_password>@localhost:5432/<db_name>

SEED_PROPERTY_NAME=Properti Lokal
SEED_PROPERTY_ADDRESS=Alamat properti lokal
SEED_ADMIN_NAME=Administrator Awal
SEED_ADMIN_LOGIN_IDENTIFIER=admin@example.test
SEED_ADMIN_PASSWORD=<private-random-password-at-least-12-characters>
```

Replace every `<...>` placeholder with your local database values and a unique password before running commands. URL-encode special characters in the database username or password. `example.test` is a reserved example domain; use the login identifier you intend to use locally.

## Commands

```sh
bun run start:dev
bun run build
bun run test
bun run test:e2e
bun run lint
bun run db:generate
bun run db:check
bun run db:migrate
bun run db:seed
```

Set `DATABASE_URL` in `.env` to a PostgreSQL 15+ database before starting the API or applying migrations. `db:generate` creates a new ordered SQL migration from the Drizzle schema; review and commit that migration with schema changes. `db:migrate` applies unapplied migrations. For the first seed, set the `SEED_*` values in the private `.env` file; reruns preserve existing property and Admin data and never replace a password hash. Do not commit `.env` or put real credentials in source control.

The Drizzle database handle is exposed through `DatabaseService`; its typed `transaction` method keeps multi-table changes atomic. Repository methods normalize login identifiers. Database triggers maintain `updated_at` on transaction-table updates. Foreign keys use `ON DELETE RESTRICT`; stored attachments contain the external file URL and report relation, never file bytes.
