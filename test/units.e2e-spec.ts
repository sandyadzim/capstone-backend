import request from 'supertest';
import {
  damageReports,
  properties,
  users,
} from '../src/modules/database/schema.js';
import { eq } from 'drizzle-orm';
import { ResidentPlacementService } from '../src/modules/units/resident-placement.service.js';
import type { Database } from '../src/modules/database/database.service.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Units API (e2e)', () => {
  const ctx = usePropertyUnitsContext();
  it('creates a unit with safe fields and updates maintenance-derived status', async () => {
    const response = await ctx
      .api('post', '/api/units')
      .send({ unitNumber: ' A-01 ', floor: -1 })
      .expect(201);
    expect(response.body).toMatchObject({
      propertyId: ctx.ids.INITIAL_PROPERTY_ID,
      unitNumber: 'A-01',
      floor: -1,
      maintenanceFlag: false,
      isArchived: false,
      activeResident: null,
      displayStatus: 'VACANT',
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'activeResident',
      'createdAt',
      'displayStatus',
      'floor',
      'id',
      'isArchived',
      'maintenanceFlag',
      'propertyId',
      'unitNumber',
      'updatedAt',
    ]);
    await ctx
      .api('patch', `/api/units/${response.body.id}`)
      .send({ unitNumber: ' B-01 ', floor: 0, maintenanceFlag: true })
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          unitNumber: 'B-01',
          floor: 0,
          displayStatus: 'MAINTENANCE',
        });
      });
  });
  it('validates UUIDs and empty patches before writing', async () => {
    const unit = await ctx.createUnit();
    await ctx.api('get', '/api/units/not-a-uuid').expect(400);
    await ctx.api('get', `/api/units/${ctx.ids.missingId}`).expect(404);
    await ctx.api('patch', `/api/units/${unit.id}`).send({}).expect(400);
    await ctx
      .api('patch', `/api/units/${unit.id}`)
      .send({ isArchived: true })
      .expect(400);
    await ctx
      .api('put', `/api/units/${unit.id}/resident`)
      .send({ residentUserId: 'bad' })
      .expect(400);
    await ctx
      .api('put', `/api/units/${unit.id}/resident`)
      .send({ residentUserId: ctx.ids.actorIds.RESIDENT, role: 'ADMIN' })
      .expect(400);
  });
  it('maps duplicate numbers to conflict while preserving case and archived reservations', async () => {
    const first = await ctx.createUnit('A-01');
    const second = await ctx.createUnit('B-01');
    await ctx
      .api('post', '/api/units')
      .send({ unitNumber: ' A-01 ', floor: 1 })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('CONFLICT'));
    await ctx
      .api('patch', `/api/units/${second.id}`)
      .send({ unitNumber: 'A-01' })
      .expect(409);
    expect(
      (await ctx.api('get', `/api/units/${second.id}`)).body.unitNumber,
    ).toBe('B-01');
    await ctx
      .api('post', '/api/units')
      .send({ unitNumber: 'a-01', floor: 1 })
      .expect(201);
    await ctx.api('post', `/api/units/${first.id}/archive`).expect(200);
    await ctx
      .api('post', '/api/units')
      .send({ unitNumber: 'A-01', floor: 1 })
      .expect(409);
  });
  it('paginates deterministically, excludes archives by default, and scopes all operations', async () => {
    await ctx.createUnit('B', { createdAt: new Date('2026-01-01T00:00:00Z') });
    await ctx.createUnit('A', { createdAt: new Date('2026-01-02T00:00:00Z') });
    await ctx.createUnit('Z', { isArchived: true });
    await ctx.db
      .insert(properties)
      .values({ id: ctx.ids.otherPropertyId, name: 'Other', address: 'Other' });
    const foreign = await ctx.createUnit('Foreign', {
      propertyId: ctx.ids.otherPropertyId,
    });
    const response = await ctx
      .api('get', '/api/units?page=1&pageSize=1')
      .expect(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(response.body.data[0].unitNumber).toBe('A');
    expect(
      (await ctx.api('get', '/api/units?page=2&pageSize=1')).body.data[0]
        .unitNumber,
    ).toBe('B');
    expect(
      (await ctx.api('get', '/api/units?page=3&pageSize=1')).body.data,
    ).toEqual([]);
    expect(
      (await ctx.api('get', '/api/units?isArchived=true')).body.data.map(
        (u: { unitNumber: string }) => u.unitNumber,
      ),
    ).toEqual(['Z']);
    for (const query of [
      'page=0',
      'pageSize=101',
      'isArchived=1',
      'unknown=true',
      'page=1&page=2',
    ])
      await ctx.api('get', `/api/units?${query}`).expect(400);
    await ctx.api('get', `/api/units/${foreign.id}`).expect(404);
    await ctx
      .api('patch', `/api/units/${foreign.id}`)
      .send({ floor: 2 })
      .expect(404);
    await ctx.api('post', `/api/units/${foreign.id}/archive`).expect(404);
    await ctx
      .api('put', `/api/units/${foreign.id}/resident`)
      .send({ residentUserId: ctx.ids.actorIds.RESIDENT })
      .expect(404);
    await ctx.api('delete', `/api/units/${foreign.id}/resident`).expect(404);
  });
  it('orders newest creations first with an ID tie-breaker across pages and updates', async () => {
    const older = await ctx.createUnit('A-OLD', {
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const timestamp = new Date('2026-01-02T00:00:00Z');
    const lowerId = await ctx.createUnit('Z-NEW', {
      id: '44000000-0000-4000-8000-000000000001',
      createdAt: timestamp,
    });
    const higherId = await ctx.createUnit('B-NEW', {
      id: '44000000-0000-4000-8000-000000000002',
      createdAt: timestamp,
    });
    // Editing an older unit must not promote it as a new creation.
    await ctx
      .api('patch', `/api/units/${older.id}`)
      .send({ floor: 2 })
      .expect(200);
    for (const [index, expected] of [higherId, lowerId, older].entries()) {
      const response = await ctx
        .api('get', `/api/units?page=${index + 1}&pageSize=1`)
        .expect(200);
      expect(response.body.data.map((unit: { id: string }) => unit.id)).toEqual(
        [expected.id],
      );
      expect(response.body.meta).toMatchObject({
        page: index + 1,
        total: 3,
        totalPages: 3,
      });
    }
  });
  it('searches literal unit numbers with matching totals, pagination and property/archive scope', async () => {
    await ctx.createUnit('Ab-101', {
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await ctx.createUnit('AB-102', {
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    await ctx.createUnit('AB-103', { isArchived: true });
    await ctx.createUnit('Other');
    await ctx.db
      .insert(properties)
      .values({ id: ctx.ids.otherPropertyId, name: 'Other', address: 'Other' });
    await ctx.createUnit('AB-104', { propertyId: ctx.ids.otherPropertyId });
    const result = await ctx
      .api('get', '/api/units?q=%20ab-10%20&pageSize=1&page=2')
      .expect(200);
    expect(result.body.meta).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(
      result.body.data.map((unit: { unitNumber: string }) => unit.unitNumber),
    ).toEqual(['Ab-101']);
    const archived = await ctx
      .api('get', '/api/units?q=ab-10&isArchived=true')
      .expect(200);
    expect(
      archived.body.data.map((unit: { unitNumber: string }) => unit.unitNumber),
    ).toEqual(['AB-103']);
    const empty = await ctx.api('get', '/api/units?q=missing').expect(200);
    expect(empty.body.meta.total).toBe(0);
    expect(empty.body.data).toEqual([]);
    const blank = await ctx.api('get', '/api/units?q=%20%20').expect(200);
    expect(blank.body.meta.total).toBe(3);
    for (const query of ['q=' + 'a'.repeat(41), 'q=A&q=B'])
      await ctx.api('get', '/api/units?' + query).expect(400);
  });
  it('filters computed display status before pagination with search and archive/property scope', async () => {
    await ctx.createUnit('A-01');
    await ctx.createUnit('A-02', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    await ctx.createUnit('A-03', {
      maintenanceFlag: true,
      createdAt: new Date('2026-01-02T00:00:00Z'),
      activeResidentUserId: ctx.ids.secondResidentId,
    });
    await ctx.createUnit('A-04', {
      maintenanceFlag: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await ctx.createUnit('A-05', { maintenanceFlag: true, isArchived: true });
    await ctx.db.insert(properties).values({
      id: ctx.ids.otherPropertyId,
      name: 'Other',
      address: 'Other',
    });
    await ctx.createUnit('A-06', {
      maintenanceFlag: true,
      propertyId: ctx.ids.otherPropertyId,
    });
    const vacant = await ctx
      .api('get', '/api/units?displayStatus=VACANT')
      .expect(200);
    expect(
      vacant.body.data.map((unit: { unitNumber: string }) => unit.unitNumber),
    ).toEqual(['A-01']);
    const occupied = await ctx
      .api('get', '/api/units?displayStatus=OCCUPIED&q=a-')
      .expect(200);
    expect(occupied.body.meta.total).toBe(1);
    expect(occupied.body.data[0]).toMatchObject({
      unitNumber: 'A-02',
      displayStatus: 'OCCUPIED',
    });
    const maintenance = await ctx
      .api('get', '/api/units?displayStatus=MAINTENANCE&q=a-&pageSize=1&page=2')
      .expect(200);
    expect(maintenance.body.meta).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(maintenance.body.data[0]).toMatchObject({
      unitNumber: 'A-04',
      displayStatus: 'MAINTENANCE',
    });
    const archived = await ctx
      .api('get', '/api/units?displayStatus=MAINTENANCE&isArchived=true')
      .expect(200);
    expect(archived.body.meta.total).toBe(1);
    expect(archived.body.data[0].unitNumber).toBe('A-05');
    const empty = await ctx
      .api('get', '/api/units?displayStatus=OCCUPIED&page=2')
      .expect(200);
    expect(empty.body.meta.total).toBe(1);
    expect(empty.body.data).toEqual([]);
    for (const query of [
      'displayStatus=unknown',
      'displayStatus=',
      'displayStatus=VACANT&displayStatus=OCCUPIED',
    ])
      await ctx.api('get', '/api/units?' + query).expect(400);
  });
  it('classifies inactive or non-resident accounts as vacant for status filtering', async () => {
    await ctx.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, ctx.ids.secondResidentId));
    await ctx.createUnit('Inactive', {
      activeResidentUserId: ctx.ids.secondResidentId,
    });
    await ctx.createUnit('Technician', {
      activeResidentUserId: ctx.ids.actorIds.TECHNICIAN,
    });
    const vacant = await ctx
      .api('get', '/api/units?displayStatus=VACANT')
      .expect(200);
    expect(vacant.body.meta.total).toBe(2);
    for (const unit of vacant.body.data)
      expect(unit).toMatchObject({
        displayStatus: 'VACANT',
        activeResident: null,
      });
    const occupied = await ctx
      .api('get', '/api/units?displayStatus=OCCUPIED')
      .expect(200);
    expect(occupied.body.meta.total).toBe(0);
  });
  it('escapes SQL wildcard characters and accepts quotes as literal search text', async () => {
    for (const number of ['A%1', 'A_1', 'A\\1', "A'1", 'AX1'])
      await ctx.createUnit(number);
    for (const [query, expected] of [
      ['%', 'A%1'],
      ['_', 'A_1'],
      ['\\', 'A\\1'],
      ["'", "A'1"],
    ]) {
      const result = await ctx
        .api('get', '/api/units?q=' + encodeURIComponent(query))
        .expect(200);
      expect(result.body.meta.total).toBe(1);
      expect(result.body.data[0].unitNumber).toBe(expected);
    }
  });
  it('places and moves a resident atomically, supports repeated placement, and never exposes credentials', async () => {
    const first = await ctx.createUnit('A');
    const second = await ctx.createUnit('B');
    const place = (id: string) =>
      ctx
        .api('put', `/api/units/${id}/resident`)
        .send({ residentUserId: ctx.ids.actorIds.RESIDENT })
        .expect(200);
    const response = await place(first.id);
    expect(response.body.activeResident).toEqual({
      id: ctx.ids.actorIds.RESIDENT,
      name: 'RESIDENT',
      loginIdentifier: 'resident@example.test',
    });
    expect(response.body.displayStatus).toBe('OCCUPIED');
    await place(first.id);
    await place(second.id);
    expect(
      (await ctx.api('get', `/api/units/${first.id}`)).body.activeResident,
    ).toBeNull();
    expect(
      (await ctx.api('get', `/api/units/${second.id}`)).body.activeResident.id,
    ).toBe(ctx.ids.actorIds.RESIDENT);
    expect(
      JSON.stringify((await ctx.api('get', '/api/units')).body),
    ).not.toMatch(/passwordHash|password_hash|activeResidentUserId/);
    await ctx
      .api('patch', `/api/units/${second.id}`)
      .send({ maintenanceFlag: true })
      .expect(200)
      .expect((res) => expect(res.body.displayStatus).toBe('MAINTENANCE'));
  });
  it('keeps the old placement when the destination is occupied, archived, or missing', async () => {
    const first = await ctx.createUnit('A', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const occupied = await ctx.createUnit('B', {
      activeResidentUserId: ctx.ids.secondResidentId,
    });
    const archived = await ctx.createUnit('C', { isArchived: true });
    for (const [id, status] of [
      [occupied.id, 409],
      [archived.id, 409],
      [ctx.ids.missingId, 404],
    ] as const) {
      await ctx
        .api('put', `/api/units/${id}/resident`)
        .send({ residentUserId: ctx.ids.actorIds.RESIDENT })
        .expect(status);
      expect(
        (await ctx.api('get', `/api/units/${first.id}`)).body.activeResident.id,
      ).toBe(ctx.ids.actorIds.RESIDENT);
    }
    expect(
      (await ctx.api('get', `/api/units/${occupied.id}`)).body.activeResident
        .id,
    ).toBe(ctx.ids.secondResidentId);
  });
  it('rejects non-residents, inactive residents, and missing accounts', async () => {
    const unit = await ctx.createUnit();
    for (const id of [ctx.ids.actorIds.ADMIN, ctx.ids.actorIds.TECHNICIAN])
      await ctx
        .api('put', `/api/units/${unit.id}/resident`)
        .send({ residentUserId: id })
        .expect(409);
    await ctx.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, ctx.ids.secondResidentId));
    await ctx
      .api('put', `/api/units/${unit.id}/resident`)
      .send({ residentUserId: ctx.ids.secondResidentId })
      .expect(409);
    await ctx
      .api('put', `/api/units/${unit.id}/resident`)
      .send({ residentUserId: ctx.ids.missingId })
      .expect(404);
  });
  it('releases idempotently without deactivating the account and composes with account transactions', async () => {
    const unit = await ctx.createUnit('A', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    await ctx
      .api('delete', `/api/units/${unit.id}/resident`)
      .expect(200)
      .expect((res) => expect(res.body.displayStatus).toBe('VACANT'));
    await ctx.api('delete', `/api/units/${unit.id}/resident`).expect(200);
    expect(
      (
        await ctx.db
          .select()
          .from(users)
          .where(eq(users.id, ctx.ids.actorIds.RESIDENT))
      )[0].isActive,
    ).toBe(true);
    const placement = ctx.app.get(ResidentPlacementService);
    const database = ctx.db as unknown as Database;
    await expect(
      database.transaction(async (tx) => {
        await placement.place(unit.id, ctx.ids.secondResidentId, tx);
        throw new Error('Rollback account transaction');
      }),
    ).rejects.toThrow('Rollback account transaction');
    expect(
      (await ctx.api('get', `/api/units/${unit.id}`)).body.activeResident,
    ).toBeNull();
    await placement.place(unit.id, ctx.ids.secondResidentId);
    await database.transaction(async (tx) => {
      await placement.releaseForResident(ctx.ids.secondResidentId, tx);
      await tx
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, ctx.ids.secondResidentId));
    });
    expect(
      (await ctx.api('get', `/api/units/${unit.id}`)).body.activeResident,
    ).toBeNull();
  });
  it('rejects archive while occupied, and archives empty units idempotently', async () => {
    const unit = await ctx.createUnit('A', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    await ctx.api('post', `/api/units/${unit.id}/archive`).expect(409);
    await ctx.api('delete', `/api/units/${unit.id}/resident`).expect(200);
    await ctx
      .api('post', `/api/units/${unit.id}/archive`)
      .expect(200)
      .expect((res) => expect(res.body.isArchived).toBe(true));
    await ctx.api('post', `/api/units/${unit.id}/archive`).expect(200);
    await ctx.api('get', `/api/units/${unit.id}`).expect(200);
    await ctx
      .api('patch', `/api/units/${unit.id}`)
      .send({ floor: 2 })
      .expect(409);
    await ctx
      .api('put', `/api/units/${unit.id}/resident`)
      .send({ residentUserId: ctx.ids.actorIds.RESIDENT })
      .expect(409);
  });
  it.each([
    'REPORTED',
    'VERIFIED',
    'ASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
  ] as const)('blocks archive with a %s report', async (status) => {
    const unit = await ctx.createUnit();
    await ctx.addReport(unit.id, status);
    await ctx.api('post', `/api/units/${unit.id}/archive`).expect(409);
    expect(
      (await ctx.api('get', `/api/units/${unit.id}`)).body.isArchived,
    ).toBe(false);
  });
  it('archives units with only terminal reports and preserves history', async () => {
    const unit = await ctx.createUnit();
    const closed = await ctx.addReport(unit.id, 'CLOSED');
    const rejected = await ctx.addReport(unit.id, 'REJECTED');
    await ctx.api('post', `/api/units/${unit.id}/archive`).expect(200);
    expect(
      (await ctx.db.select({ id: damageReports.id }).from(damageReports))
        .map((r) => r.id)
        .sort(),
    ).toEqual([closed.id, rejected.id].sort());
  });
  it('retains existing origin/CSRF rules for authenticated mutations', async () => {
    const unit = await ctx.createUnit();
    await request(ctx.app.getHttpServer())
      .patch(`/api/units/${unit.id}`)
      .set('Cookie', ctx.cookies.ADMIN)
      .set('Origin', 'https://untrusted.example')
      .send({ floor: 2 })
      .expect(403);
    expect((await ctx.api('get', `/api/units/${unit.id}`)).body.floor).toBe(1);
  });

  it('requires a session and restricts every unit operation to Admin', async () => {
    const unit = await ctx.createUnit();
    const calls = [
      ['get', '/api/units'],
      ['post', '/api/units'],
      ['get', `/api/units/${unit.id}`],
      ['patch', `/api/units/${unit.id}`],
      ['post', `/api/units/${unit.id}/archive`],
      ['put', `/api/units/${unit.id}/resident`],
      ['delete', `/api/units/${unit.id}/resident`],
    ] as const;
    for (const [method, path] of calls) {
      await ctx.api(method, path, null).expect(401);
      for (const role of ['TECHNICIAN', 'RESIDENT'] as const) {
        await ctx.api(method, path, role).expect(403);
      }
    }
  });

  it('returns 404 for unit operations when the Phase 1 property is absent', async () => {
    await ctx.db
      .delete(properties)
      .where(eq(properties.id, ctx.ids.INITIAL_PROPERTY_ID));
    await ctx.db.insert(properties).values({
      id: ctx.ids.otherPropertyId,
      name: 'Other',
      address: 'Other Address',
    });
    await ctx.api('get', '/api/units').expect(404);
    await ctx
      .api('post', '/api/units')
      .send({ unitNumber: 'A', floor: 1 })
      .expect(404);
  });

  it.each([
    { unitNumber: ' ', floor: 1 },
    { unitNumber: 'a'.repeat(41), floor: 1 },
    { unitNumber: 'A', floor: 32768 },
    { unitNumber: 'A', floor: -32769 },
    { unitNumber: 'A', floor: '1' },
    { unitNumber: 'A', floor: 1.5 },
    {
      unitNumber: 'A',
      floor: 1,
      propertyId: '99000000-0000-4000-8000-000000000001',
    },
  ])('returns validation issues for invalid unit body %j', async (body) => {
    const response = await ctx.api('post', '/api/units').send(body).expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: expect.any(Array) },
    });
  });

  it('documents the unit routes, input/response schemas, and cookie security', async () => {
    const document = (
      await request(ctx.app.getHttpServer()).get('/api/docs-json').expect(200)
    ).body;
    const paths = [
      '/api/units',
      '/api/units/{id}',
      '/api/units/{id}/archive',
      '/api/units/{id}/resident',
    ];
    for (const path of paths) {
      for (const operation of Object.values(document.paths[path]) as {
        security: unknown;
        responses: Record<string, unknown>;
      }[]) {
        expect(operation.security).toEqual(
          document.paths['/api/auth/me'].get.security,
        );
        expect(operation.responses['401']).toBeDefined();
        expect(operation.responses['403']).toBeDefined();
        expect(operation.responses['404']).toBeDefined();
        expect(operation.responses['500']).toBeDefined();
      }
    }
    expect(document.paths['/api/units'].post.responses['201']).toBeDefined();
    expect(
      document.paths['/api/units/{id}/archive'].post.responses['200'],
    ).toBeDefined();
    expect(
      JSON.stringify(document.paths['/api/units'].post.requestBody),
    ).toContain('unitNumber');
    expect(
      document.paths['/api/units'].get.parameters
        .map((p: { name: string }) => p.name)
        .sort(),
    ).toEqual(['displayStatus', 'isArchived', 'page', 'pageSize', 'q']);
    expect(
      document.paths['/api/units'].get.parameters.find(
        (p: { name: string }) => p.name === 'q',
      ),
    ).toMatchObject({
      required: false,
      schema: { type: 'string', maxLength: 40 },
    });
    expect(
      document.paths['/api/units'].get.parameters.find(
        (p: { name: string }) => p.name === 'displayStatus',
      ),
    ).toMatchObject({
      required: false,
      schema: { type: 'string', enum: ['MAINTENANCE', 'OCCUPIED', 'VACANT'] },
    });
    expect(
      document.components.schemas.UnitResponseDto.properties.displayStatus.enum,
    ).toEqual(['MAINTENANCE', 'OCCUPIED', 'VACANT']);
  });
});
