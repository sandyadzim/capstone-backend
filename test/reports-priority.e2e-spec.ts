import { assignments } from '../src/modules/database/schema.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Report priority ordering', () => {
  const ctx = usePropertyUnitsContext();

  it('ranks effective priority globally before pagination with stable oldest-first ties', async () => {
    const unit = await ctx.createUnit('Priority');
    const low = await ctx.addReport(unit.id, 'VERIFIED', {
      finalPriority: 'LOW',
      proposedPriority: 'HIGH',
      reportedAt: new Date('2026-10-17T00:00:00Z'),
    });
    const medium = await ctx.addReport(unit.id, 'VERIFIED', {
      finalPriority: 'MEDIUM',
      reportedAt: new Date('2026-10-01T00:00:00Z'),
    });
    const highNew = await ctx.addReport(unit.id, 'VERIFIED', {
      finalPriority: 'HIGH',
      reportedAt: new Date('2026-10-03T00:00:00Z'),
    });
    const highOld = await ctx.addReport(unit.id, 'VERIFIED', {
      finalPriority: 'HIGH',
      proposedPriority: 'LOW',
      reportedAt: new Date('2026-10-02T00:00:00Z'),
    });
    const highTie = await ctx.addReport(unit.id, 'VERIFIED', {
      finalPriority: 'HIGH',
      reportedAt: highOld.reportedAt,
    });
    const expected = [
      ...[highOld, highTie].sort((a, b) => a.id.localeCompare(b.id)),
      highNew,
      medium,
      low,
    ].map((report) => report.id);
    const actual: string[] = [];
    for (const page of [1, 2, 3]) {
      const response = await ctx
        .api('get', '/api/reports')
        .query({ status: 'VERIFIED', sort: 'priority', page, pageSize: 2 })
        .expect(200);
      expect(response.body.meta).toEqual({
        page,
        pageSize: 2,
        total: 5,
        totalPages: 3,
      });
      actual.push(
        ...response.body.data.map((report: { id: string }) => report.id),
      );
    }
    expect(actual).toEqual(expected);
    const omitted = await ctx
      .api('get', '/api/reports')
      .query({ status: 'VERIFIED' })
      .expect(200);
    const latest = await ctx
      .api('get', '/api/reports')
      .query({ status: 'VERIFIED', sort: 'latest' })
      .expect(200);
    expect(latest.body).toEqual(omitted.body);
    expect(latest.body.data[0].id).toBe(low.id);
  });

  it('uses proposed priority when final is absent, keeps unknown last and preserves filters and role scope', async () => {
    const own = await ctx.createUnit('Own', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const other = await ctx.createUnit('Other', {
      activeResidentUserId: ctx.ids.secondResidentId,
    });
    const unknown = await ctx.addReport(own.id, 'REPORTED', {
      proposedPriority: null,
      reportedAt: new Date('2026-10-01T00:00:00Z'),
    });
    const low = await ctx.addReport(own.id, 'REPORTED', {
      proposedPriority: 'LOW',
    });
    const high = await ctx.addReport(own.id, 'REPORTED', {
      proposedPriority: 'HIGH',
    });
    const outside = await ctx.addReport(other.id, 'REPORTED', {
      proposedPriority: 'HIGH',
    });
    await ctx.addReport(own.id, 'CLOSED', { finalPriority: 'HIGH' });
    await ctx.db
      .insert(assignments)
      .values({
        reportId: low.id,
        technicianUserId: ctx.ids.actorIds.TECHNICIAN,
        assignedByUserId: ctx.ids.actorIds.ADMIN,
      });
    for (const role of ['ADMIN', 'RESIDENT', 'TECHNICIAN'] as const) {
      const response = await ctx
        .api('get', '/api/reports', role)
        .query({ status: 'REPORTED', sort: 'priority' })
        .expect(200);
      const ids = response.body.data.map((report: { id: string }) => report.id);
      expect(response.body.meta.total).toBe(
        role === 'ADMIN' ? 4 : role === 'RESIDENT' ? 3 : 1,
      );
      if (role === 'RESIDENT')
        expect(ids).toEqual([high.id, low.id, unknown.id]);
      if (role === 'TECHNICIAN') expect(ids).toEqual([low.id]);
      if (role !== 'ADMIN') expect(ids).not.toContain(outside.id);
    }
    const filtered = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({
        status: 'REPORTED',
        sort: 'priority',
        priority: 'HIGH',
        category: 'OTHER',
        q: 'Test damage',
      })
      .expect(200);
    expect(
      filtered.body.data.map((report: { id: string }) => report.id),
    ).toEqual([high.id]);
    expect(filtered.body.meta.total).toBe(1);
  });

  it('validates strict sort input and exposes the matching OpenAPI contract', async () => {
    for (const query of [
      'sort=oldest',
      'sort=',
      'sort=PRIORITY',
      'sort=priority&sort=latest',
      'sort[order]=priority',
    ]) {
      await ctx.api('get', `/api/reports?${query}`).expect(400);
    }
    await ctx.api('get', '/api/reports?sort=priority', null).expect(401);
    const document = await ctx.api('get', '/api/docs-json', null).expect(200);
    expect(document.body.paths['/api/reports'].get.parameters).toContainEqual(
      expect.objectContaining({
        name: 'sort',
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          enum: ['latest', 'priority'],
          default: 'latest',
        },
      }),
    );
  });
});
