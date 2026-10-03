import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../src/modules/database/database.service.js';
import {
  schema,
  properties,
  units,
  users,
} from '../src/modules/database/schema.js';
import { INITIAL_PROPERTY_ID } from '../src/modules/property/property.constants.js';
import { UnitsRepository } from '../src/modules/units/units.repository.js';
import { PropertyService } from '../src/modules/property/property.service.js';
import { UnitsService } from '../src/modules/units/units.service.js';
import { ResidentPlacementService } from '../src/modules/units/resident-placement.service.js';

// Opt in to real PostgreSQL checks. All writes, including migration functions
// and foreign keys, are redirected into a disposable, random test schema.
const databaseUrl = process.env.TEST_DATABASE_URL;
const testSchema = `be06_test_${randomUUID().replaceAll('-', '')}`;
const residentA = '44000000-0000-4000-8000-000000000001';
const residentB = '44000000-0000-4000-8000-000000000002';

describe.skipIf(!databaseUrl)('Property/unit concurrency on PostgreSQL', () => {
  let control: Sql;
  let schemaCreated = false;
  let firstClient: Sql;
  let secondClient: Sql;
  let first: DatabaseService;
  let second: DatabaseService;
  let secondPid: number;
  let firstRepository: UnitsRepository;
  let firstUnits: UnitsService;
  let firstPlacement: ResidentPlacementService;
  let secondUnits: UnitsService;
  let secondPlacement: ResidentPlacementService;

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }
    control = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
    await control`CREATE SCHEMA ${control(testSchema)}`;
    schemaCreated = true;
    const options = {
      max: 1,
      prepare: false,
      connection: { search_path: testSchema },
      onnotice: () => {},
    };
    firstClient = postgres(databaseUrl!, options);
    secondClient = postgres(databaseUrl!, options);
    for (const file of ['0000_initial_schema.sql', '0001_auth_sessions.sql']) {
      const migration = (await readFile(resolve('drizzle', file), 'utf8'))
        .replaceAll('"public".', `"${testSchema}".`)
        .replaceAll('public.', `"${testSchema}".`);
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) await firstClient.unsafe(statement);
      }
    }
    first = new DatabaseService(firstClient, drizzle(firstClient, { schema }));
    second = new DatabaseService(
      secondClient,
      drizzle(secondClient, { schema }),
    );
    firstRepository = new UnitsRepository(first);
    const secondRepository = new UnitsRepository(second);
    firstUnits = new UnitsService(
      first,
      firstRepository,
      new PropertyService(firstRepository),
    );
    secondUnits = new UnitsService(
      second,
      secondRepository,
      new PropertyService(secondRepository),
    );
    firstPlacement = new ResidentPlacementService(first, firstRepository);
    secondPlacement = new ResidentPlacementService(second, secondRepository);
    secondPid = (await secondClient`SELECT pg_backend_pid() AS pid`)[0].pid;
    await first.db.insert(properties).values({
      id: INITIAL_PROPERTY_ID,
      name: 'Concurrency test',
      address: 'Isolated schema',
    });
    await first.db.insert(users).values(
      [residentA, residentB].map((id, index) => ({
        id,
        name: `Resident ${index}`,
        loginIdentifier: `resident-${index}@example.test`,
        role: 'RESIDENT' as const,
        passwordHash: 'test-only-no-login',
      })),
    );
  });
  beforeEach(async () => {
    if (first) {
      await first.db.delete(units);
    }
  });
  afterAll(async () => {
    await Promise.all([firstClient?.end(), secondClient?.end()]);
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
  async function createUnit(number: string) {
    const [unit] = await first.db
      .insert(units)
      .values({ propertyId: INITIAL_PROPERTY_ID, unitNumber: number, floor: 1 })
      .returning();
    return unit;
  }
  async function waitForBlockedConnection() {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] =
        await control`SELECT cardinality(pg_blocking_pids(${secondPid}::integer)) > 0 AS blocked`;
      if (row.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      'Second PostgreSQL connection did not wait on the expected row lock',
    );
  }
  // Hold the first operation after its writes but before COMMIT. The competing
  // request must actually wait on a PostgreSQL lock before we release it.
  async function compete(
    firstAction: () => Promise<unknown>,
    secondAction: () => Promise<unknown>,
  ) {
    const ready = Promise.withResolvers<void>();
    const commit = Promise.withResolvers<void>();
    const original = first.transaction.bind(first);
    const spy = vi.spyOn(first, 'transaction').mockImplementation((work) =>
      original(async (tx) => {
        const result = await work(tx);
        ready.resolve();
        await commit.promise;
        return result;
      }),
    );
    const firstTask = firstAction();
    let secondTask: Promise<PromiseSettledResult<unknown>> | undefined;
    try {
      await Promise.race([ready.promise, firstTask]);
      secondTask = secondAction().then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
      );
      await waitForBlockedConnection();
    } finally {
      commit.resolve();
      spy.mockRestore();
      // Always consume both tasks so failures cannot leak unhandled rejections.
      await Promise.allSettled([firstTask, secondTask]);
    }
    await firstTask;
    return secondTask!;
  }
  it('serializes moves for the same resident and keeps exactly one placement', async () => {
    const a = await createUnit('A');
    const b = await createUnit('B');
    const result = await compete(
      () => firstPlacement.place(a.id, residentA),
      () => secondPlacement.place(b.id, residentA),
    );
    expect(result.status).toBe('fulfilled');
    const placements = await first.db
      .select()
      .from(units)
      .where(eq(units.activeResidentUserId, residentA));
    expect(placements.map((unit) => unit.id)).toEqual([b.id]);
    expect((await firstUnits.get(a.id)).activeResident).toBeNull();
  });
  it('allows only one of two residents competing for the same destination', async () => {
    const target = await createUnit('A');
    const result = await compete(
      () => firstPlacement.place(target.id, residentA),
      () => secondPlacement.place(target.id, residentB),
    );
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'CONFLICT' } },
    });
    expect((await firstUnits.get(target.id)).activeResident?.id).toBe(
      residentA,
    );
  });
  it('rejects placement when a competing archive commits first', async () => {
    const target = await createUnit('A');
    const result = await compete(
      () => firstUnits.archive(target.id),
      () => secondPlacement.place(target.id, residentA),
    );
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'CONFLICT' } },
    });
    expect(await firstUnits.get(target.id)).toMatchObject({
      isArchived: true,
      activeResident: null,
    });
  });
  it('rejects archive when a competing placement commits first', async () => {
    const target = await createUnit('A');
    const result = await compete(
      () => firstPlacement.place(target.id, residentA),
      () => secondUnits.archive(target.id),
    );
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'CONFLICT' } },
    });
    expect(await firstUnits.get(target.id)).toMatchObject({
      isArchived: false,
      activeResident: { id: residentA },
    });
  });
  it('detects a changed resident when release waits for another placement', async () => {
    const target = await createUnit('A');
    const result = await compete(
      () => firstPlacement.place(target.id, residentA),
      () => secondPlacement.release(target.id),
    );
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'CONFLICT' } },
    });
    expect((await firstUnits.get(target.id)).activeResident?.id).toBe(
      residentA,
    );
  });
  it('maps native PostgreSQL duplicate number errors to a safe conflict', async () => {
    await createUnit('A');
    await expect(
      firstUnits.create({ unitNumber: 'A', floor: 2 }),
    ).rejects.toMatchObject({
      response: { code: 'CONFLICT', message: 'Unit number is already in use' },
    });
  });
});
