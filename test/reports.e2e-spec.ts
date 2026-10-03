import { eq } from 'drizzle-orm';
import {
  assignments,
  attachments,
  damageReports,
  properties,
} from '../src/modules/database/schema.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Reports API (e2e)', () => {
  const ctx = usePropertyUnitsContext();
  const payload = (unitId: string, title = 'AC tidak dingin') => ({
    unitId,
    title,
    description: 'AC menyala tetapi tidak mengeluarkan udara dingin.',
    category: 'AC',
    priority: 'MEDIUM',
  });

  it('creates Resident and Admin reports with server-derived identity and initial state', async () => {
    const unit = await ctx.createUnit('A-01', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const resident = await ctx
      .api('post', '/api/reports', 'RESIDENT')
      .send(payload(unit.id))
      .expect(201);
    expect(resident.body).toMatchObject({
      reportNumber: expect.stringMatching(/^RPT-\d{10,}$/),
      unit: { id: unit.id, unitNumber: 'A-01' },
      title: 'AC tidak dingin',
      category: 'AC',
      proposedPriority: 'MEDIUM',
      finalPriority: null,
      status: 'REPORTED',
      assignment: null,
      damagePhotos: [],
    });
    expect(resident.body).not.toHaveProperty('createdBy');
    expect(resident.body).not.toHaveProperty('reportedBy');

    const admin = await ctx
      .api('post', '/api/reports')
      .send(payload(unit.id, 'Pipa bocor'))
      .expect(201);
    expect(admin.body).toMatchObject({
      title: 'Pipa bocor',
      proposedPriority: null,
      finalPriority: 'MEDIUM',
      status: 'VERIFIED',
      createdBy: { id: ctx.ids.actorIds.ADMIN, name: 'ADMIN' },
      reportedBy: { id: ctx.ids.actorIds.ADMIN, name: 'ADMIN' },
      reviewedBy: null,
    });
    expect(admin.body.reportNumber).not.toBe(resident.body.reportNumber);

    await ctx
      .api('post', '/api/reports', 'TECHNICIAN')
      .send(payload(unit.id))
      .expect(403);
    await ctx
      .api('post', '/api/reports', null)
      .send(payload(unit.id))
      .expect(401);
  });

  it('validates the body and denies missing, foreign, unplaced, and archived units', async () => {
    const unit = await ctx.createUnit('A-02');
    const archived = await ctx.createUnit('A-03', { isArchived: true });
    await ctx.db
      .insert(properties)
      .values({ id: ctx.ids.otherPropertyId, name: 'Other', address: 'Other' });
    const foreign = await ctx.createUnit('B-01', {
      propertyId: ctx.ids.otherPropertyId,
    });

    await ctx
      .api('post', '/api/reports')
      .send({ ...payload(unit.id), status: 'REPORTED' })
      .expect(400);
    await ctx
      .api('post', '/api/reports')
      .send({ ...payload(unit.id), priority: 'URGENT' })
      .expect(400);
    await ctx
      .api('post', '/api/reports')
      .send({ ...payload(unit.id), title: '  ' })
      .expect(400);
    await ctx
      .api('post', '/api/reports')
      .send(payload(ctx.ids.missingId))
      .expect(404);
    await ctx.api('post', '/api/reports').send(payload(foreign.id)).expect(404);
    await ctx
      .api('post', '/api/reports')
      .send(payload(archived.id))
      .expect(409);
    await ctx
      .api('post', '/api/reports', 'RESIDENT')
      .send(payload(unit.id))
      .expect(404);
    await ctx.api('get', '/api/reports/not-a-uuid').expect(400);
    await ctx.api('get', '/api/reports?page=1&page=2').expect(400);
    await ctx.api('get', '/api/reports?pageSize=101').expect(400);
  });

  it('scopes list and detail to current resident placement and technician assignment', async () => {
    const firstUnit = await ctx.createUnit('A-10', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const secondUnit = await ctx.createUnit('A-11');
    const residentReport = await ctx
      .api('post', '/api/reports')
      .send(payload(firstUnit.id, 'Resident report'))
      .expect(201);
    const previousResidentReport = await ctx
      .api('post', '/api/reports')
      .send(payload(secondUnit.id, 'Previous resident report'))
      .expect(201);
    const [record] = await ctx.db
      .select({ id: damageReports.id })
      .from(damageReports)
      .where(
        eq(
          damageReports.reportNumber,
          previousResidentReport.body.reportNumber,
        ),
      );
    await ctx.db.insert(assignments).values({
      reportId: record.id,
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
      estimatedArrivalAt: new Date('2026-10-04T02:00:00.000Z'),
      note: 'Datang pagi',
    });
    await ctx.db.insert(attachments).values({
      reportId: record.id,
      purpose: 'DAMAGE_PHOTO',
      fileUrl: 'https://files.example.test/damage.jpg',
    });

    const residentList = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .expect(200);
    expect(residentList.body.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(
      residentList.body.data.map((item: { id: string }) => item.id),
    ).toEqual([residentReport.body.id]);
    const technicianList = await ctx
      .api('get', '/api/reports', 'TECHNICIAN')
      .expect(200);
    expect(
      technicianList.body.data.map((item: { id: string }) => item.id),
    ).toEqual([previousResidentReport.body.id]);
    expect(
      (await ctx.api('get', '/api/reports', 'ADMIN')).body.meta.total,
    ).toBe(2);

    await ctx
      .api('get', `/api/reports/${previousResidentReport.body.id}`, 'RESIDENT')
      .expect(404);
    const technicianDetail = await ctx
      .api(
        'get',
        `/api/reports/${previousResidentReport.body.id}`,
        'TECHNICIAN',
      )
      .expect(200);
    expect(technicianDetail.body).toMatchObject({
      damagePhotos: [{ fileUrl: 'https://files.example.test/damage.jpg' }],
      assignment: {
        technician: { id: ctx.ids.actorIds.TECHNICIAN, name: 'TECHNICIAN' },
        estimatedArrivalAt: '2026-10-04T02:00:00.000Z',
        note: 'Datang pagi',
      },
    });
    expect(technicianDetail.body).not.toHaveProperty('createdBy');
    expect(technicianDetail.body.assignment).not.toHaveProperty('assignedBy');
    const adminDetail = await ctx
      .api('get', `/api/reports/${previousResidentReport.body.id}`)
      .expect(200);
    expect(adminDetail.body).toHaveProperty('createdBy');
    expect(adminDetail.body.assignment).toHaveProperty('assignedBy');

    await ctx
      .api('put', `/api/units/${secondUnit.id}/resident`)
      .send({ residentUserId: ctx.ids.actorIds.RESIDENT })
      .expect(200);
    const movedResidentList = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .expect(200);
    expect(
      movedResidentList.body.data.map((item: { id: string }) => item.id),
    ).toEqual([previousResidentReport.body.id]);
    const movedResidentDetail = await ctx
      .api('get', `/api/reports/${previousResidentReport.body.id}`, 'RESIDENT')
      .expect(200);
    expect(movedResidentDetail.body).not.toHaveProperty('reportedBy');
    await ctx
      .api('get', `/api/reports/${residentReport.body.id}`, 'RESIDENT')
      .expect(404);
  });

  it('paginates in deterministic order and returns empty out-of-range pages', async () => {
    const first = await ctx.createUnit('A-20');
    const second = await ctx.createUnit('A-21');
    await ctx
      .api('post', '/api/reports')
      .send(payload(first.id, 'Older'))
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await ctx
      .api('post', '/api/reports')
      .send(payload(second.id, 'Newer'))
      .expect(201);
    const firstPage = await ctx
      .api('get', '/api/reports?page=1&pageSize=1')
      .expect(200);
    expect(firstPage.body.meta).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstPage.body.data[0].title).toBe('Newer');
    expect(
      (await ctx.api('get', '/api/reports?page=2&pageSize=1')).body.data[0]
        .title,
    ).toBe('Older');
    expect(
      (await ctx.api('get', '/api/reports?page=3&pageSize=1')).body.data,
    ).toEqual([]);
  });
});
