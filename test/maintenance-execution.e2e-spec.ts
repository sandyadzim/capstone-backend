import { eq, sql } from 'drizzle-orm';
import {
  assignments,
  damageReports,
  properties,
  users,
} from '../src/modules/database/schema.js';
import { MaintenanceExecutionService } from '../src/modules/maintenance-execution/maintenance-execution.service.js';
import type { AuthenticatedActor } from '../src/modules/auth-accounts/authentication.types.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Maintenance execution API (e2e)', () => {
  const ctx = usePropertyUnitsContext();
  const estimate = '2020-01-01T14:30:00+07:00';

  async function assign(
    reportId: string,
    technicianId = ctx.ids.actorIds.TECHNICIAN,
  ) {
    await ctx.db.insert(assignments).values({
      reportId,
      technicianUserId: technicianId,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
    });
  }

  it('starts Admin and Resident reports and exposes the saved estimate to allowed readers', async () => {
    const adminUnit = await ctx.createUnit('START-A-01', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const adminReport = await ctx.addReport(adminUnit.id, 'ASSIGNED');
    await assign(adminReport.id);

    const residentCreate = await ctx
      .api('post', '/api/reports', 'RESIDENT')
      .send({
        unitId: adminUnit.id,
        title: 'Broken tap',
        description: 'Water is leaking.',
        category: 'PLUMBING',
        priority: 'MEDIUM',
      })
      .expect(201);
    await ctx
      .api('post', `/api/reports/${residentCreate.body.id}/verify`)
      .send({ finalPriority: 'HIGH' })
      .expect(200);
    await ctx
      .api('post', `/api/reports/${residentCreate.body.id}/assign`)
      .send({ technicianUserId: ctx.ids.actorIds.TECHNICIAN })
      .expect(200);

    for (const reportId of [adminReport.id, residentCreate.body.id]) {
      const started = await ctx
        .api('post', `/api/reports/${reportId}/start`, 'TECHNICIAN')
        .send({ estimatedArrivalAt: estimate })
        .expect(200);
      expect(started.body.status).toBe('IN_PROGRESS');
      expect(started.body.assignment.estimatedArrivalAt).toBe(
        '2020-01-01T07:30:00.000Z',
      );
      expect(started.body.assignment).not.toHaveProperty('assignedBy');
      expect(started.body).not.toHaveProperty('reviewNote');

      const adminDetail = await ctx
        .api('get', `/api/reports/${reportId}`)
        .expect(200);
      expect(adminDetail.body).toMatchObject({
        status: 'IN_PROGRESS',
        assignment: { estimatedArrivalAt: '2020-01-01T07:30:00.000Z' },
      });
      const residentDetail = await ctx
        .api('get', `/api/reports/${reportId}`, 'RESIDENT')
        .expect(200);
      expect(residentDetail.body.assignment.estimatedArrivalAt).toBe(
        '2020-01-01T07:30:00.000Z',
      );
    }
  });

  it('validates the request and restricts the endpoint to an authenticated Technician', async () => {
    const unit = await ctx.createUnit('START-AUTH-01');
    const report = await ctx.addReport(unit.id, 'ASSIGNED');
    await assign(report.id);
    const path = `/api/reports/${report.id}/start`;

    await ctx
      .api('post', path, null)
      .send({ estimatedArrivalAt: estimate })
      .expect(401);
    await ctx
      .api('post', path, 'ADMIN')
      .send({ estimatedArrivalAt: estimate })
      .expect(403);
    await ctx
      .api('post', path, 'RESIDENT')
      .send({ estimatedArrivalAt: estimate })
      .expect(403);
    await ctx
      .api('post', '/api/reports/not-a-uuid/start', 'TECHNICIAN')
      .send({ estimatedArrivalAt: estimate })
      .expect(400);
    for (const body of [
      {},
      { estimatedArrivalAt: null },
      { estimatedArrivalAt: '2026-10-04' },
      { estimatedArrivalAt: '2026-10-04T14:30:00' },
      { estimatedArrivalAt: '2026-02-30T14:30:00Z' },
      { estimatedArrivalAt: estimate, status: 'IN_PROGRESS' },
    ]) {
      await ctx.api('post', path, 'TECHNICIAN').send(body).expect(400);
    }
  });

  it('lists only the current Technician assignments and hides another Technician task', async () => {
    const otherTechnicianId = ctx.ids.secondResidentId;
    await ctx.db
      .update(users)
      .set({ role: 'TECHNICIAN', isActive: true })
      .where(eq(users.id, otherTechnicianId));
    const mineUnit = await ctx.createUnit('START-LIST-01');
    const mine = await ctx.addReport(mineUnit.id, 'ASSIGNED');
    await assign(mine.id);
    const theirsUnit = await ctx.createUnit('START-LIST-02');
    const theirs = await ctx.addReport(theirsUnit.id, 'ASSIGNED');
    await assign(theirs.id, otherTechnicianId);

    const list = await ctx.api('get', '/api/reports', 'TECHNICIAN').expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([
      mine.id,
    ]);
    await ctx.api('get', `/api/reports/${theirs.id}`, 'TECHNICIAN').expect(404);
    await ctx
      .api('post', `/api/reports/${theirs.id}/start`, 'TECHNICIAN')
      .send({ estimatedArrivalAt: estimate })
      .expect(404);

    const unassignedUnit = await ctx.createUnit('START-LIST-03');
    const unassigned = await ctx.addReport(unassignedUnit.id, 'ASSIGNED');
    await ctx
      .api('post', `/api/reports/${unassigned.id}/start`, 'TECHNICIAN')
      .send({ estimatedArrivalAt: estimate })
      .expect(404);

    await ctx.db.insert(properties).values({
      id: ctx.ids.otherPropertyId,
      name: 'Other property',
      address: 'Other address',
    });
    const foreignUnit = await ctx.createUnit('START-LIST-04', {
      propertyId: ctx.ids.otherPropertyId,
    });
    const foreignReport = await ctx.addReport(foreignUnit.id, 'ASSIGNED');
    await assign(foreignReport.id);
    await ctx
      .api('post', `/api/reports/${foreignReport.id}/start`, 'TECHNICIAN')
      .send({ estimatedArrivalAt: estimate })
      .expect(404);
  });

  it('rechecks account state and conflicts on every status except ASSIGNED without changing data', async () => {
    const unit = await ctx.createUnit('START-STATE-01');
    const statuses = [
      'REPORTED',
      'VERIFIED',
      'REJECTED',
      'IN_PROGRESS',
      'COMPLETED',
      'CLOSED',
    ] as const;
    for (const status of statuses) {
      const report = await ctx.addReport(unit.id, status);
      await assign(report.id);
      await ctx
        .api('post', `/api/reports/${report.id}/start`, 'TECHNICIAN')
        .send({ estimatedArrivalAt: estimate })
        .expect(409);
      const [afterReport] = await ctx.db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, report.id));
      const [afterAssignment] = await ctx.db
        .select()
        .from(assignments)
        .where(eq(assignments.reportId, report.id));
      expect(afterReport.status).toBe(status);
      expect(afterAssignment.estimatedArrivalAt).toBeNull();
    }

    const assignedReport = await ctx.addReport(unit.id, 'ASSIGNED');
    await assign(assignedReport.id);
    const staleActor: AuthenticatedActor = {
      id: ctx.ids.actorIds.TECHNICIAN,
      name: 'TECHNICIAN',
      loginIdentifier: 'technician@example.test',
      role: 'TECHNICIAN',
    };
    const service = ctx.app.get(MaintenanceExecutionService);
    for (const changedAccount of [
      { isActive: false },
      { isActive: true, role: 'RESIDENT' as const },
    ]) {
      await ctx.db
        .update(users)
        .set(changedAccount)
        .where(eq(users.id, staleActor.id));
      try {
        await expect(
          service.start(staleActor, assignedReport.id, {
            estimatedArrivalAt: new Date(estimate),
          }),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        await ctx.db
          .update(users)
          .set({ isActive: true, role: 'TECHNICIAN' })
          .where(eq(users.id, staleActor.id));
      }
    }
  });

  it('keeps the first estimate on repeated or concurrent start requests', async () => {
    const unit = await ctx.createUnit('START-RACE-01');
    const report = await ctx.addReport(unit.id, 'ASSIGNED');
    await assign(report.id);
    const firstEstimate = '2026-10-04T14:30:00+07:00';
    const secondEstimate = '2026-10-05T09:00:00+07:00';

    const responses = await Promise.all([
      ctx
        .api('post', `/api/reports/${report.id}/start`, 'TECHNICIAN')
        .send({ estimatedArrivalAt: firstEstimate }),
      ctx
        .api('post', `/api/reports/${report.id}/start`, 'TECHNICIAN')
        .send({ estimatedArrivalAt: secondEstimate }),
    ]);
    expect(
      responses
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 409]);
    const success = responses.find((response) => response.status === 200)!;
    const [after] = await ctx.db
      .select()
      .from(assignments)
      .where(eq(assignments.reportId, report.id));
    expect(after.estimatedArrivalAt?.toISOString()).toBe(
      success.body.assignment.estimatedArrivalAt,
    );

    await ctx
      .api('post', `/api/reports/${report.id}/start`, 'TECHNICIAN')
      .send({ estimatedArrivalAt: '2026-10-06T10:00:00Z' })
      .expect(409);
    const [afterRepeat] = await ctx.db
      .select()
      .from(assignments)
      .where(eq(assignments.reportId, report.id));
    expect(afterRepeat.estimatedArrivalAt).toEqual(after.estimatedArrivalAt);
  });

  it('rolls back the estimate when the report status update fails', async () => {
    const unit = await ctx.createUnit('START-ROLLBACK-01');
    const report = await ctx.addReport(unit.id, 'ASSIGNED');
    await assign(report.id);
    await ctx.db.execute(
      sql.raw(`
      CREATE FUNCTION fail_start_work_for_test() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'IN_PROGRESS' THEN
          RAISE EXCEPTION 'simulated start status failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `),
    );
    await ctx.db.execute(
      sql.raw(`
      CREATE TRIGGER fail_start_work_for_test
      BEFORE UPDATE ON damage_reports
      FOR EACH ROW EXECUTE FUNCTION fail_start_work_for_test()
    `),
    );
    try {
      await ctx
        .api('post', `/api/reports/${report.id}/start`, 'TECHNICIAN')
        .send({ estimatedArrivalAt: estimate })
        .expect(500);
    } finally {
      await ctx.db.execute(
        sql.raw('DROP TRIGGER fail_start_work_for_test ON damage_reports'),
      );
      await ctx.db.execute(sql.raw('DROP FUNCTION fail_start_work_for_test()'));
    }

    const [afterReport] = await ctx.db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, report.id));
    const [afterAssignment] = await ctx.db
      .select()
      .from(assignments)
      .where(eq(assignments.reportId, report.id));
    expect(afterReport.status).toBe('ASSIGNED');
    expect(afterAssignment.estimatedArrivalAt).toBeNull();
  });

  it('documents the Technician start operation and payload in OpenAPI', async () => {
    const response = await ctx.api('get', '/api/docs-json', null).expect(200);
    const operation = response.body.paths['/api/reports/{id}/start'].post;
    expect(operation.security).toEqual(
      response.body.paths['/api/auth/me'].get.security,
    );
    expect(operation.responses['200']).toBeDefined();
    expect(operation.responses['400']).toBeDefined();
    expect(operation.responses['401']).toBeDefined();
    expect(operation.responses['403']).toBeDefined();
    expect(operation.responses['404']).toBeDefined();
    expect(operation.responses['409']).toBeDefined();
    expect(JSON.stringify(operation.requestBody)).toContain(
      'estimatedArrivalAt',
    );
    expect(JSON.stringify(operation.requestBody)).toContain('date-time');
  });
});
