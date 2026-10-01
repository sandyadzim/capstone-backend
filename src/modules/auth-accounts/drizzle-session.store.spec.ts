import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { DatabaseService } from '../database/database.service.js';
import { schema } from '../database/schema.js';
import { AuthenticationStorage } from '@nestjs/authentication';
import { DrizzleSessionStore } from './drizzle-session.store.js';

describe('DrizzleSessionStore contract', () => {
  let client: PGlite;
  let store: DrizzleSessionStore;

  beforeAll(async () => {
    client = new PGlite();
    const database = drizzle(client, { schema });
    await migrate(database, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });

    const databaseService = { db: database } as unknown as DatabaseService;
    store = new DrizzleSessionStore(
      databaseService,
      new AuthenticationStorage({ contracts: [], allowInMemoryStorage: true }),
    );
  });

  afterAll(async () => {
    await client.close();
  });

  const contractCases = authenticationStoreContract(
    async () => {
      await client.query('TRUNCATE TABLE sessions');
      return { sessions: store };
    },
    { contracts: ['sessions'], concurrent: true },
  );

  for (const contractCase of contractCases) {
    it(contractCase.name, async () => {
      await contractCase.run();
    });
  }
});
