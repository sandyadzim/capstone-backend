import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureHttpApplication } from '../../src/configure-http-application.js';
import { getApiEnvironment } from '../../src/config/environment.js';
import { DATABASE_CLIENT } from '../../src/modules/database/database.module.js';
import { DatabaseService } from '../../src/modules/database/database.service.js';
import type { Database } from '../../src/modules/database/database.service.js';
import {
  schema,
  properties,
  units,
  users,
  assignments,
  attachments,
  costItems,
  damageReports,
  maintenanceResults,
} from '../../src/modules/database/schema.js';
import type {
  DamageReportStatus,
  UserRole,
} from '../../src/modules/database/schema.js';
import { INITIAL_PROPERTY_ID } from '../../src/modules/property/property.constants.js';
import { UploadThingStorageService } from '../../src/modules/attachments/uploadthing-storage.service.js';

const origin = 'http://localhost:5173';
const password = 'test-only-password';
const actorIds = {
  ADMIN: '33000000-0000-4000-8000-000000000001',
  TECHNICIAN: '33000000-0000-4000-8000-000000000002',
  RESIDENT: '33000000-0000-4000-8000-000000000003',
};
const secondResidentId = '33000000-0000-4000-8000-000000000004';

export function usePropertyUnitsContext() {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;
  let app: INestApplication<App>;
  const cookies: Record<string, string> = {};
  let nextFileKey = 0;
  const storage = {
    upload: vi.fn(async () => {
      nextFileKey += 1;
      const fileKey = `test-file-${nextFileKey}.png`;
      return { fileUrl: `https://test-app.ufs.sh/f/${fileKey}`, fileKey };
    }),
    delete: vi.fn(async () => undefined),
    deleteByUrl: vi.fn(async () => undefined),
  };
  const ids = {
    INITIAL_PROPERTY_ID,
    actorIds,
    secondResidentId,
    otherPropertyId: '22000000-0000-4000-8000-000000000001',
    missingId: '99000000-0000-4000-8000-000000000001',
  };

  const context = {
    ids,
    cookies,
    get app() {
      return app;
    },
    get db() {
      return db;
    },
    storage,
    api(
      method: 'get' | 'post' | 'patch' | 'put' | 'delete',
      path: string,
      role: UserRole | null = 'ADMIN',
    ) {
      const call = request(app.getHttpServer())
        [method](path)
        .set('Origin', origin);
      return role ? call.set('Cookie', cookies[role]) : call;
    },
    async createUnit(
      unitNumber = 'A-01',
      extra: Partial<typeof units.$inferInsert> = {},
    ) {
      const [unit] = await db
        .insert(units)
        .values({
          propertyId: INITIAL_PROPERTY_ID,
          unitNumber,
          floor: 1,
          ...extra,
        })
        .returning();
      return unit;
    },
    async addReport(unitId: string, status: DamageReportStatus = 'REPORTED') {
      const [report] = await db
        .insert(damageReports)
        .values({
          unitId,
          reportNumber: `R-${randomUUID().replaceAll('-', '').slice(0, 30)}`,
          title: 'Test damage',
          description: 'Test description',
          category: 'OTHER',
          createdByUserId: actorIds.ADMIN,
          reportedByUserId: actorIds.ADMIN,
          status,
          finalPriority: status === 'REPORTED' ? null : 'LOW',
          reviewedByUserId: status === 'REJECTED' ? actorIds.ADMIN : null,
          rejectionReason: status === 'REJECTED' ? 'Invalid report' : null,
          closedAt: status === 'CLOSED' ? new Date() : null,
          closedByUserId: status === 'CLOSED' ? actorIds.ADMIN : null,
        })
        .returning();
      return report;
    },
  };

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
    });
    await db.insert(properties).values({
      id: INITIAL_PROPERTY_ID,
      name: 'Test Property',
      address: 'Test Address',
    });
    for (const role of ['ADMIN', 'TECHNICIAN', 'RESIDENT'] as const) {
      await db.insert(users).values({
        id: actorIds[role],
        name: role,
        loginIdentifier: `${role.toLowerCase()}@example.test`,
        passwordHash,
        role,
      });
    }
    await db.insert(users).values({
      id: secondResidentId,
      name: 'Second resident',
      loginIdentifier: 'second@example.test',
      passwordHash,
      role: 'RESIDENT',
    });
    const database = db as unknown as Database;
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_CLIENT)
      .useValue({})
      .overrideProvider(DatabaseService)
      .useValue({
        db: database,
        transaction: database.transaction.bind(database),
      })
      .overrideProvider(UploadThingStorageService)
      .useValue(storage)
      .compile();
    app = fixture.createNestApplication<INestApplication<App>>();
    configureHttpApplication(app, getApiEnvironment(app.get(ConfigService)));
    await app.init();
    await app.listen(0, '127.0.0.1');
    for (const role of ['ADMIN', 'TECHNICIAN', 'RESIDENT'] as const) {
      const response = await context
        .api('post', '/api/auth/login', null)
        .send({
          loginIdentifier: `${role.toLowerCase()}@example.test`,
          password,
        })
        .expect(200);
      cookies[role] = response.headers['set-cookie'][0].split(';', 1)[0];
    }
  });

  beforeEach(async () => {
    await db.execute(sql.raw(
      'ALTER TABLE cost_items DROP CONSTRAINT IF EXISTS test_cost_items_no_trigger_failure',
    ));
    await db.execute(sql.raw(
      'ALTER TABLE damage_reports DROP CONSTRAINT IF EXISTS test_reports_no_completed',
    ));
    nextFileKey = 0;
    storage.upload.mockClear();
    storage.delete.mockClear();
    storage.deleteByUrl.mockClear();
    await db.delete(assignments);
    await db.delete(attachments);
    await db.delete(costItems);
    await db.delete(maintenanceResults);
    await db.delete(damageReports);
    await db.delete(units);
    await db.delete(properties).where(eq(properties.id, ids.otherPropertyId));
    await db
      .insert(properties)
      .values({
        id: INITIAL_PROPERTY_ID,
        name: 'Test Property',
        address: 'Test Address',
      })
      .onConflictDoNothing();
    await db
      .update(properties)
      .set({ name: 'Test Property', address: 'Test Address', logoUrl: null })
      .where(eq(properties.id, INITIAL_PROPERTY_ID));
    await db
      .update(users)
      .set({ isActive: true, role: 'RESIDENT' })
      .where(eq(users.id, secondResidentId));
    await db
      .update(users)
      .set({ isActive: true, role: 'TECHNICIAN' })
      .where(eq(users.id, actorIds.TECHNICIAN));
  });

  afterAll(async () => {
    await app?.close();
    await client?.close();
  });

  return context;
}
