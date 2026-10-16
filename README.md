# Property Maintenance API

REST API for managing property details, units, accounts, and damage reports from submission through repair and closure. Supports Admin, Resident, and Technician roles for a single property.

Built with NestJS, TypeScript, PostgreSQL, and Drizzle ORM. Uses session cookies for authentication and UploadThing for file storage.

## Run locally

Install Node.js compatible with NestJS 12, Bun 1.4.2, and PostgreSQL 15+.

```sh
bun install --frozen-lockfile
cp .env.example .env
```

Set `DATABASE_URL` and all `SEED_*` values in `.env`. The initial Admin password must contain 4–30 characters. Set `CORS_ORIGINS` to your frontend origins and provide `UPLOADTHING_TOKEN` for uploads (required in production).

```sh
bun run db:migrate
bun run db:seed
bun run start:dev
```

Seeding creates the property and initial Admin account. Rerunning it preserves existing data and passwords. Sign in with that account to manage accounts and units through the Admin API.

- API: [localhost:3001/api](http://localhost:3001/api)
- Health: [localhost:3001/api/health](http://localhost:3001/api/health)
- Swagger: [localhost:3001/api/docs](http://localhost:3001/api/docs)
- OpenAPI: [localhost:3001/api/docs-json](http://localhost:3001/api/docs-json)

Swagger and OpenAPI are available in development/test. Browser requests must include credentials for session cookies.

## Main commands

| Command               | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `bun run start:dev`   | Start development server with watch mode |
| `bun run build`       | Build to `dist/`                         |
| `bun run start:prod`  | Run the production build                 |
| `bun run test`        | Run unit tests                           |
| `bun run test:e2e`    | Run HTTP integration tests with PGlite   |
| `bun run lint`        | Run type-aware lint checks               |
| `bun run db:generate` | Generate migrations from schema changes  |
| `bun run db:check`    | Check migration consistency              |
| `bun run db:migrate`  | Apply migrations                         |
| `bun run db:studio`   | Open Drizzle Studio                      |

Additional commands are listed in `package.json`. Tests require no external database; uploads are mocked.

## Documentation

Start with the [API contracts](docs/api-contracts.md) for endpoints, errors, and links to feature guides. See [authentication](docs/features/authentication.md) for cookie and CORS integration.

For production, configure the deployment environment, apply migrations, build, and run `bun run start:prod` behind HTTPS. Deploy with a frontend that uses the matching API contract.
