import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DatabaseTransaction } from '../database/database.service.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import {
  assignments,
  attachments,
  damageReports,
  costItems,
  maintenanceResults,
  units,
  users,
} from '../database/schema.js';
import { INITIAL_PROPERTY_ID } from '../property/property.constants.js';

@Injectable()
export class MaintenanceExecutionRepository {
  private async lockAssignedWork(
    transaction: DatabaseTransaction,
    actor: AuthenticatedActor,
    reportId: string,
  ) {
    const [lockedActor] = await transaction
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, actor.id))
      .for('update');
    if (!lockedActor?.isActive || lockedActor.role !== 'TECHNICIAN')
      return { kind: 'actor-changed' as const };

    const [report] = await transaction
      .select({ id: damageReports.id, status: damageReports.status })
      .from(damageReports)
      .innerJoin(units, eq(units.id, damageReports.unitId))
      .where(
        and(
          eq(damageReports.id, reportId),
          eq(units.propertyId, INITIAL_PROPERTY_ID),
        ),
      )
      .for('update', { of: damageReports });
    if (!report) return { kind: 'report-not-found' as const };

    const [assignment] = await transaction
      .select({
        id: assignments.id,
        technicianUserId: assignments.technicianUserId,
      })
      .from(assignments)
      .where(eq(assignments.reportId, report.id))
      .for('update');
    if (!assignment || assignment.technicianUserId !== actor.id)
      return { kind: 'report-not-found' as const };
    if (report.status !== 'IN_PROGRESS')
      return { kind: 'status-conflict' as const, status: report.status };
    return { kind: 'allowed' as const, report };
  }

  async saveResult(
    transaction: DatabaseTransaction,
    actor: AuthenticatedActor,
    reportId: string,
    input: {
      inspectionResult: string;
      problemFound: string;
      repairAction: string;
      additionalNotes: string | null;
    },
  ) {
    const access = await this.lockAssignedWork(transaction, actor, reportId);
    if (access.kind !== 'allowed') return access;
    await transaction
      .insert(maintenanceResults)
      .values({ reportId, ...input })
      .onConflictDoUpdate({
        target: maintenanceResults.reportId,
        set: input,
      });
    return { kind: 'saved' as const };
  }

  async saveCostItems(
    transaction: DatabaseTransaction,
    actor: AuthenticatedActor,
    reportId: string,
    items: Array<{
      type: 'SERVICE' | 'MATERIAL';
      description: string;
      quantity: string;
      unitPrice: string;
    }>,
  ) {
    const access = await this.lockAssignedWork(transaction, actor, reportId);
    if (access.kind !== 'allowed') return access;
    await transaction.delete(costItems).where(eq(costItems.reportId, reportId));
    if (items.length) {
      await transaction.insert(costItems).values(
        items.map((item) => ({ reportId, ...item })),
      );
    }
    return { kind: 'saved' as const };
  }

  async complete(
    transaction: DatabaseTransaction,
    actor: AuthenticatedActor,
    reportId: string,
  ) {
    const access = await this.lockAssignedWork(transaction, actor, reportId);
    if (access.kind !== 'allowed') return access;
    const [result] = await transaction
      .select({ id: maintenanceResults.id })
      .from(maintenanceResults)
      .where(eq(maintenanceResults.reportId, reportId));
    if (!result) return { kind: 'result-missing' as const };
    const [receipt] = await transaction
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        and(
          eq(attachments.reportId, reportId),
          eq(attachments.purpose, 'RECEIPT'),
        ),
      );
    if (!receipt) return { kind: 'receipt-missing' as const };
    await transaction
      .update(damageReports)
      .set({ status: 'COMPLETED' })
      .where(eq(damageReports.id, reportId));
    return { kind: 'completed' as const };
  }

  async start(
    transaction: DatabaseTransaction,
    actor: AuthenticatedActor,
    reportId: string,
    estimatedArrivalAt: Date,
  ) {
    const [lockedActor] = await transaction
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, actor.id))
      .for('update');
    if (
      !lockedActor ||
      !lockedActor.isActive ||
      lockedActor.role !== 'TECHNICIAN'
    ) {
      return { kind: 'actor-changed' as const };
    }

    const [report] = await transaction
      .select({ id: damageReports.id, status: damageReports.status })
      .from(damageReports)
      .innerJoin(units, eq(units.id, damageReports.unitId))
      .where(
        and(
          eq(damageReports.id, reportId),
          eq(units.propertyId, INITIAL_PROPERTY_ID),
        ),
      )
      .for('update', { of: damageReports });
    if (!report) return { kind: 'report-not-found' as const };

    const [assignment] = await transaction
      .select({
        id: assignments.id,
        technicianUserId: assignments.technicianUserId,
      })
      .from(assignments)
      .where(eq(assignments.reportId, report.id))
      .for('update');
    if (!assignment || assignment.technicianUserId !== actor.id) {
      return { kind: 'report-not-found' as const };
    }
    if (report.status !== 'ASSIGNED') {
      return { kind: 'status-conflict' as const, status: report.status };
    }

    await transaction
      .update(assignments)
      .set({ estimatedArrivalAt })
      .where(eq(assignments.id, assignment.id));
    await transaction
      .update(damageReports)
      .set({ status: 'IN_PROGRESS' })
      .where(eq(damageReports.id, report.id));

    return { kind: 'started' as const };
  }
}
