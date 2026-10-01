import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import {
  assignments,
  attachments,
  damageReports,
  properties,
  schema,
  units,
  users,
} from './schema.js';
import type { Database } from './database.service.js';
import { seedInitialData } from './seed-initial-data.js';

describe('PostgreSQL schema and initial seed', () => {
  let client: PGlite;
  let database: PgliteDatabase<typeof schema>;

  beforeEach(async () => {
    client = new PGlite();
    database = drizzle(client, { schema });
    await migrate(database, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('applies ordered migrations and can safely run them again', async () => {
    await migrate(database, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });

    const result = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    expect(result.rows.map(({ tablename }) => tablename)).toEqual([
      'assignments',
      'attachments',
      'cost_items',
      'damage_reports',
      'maintenance_results',
      'properties',
      'units',
      'users',
    ]);

    const columns = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'attachments' ORDER BY ordinal_position",
    );
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      'id',
      'report_id',
      'purpose',
      'file_url',
      'created_at',
    ]);
  });

  it('enforces unit uniqueness, report relations, one assignment, and one receipt', async () => {
    const [property] = await database
      .insert(properties)
      .values({ name: 'Property', address: 'Address' })
      .returning();
    const [admin] = await database
      .insert(users)
      .values({
        name: 'Admin',
        loginIdentifier: 'admin@example.test',
        passwordHash: 'argon2id-hash',
        role: 'ADMIN',
      })
      .returning();
    const [unit] = await database
      .insert(units)
      .values({ propertyId: property.id, unitNumber: 'A-01', floor: 1 })
      .returning();
    const [report] = await database
      .insert(damageReports)
      .values({
        reportNumber: 'RPT-001',
        unitId: unit.id,
        createdByUserId: admin.id,
        reportedByUserId: admin.id,
        title: 'Leak',
        description: 'A visible water leak',
        category: 'PLUMBING',
        proposedPriority: 'MEDIUM',
        status: 'REPORTED',
      })
      .returning();

    await expect(
      database.insert(units).values({
        propertyId: property.id,
        unitNumber: 'A-01',
        floor: 1,
      }),
    ).rejects.toThrow();

    await database.insert(assignments).values({
      reportId: report.id,
      technicianUserId: admin.id,
      assignedByUserId: admin.id,
    });
    await expect(
      database.insert(assignments).values({
        reportId: report.id,
        technicianUserId: admin.id,
        assignedByUserId: admin.id,
      }),
    ).rejects.toThrow();

    await database.insert(attachments).values({
      reportId: report.id,
      purpose: 'RECEIPT',
      fileUrl: 'https://files.example/receipt-1',
    });
    await expect(
      database.insert(attachments).values({
        reportId: report.id,
        purpose: 'RECEIPT',
        fileUrl: 'https://files.example/receipt-2',
      }),
    ).rejects.toThrow();

    await database.insert(attachments).values({
      reportId: report.id,
      purpose: 'DAMAGE_PHOTO',
      fileUrl: 'https://files.example/damage-photo',
    });

    const [beforeUpdate] = await database
      .select({ updatedAt: properties.updatedAt })
      .from(properties)
      .where(eq(properties.id, property.id));
    await database
      .update(properties)
      .set({ name: 'Updated Property', updatedAt: new Date('2000-01-01') })
      .where(eq(properties.id, property.id));
    const [afterUpdate] = await database
      .select({ updatedAt: properties.updatedAt })
      .from(properties)
      .where(eq(properties.id, property.id));
    expect(afterUpdate.updatedAt.getTime()).toBeGreaterThan(
      new Date('2000-01-01').getTime(),
    );
    expect(afterUpdate.updatedAt.getTime()).toBeGreaterThanOrEqual(
      beforeUpdate.updatedAt.getTime(),
    );

    await expect(
      database.delete(properties).where(eq(properties.id, property.id)),
    ).rejects.toThrow();
  });

  it('seeds the property and Admin idempotently without replacing credentials', async () => {
    const hashPassword = vi.fn(async () => '$argon2id$test-hash');
    const seedInput = {
      propertyName: 'Initial Property',
      propertyAddress: 'Initial Address',
      adminName: 'Initial Admin',
      adminLoginIdentifier: ' Admin@Example.Test ',
      adminPassword: randomBytes(32).toString('base64url'),
    };

    const firstRun = await seedInitialData(
      database as unknown as Database,
      seedInput,
      hashPassword,
    );
    const secondRun = await seedInitialData(
      database as unknown as Database,
      seedInput,
      hashPassword,
    );

    const [storedAdmin] = await database
      .select()
      .from(users)
      .where(eq(users.id, firstRun.adminId));
    const propertyRows = await database.select().from(properties);
    const adminRows = await database
      .select()
      .from(users)
      .where(eq(users.role, 'ADMIN'));

    expect(firstRun.adminCreated).toBe(true);
    expect(secondRun).toEqual({ ...firstRun, adminCreated: false });
    expect(propertyRows).toHaveLength(1);
    expect(adminRows).toHaveLength(1);
    expect(storedAdmin.passwordHash).toBe('$argon2id$test-hash');
    expect(storedAdmin.passwordHash).not.toBe(seedInput.adminPassword);
    expect(hashPassword).toHaveBeenCalledTimes(1);
  });
});
