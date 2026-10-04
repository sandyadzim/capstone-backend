import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DatabaseTransaction } from '../database/database.service.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import {
  assignments,
  damageReports,
  units,
  users,
} from '../database/schema.js';
import { INITIAL_PROPERTY_ID } from '../property/property.constants.js';

@Injectable()
export class MaintenanceExecutionRepository {
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
