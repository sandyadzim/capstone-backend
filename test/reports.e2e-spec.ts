import { eq, sql } from 'drizzle-orm';
import {
  assignments,
  attachments,
  damageReports,
  properties,
  users,
} from '../src/modules/database/schema.js';
import { ReportsService } from '../src/modules/reports-assignment/reports.service.js';
import { ReportsRepository } from '../src/modules/reports-assignment/reports.repository.js';
import { vi } from 'vitest';
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

  it('searches and filters reports within actor scope and Jakarta calendar dates', async () => {
    const residentUnit = await ctx.createUnit('F-01', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const otherResidentUnit = await ctx.createUnit('F-02', {
      activeResidentUserId: ctx.ids.secondResidentId,
    });
    const literalMatch = await ctx.addReport(residentUnit.id, 'REPORTED', {
      reportNumber: 'RPT-100%_A',
      title: 'Fan 100%_Filter',
      description: 'The description must not be searched.',
      category: 'AC',
      proposedPriority: 'MEDIUM',
      reportedAt: new Date('2099-02-28T17:00:00.000Z'),
    });
    const wildcardDecoy = await ctx.addReport(residentUnit.id, 'REPORTED', {
      reportNumber: 'RPT-100XXA',
      title: 'Fan 100ZZFilter',
      category: 'AC',
      proposedPriority: 'LOW',
      reportedAt: new Date('2099-03-01T17:00:00.000Z'),
    });
    const verified = await ctx.addReport(residentUnit.id, 'VERIFIED', {
      reportNumber: 'RPT-VERIFIED-LEAK',
      title: 'Leak under sink',
      category: 'PLUMBING',
      finalPriority: 'HIGH',
      reportedAt: new Date('2099-03-01T10:00:00.000Z'),
    });
    const sameTimeReport = await ctx.addReport(residentUnit.id, 'REPORTED', {
      reportNumber: 'RPT-SAME-TIME',
      title: 'Same timestamp',
      category: 'OTHER',
      proposedPriority: 'LOW',
      reportedAt: new Date('2099-03-01T10:00:00.000Z'),
    });
    const residentLeak = await ctx.addReport(residentUnit.id, 'REPORTED', {
      reportNumber: 'RPT-RESIDENT-LEAK',
      title: 'Shared leak',
      category: 'PLUMBING',
      proposedPriority: 'MEDIUM',
    });
    await ctx.addReport(otherResidentUnit.id, 'REPORTED', {
      reportNumber: 'RPT-FOREIGN-LEAK',
      title: 'Shared leak',
      category: 'PLUMBING',
      proposedPriority: 'MEDIUM',
    });
    await ctx.db.insert(assignments).values({
      reportId: verified.id,
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
    });

    const literalSearch = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ q: '  fan 100%_filter ' })
      .expect(200);
    expect(
      literalSearch.body.data.map((report: { id: string }) => report.id),
    ).toEqual([literalMatch.id]);
    const descriptionSearch = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ q: 'description must not be searched' })
      .expect(200);
    expect(descriptionSearch.body.data).toEqual([]);

    const dateRange = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ dateFrom: '2099-03-01', dateTo: '2099-03-01' })
      .expect(200);
    const dateRangeIds = dateRange.body.data.map(
      (report: { id: string }) => report.id,
    );
    expect(dateRangeIds).toEqual(
      [verified.id, sameTimeReport.id]
        .sort((left, right) => right.localeCompare(left))
        .concat(literalMatch.id),
    );
    expect(dateRange.body.meta.total).toBe(3);

    const dateFromOnly = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ dateFrom: '2099-03-02' })
      .expect(200);
    expect(
      dateFromOnly.body.data.map((report: { id: string }) => report.id),
    ).toEqual([wildcardDecoy.id]);
    const dateToOnly = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ dateTo: '2099-03-01' })
      .expect(200);
    expect(
      dateToOnly.body.data.map((report: { id: string }) => report.id),
    ).toContain(literalMatch.id);
    expect(
      dateToOnly.body.data.map((report: { id: string }) => report.id),
    ).not.toContain(wildcardDecoy.id);

    const combined = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({
        status: 'REPORTED',
        category: 'AC',
        priority: 'MEDIUM',
        dateFrom: '2099-03-01',
        dateTo: '2099-03-01',
      })
      .expect(200);
    expect(
      combined.body.data.map((report: { id: string }) => report.id),
    ).toEqual([literalMatch.id]);
    const finalPriority = await ctx
      .api('get', '/api/reports', 'ADMIN')
      .query({ priority: 'HIGH' })
      .expect(200);
    expect(
      finalPriority.body.data.map((report: { id: string }) => report.id),
    ).toContain(verified.id);
    const proposedPriority = await ctx
      .api('get', '/api/reports', 'ADMIN')
      .query({ priority: 'MEDIUM' })
      .expect(200);
    expect(
      proposedPriority.body.data.map((report: { id: string }) => report.id),
    ).toContain(residentLeak.id);
    expect(
      proposedPriority.body.data.map((report: { id: string }) => report.id),
    ).not.toContain(verified.id);

    const residentScope = await ctx
      .api('get', '/api/reports', 'RESIDENT')
      .query({ q: 'shared leak' })
      .expect(200);
    expect(residentScope.body.meta.total).toBe(1);
    expect(residentScope.body.data[0].id).toBe(residentLeak.id);
    const technicianScope = await ctx
      .api('get', '/api/reports', 'TECHNICIAN')
      .query({ q: 'leak' })
      .expect(200);
    expect(technicianScope.body.meta.total).toBe(1);
    expect(technicianScope.body.data[0].id).toBe(verified.id);

    const listSpy = vi.spyOn(ctx.app.get(ReportsRepository), 'list');
    await ctx
      .api('get', '/api/reports')
      .query({ dateFrom: '2026-03-02', dateTo: '2026-03-01' })
      .expect(400);
    await ctx
      .api('get', '/api/reports?status=REPORTED&status=CLOSED')
      .expect(400);
    expect(listSpy).not.toHaveBeenCalled();
    listSpy.mockRestore();
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

  it('assigns Admin and Resident reports atomically and grants access to the selected Technician', async () => {
    const adminUnit = await ctx.createUnit('A-ASSIGN-01', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const adminReport = await ctx
      .api('post', '/api/reports')
      .send(payload(adminUnit.id, 'Admin created report'))
      .expect(201);
    const assignedAdminReport = await ctx
      .api('post', `/api/reports/${adminReport.body.id}/assign`)
      .send({
        technicianUserId: ctx.ids.actorIds.TECHNICIAN,
        note: '  Check the replacement part.  ',
      })
      .expect(200);
    expect(assignedAdminReport.body).toMatchObject({
      status: 'ASSIGNED',
      assignment: {
        technician: { id: ctx.ids.actorIds.TECHNICIAN, name: 'TECHNICIAN' },
        assignedBy: { id: ctx.ids.actorIds.ADMIN, name: 'ADMIN' },
        note: 'Check the replacement part.',
        estimatedArrivalAt: null,
      },
    });
    const [adminRecord] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, adminReport.body.id));
    const adminAssignments = await ctx.db
      .select()
      .from(assignments)
      .where(eq(assignments.reportId, adminReport.body.id));
    expect(adminRecord.status).toBe('ASSIGNED');
    expect(adminAssignments).toHaveLength(1);
    expect(adminAssignments[0]).toMatchObject({
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
      estimatedArrivalAt: null,
      note: 'Check the replacement part.',
    });
    const residentAdminDetail = await ctx
      .api('get', `/api/reports/${adminReport.body.id}`, 'RESIDENT')
      .expect(200);
    expect(residentAdminDetail.body.assignment.note).toBeNull();
    expect(residentAdminDetail.body.assignment).not.toHaveProperty(
      'assignedBy',
    );
    const technicianAdminDetail = await ctx
      .api('get', `/api/reports/${adminReport.body.id}`, 'TECHNICIAN')
      .expect(200);
    expect(technicianAdminDetail.body.assignment.note).toBe(
      'Check the replacement part.',
    );
    expect(technicianAdminDetail.body.assignment).not.toHaveProperty(
      'assignedBy',
    );

    const residentReport = await ctx
      .api('post', '/api/reports', 'RESIDENT')
      .send(payload(adminUnit.id, 'Resident created report'))
      .expect(201);
    await ctx
      .api('post', `/api/reports/${residentReport.body.id}/verify`)
      .send({ finalPriority: 'HIGH' })
      .expect(200);
    const assignedResidentReport = await ctx
      .api('post', `/api/reports/${residentReport.body.id}/assign`)
      .send({ technicianUserId: ctx.ids.actorIds.TECHNICIAN })
      .expect(200);
    expect(assignedResidentReport.body).toMatchObject({
      status: 'ASSIGNED',
      assignment: {
        technician: { id: ctx.ids.actorIds.TECHNICIAN },
        note: null,
        estimatedArrivalAt: null,
      },
    });

    const technicianList = await ctx
      .api('get', '/api/reports', 'TECHNICIAN')
      .expect(200);
    expect(
      technicianList.body.data.map((item: { id: string }) => item.id),
    ).toEqual(
      expect.arrayContaining([adminReport.body.id, residentReport.body.id]),
    );
    const technicianDetail = await ctx
      .api('get', `/api/reports/${residentReport.body.id}`, 'TECHNICIAN')
      .expect(200);
    expect(technicianDetail.body.assignment).toMatchObject({
      note: null,
      estimatedArrivalAt: null,
    });
    expect(technicianDetail.body.assignment).not.toHaveProperty('assignedBy');
    const residentDetail = await ctx
      .api('get', `/api/reports/${residentReport.body.id}`, 'RESIDENT')
      .expect(200);
    expect(residentDetail.body.assignment.note).toBeNull();
    expect(residentDetail.body.assignment).not.toHaveProperty('assignedBy');

    const otherTechnician = await ctx.createUnit('A-ASSIGN-03');
    const otherReport = await ctx
      .api('post', '/api/reports')
      .send(payload(otherTechnician.id))
      .expect(201);
    await ctx.db
      .update(users)
      .set({ role: 'TECHNICIAN' })
      .where(eq(users.id, ctx.ids.secondResidentId));
    await ctx
      .api('post', `/api/reports/${otherReport.body.id}/assign`)
      .send({ technicianUserId: ctx.ids.secondResidentId })
      .expect(200);
    await ctx
      .api('get', `/api/reports/${otherReport.body.id}`, 'TECHNICIAN')
      .expect(404);
    await ctx
      .api('get', `/api/reports/${otherReport.body.id}`, 'RESIDENT')
      .expect(404);
    const unassignedReport = await ctx.addReport(
      otherTechnician.id,
      'VERIFIED',
    );
    await ctx
      .api('get', `/api/reports/${unassignedReport.id}`, 'TECHNICIAN')
      .expect(404);
  });

  it('validates assignment access, input, scope, and rechecks the Admin account', async () => {
    const unit = await ctx.createUnit('A-ASSIGN-04');
    const report = await ctx.addReport(unit.id, 'VERIFIED');
    const path = `/api/reports/${report.id}/assign`;
    const body = { technicianUserId: ctx.ids.actorIds.TECHNICIAN };

    await ctx.api('post', path, null).send(body).expect(401);
    await ctx.api('post', path, 'RESIDENT').send(body).expect(403);
    await ctx.api('post', path, 'TECHNICIAN').send(body).expect(403);
    await ctx
      .api('post', `/api/reports/not-a-uuid/assign`)
      .send(body)
      .expect(400);
    for (const invalidBody of [
      {},
      { technicianUserId: 'invalid' },
      { ...body, status: 'ASSIGNED' },
      { ...body, note: '  ' },
      { ...body, note: null },
    ]) {
      await ctx.api('post', path).send(invalidBody).expect(400);
    }
    await ctx
      .api('post', path)
      .send({ technicianUserId: ctx.ids.missingId })
      .expect(404);
    await ctx
      .api('post', path)
      .send({ technicianUserId: ctx.ids.actorIds.RESIDENT })
      .expect(409);
    await ctx
      .api('post', `/api/reports/${ctx.ids.missingId}/assign`)
      .send(body)
      .expect(404);

    await ctx.db
      .insert(properties)
      .values({ id: ctx.ids.otherPropertyId, name: 'Other', address: 'Other' });
    const foreignUnit = await ctx.createUnit('A-ASSIGN-05', {
      propertyId: ctx.ids.otherPropertyId,
    });
    const foreignReport = await ctx.addReport(foreignUnit.id, 'VERIFIED');
    await ctx
      .api('post', `/api/reports/${foreignReport.id}/assign`)
      .send(body)
      .expect(404);

    const staleAdmin = {
      id: ctx.ids.actorIds.ADMIN,
      name: 'ADMIN',
      loginIdentifier: 'admin@example.test',
      role: 'ADMIN' as const,
    };
    const reports = ctx.app.get(ReportsService);
    for (const changedState of [
      { isActive: false },
      { role: 'TECHNICIAN' as const },
    ]) {
      await ctx.db
        .update(users)
        .set(changedState)
        .where(eq(users.id, ctx.ids.actorIds.ADMIN));
      try {
        await expect(
          reports.assign(staleAdmin, report.id, body),
        ).rejects.toMatchObject({
          status: 403,
        });
      } finally {
        await ctx.db
          .update(users)
          .set({ isActive: true, role: 'ADMIN' })
          .where(eq(users.id, ctx.ids.actorIds.ADMIN));
      }
    }
  });

  it('conflicts for every non-VERIFIED state and any existing assignment without changing records', async () => {
    const unit = await ctx.createUnit('A-ASSIGN-06');
    for (const status of [
      'REPORTED',
      'REJECTED',
      'ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
      'CLOSED',
    ] as const) {
      const report = await ctx.addReport(unit.id, status);
      const [before] = await ctx.db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, report.id));
      await ctx
        .api('post', `/api/reports/${report.id}/assign`)
        .send({ technicianUserId: ctx.ids.actorIds.TECHNICIAN })
        .expect(409);
      const [after] = await ctx.db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, report.id));
      expect(after).toEqual(before);
      expect(
        await ctx.db
          .select()
          .from(assignments)
          .where(eq(assignments.reportId, report.id)),
      ).toHaveLength(0);
    }

    const report = await ctx.addReport(unit.id, 'VERIFIED');
    await ctx.db.insert(assignments).values({
      reportId: report.id,
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
      note: 'Existing assignment',
    });
    const [before] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, report.id));
    await ctx.db
      .update(users)
      .set({ role: 'TECHNICIAN', isActive: true })
      .where(eq(users.id, ctx.ids.secondResidentId));
    for (const technicianUserId of [
      ctx.ids.actorIds.TECHNICIAN,
      ctx.ids.secondResidentId,
    ]) {
      await ctx
        .api('post', `/api/reports/${report.id}/assign`)
        .send({ technicianUserId })
        .expect(409);
      const [after] = await ctx.db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, report.id));
      expect(after).toEqual(before);
    }
    expect(
      await ctx.db
        .select()
        .from(assignments)
        .where(eq(assignments.reportId, report.id)),
    ).toHaveLength(1);
  });

  it('coordinates with BE-05 account changes before and after assignment', async () => {
    const unit = await ctx.createUnit('A-ASSIGN-07');
    const report = await ctx.addReport(unit.id, 'VERIFIED');
    await ctx
      .api('post', `/api/reports/${report.id}/assign`)
      .send({ technicianUserId: ctx.ids.actorIds.TECHNICIAN })
      .expect(200);
    await ctx
      .api('post', `/api/accounts/${ctx.ids.actorIds.TECHNICIAN}/deactivate`)
      .expect(409);
    await ctx
      .api('patch', `/api/accounts/${ctx.ids.actorIds.TECHNICIAN}`)
      .send({ role: 'RESIDENT' })
      .expect(409);

    const inactiveTechnician = await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'BE-09 Inactive Technician',
        loginIdentifier: 'be09-inactive-technician@example.test',
        password: 'test-only-new-password',
        role: 'TECHNICIAN',
      })
      .expect(201);
    await ctx
      .api('post', `/api/accounts/${inactiveTechnician.body.id}/deactivate`)
      .expect(200);
    const secondReport = await ctx.addReport(unit.id, 'VERIFIED');
    await ctx
      .api('post', `/api/reports/${secondReport.id}/assign`)
      .send({ technicianUserId: inactiveTechnician.body.id })
      .expect(409);
  });

  it('rolls back assignment when changing the report status fails', async () => {
    const unit = await ctx.createUnit('A-ASSIGN-08');
    const report = await ctx.addReport(unit.id, 'VERIFIED');
    await ctx.db.execute(
      sql.raw(`
      CREATE FUNCTION fail_report_assignment_for_test() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'ASSIGNED' THEN
          RAISE EXCEPTION 'simulated assignment status failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `),
    );
    await ctx.db.execute(
      sql.raw(`
      CREATE TRIGGER fail_report_assignment_for_test
      BEFORE UPDATE ON damage_reports
      FOR EACH ROW EXECUTE FUNCTION fail_report_assignment_for_test()
    `),
    );
    try {
      await ctx
        .api('post', `/api/reports/${report.id}/assign`)
        .send({ technicianUserId: ctx.ids.actorIds.TECHNICIAN })
        .expect(500);
    } finally {
      await ctx.db.execute(
        sql.raw(
          'DROP TRIGGER fail_report_assignment_for_test ON damage_reports',
        ),
      );
      await ctx.db.execute(
        sql.raw('DROP FUNCTION fail_report_assignment_for_test()'),
      );
    }

    const [after] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, report.id));
    expect(after.status).toBe('VERIFIED');
    expect(
      await ctx.db
        .select()
        .from(assignments)
        .where(eq(assignments.reportId, report.id)),
    ).toHaveLength(0);
  });

  it('serializes concurrent assignment requests so only one assignment is stored', async () => {
    const unit = await ctx.createUnit('A-ASSIGN-09');
    const report = await ctx.addReport(unit.id, 'VERIFIED');
    await ctx.db
      .update(users)
      .set({ role: 'TECHNICIAN', isActive: true })
      .where(eq(users.id, ctx.ids.secondResidentId));

    const responses = await Promise.all([
      ctx
        .api('post', `/api/reports/${report.id}/assign`)
        .send({ technicianUserId: ctx.ids.actorIds.TECHNICIAN }),
      ctx
        .api('post', `/api/reports/${report.id}/assign`)
        .send({ technicianUserId: ctx.ids.secondResidentId }),
    ]);
    expect(
      responses
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 409]);
    const [after] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, report.id));
    expect(after.status).toBe('ASSIGNED');
    expect(
      await ctx.db
        .select()
        .from(assignments)
        .where(eq(assignments.reportId, report.id)),
    ).toHaveLength(1);
  });
});
