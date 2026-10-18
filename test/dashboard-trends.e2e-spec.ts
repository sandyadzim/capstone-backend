import { DashboardHistoryRepository } from '../src/modules/dashboard-history/dashboard-history.repository.js';
import { costItems, properties } from '../src/modules/database/schema.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Admin monthly dashboard trends', () => {
  const ctx = usePropertyUnitsContext();

  it('fills empty months, validates the window, restricts roles, and documents the API', async () => {
    for (const role of ['RESIDENT', 'TECHNICIAN'] as const)
      await ctx.api('get', '/api/dashboard/trends', role).expect(403);
    await ctx.api('get', '/api/dashboard/trends', null).expect(401);
    for (const query of [
      'months=0',
      'months=13',
      'months=-1',
      'months=1.5',
      'months=',
      'months=6&months=3',
      'foo=1',
    ]) {
      await ctx.api('get', `/api/dashboard/trends?${query}`).expect(400);
    }
    const response = await ctx.api('get', '/api/dashboard/trends').expect(200);
    expect(response.body.timeZone).toBe('Asia/Jakarta');
    expect(Number.isNaN(Date.parse(response.body.generatedAt))).toBe(false);
    expect(response.body.months).toHaveLength(6);
    for (const month of response.body.months)
      expect(month).toMatchObject({
        reportedCount: 0,
        closedCount: 0,
        closedCost: '0.00',
      });
    const single = await ctx
      .api('get', '/api/dashboard/trends?months=1')
      .expect(200);
    expect(single.body.months).toHaveLength(1);
    const max = await ctx
      .api('get', '/api/dashboard/trends?months=12')
      .expect(200);
    expect(max.body.months).toHaveLength(12);
    const document = await ctx.api('get', '/api/docs-json', null).expect(200);
    const endpoint = document.body.paths['/api/dashboard/trends'].get;
    expect(endpoint.security).toEqual(
      document.body.paths['/api/dashboard/summary'].get.security,
    );
    expect(endpoint.parameters).toContainEqual(
      expect.objectContaining({
        name: 'months',
        schema: { type: 'integer', minimum: 1, maximum: 12, default: 6 },
      }),
    );
  });

  it('uses Jakarta calendar boundaries across years and closure dates independently of reported dates, without cost join duplication', async () => {
    const unit = await ctx.createUnit('Trend');
    const archived = await ctx.createUnit('Archived', { isArchived: true });
    await ctx.db
      .insert(properties)
      .values({
        id: ctx.ids.otherPropertyId,
        name: 'Outside',
        address: 'Other property',
      });
    const outside = await ctx.createUnit('Outside', {
      propertyId: ctx.ids.otherPropertyId,
    });
    const start = new Date('2025-08-31T17:00:00Z'); // September 1 in WIB.
    const now = new Date('2026-01-31T17:00:00Z'); // February 1 in WIB.
    await ctx.addReport(unit.id, 'REPORTED', { reportedAt: start });
    await ctx.addReport(unit.id, 'REPORTED', {
      reportedAt: new Date(start.getTime() - 1),
    });
    const closed = await ctx.addReport(archived.id, 'CLOSED', {
      reportedAt: new Date('2025-07-01T00:00:00Z'),
      closedAt: now,
    });
    const previous = await ctx.addReport(unit.id, 'CLOSED', {
      reportedAt: now,
      closedAt: new Date(now.getTime() - 1),
    });
    await ctx.addReport(unit.id, 'COMPLETED', {
      reportedAt: new Date('2026-01-02T00:00:00Z'),
    });
    const outsideReport = await ctx.addReport(outside.id, 'CLOSED', {
      reportedAt: now,
      closedAt: now,
    });
    const future = await ctx.addReport(unit.id, 'CLOSED', {
      reportedAt: new Date(now.getTime() + 1),
      closedAt: new Date(now.getTime() + 1),
    });
    for (const [reportId, price] of [
      [closed.id, '900719925474099312345.50'],
      [closed.id, '0.51'],
      [previous.id, '2.00'],
      [outsideReport.id, '100.00'],
      [future.id, '200.00'],
    ]) {
      await ctx.db
        .insert(costItems)
        .values({ reportId, type: 'SERVICE', description: 'Work', price });
    }
    const repository = ctx.app.get(DashboardHistoryRepository);
    const response = await repository.dashboardTrends(now, 6);
    expect(response.generatedAt).toEqual(now);
    expect(response.months).toEqual([
      {
        month: '2025-09',
        reportedCount: 1,
        closedCount: 0,
        closedCost: '0.00',
      },
      {
        month: '2025-10',
        reportedCount: 0,
        closedCount: 0,
        closedCost: '0.00',
      },
      {
        month: '2025-11',
        reportedCount: 0,
        closedCount: 0,
        closedCost: '0.00',
      },
      {
        month: '2025-12',
        reportedCount: 0,
        closedCount: 0,
        closedCost: '0.00',
      },
      {
        month: '2026-01',
        reportedCount: 1,
        closedCount: 1,
        closedCost: '2.00',
      },
      {
        month: '2026-02',
        reportedCount: 1,
        closedCount: 1,
        closedCost: '900719925474099312346.01',
      },
    ]);
  });
});
