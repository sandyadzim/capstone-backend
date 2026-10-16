import { usePropertyUnitsContext } from './support/property-units-context.js';
import { assignments } from '../src/modules/database/schema.js';

describe('History reports API', () => {
  const ctx = usePropertyUnitsContext();

  it('filters before counts/pagination and orders history reports by timestamp then id', async () => {
    const unit = await ctx.createUnit('History', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const statuses = [
      'CLOSED',
      'REJECTED',
      'CLOSED',
      'REJECTED',
      'CLOSED',
    ] as const;
    const ongoing = [];
    for (const [index, status] of statuses.entries()) {
      ongoing.push(
        await ctx.addReport(unit.id, status, {
          reportedAt: new Date(
            index < 2
              ? '2026-10-15T05:00:00Z'
              : `2026-10-${10 + index}T05:00:00Z`,
          ),
        }),
      );
    }
    await ctx.addReport(unit.id, 'REPORTED');
    await ctx.addReport(unit.id, 'COMPLETED');
    const expected = ongoing
      .sort(
        (a, b) =>
          b.reportedAt.getTime() - a.reportedAt.getTime() ||
          b.id.localeCompare(a.id),
      )
      .map((report) => report.id);
    const first = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ historyOnly: true, pageSize: 2 })
      .expect(200);
    expect(first.body.meta).toEqual({
      page: 1,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
    expect(first.body.data.map((report: { id: string }) => report.id)).toEqual(
      expected.slice(0, 2),
    );
    const remaining = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ historyOnly: true, pageSize: 2, page: 3 })
      .expect(200);
    expect(
      remaining.body.data.map((report: { id: string }) => report.id),
    ).toEqual(expected.slice(4));
    for (const query of [{}, { historyOnly: false }]) {
      const all = await ctx
        .api('get', '/api/reports', 'RESIDENT')
        .query(query)
        .expect(200);
      expect(all.body.meta.total).toBe(7);
    }
    const allOngoing = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ historyOnly: true })
      .expect(200);
    expect(
      new Set(
        allOngoing.body.data.map((report: { status: string }) => report.status),
      ),
    ).toEqual(new Set(statuses));
    const closed = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ historyOnly: true, status: 'REPORTED' })
      .expect(200);
    expect(closed.body).toMatchObject({ data: [], meta: { total: 0 } });
    const conflicting = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ historyOnly: true, ongoingOnly: true })
      .expect(200);
    expect(conflicting.body).toMatchObject({ data: [], meta: { total: 0 } });
  });

  it('preserves role scope, combines filters, and documents strict boolean input', async () => {
    const own = await ctx.createUnit('Own', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const other = await ctx.createUnit('Other', {
      activeResidentUserId: ctx.ids.secondResidentId,
    });
    const report = await ctx.addReport(own.id, 'CLOSED', {
      title: 'Kitchen leak',
      category: 'PLUMBING',
      finalPriority: 'HIGH',
      reportedAt: new Date('2026-10-15T01:00:00Z'),
    });
    await ctx.addReport(other.id, 'CLOSED');
    await ctx.db.insert(assignments).values({
      reportId: report.id,
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
    });
    for (const role of ['ADMIN', 'RESIDENT', 'TECHNICIAN'] as const) {
      const response = await ctx
        .api('get', '/api/reports', role)
        .query({ historyOnly: true })
        .expect(200);
      expect(response.body.meta.total).toBe(role === 'ADMIN' ? 2 : 1);
    }
    const filtered = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({
        historyOnly: true,
        q: 'leak',
        status: 'CLOSED',
        category: 'PLUMBING',
        priority: 'HIGH',
        dateFrom: '2026-10-15',
        dateTo: '2026-10-15',
      })
      .expect(200);
    expect(filtered.body.data.map((item: { id: string }) => item.id)).toEqual([
      report.id,
    ]);
    for (const query of [
      'historyOnly=1',
      'historyOnly=',
      'historyOnly=true&historyOnly=false',
    ]) {
      await ctx.api('get', `/api/reports?${query}`).expect(400);
    }
    await ctx
      .api('get', '/api/reports', null)
      .query({ historyOnly: true })
      .expect(401);
    const document = await ctx.api('get', '/api/docs-json', null).expect(200);
    expect(document.body.paths['/api/reports'].get.parameters).toContainEqual(
      expect.objectContaining({
        name: 'historyOnly',
        in: 'query',
        schema: { type: 'boolean', default: false },
      }),
    );
  });
});
