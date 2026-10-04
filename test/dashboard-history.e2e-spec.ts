import { eq } from 'drizzle-orm';
import {
  assignments,
  attachments,
  costItems,
  damageReports,
  maintenanceResults,
  properties,
  units,
  users,
} from '../src/modules/database/schema.js';
import { jakartaCalendarMonthBounds } from '../src/modules/dashboard-history/dashboard-history.repository.js';
import {
  historyListSchema,
  historyUnitIdSchema,
} from '../src/modules/dashboard-history/dashboard-history.schemas.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('BE-13 close, history, and dashboard API (e2e)', () => {
  const ctx = usePropertyUnitsContext();
  const adminId = ctx.ids.actorIds.ADMIN;
  const residentId = ctx.ids.actorIds.RESIDENT;
  const technicianId = ctx.ids.actorIds.TECHNICIAN;

  async function closeableReport(
    unitId: string,
    status: 'COMPLETED' | 'CLOSED' = 'COMPLETED',
  ) {
    const report = await ctx.addReport(unitId, status);
    await ctx.db.insert(maintenanceResults).values({
      reportId: report.id,
      inspectionResult: 'Checked',
      problemFound: 'Seal worn',
      repairAction: 'Replaced seal',
      additionalNotes: null,
    });
    await ctx.db.insert(assignments).values({
      reportId: report.id,
      technicianUserId: technicianId,
      assignedByUserId: adminId,
    });
    await ctx.db.insert(attachments).values({
      reportId: report.id,
      purpose: 'RECEIPT',
      fileUrl: `https://test-app.ufs.sh/${report.id}`,
    });
    return report;
  }

  it('closes only completed work as Admin and stores closure audit atomically', async () => {
    const unit = await ctx.createUnit('CLOSE-01');
    const report = await closeableReport(unit.id);
    await ctx
      .api('post', `/api/reports/${report.id}/close`, 'RESIDENT')
      .send({})
      .expect(403);

    const response = await ctx
      .api('post', `/api/reports/${report.id}/close`)
      .send({})
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'CLOSED',
      closedBy: { id: adminId },
    });
    expect(response.body.closedAt).toBeTruthy();
    const [stored] = await ctx.db
      .select({
        status: damageReports.status,
        closedByUserId: damageReports.closedByUserId,
        closedAt: damageReports.closedAt,
      })
      .from(damageReports)
      .where(eq(damageReports.id, report.id));
    expect(stored).toMatchObject({ status: 'CLOSED', closedByUserId: adminId });
    expect(stored?.closedAt).toBeInstanceOf(Date);
    await ctx
      .api('post', `/api/reports/${report.id}/close`)
      .send({})
      .expect(409);
  });

  it('requires a result and receipt before closing and leaves completed status unchanged', async () => {
    const unit = await ctx.createUnit('CLOSE-02');
    const report = await ctx.addReport(unit.id, 'COMPLETED');
    await ctx
      .api('post', `/api/reports/${report.id}/close`)
      .send({})
      .expect(409);
    const [stored] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, report.id));
    expect(stored).toMatchObject({
      status: 'COMPLETED',
      closedByUserId: null,
      closedAt: null,
    });
  });

  it('rejects close for statuses before completion and when the receipt is missing', async () => {
    const unit = await ctx.createUnit('CLOSE-03');
    const reported = await ctx.addReport(unit.id, 'REPORTED');
    await ctx
      .api('post', `/api/reports/${reported.id}/close`)
      .send({})
      .expect(409);

    const completed = await ctx.addReport(unit.id, 'COMPLETED');
    await ctx.db.insert(maintenanceResults).values({
      reportId: completed.id,
      inspectionResult: 'Checked',
      problemFound: 'Seal worn',
      repairAction: 'Replaced seal',
    });
    await ctx
      .api('post', `/api/reports/${completed.id}/close`)
      .send({})
      .expect(409);
  });

  it('serializes simultaneous close requests so only one transition succeeds', async () => {
    const unit = await ctx.createUnit('CLOSE-RACE');
    const report = await closeableReport(unit.id);
    const responses = await Promise.all([
      ctx.api('post', `/api/reports/${report.id}/close`).send({}),
      ctx.api('post', `/api/reports/${report.id}/close`).send({}),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    const [stored] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, report.id));
    expect(stored).toMatchObject({ status: 'CLOSED', closedByUserId: adminId });
  });

  it('rejects stale Admin role and reports outside the Phase 1 property', async () => {
    const unit = await ctx.createUnit('CLOSE-SCOPE');
    const report = await closeableReport(unit.id);
    await ctx.db
      .update(users)
      .set({ role: 'RESIDENT' })
      .where(eq(users.id, adminId));
    await ctx
      .api('post', `/api/reports/${report.id}/close`)
      .send({})
      .expect(403);
    await ctx.db
      .update(users)
      .set({ role: 'ADMIN' })
      .where(eq(users.id, adminId));

    await ctx.db.insert(properties).values({
      id: ctx.ids.otherPropertyId,
      name: 'Other Property',
      address: 'Other Address',
    });
    const [otherUnit] = await ctx.db
      .insert(units)
      .values({
        propertyId: ctx.ids.otherPropertyId,
        unitNumber: 'OUTSIDE-01',
        floor: 1,
      })
      .returning();
    const outsideReport = await closeableReport(otherUnit!.id);
    await ctx
      .api('post', `/api/reports/${outsideReport.id}/close`)
      .send({})
      .expect(404);
  });

  it('lists only closed history for the resident current unit and omits reporter identity and receipt/cost details', async () => {
    const unit = await ctx.createUnit('HISTORY-01', {
      activeResidentUserId: residentId,
    });
    const closed = await closeableReport(unit.id, 'CLOSED');
    const newer = await closeableReport(unit.id, 'CLOSED');
    await ctx.db
      .update(damageReports)
      .set({ closedAt: new Date('2025-01-01T00:00:00.000Z') })
      .where(eq(damageReports.id, closed.id));
    await ctx.db
      .update(damageReports)
      .set({ closedAt: new Date('2025-02-01T00:00:00.000Z') })
      .where(eq(damageReports.id, newer.id));
    await ctx.db.insert(costItems).values({
      reportId: closed.id,
      type: 'MATERIAL',
      description: 'Seal',
      quantity: '1.000',
      unitPrice: '25.00',
    });
    await ctx.addReport(unit.id, 'REPORTED');

    const response = await ctx
      .api('get', `/api/units/${unit.id}/history?pageSize=1`, 'RESIDENT')
      .expect(200);
    expect(response.body.meta).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(response.body.data[0].id).toBe(newer.id);
    const olderResponse = await ctx
      .api('get', `/api/units/${unit.id}/history?page=2&pageSize=1`, 'RESIDENT')
      .expect(200);
    expect(olderResponse.body.data[0]).toMatchObject({
      id: closed.id,
      status: 'CLOSED',
      technician: { id: technicianId, name: 'TECHNICIAN' },
      maintenanceResult: { repairAction: 'Replaced seal' },
      totalCost: '25.00',
    });
    expect(olderResponse.body.data[0]).not.toHaveProperty('createdBy');
    expect(olderResponse.body.data[0]).not.toHaveProperty('reportedBy');
    expect(olderResponse.body.data[0]).not.toHaveProperty('receipt');
    expect(olderResponse.body.data[0]).not.toHaveProperty('costItems');
    await ctx
      .api('get', `/api/units/${unit.id}/history`, 'TECHNICIAN')
      .expect(403);

    const otherUnit = await ctx.createUnit('HISTORY-02');
    await ctx
      .api('get', `/api/units/${otherUnit.id}/history`, 'RESIDENT')
      .expect(404);
    await ctx.db
      .update(units)
      .set({ activeResidentUserId: ctx.ids.secondResidentId })
      .where(eq(units.id, unit.id));
    await ctx
      .api('get', `/api/units/${unit.id}/history`, 'RESIDENT')
      .expect(404);
  });

  it('allows Admin to read archived unit history and returns an empty page when none is closed', async () => {
    const unit = await ctx.createUnit('HISTORY-ARCHIVE', { isArchived: true });
    const response = await ctx
      .api('get', `/api/units/${unit.id}/history`)
      .expect(200);
    expect(response.body).toMatchObject({
      data: [],
      meta: { total: 0, totalPages: 0 },
    });
  });

  it('returns zero-valued metrics for an empty property', async () => {
    const response = await ctx.api('get', '/api/dashboard/summary').expect(200);
    expect(response.body).toEqual({
      totalUnits: 0,
      totalReports: 0,
      activeReports: 0,
      inProgressReports: 0,
      closedReportsThisMonth: 0,
      totalClosedCost: '0.00',
    });
    await ctx.api('get', '/api/dashboard/summary', 'RESIDENT').expect(403);
  });

  it('publishes authenticated OpenAPI contracts for all three endpoints', async () => {
    const response = await ctx.api('get', '/api/docs-json', null).expect(200);
    const paths = response.body.paths;
    const auth = response.body.paths['/api/auth/me'].get.security;
    expect(paths['/api/reports/{id}/close'].post.security).toEqual(auth);
    expect(paths['/api/units/{id}/history'].get.security).toEqual(auth);
    expect(paths['/api/dashboard/summary'].get.security).toEqual(auth);
    expect(
      paths['/api/reports/{id}/close'].post.responses['409'],
    ).toBeDefined();
    expect(paths['/api/units/{id}/history'].get.parameters).toHaveLength(3);
    expect(paths['/api/dashboard/summary'].get.responses['200']).toBeDefined();
  });

  it('counts statuses and sums rounded closed-report costs including archived units', async () => {
    const activeUnit = await ctx.createUnit('DASHBOARD-ACTIVE');
    const archivedUnit = await ctx.createUnit('DASHBOARD-ARCHIVED', {
      isArchived: true,
    });
    await ctx.addReport(activeUnit.id, 'REPORTED');
    await ctx.addReport(activeUnit.id, 'IN_PROGRESS');
    await ctx.addReport(activeUnit.id, 'REJECTED');
    await ctx.addReport(activeUnit.id, 'COMPLETED');
    const closedA = await closeableReport(activeUnit.id, 'CLOSED');
    const closedB = await closeableReport(archivedUnit.id, 'CLOSED');
    const bounds = jakartaCalendarMonthBounds(new Date());
    await ctx.db
      .update(damageReports)
      .set({
        closedAt: new Date((bounds.start.getTime() + bounds.end.getTime()) / 2),
      })
      .where(eq(damageReports.id, closedA.id));
    await ctx.db
      .update(damageReports)
      .set({ closedAt: new Date(bounds.start.getTime() - 1) })
      .where(eq(damageReports.id, closedB.id));
    await ctx.db.insert(costItems).values([
      {
        reportId: closedA.id,
        type: 'MATERIAL',
        description: 'Small part',
        quantity: '0.001',
        unitPrice: '5.00',
      },
      {
        reportId: closedB.id,
        type: 'MATERIAL',
        description: 'Small part',
        quantity: '0.001',
        unitPrice: '5.00',
      },
    ]);
    const [otherProperty] = await ctx.db
      .insert(properties)
      .values({
        id: ctx.ids.otherPropertyId,
        name: 'Other Property',
        address: 'Other Address',
      })
      .returning();
    const [otherUnit] = await ctx.db
      .insert(units)
      .values({
        propertyId: otherProperty!.id,
        unitNumber: 'OTHER-01',
        floor: 1,
      })
      .returning();
    await ctx.addReport(otherUnit!.id, 'IN_PROGRESS');

    const response = await ctx.api('get', '/api/dashboard/summary').expect(200);
    expect(response.body).toEqual({
      totalUnits: 1,
      totalReports: 6,
      activeReports: 3,
      inProgressReports: 1,
      closedReportsThisMonth: 1,
      totalClosedCost: '0.02',
    });
  });
});

describe('dashboard history schemas and Jakarta calendar boundaries', () => {
  it('validates normalized unit UUIDs and bounded pagination', () => {
    expect(
      historyUnitIdSchema.safeParse({
        id: '33000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
    expect(historyUnitIdSchema.safeParse({ id: 'invalid' }).success).toBe(
      false,
    );
    expect(historyListSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(historyListSchema.safeParse({ pageSize: '101' }).success).toBe(
      false,
    );
    expect(
      historyListSchema.safeParse({ page: '2', extra: 'no' }).success,
    ).toBe(false);
  });

  it('calculates Jakarta month starts as explicit UTC instants across a year boundary', () => {
    const { start, end } = jakartaCalendarMonthBounds(
      new Date('2026-12-31T17:30:00.000Z'),
    );
    expect(start.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-31T17:00:00.000Z');
  });
});
