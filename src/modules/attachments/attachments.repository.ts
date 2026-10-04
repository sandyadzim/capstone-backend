import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import type {
  Database,
  DatabaseTransaction,
} from '../database/database.service.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import {
  assignments,
  attachments,
  damageReports,
  units,
  users,
} from '../database/schema.js';
import { INITIAL_PROPERTY_ID } from '../property/property.constants.js';

type Executor = Database | DatabaseTransaction;
export type UploadPurpose = 'DAMAGE_PHOTO' | 'REPAIR_PHOTO' | 'RECEIPT';

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async checkAccess(
    actor: AuthenticatedActor,
    reportId: string,
    purpose: UploadPurpose,
  ) {
    return this.access(this.database.db, actor, reportId, purpose, false);
  }

  async addReportAttachment(
    actor: AuthenticatedActor,
    reportId: string,
    purpose: UploadPurpose,
    fileUrl: string,
  ) {
    return this.database.transaction(async (tx) => {
      const access = await this.access(tx, actor, reportId, purpose, true);
      if (access.kind !== 'allowed') return access;

      const current = await tx
        .select({
          id: attachments.id,
          fileUrl: attachments.fileUrl,
          createdAt: attachments.createdAt,
        })
        .from(attachments)
        .where(
          and(
            eq(attachments.reportId, reportId),
            eq(attachments.purpose, purpose),
          ),
        )
        .orderBy(asc(attachments.createdAt), asc(attachments.id));

      if (purpose === 'RECEIPT') {
        if (current[0]) {
          const [updated] = await tx
            .update(attachments)
            .set({ fileUrl })
            .where(eq(attachments.id, current[0].id))
            .returning({
              id: attachments.id,
              fileUrl: attachments.fileUrl,
              createdAt: attachments.createdAt,
            });
          return {
            kind: 'saved' as const,
            attachment: updated,
            previousUrl: current[0].fileUrl,
          };
        }
      } else if (current.length >= 5) {
        return { kind: 'limit-reached' as const };
      }

      const [attachment] = await tx
        .insert(attachments)
        .values({ reportId, purpose, fileUrl })
        .returning({
          id: attachments.id,
          fileUrl: attachments.fileUrl,
          createdAt: attachments.createdAt,
        });
      return { kind: 'saved' as const, attachment, previousUrl: null };
    });
  }

  private async access(
    executor: Executor,
    actor: AuthenticatedActor,
    reportId: string,
    purpose: UploadPurpose,
    lock: boolean,
  ) {
    const accountQuery = executor
      .select({ role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, actor.id));
    const [account] = lock
      ? await accountQuery.for('update')
      : await accountQuery;
    if (!account?.isActive || account.role !== actor.role)
      return { kind: 'actor-changed' as const };

    let [unit] = await executor
      .select({
        id: units.id,
        activeResidentUserId: units.activeResidentUserId,
        propertyId: units.propertyId,
      })
      .from(units)
      .innerJoin(damageReports, eq(damageReports.unitId, units.id))
      .where(eq(damageReports.id, reportId));
    if (!unit || unit.propertyId !== INITIAL_PROPERTY_ID)
      return { kind: 'report-not-found' as const };
    if (lock)
      [unit] = await executor
        .select({
          id: units.id,
          activeResidentUserId: units.activeResidentUserId,
          propertyId: units.propertyId,
        })
        .from(units)
        .where(eq(units.id, unit.id))
        .for('update');

    let [report] = await executor
      .select({ id: damageReports.id, status: damageReports.status })
      .from(damageReports)
      .where(eq(damageReports.id, reportId));
    if (lock)
      [report] = await executor
        .select({ id: damageReports.id, status: damageReports.status })
        .from(damageReports)
        .where(eq(damageReports.id, reportId))
        .for('update');
    if (!report) return { kind: 'report-not-found' as const };

    if (actor.role === 'RESIDENT') {
      if (purpose !== 'DAMAGE_PHOTO' || unit.activeResidentUserId !== actor.id)
        return { kind: 'report-not-found' as const };
      if (report.status !== 'REPORTED')
        return { kind: 'status-conflict' as const };
    } else if (actor.role === 'ADMIN') {
      if (purpose === 'REPAIR_PHOTO' || purpose === 'RECEIPT')
        return { kind: 'forbidden' as const };
      if (report.status !== 'REPORTED' && report.status !== 'VERIFIED')
        return { kind: 'status-conflict' as const };
    } else {
      if (purpose === 'DAMAGE_PHOTO') return { kind: 'forbidden' as const };
      const assignmentQuery = executor
        .select({ technicianUserId: assignments.technicianUserId })
        .from(assignments)
        .where(eq(assignments.reportId, reportId));
      const [assignment] = lock
        ? await assignmentQuery.for('update')
        : await assignmentQuery;
      if (!assignment || assignment.technicianUserId !== actor.id)
        return { kind: 'report-not-found' as const };
      if (report.status !== 'IN_PROGRESS')
        return { kind: 'status-conflict' as const };
    }
    return { kind: 'allowed' as const };
  }
}
