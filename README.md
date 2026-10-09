# STSI4440 - Capstone Project (Backend)

This Repository is the REST API for a property maintenance system. It manages units and resident accounts, tracks damage reports from submission through repair and closure, and provides maintenance history and operational metrics.

The current Phase 1 implementation serves a single property. Property-scoped operations use the fixed property ID defined in `src/modules/property/property.constants.ts`; clients do not select a property or supply a tenant ID.

## Features and access

| Role         | Capabilities                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN`      | Manage the property profile/logo, accounts, units, and resident placement; create, review, assign, and close reports; read property reports, unit history, and dashboard metrics.                       |
| `TECHNICIAN` | Read assigned reports, record an arrival estimate when starting work, save inspection and repair results, record service/material costs, upload repair photos and a receipt, and submit completed work. |
| `RESIDENT`   | Create and read reports for their currently assigned unit, upload damage photos subject to report rules, and read closed maintenance history for their current non-archived unit.                       |

All authenticated roles can read the property profile. Accounts are created by Admin; there is no self-registration. Report access is enforced in database queries, and detail responses hide internal Admin fields from other roles. Residents can see repair results and total cost, but not receipts or itemized costs.

Report listing supports pagination, case-insensitive report-number/title search, and filters for status, category, effective priority, and reporting date. Date filters use the `Asia/Jakarta` calendar; timestamps are returned in UTC.

Units support one active resident per unit and one unit per resident, transactional resident moves, and a derived occupancy status (`VACANT`, `OCCUPIED`, or `MAINTENANCE`). Archiving preserves history and requires an empty unit with no reports outside `CLOSED` or `REJECTED`.

## Maintenance workflow

```text
Resident submission: REPORTED → VERIFIED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
                            ↘ REJECTED
Admin submission:               VERIFIED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
```

Admin verifies or rejects resident reports and assigns a single active Technician to a verified report. The assigned Technician starts work with an arrival estimate, records results and optional costs, and submits completion. Completion requires both a maintenance result and a receipt; repair photos and cost items are optional. Admin then closes the completed report, making it available in unit history.

The dashboard reports unit/report counts, active and in-progress reports, reports closed in the current Jakarta calendar month, and the total cost of closed reports.

## Technology and structure

- NestJS 12 and TypeScript, using ECMAScript modules with `.js` suffixes on local imports.
- Node.js for the API runtime; Bun for dependency management and project scripts.
- PostgreSQL with Drizzle ORM, the `postgres` driver, and Drizzle Kit SQL migrations.
- Database-backed cookie sessions via `@nestjs/authentication`, with Argon2id password hashing.
- Zod request/environment validation and generated Swagger/OpenAPI documentation.
- UploadThing for external file storage.
- Vitest, Supertest, and PGlite for unit and HTTP integration tests; Oxlint for type-aware linting.

```text
src/
  main.ts                        Application entry point
  configure-http-application.ts  API prefix, CORS, CSRF, validation, OpenAPI, logging
  common/http/                   Shared error handling
  config/                        Environment validation
  modules/
    auth-accounts/               Authentication, sessions, roles, account management
    property/                    Single-property profile
    units/                       Units, resident placement, archiving
    reports-assignment/          Reports, search/filtering, review, assignment
    maintenance-execution/       Start, results, costs, completion, closure
    attachments/                 Damage/repair photos, receipts, property logo
    dashboard-history/           Unit maintenance history and Admin dashboard
    database/                    Schema, database service, seed logic
    health/                      Public health endpoint
drizzle/                         Versioned SQL migrations and metadata
scripts/                         Database command helpers
test/                            HTTP integration tests and shared fixtures
docs/                            API contracts and frontend integration guides
```

Controllers define HTTP contracts, services enforce business rules, and repositories handle persistence. Multi-table changes use typed database transactions. Foreign keys use `ON DELETE RESTRICT`; database triggers maintain `updated_at`. File bytes live in UploadThing, while PostgreSQL stores file metadata, URLs, and domain relationships.

## Requirements

- Node.js compatible with NestJS 12 for running the API.
- Bun 1.4.2 (as declared in `package.json`), or a compatible newer version.
- PostgreSQL 15+

## Run locally

```sh
bun install
cp .env.example .env
```

Create a local PostgreSQL database and fill in `DATABASE_URL` and the `SEED_*` values in `.env` using the [environment reference](#environment) below. Configure `UPLOADTHING_TOKEN` if you need uploads; it can remain empty for local development without uploads. Then run:

```sh
bun run db:migrate
bun run db:seed
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

## Documentation

| Guide                                                       | Contents                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| [API contracts](docs/api-contracts.md)                      | Active endpoints, error envelopes, enums, pagination, cookies, and CORS.   |
| [Authentication](docs/features/authentication.md)           | Login, current account, logout, session lifetime, and browser integration. |
| [Accounts](docs/features/accounts.md)                       | Account administration, roles, activation, passwords, and unit placement.  |
| [Property](docs/features/property.md)                       | Property profile and logo uploads.                                         |
| [Units](docs/features/units.md)                             | Unit management, occupancy, resident placement, and archiving.             |
| [Reports](docs/features/reports.md)                         | Creation, search/filtering, role-scoped reads, review, and assignment.     |
| [Technician work](docs/features/technician-work.md)         | Starting work, results, decimal costs, receipt uploads, and completion.    |
| [History and dashboard](docs/features/dashboard-history.md) | Admin closure, unit history, and metric definitions.                       |

Swagger UI is available at `http://localhost:3001/api/docs`, and the OpenAPI JSON at `http://localhost:3001/api/docs-json`, in development and test. Both are disabled in production. The guides contain detailed request/response examples and access rules; most guides are written in Indonesian.

## File uploads

Clients send `multipart/form-data` with a single `file` field directly to the API using the same session cookie:

| Method and endpoint                   | Purpose                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /api/reports/:id/damage-photos` | Add a damage photo as an authorized Admin or Resident.                                |
| `POST /api/reports/:id/repair-photos` | Add a repair photo as the assigned Technician while work is `IN_PROGRESS`.            |
| `PUT /api/reports/:id/receipt`        | Upload or replace the receipt as the assigned Technician while work is `IN_PROGRESS`. |
| `PUT /api/property/logo`              | Upload or replace the property logo as Admin.                                         |

Images accept JPEG, PNG, or WebP; receipts also accept PDF. Each file is limited to 5 MiB. A report can have up to five damage photos, five repair photos, and one receipt; the property has one logo. The backend validates file signatures and uploads through UploadThing before saving the reference. Uploaded files have public URLs, so API authorization controls upload and response visibility rather than access to a known storage URL. Keep `UPLOADTHING_TOKEN` on the backend.

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

SEED_PROPERTY_NAME=Local Property
SEED_PROPERTY_ADDRESS=Local property address
SEED_ADMIN_NAME=Initial Administrator
SEED_ADMIN_LOGIN_IDENTIFIER=admin@example.test
SEED_ADMIN_PASSWORD=<private-random-password-at-least-12-characters>
```

Replace the database and password placeholders before running migrations and seed. Replace the UploadThing placeholder with a real token when using uploads, or leave that variable empty in local development. URL-encode special characters in the database username or password. `example.test` is a reserved example domain; use the login identifier you intend to use locally. `UPLOADTHING_TOKEN` is server-only and required in production.

## Development commands

| Command               | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `bun run start:dev`   | Start the API in watch mode.                                         |
| `bun run start:debug` | Start with the debugger and watch mode.                              |
| `bun run build`       | Compile the application into `dist/`.                                |
| `bun run start:prod`  | Run the compiled application with Node.js; build first.              |
| `bun run test`        | Run unit tests.                                                      |
| `bun run test:watch`  | Run tests in watch mode.                                             |
| `bun run test:cov`    | Run tests with coverage.                                             |
| `bun run test:e2e`    | Run HTTP integration tests with PGlite.                              |
| `bun run lint`        | Run type-aware Oxlint checks.                                        |
| `bun run format`      | Format TypeScript source, tests, scripts, and Drizzle configuration. |
| `bun run db:generate` | Generate SQL migrations from schema changes.                         |
| `bun run db:check`    | Check migration consistency.                                         |
| `bun run db:migrate`  | Apply pending migrations to the configured PostgreSQL database.      |
| `bun run db:seed`     | Create the initial property and Admin account.                       |
| `bun run db:studio`   | Start Drizzle Studio bound to `127.0.0.1`.                           |

Review and commit generated migrations together with schema changes. Seed reruns preserve existing property and Admin data and never replace an existing password hash. The seed initializes the property and Admin only; create units, Technicians, and Residents through the Admin APIs.

## Verification

```sh
bun run test
bun run test:e2e
bun run build
bun run lint
bunx tsc --noEmit --incremental false
bun run db:check
```

HTTP integration tests apply the real SQL migrations to PGlite and bind local listeners on random ports. They do not require an external PostgreSQL database. UploadThing is mocked in tests; these tests do not verify live uploads or PostgreSQL locking across separate connections.

For production, set `NODE_ENV=production`, configure `DATABASE_URL`, explicit `CORS_ORIGINS`, and `UPLOADTHING_TOKEN`, apply migrations, build, and run `bun run start:prod`. Serve the API over HTTPS for its Secure session cookie. Frontend and API deployment must account for the `SameSite=Lax` cookie; see the authentication guide for cross-origin integration details.
