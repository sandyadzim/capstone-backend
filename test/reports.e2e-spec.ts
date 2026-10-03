import { eq, sql } from 'drizzle-orm';
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

  it('verifies a Resident report, records the reviewer and keeps review notes private', async () => {
    const unit = await ctx.createUnit('R-01', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const created = await ctx
      .api('post', '/api/reports', 'RESIDENT')
      .send(payload(unit.id))
      .expect(201);

    const verified = await ctx
      .api('post', `/api/reports/${created.body.id}/verify`)
      .send({ finalPriority: 'HIGH', reviewNote: '  Checked the photos.  ' })
      .expect(200);
    expect(verified.body).toMatchObject({
      id: created.body.id,
      proposedPriority: 'MEDIUM',
      finalPriority: 'HIGH',
      status: 'VERIFIED',
      rejectionReason: null,
      reviewNote: 'Checked the photos.',
      reviewedBy: { id: ctx.ids.actorIds.ADMIN, name: 'ADMIN' },
    });

    const [record] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, created.body.id));
    expect(record).toMatchObject({
      finalPriority: 'HIGH',
      status: 'VERIFIED',
      reviewNote: 'Checked the photos.',
      reviewedByUserId: ctx.ids.actorIds.ADMIN,
      rejectionReason: null,
    });
    const residentDetail = await ctx
      .api('get', `/api/reports/${created.body.id}`, 'RESIDENT')
      .expect(200);
    expect(residentDetail.body).toMatchObject({
      finalPriority: 'HIGH',
      status: 'VERIFIED',
    });
    expect(residentDetail.body).not.toHaveProperty('reviewNote');
    expect(residentDetail.body).not.toHaveProperty('reviewedBy');

    const listed = await ctx.api('get', '/api/reports').expect(200);
    expect(listed.body.data).toContainEqual(
      expect.objectContaining({
        id: created.body.id,
        finalPriority: 'HIGH',
        status: 'VERIFIED',
      }),
    );
  });

  it('rejects a Resident report and exposes the reason, not the internal note, to the Resident', async () => {
    const unit = await ctx.createUnit('R-02', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const created = await ctx
      .api('post', '/api/reports', 'RESIDENT')
      .send(payload(unit.id))
      .expect(201);

    const rejected = await ctx
      .api('post', `/api/reports/${created.body.id}/reject`)
      .send({
        finalPriority: 'LOW',
        rejectionReason: '  Duplicate submission.  ',
        reviewNote: '  Confirmed against the existing ticket.  ',
      })
      .expect(200);
    expect(rejected.body).toMatchObject({
      finalPriority: 'LOW',
      status: 'REJECTED',
      rejectionReason: 'Duplicate submission.',
      reviewNote: 'Confirmed against the existing ticket.',
      reviewedBy: { id: ctx.ids.actorIds.ADMIN, name: 'ADMIN' },
    });
    const [record] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, created.body.id));
    expect(record).toMatchObject({
      finalPriority: 'LOW',
      status: 'REJECTED',
      rejectionReason: 'Duplicate submission.',
      reviewNote: 'Confirmed against the existing ticket.',
      reviewedByUserId: ctx.ids.actorIds.ADMIN,
    });

    const residentDetail = await ctx
      .api('get', `/api/reports/${created.body.id}`, 'RESIDENT')
      .expect(200);
    expect(residentDetail.body).toMatchObject({
      finalPriority: 'LOW',
      status: 'REJECTED',
      rejectionReason: 'Duplicate submission.',
    });
    expect(residentDetail.body).not.toHaveProperty('reviewNote');
    expect(residentDetail.body).not.toHaveProperty('reviewedBy');
  });

  it('validates review access and hides reports outside the Phase 1 property', async () => {
    const unit = await ctx.createUnit('R-03');
    const report = await ctx.addReport(unit.id);
    const verifyPath = `/api/reports/${report.id}/verify`;
    const validBody = { finalPriority: 'HIGH' };

    await ctx.api('post', verifyPath, null).send(validBody).expect(401);
    await ctx.api('post', verifyPath, 'RESIDENT').send(validBody).expect(403);
    await ctx.api('post', verifyPath, 'TECHNICIAN').send(validBody).expect(403);
    await ctx
      .api('post', '/api/reports/not-a-uuid/verify')
      .send(validBody)
      .expect(400);
    await ctx
      .api('post', verifyPath)
      .send({ ...validBody, status: 'VERIFIED' })
      .expect(400);
    await ctx
      .api('post', `/api/reports/${report.id}/reject`)
      .send({ finalPriority: 'HIGH', rejectionReason: '  ' })
      .expect(400);
    await ctx
      .api('post', `/api/reports/${report.id}/reject`)
      .send({
        finalPriority: 'MEDIUM',
        rejectionReason: 'Valid',
        reviewNote: null,
      })
      .expect(400);

    await ctx.db
      .insert(properties)
      .values({ id: ctx.ids.otherPropertyId, name: 'Other', address: 'Other' });
    const foreignUnit = await ctx.createUnit('R-04', {
      propertyId: ctx.ids.otherPropertyId,
    });
    const foreignReport = await ctx.addReport(foreignUnit.id);
    await ctx
      .api('post', `/api/reports/${foreignReport.id}/verify`)
      .send(validBody)
      .expect(404);
    await ctx
      .api('post', `/api/reports/${ctx.ids.missingId}/verify`)
      .send(validBody)
      .expect(404);
  });

  it('returns conflict for every report that is no longer REPORTED without changing its record', async () => {
    const unit = await ctx.createUnit('R-05');
    const adminCreated = await ctx
      .api('post', '/api/reports')
      .send(payload(unit.id, 'Already verified by Admin'))
      .expect(201);
    const idsByStatus: Array<[string, string]> = [
      [adminCreated.body.id, 'VERIFIED'],
    ];
    for (const status of [
      'REJECTED',
      'ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
      'CLOSED',
    ] as const) {
      const report = await ctx.addReport(unit.id, status);
      idsByStatus.push([report.id, status]);
    }

    for (const [id, status] of idsByStatus) {
      const [before] = await ctx.db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, id));
      for (const [decision, body] of [
        ['verify', { finalPriority: 'HIGH' }],
        [
          'reject',
          { finalPriority: 'HIGH', rejectionReason: 'Duplicate report' },
        ],
      ] as const) {
        const response = await ctx
          .api('post', `/api/reports/${id}/${decision}`)
          .send(body)
          .expect(409);
        expect(response.body).toMatchObject({
          code: 'CONFLICT',
          message: expect.stringContaining(status),
        });
        const [after] = await ctx.db
          .select()
          .from(damageReports)
          .where(eq(damageReports.id, id));
        expect(after).toEqual(before);
      }
    }

    const residentUnit = await ctx.createUnit('R-06', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const report = await ctx
      .api('post', '/api/reports', 'RESIDENT')
      .send(payload(residentUnit.id))
      .expect(201);
    await ctx
      .api('post', `/api/reports/${report.body.id}/verify`)
      .send({ finalPriority: 'MEDIUM' })
      .expect(200);

    for (const [path, body] of [
      [`/api/reports/${report.body.id}/verify`, { finalPriority: 'HIGH' }],
      [
        `/api/reports/${report.body.id}/reject`,
        { finalPriority: 'LOW', rejectionReason: 'Too late' },
      ],
    ] as const) {
      const [before] = await ctx.db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, report.body.id));
      await ctx.api('post', path).send(body).expect(409);
      const [after] = await ctx.db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, report.body.id));
      expect(after).toEqual(before);
    }
  });

  it('rolls back a decision when the database rejects the report update', async () => {
    const unit = await ctx.createUnit('R-07');
    const report = await ctx.addReport(unit.id);
    const [before] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, report.id));

    await ctx.db.execute(
      sql.raw(`
      CREATE FUNCTION fail_report_review_for_test() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status IN ('VERIFIED', 'REJECTED') THEN
          RAISE EXCEPTION 'simulated report review failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `),
    );
    await ctx.db.execute(
      sql.raw(`
      CREATE TRIGGER fail_report_review_for_test
      BEFORE UPDATE ON damage_reports
      FOR EACH ROW EXECUTE FUNCTION fail_report_review_for_test()
    `),
    );

    try {
      await ctx
        .api('post', `/api/reports/${report.id}/verify`)
        .send({ finalPriority: 'HIGH', reviewNote: 'Checked' })
        .expect(500);
    } finally {
      await ctx.db.execute(
        sql.raw('DROP TRIGGER fail_report_review_for_test ON damage_reports'),
      );
      await ctx.db.execute(
        sql.raw('DROP FUNCTION fail_report_review_for_test()'),
      );
    }

    const [after] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, report.id));
    expect(after).toEqual(before);
  });
});
