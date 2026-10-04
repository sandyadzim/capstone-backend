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

## Authentication

Frontend integration details are documented in [docs/features/authentication.md](docs/features/authentication.md).
The shared response, error, enum, cookie, and CORS contracts are documented in [docs/api-contracts.md](docs/api-contracts.md); OpenAPI is available at `/api/docs` in development and test.

The API uses database-backed cookie sessions. Apply pending migrations with `bun run db:migrate` before starting it. The initial Admin created by `bun run db:seed` can sign in at `POST /api/auth/login` with this JSON body:

```json
{
  "loginIdentifier": "admin@example.test",
  "password": "<the-seed-admin-password>"
}
```

The response contains the account identity and role. The session token is sent only in the `HttpOnly`, `SameSite=Lax`, `Secure` cookie named `__Host-sid`; browser clients must send credentials with API requests. `GET /api/auth/me` returns the current account, and `POST /api/auth/logout` revokes the server-side session. Sessions expire after one day without activity and at most seven days after sign-in.

`CORS_ORIGINS` is also the exact trusted-origin list for sign-in and CSRF protection. Add every frontend origin that needs to make credentialed requests; production origins should use HTTPS. The health endpoint and the login/logout routes are explicitly public. There is no self-registration endpoint.

## Property and units

Frontend integration for the property profile is documented in [docs/features/property.md](docs/features/property.md); unit management, pagination, resident placement, and archiving are in [docs/features/units.md](docs/features/units.md). Profile reads are available to every authenticated role; all unit routes and profile changes require Admin. Uploading/replacing the property logo will be added in BE-11.

Account administration, password changes, active Technician filtering, and account-to-unit placement are documented in [docs/features/accounts.md](docs/features/accounts.md). All account routes require Admin; passwords are stored as Argon2id hashes and never included in responses.

Report creation, role-scoped listing/detail, pagination, and the optional photo upload handoff are documented in [docs/features/reports.md](docs/features/reports.md). Every report route requires a session; create is available to Admin and Resident, while list/detail results are scoped to the actor.

Technician task access and the atomic start-work action with an estimated arrival timestamp are documented in [docs/features/technician-work.md](docs/features/technician-work.md). Technicians see only their assigned reports; starting work changes `ASSIGNED` to `IN_PROGRESS`.

## Environment

| Variable                      | Default                                    | Description                                                                      |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`                              | `development`, `test`, or `production`.                                          |
| `PORT`                        | `3001`                                     | HTTP port, from 1 to 65535.                                                      |
| `CORS_ORIGINS`                | `http://localhost:5173` outside production | Comma-separated exact HTTP(S) origins. Required in production.                   |
| `DATABASE_URL`                | —                                          | PostgreSQL connection URL. Required to start the API and run database commands.  |
| `UPLOADTHING_TOKEN`           | —                                          | Server-only UploadThing credential. Required in production and for file uploads. |
| `SEED_PROPERTY_NAME`          | —                                          | Initial property name used only by `db:seed`.                                    |
| `SEED_PROPERTY_ADDRESS`       | —                                          | Initial property address used only by `db:seed`.                                 |
| `SEED_ADMIN_NAME`             | —                                          | Initial Admin display name used only by `db:seed`.                               |
| `SEED_ADMIN_LOGIN_IDENTIFIER` | —                                          | Initial Admin login, normalized to lowercase.                                    |
| `SEED_ADMIN_PASSWORD`         | —                                          | Initial Admin password, at least 12 characters; stored as an Argon2id hash.      |

CORS allows credentials for session cookies and only returns access headers to configured origins. Do not use `*` with credentialed requests.

Example `.env` for local development:

```dotenv
NODE_ENV=development
PORT=3001
CORS_ORIGINS=http://localhost:5173
DATABASE_URL=postgresql://<db_user>:<url_encoded_db_password>@localhost:5432/<db_name>
UPLOADTHING_TOKEN=<private-uploadthing-token>

SEED_PROPERTY_NAME=Properti Lokal
SEED_PROPERTY_ADDRESS=Alamat properti lokal
SEED_ADMIN_NAME=Administrator Awal
SEED_ADMIN_LOGIN_IDENTIFIER=admin@example.test
SEED_ADMIN_PASSWORD=<private-random-password-at-least-12-characters>
```

Replace every `<...>` placeholder with your local database values, UploadThing token, and a unique password before running commands. URL-encode special characters in the database username or password. `example.test` is a reserved example domain; use the login identifier you intend to use locally. `UPLOADTHING_TOKEN` is server-only and required in production.

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
