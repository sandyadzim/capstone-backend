import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import type { DatabaseTransaction } from '../database/database.service.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import {
  assignments,
  costItems,
  damageReports,
  maintenanceResults,
  units,
  users,
} from '../database/schema.js';
import { INITIAL_PROPERTY_ID } from '../property/property.constants.js';
import type { HistoryListInput } from './dashboard-history.schemas.js';

const UTC_OFFSET_JAKARTA_MINUTES = 7 * 60;

export function jakartaCalendarMonthBounds(now: Date): {
  start: Date;
  end: Date;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')!.value);
  const month = Number(parts.find((part) => part.type === 'month')!.value);
  const start =
    Date.UTC(year, month - 1, 1) - UTC_OFFSET_JAKARTA_MINUTES * 60_000;
  const end = Date.UTC(year, month, 1) - UTC_OFFSET_JAKARTA_MINUTES * 60_000;
  return { start: new Date(start), end: new Date(end) };
}

@Injectable()
export class DashboardHistoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async listUnitHistory(
    actor: AuthenticatedActor,
    unitId: string,
    input: HistoryListInput,
  ) {
    return this.database.db.transaction(
      async (transaction) => {
        const visibleUnit = await this.findVisibleUnit(
          transaction,
          actor,
          unitId,
        );
        if (!visibleUnit) throw new NotFoundException();

        const where = and(
          eq(damageReports.unitId, unitId),
          eq(damageReports.status, 'CLOSED'),
        );
        const [totalResult] = await transaction
          .select({ total: count() })
          .from(damageReports)
          .where(where);
        const rows = await transaction
          .select({
            id: damageReports.id,
            reportNumber: damageReports.reportNumber,
            title: damageReports.title,
            category: damageReports.category,
            reportedAt: damageReports.reportedAt,
            closedAt: damageReports.closedAt,
            status: damageReports.status,
            technicianId: users.id,
            technicianName: users.name,
            resultId: maintenanceResults.id,
            inspectionResult: maintenanceResults.inspectionResult,
            problemFound: maintenanceResults.problemFound,
            repairAction: maintenanceResults.repairAction,
            additionalNotes: maintenanceResults.additionalNotes,
            resultCreatedAt: maintenanceResults.createdAt,
            resultUpdatedAt: maintenanceResults.updatedAt,
            totalCost: sql<string>`coalesce((select sum(${costItems.price})::text from ${costItems} where ${costItems.reportId} = ${damageReports.id}), '0.00')`,
          })
          .from(damageReports)
          .innerJoin(units, eq(units.id, damageReports.unitId))
          .leftJoin(assignments, eq(assignments.reportId, damageReports.id))
          .leftJoin(users, eq(users.id, assignments.technicianUserId))
          .leftJoin(
            maintenanceResults,
            eq(maintenanceResults.reportId, damageReports.id),
          )
          .where(where)
          .orderBy(desc(damageReports.closedAt), desc(damageReports.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);

        return {
          data: rows.map((row) => ({
            id: row.id,
            reportNumber: row.reportNumber,
            title: row.title,
            category: row.category,
            reportedAt: row.reportedAt,
            closedAt: row.closedAt!,
            technician: row.technicianId
              ? { id: row.technicianId, name: row.technicianName! }
              : null,
            maintenanceResult: row.resultId
              ? {
                  id: row.resultId,
                  inspectionResult: row.inspectionResult!,
                  problemFound: row.problemFound!,
                  repairAction: row.repairAction!,
                  additionalNotes: row.additionalNotes,
                  createdAt: row.resultCreatedAt!,
                  updatedAt: row.resultUpdatedAt!,
                }
              : null,
            totalCost: row.totalCost,
            status: row.status,
          })),
          meta: {
            page: input.page,
            pageSize: input.pageSize,
            total: totalResult?.total ?? 0,
            totalPages: Math.ceil((totalResult?.total ?? 0) / input.pageSize),
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  private async findVisibleUnit(
    transaction: DatabaseTransaction,
    actor: AuthenticatedActor,
    unitId: string,
  ) {
    const [unit] = await transaction
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.id, unitId),
          eq(units.propertyId, INITIAL_PROPERTY_ID),
          ...(actor.role === 'RESIDENT'
            ? [
                eq(units.activeResidentUserId, actor.id),
                eq(units.isArchived, false),
              ]
            : []),
        ),
      );
    return unit;
  }

  async dashboardSummary(now: Date) {
    const { start, end } = jakartaCalendarMonthBounds(now);
    return this.database.db.transaction(
      async (transaction) => {
        const [unitResult] = await transaction
          .select({ total: count() })
          .from(units)
          .where(
            and(
              eq(units.propertyId, INITIAL_PROPERTY_ID),
              eq(units.isArchived, false),
            ),
          );
        const [reportCounts] = await transaction
          .select({
            totalReports: count(),
            activeReports: sql<number>`count(*) filter (where ${damageReports.status} not in ('CLOSED', 'REJECTED'))::int`,
            inProgressReports: sql<number>`count(*) filter (where ${damageReports.status} = 'IN_PROGRESS')::int`,
            closedReportsThisMonth: sql<number>`count(*) filter (where ${damageReports.status} = 'CLOSED' and ${damageReports.closedAt} >= ${start.toISOString()}::timestamptz and ${damageReports.closedAt} < ${end.toISOString()}::timestamptz)::int`,
          })
          .from(damageReports)
          .innerJoin(units, eq(units.id, damageReports.unitId))
          .where(eq(units.propertyId, INITIAL_PROPERTY_ID));
        const [costResult] = await transaction
          .select({
            totalClosedCost: sql<string>`coalesce((select sum(ci.price) from cost_items as ci inner join damage_reports as dr on dr.id = ci.report_id inner join units as u on u.id = dr.unit_id where dr.status = 'CLOSED' and u.property_id = ${INITIAL_PROPERTY_ID}), 0)::numeric(1000, 2)::text`,
          })
          .from(sql`(select 1) as dashboard_seed`);

        return {
          totalUnits: unitResult?.total ?? 0,
          totalReports: reportCounts?.totalReports ?? 0,
          activeReports: reportCounts?.activeReports ?? 0,
          inProgressReports: reportCounts?.inProgressReports ?? 0,
          closedReportsThisMonth: reportCounts?.closedReportsThisMonth ?? 0,
          totalClosedCost: costResult?.totalClosedCost ?? '0.00',
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
