import { eq, sql } from 'drizzle-orm';
import {
  assignments,
  costItems,
  damageReports,
  users,
} from '../src/modules/database/schema.js';
import type { AuthenticatedActor } from '../src/modules/auth-accounts/authentication.types.js';
import { MaintenanceExecutionService } from '../src/modules/maintenance-execution/maintenance-execution.service.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Maintenance completion API (e2e)', () => {
  const ctx = usePropertyUnitsContext();

  async function inProgressReport(unitNumber: string, resident = false) {
    const unit = await ctx.createUnit(unitNumber, {
      activeResidentUserId: resident ? ctx.ids.actorIds.RESIDENT : null,
    });
    const report = await ctx.addReport(unit.id, 'IN_PROGRESS');
    await ctx.db.insert(assignments).values({
      reportId: report.id,
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
    });
    return report;
  }

  function saveResult(reportId: string) {
    return ctx
      .api('put', `/api/reports/${reportId}/result`, 'TECHNICIAN')
      .send({
        inspectionResult: '  Checked the pipe  ',
        problemFound: ' Pipe joint was leaking ',
        repairAction: ' Replaced the seal ',
        additionalNotes: ' ',
      });
  }

  function uploadReceipt(reportId: string) {
    return ctx
      .api('put', `/api/reports/${reportId}/receipt`, 'TECHNICIAN')
      .attach('file', Buffer.from('%PDF-1.7 receipt'), {
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
      });
  }

  it('saves or updates one result, replaces costs atomically, computes NUMERIC totals, and completes', async () => {
    const report = await inProgressReport('COMPLETE-SUCCESS-01', true);
    const first = await saveResult(report.id).expect(200);
    expect(first.body.maintenanceResult).toMatchObject({
      inspectionResult: 'Checked the pipe',
      problemFound: 'Pipe joint was leaking',
      repairAction: 'Replaced the seal',
      additionalNotes: null,
    });
    const resultId = first.body.maintenanceResult.id;
    const second = await ctx
      .api('put', `/api/reports/${report.id}/result`, 'TECHNICIAN')
      .send({
        inspectionResult: 'Checked again',
        problemFound: 'Leak confirmed',
        repairAction: 'Seal replaced',
        additionalNotes: null,
      })
      .expect(200);
    expect(second.body.maintenanceResult.id).toBe(resultId);

    const costs = await ctx
      .api('put', `/api/reports/${report.id}/cost-items`, 'TECHNICIAN')
      .send({
        items: [
          {
            type: 'SERVICE',
            description: 'Labor',
            price: '1.01',
          },
          {
            type: 'MATERIAL',
            description: 'Seal',
            price: '1.01',
          },
        ],
      })
      .expect(200);
    expect(
      costs.body.costItems.map((item: { price: string }) => item.price),
    ).toEqual(['1.01', '1.01']);
    expect(costs.body.totalCost).toBe('2.02');
    for (const item of costs.body.costItems) {
      expect(item).not.toHaveProperty('quantity');
      expect(item).not.toHaveProperty('unitPrice');
      expect(item).not.toHaveProperty('subtotal');
    }
    await ctx
      .api('put', `/api/reports/${report.id}/cost-items`, 'TECHNICIAN')
      .send({
        items: [
          {
            type: 'SERVICE',
            description: 'Labor',
            price: '10.50',
          },
        ],
      })
      .expect(200);
    const savedCosts = await ctx.db
      .select()
      .from(costItems)
      .where(eq(costItems.reportId, report.id));
    expect(savedCosts).toHaveLength(1);

    const missingReceipt = await ctx
      .api('post', `/api/reports/${report.id}/complete`, 'TECHNICIAN')
      .expect(409);
    expect(missingReceipt.body.code).toBe('CONFLICT');
    await uploadReceipt(report.id).expect(200);

    const [completed, repeated] = await Promise.all([
      ctx.api('post', `/api/reports/${report.id}/complete`, 'TECHNICIAN'),
      ctx.api('post', `/api/reports/${report.id}/complete`, 'TECHNICIAN'),
    ]);
    expect([completed.status, repeated.status].sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const detail = await ctx
      .api('get', `/api/reports/${report.id}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      status: 'COMPLETED',
      totalCost: '10.50',
      maintenanceResult: { id: resultId },
    });
    expect(detail.body.costItems).toHaveLength(1);
    expect(detail.body.receipt).toMatchObject({ fileUrl: expect.any(String) });

    const residentDetail = await ctx
      .api('get', `/api/reports/${report.id}`, 'RESIDENT')
      .expect(200);
    expect(residentDetail.body).toMatchObject({
      totalCost: '10.50',
      maintenanceResult: { inspectionResult: 'Checked again' },
      receipt: null,
    });
    expect(residentDetail.body).not.toHaveProperty('costItems');
  });

  it('requires result and receipt, allows zero cost rows, and keeps failed work in progress', async () => {
    const report = await inProgressReport('COMPLETE-REQUIREMENTS-01');
    const noResult = await ctx
      .api('post', `/api/reports/${report.id}/complete`, 'TECHNICIAN')
      .expect(409);
    expect(noResult.body.message).toContain('result');
    expect(
      (await ctx.api('get', `/api/reports/${report.id}`)).body.status,
    ).toBe('IN_PROGRESS');

    await saveResult(report.id).expect(200);
    await ctx
      .api('put', `/api/reports/${report.id}/cost-items`, 'TECHNICIAN')
      .send({ items: [] })
      .expect(200);
    const noReceipt = await ctx
      .api('post', `/api/reports/${report.id}/complete`, 'TECHNICIAN')
      .expect(409);
    expect(noReceipt.body.message).toContain('receipt');
    await uploadReceipt(report.id).expect(200);
    const completed = await ctx
      .api('post', `/api/reports/${report.id}/complete`, 'TECHNICIAN')
      .expect(200);
    expect(completed.body).toMatchObject({
      status: 'COMPLETED',
      totalCost: '0.00',
      costItems: [],
    });
  });

  it('restricts writes to the assigned Technician and IN_PROGRESS state', async () => {
    const report = await inProgressReport('COMPLETE-AUTH-01');
    const resultPath = `/api/reports/${report.id}/result`;
    await ctx.api('put', resultPath, null).send({}).expect(401);
    await ctx.api('put', resultPath, 'ADMIN').send({}).expect(403);
    await ctx.api('put', resultPath, 'RESIDENT').send({}).expect(403);
    await ctx
      .api('put', resultPath, 'TECHNICIAN')
      .send({ inspectionResult: ' ', problemFound: 'x', repairAction: 'x' })
      .expect(400);
    await ctx
      .api('put', `/api/reports/${report.id}/cost-items`, 'TECHNICIAN')
      .send({ items: [{ type: 'OTHER' }] })
      .expect(400);

    const other = await inProgressReport('COMPLETE-OTHER-TECH-01');
    await ctx.db
      .update(assignments)
      .set({ technicianUserId: ctx.ids.secondResidentId })
      .where(eq(assignments.reportId, other.id));
    await ctx
      .api('put', `/api/reports/${other.id}/cost-items`, 'TECHNICIAN')
      .send({ items: [] })
      .expect(404);

    const statusReport = await inProgressReport('COMPLETE-STATUS-01');
    await ctx.db
      .update(damageReports)
      .set({ status: 'ASSIGNED' })
      .where(eq(damageReports.id, statusReport.id));
    await ctx
      .api('put', `/api/reports/${statusReport.id}/result`, 'TECHNICIAN')
      .send({ inspectionResult: 'x', problemFound: 'x', repairAction: 'x' })
      .expect(409);

    for (const [index, status] of (
      [
        'REPORTED',
        'VERIFIED',
        'REJECTED',
        'ASSIGNED',
        'COMPLETED',
        'CLOSED',
      ] as const
    ).entries()) {
      const unit = await ctx.createUnit(`COMPLETE-STATUS-${index + 2}`);
      const otherStatus = await ctx.addReport(unit.id, status);
      await ctx.db.insert(assignments).values({
        reportId: otherStatus.id,
        technicianUserId: ctx.ids.actorIds.TECHNICIAN,
        assignedByUserId: ctx.ids.actorIds.ADMIN,
      });
      await ctx
        .api('put', `/api/reports/${otherStatus.id}/cost-items`, 'TECHNICIAN')
        .send({ items: [] })
        .expect(409);
    }

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
        .where(eq(users.id, ctx.ids.actorIds.TECHNICIAN));
      try {
        await expect(
          service.saveCostItems(staleActor, report.id, { items: [] }),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        await ctx.db
          .update(users)
          .set({ isActive: true, role: 'TECHNICIAN' })
          .where(eq(users.id, ctx.ids.actorIds.TECHNICIAN));
      }
    }
  });

  it('documents the result, cost item, and completion operations in OpenAPI', async () => {
    const response = await ctx.api('get', '/api/docs-json', null).expect(200);
    const { paths } = response.body;
    expect(
      paths['/api/reports/{id}/result'].put.responses['200'],
    ).toBeDefined();
    expect(
      paths['/api/reports/{id}/cost-items'].put.responses['200'],
    ).toBeDefined();
    expect(
      paths['/api/reports/{id}/complete'].post.responses['409'],
    ).toBeDefined();
    expect(
      JSON.stringify(paths['/api/reports/{id}/cost-items'].put.requestBody),
    ).toContain('price');
    const properties =
      response.body.components.schemas.CostItemResponseDto.properties;
    expect(properties.price).toBeDefined();
    expect(properties.quantity).toBeUndefined();
    expect(properties.unitPrice).toBeUndefined();
    expect(properties.subtotal).toBeUndefined();
  });

  it('rolls back a failed cost replacement and a completion without changing saved data', async () => {
    const report = await inProgressReport('COMPLETE-ROLLBACK-01');
    await saveResult(report.id).expect(200);
    await ctx
      .api('put', `/api/reports/${report.id}/cost-items`, 'TECHNICIAN')
      .send({ items: [{ type: 'SERVICE', description: 'Old', price: '2' }] })
      .expect(200);
    await ctx.db.execute(
      sql.raw(
        "ALTER TABLE cost_items ADD CONSTRAINT test_cost_items_no_trigger_failure CHECK (description <> 'TriggerFailure')",
      ),
    );
    await ctx
      .api('put', `/api/reports/${report.id}/cost-items`, 'TECHNICIAN')
      .send({
        items: [
          { type: 'MATERIAL', description: 'TriggerFailure', price: '1' },
        ],
      })
      .expect(500);
    await ctx.db.execute(
      sql.raw(
        'ALTER TABLE cost_items DROP CONSTRAINT test_cost_items_no_trigger_failure',
      ),
    );
    const rows = await ctx.db
      .select()
      .from(costItems)
      .where(eq(costItems.reportId, report.id));
    expect(rows).toHaveLength(1);
    await uploadReceipt(report.id).expect(200);
    await ctx.db.execute(
      sql.raw(
        "ALTER TABLE damage_reports ADD CONSTRAINT test_reports_no_completed CHECK (status <> 'COMPLETED')",
      ),
    );
    await ctx
      .api('post', `/api/reports/${report.id}/complete`, 'TECHNICIAN')
      .expect(500);
    expect(
      (await ctx.api('get', `/api/reports/${report.id}`)).body.status,
    ).toBe('IN_PROGRESS');
    await ctx.db.execute(
      sql.raw(
        'ALTER TABLE damage_reports DROP CONSTRAINT test_reports_no_completed',
      ),
    );
  });
});

describe('Price-only cost contract', () => {
  const ctx = usePropertyUnitsContext();
  it('accepts exact large/zero prices, sums them, and rejects removed fields without replacing saved data', async () => {
    const unit = await ctx.createUnit('PRICE-ONLY');
    const report = await ctx.addReport(unit.id, 'IN_PROGRESS');
    await ctx.db.insert(assignments).values({
      reportId: report.id,
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
    });
    const items = [
      {
        type: 'SERVICE',
        description: 'Large amount',
        price: '999999999999999999999.99',
      },
      { type: 'MATERIAL', description: 'Zero', price: '0' },
      { type: 'SERVICE', description: 'Cent', price: '0.01' },
    ];
    const response = await ctx
      .api('put', `/api/reports/${report.id}/cost-items`, 'TECHNICIAN')
      .send({ items })
      .expect(200);
    expect(response.body.totalCost).toBe('1000000000000000000000.00');
    expect(
      response.body.costItems
        .map((item: { price: string }) => item.price)
        .sort(),
    ).toEqual(['0.00', '0.01', '999999999999999999999.99']);
    for (const item of [
      { type: 'SERVICE', description: 'Legacy', quantity: '1', unitPrice: '1' },
      { type: 'SERVICE', description: 'Extra', price: '1', subtotal: '1' },
      { type: 'SERVICE', description: 'Negative', price: '-1' },
      { type: 'SERVICE', description: 'Precision', price: '0.001' },
      {
        type: 'SERVICE',
        description: 'Overflow',
        price: '1000000000000000000000',
      },
    ])
      await ctx
        .api('put', `/api/reports/${report.id}/cost-items`, 'TECHNICIAN')
        .send({ items: [item] })
        .expect(400);
    const retained = await ctx
      .api('get', `/api/reports/${report.id}`, 'TECHNICIAN')
      .expect(200);
    expect(retained.body.totalCost).toBe(response.body.totalCost);
    expect(retained.body.costItems).toHaveLength(3);
  });
});
