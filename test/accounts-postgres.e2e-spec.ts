import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { AuthenticationStorage } from '@nestjs/authentication';
import type { Database } from '../src/modules/database/database.service.js';
import { DatabaseService } from '../src/modules/database/database.service.js';
import { schema, users } from '../src/modules/database/schema.js';
import { UsersRepository } from '../src/modules/database/users.repository.js';
import { AccountsRepository } from '../src/modules/auth-accounts/accounts.repository.js';
import { AccountsService } from '../src/modules/auth-accounts/accounts.service.js';
import { DrizzleSessionStore } from '../src/modules/auth-accounts/drizzle-session.store.js';
import { PasswordCredentialsService } from '../src/modules/auth-accounts/password-credentials.service.js';
import { ResidentPlacementService } from '../src/modules/units/resident-placement.service.js';
import { UnitsRepository } from '../src/modules/units/units.repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const testSchema = `be05_test_${randomUUID().replaceAll('-', '')}`;
const adminA = '55000000-0000-4000-8000-000000000001';
const adminB = '55000000-0000-4000-8000-000000000002';

describe.skipIf(!databaseUrl)(
  'Account Admin membership concurrency on PostgreSQL',
  () => {
    let control: Sql;
    let client: Sql;
    let database: DatabaseService;
    let accounts: AccountsService;
    let schemaCreated = false;

    beforeAll(async () => {
      if (!databaseUrl) return;
      control = postgres(databaseUrl, {
        max: 1,
        prepare: false,
        onnotice: () => {},
      });
      await control`CREATE SCHEMA ${control(testSchema)}`;
      schemaCreated = true;
      client = postgres(databaseUrl, {
        max: 4,
        prepare: false,
        connection: { search_path: testSchema },
        onnotice: () => {},
      });
      for (const file of [
        '0000_initial_schema.sql',
        '0001_auth_sessions.sql',
      ]) {
        const migration = (await readFile(resolve('drizzle', file), 'utf8'))
          .replaceAll('"public".', `"${testSchema}".`)
          .replaceAll('public.', `"${testSchema}".`);
        for (const statement of migration.split('--> statement-breakpoint')) {
          if (statement.trim()) await client.unsafe(statement);
        }
      }
      const db = drizzle(client, { schema });
      database = new DatabaseService(client, db as unknown as Database);
      const userRepository = new UsersRepository(database);
      const unitRepository = new UnitsRepository(database);
      const storage = new AuthenticationStorage({
        contracts: [],
        allowInMemoryStorage: true,
      });
      accounts = new AccountsService(
        database,
        new AccountsRepository(database),
        new PasswordCredentialsService(userRepository),
        new DrizzleSessionStore(database, storage),
        new ResidentPlacementService(database, unitRepository),
      );
      await database.db.insert(users).values([
        {
          id: adminA,
          name: 'Admin A',
          loginIdentifier: 'admin-a@example.test',
          passwordHash: 'test-only-no-login',
          role: 'ADMIN',
        },
        {
          id: adminB,
          name: 'Admin B',
          loginIdentifier: 'admin-b@example.test',
          passwordHash: 'test-only-no-login',
          role: 'ADMIN',
        },
      ]);
    });

    afterAll(async () => {
      await client?.end();
      if (control) {
        try {
          if (schemaCreated) {
            await control`DROP SCHEMA IF EXISTS ${control(testSchema)} CASCADE`;
          }
        } finally {
          await control.end();
        }
      }
    });

    it('serializes concurrent mutual demotions and preserves one active Admin', async () => {
      const outcomes = await Promise.allSettled([
        accounts.update(adminA, adminB, { role: 'TECHNICIAN' }),
        accounts.update(adminB, adminA, { role: 'TECHNICIAN' }),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome.status === 'rejected'),
      ).toHaveLength(1);
      const activeAdmins = await database.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'ADMIN'));
      expect(activeAdmins).toHaveLength(1);
    });
  },
);
