import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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
  damageReportNumberSequence,
  units,
  users,
} from '../database/schema.js';
import { INITIAL_PROPERTY_ID } from '../property/property.constants.js';
import type {
  ReportCreateInput,
  ReportListInput,
  ReportRejectInput,
  ReportVerifyInput,
} from './report.schemas.js';

type Executor = Database | DatabaseTransaction;

const createdUser = alias(users, 'created_user');
const reportedUser = alias(users, 'reported_user');
const reviewedUser = alias(users, 'reviewed_user');
const closedUser = alias(users, 'closed_user');
const technicianUser = alias(users, 'technician_user');
const assignedByUser = alias(users, 'assigned_by_user');

function accessPredicate(actor: AuthenticatedActor) {
  if (actor.role === 'ADMIN') {
    return eq(units.propertyId, INITIAL_PROPERTY_ID);
  }
  if (actor.role === 'RESIDENT') {
    return and(
      eq(units.propertyId, INITIAL_PROPERTY_ID),
      eq(units.activeResidentUserId, actor.id),
    );
  }
  return and(
    eq(units.propertyId, INITIAL_PROPERTY_ID),
    sql`exists (select 1 from ${assignments} where ${assignments.reportId} = ${damageReports.id} and ${assignments.technicianUserId} = ${actor.id})`,
  );
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: ReportCreateInput, actor: AuthenticatedActor) {
    return this.database.transaction(async (transaction) => {
      const [lockedActor] = await transaction
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, actor.id))
        .for('update');
      if (
        !lockedActor ||
        !lockedActor.isActive ||
        lockedActor.role !== actor.role
      ) {
        return { kind: 'actor-changed' as const };
      }

      const [unit] = await transaction
        .select({
          id: units.id,
          isArchived: units.isArchived,
          activeResidentUserId: units.activeResidentUserId,
        })
        .from(units)
        .where(
          and(
            eq(units.id, input.unitId),
            eq(units.propertyId, INITIAL_PROPERTY_ID),
          ),
        )
        .for('update');
      if (!unit) return { kind: 'unit-not-found' as const };
      if (actor.role === 'RESIDENT' && unit.activeResidentUserId !== actor.id) {
        return { kind: 'unit-not-found' as const };
      }
      if (unit.isArchived) return { kind: 'unit-archived' as const };

      const priorityFields =
        actor.role === 'RESIDENT'
          ? {
              proposedPriority: input.priority,
              finalPriority: null,
              status: 'REPORTED' as const,
            }
          : {
              proposedPriority: null,
              finalPriority: input.priority,
              status: 'VERIFIED' as const,
            };
      const sequenceResult: unknown = await transaction.execute(sql`
        select nextval(${damageReportNumberSequence.seqName!}::regclass)::text as value
      `);
      const sequenceRow = Array.isArray(sequenceResult)
        ? sequenceResult[0]
        : sequenceResult &&
            typeof sequenceResult === 'object' &&
            'rows' in sequenceResult &&
            Array.isArray(sequenceResult.rows)
          ? sequenceResult.rows[0]
          : undefined;
      if (
        !sequenceRow ||
        typeof sequenceRow !== 'object' ||
        !('value' in sequenceRow)
      ) {
        throw new Error('Could not allocate report number');
      }
      const rawNumber = String(sequenceRow.value);
      const reportNumber = `RPT-${rawNumber.padStart(10, '0')}`;
      const [report] = await transaction
        .insert(damageReports)
        .values({
          reportNumber,
          unitId: unit.id,
          createdByUserId: actor.id,
          reportedByUserId: actor.id,
          title: input.title,
          description: input.description,
          category: input.category,
          ...priorityFields,
        })
        .returning({ id: damageReports.id });
      return {
        kind: 'created' as const,
        report: (await this.findAccessible(report.id, actor, transaction))!,
      };
    });
  }

  async review(
    id: string,
    actor: AuthenticatedActor,
    decision:
      | { kind: 'verify'; input: ReportVerifyInput }
      | { kind: 'reject'; input: ReportRejectInput },
  ) {
    return this.database.transaction(async (transaction) => {
      const [lockedActor] = await transaction
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, actor.id))
        .for('update');
      if (
        !lockedActor ||
        !lockedActor.isActive ||
        lockedActor.role !== 'ADMIN'
      ) {
        return { kind: 'actor-changed' as const };
      }

      const [report] = await transaction
        .select({ id: damageReports.id, status: damageReports.status })
        .from(damageReports)
        .innerJoin(units, eq(units.id, damageReports.unitId))
        .where(
          and(
            eq(damageReports.id, id),
            eq(units.propertyId, INITIAL_PROPERTY_ID),
          ),
        )
        .for('update', { of: damageReports });
      if (!report) return { kind: 'report-not-found' as const };
      if (report.status !== 'REPORTED') {
        return { kind: 'status-conflict' as const, status: report.status };
      }

      const decisionFields =
        decision.kind === 'verify'
          ? {
              status: 'VERIFIED' as const,
              finalPriority: decision.input.finalPriority,
              rejectionReason: null,
              reviewNote: decision.input.reviewNote ?? null,
            }
          : {
              status: 'REJECTED' as const,
              finalPriority: decision.input.finalPriority,
              rejectionReason: decision.input.rejectionReason,
              reviewNote: decision.input.reviewNote ?? null,
            };
      await transaction
        .update(damageReports)
        .set({ ...decisionFields, reviewedByUserId: actor.id })
        .where(eq(damageReports.id, report.id));

      return {
        kind: 'reviewed' as const,
        report: (await this.findAccessible(report.id, actor, transaction))!,
      };
    });
  }

  async list(actor: AuthenticatedActor, input: ReportListInput) {
    return this.database.db.transaction(
      async (transaction) => {
        const predicate = accessPredicate(actor);
        const [totals] = await transaction
          .select({ total: count() })
          .from(damageReports)
          .innerJoin(units, eq(units.id, damageReports.unitId))
          .where(predicate);
        const rows = await transaction
          .select({
            id: damageReports.id,
            reportNumber: damageReports.reportNumber,
            unit: {
              id: units.id,
              unitNumber: units.unitNumber,
              floor: units.floor,
            },
            title: damageReports.title,
            category: damageReports.category,
            proposedPriority: damageReports.proposedPriority,
            finalPriority: damageReports.finalPriority,
            status: damageReports.status,
            reportedAt: damageReports.reportedAt,
          })
          .from(damageReports)
          .innerJoin(units, eq(units.id, damageReports.unitId))
          .where(predicate)
          .orderBy(desc(damageReports.reportedAt), desc(damageReports.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
        return {
          data: rows,
          meta: {
            page: input.page,
            pageSize: input.pageSize,
            total: totals.total,
            totalPages: Math.ceil(totals.total / input.pageSize),
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async findAccessible(
    id: string,
    actor: AuthenticatedActor,
    executor: Executor = this.database.db,
  ) {
    const [row] = await executor
      .select({
        id: damageReports.id,
        reportNumber: damageReports.reportNumber,
        unit: {
          id: units.id,
          unitNumber: units.unitNumber,
          floor: units.floor,
        },
        title: damageReports.title,
        category: damageReports.category,
        proposedPriority: damageReports.proposedPriority,
        finalPriority: damageReports.finalPriority,
        status: damageReports.status,
        reportedAt: damageReports.reportedAt,
        description: damageReports.description,
        rejectionReason: damageReports.rejectionReason,
        reviewNote: damageReports.reviewNote,
        closedAt: damageReports.closedAt,
        createdAt: damageReports.createdAt,
        updatedAt: damageReports.updatedAt,
        createdById: createdUser.id,
        createdByName: createdUser.name,
        reportedById: reportedUser.id,
        reportedByName: reportedUser.name,
        reviewedById: reviewedUser.id,
        reviewedByName: reviewedUser.name,
        closedById: closedUser.id,
        closedByName: closedUser.name,
        assignmentId: assignments.id,
        technicianId: technicianUser.id,
        technicianName: technicianUser.name,
        assignedById: assignedByUser.id,
        assignedByName: assignedByUser.name,
        assignedAt: assignments.assignedAt,
        estimatedArrivalAt: assignments.estimatedArrivalAt,
        assignmentNote: assignments.note,
      })
      .from(damageReports)
      .innerJoin(units, eq(units.id, damageReports.unitId))
      .leftJoin(assignments, eq(assignments.reportId, damageReports.id))
      .leftJoin(
        technicianUser,
        eq(technicianUser.id, assignments.technicianUserId),
      )
      .leftJoin(
        assignedByUser,
        eq(assignedByUser.id, assignments.assignedByUserId),
      )
      .leftJoin(createdUser, eq(createdUser.id, damageReports.createdByUserId))
      .leftJoin(
        reportedUser,
        eq(reportedUser.id, damageReports.reportedByUserId),
      )
      .leftJoin(
        reviewedUser,
        eq(reviewedUser.id, damageReports.reviewedByUserId),
      )
      .leftJoin(closedUser, eq(closedUser.id, damageReports.closedByUserId))
      .where(and(eq(damageReports.id, id), accessPredicate(actor)))
      .limit(1);
    if (!row) return undefined;

    const photos = await executor
      .select({
        id: attachments.id,
        fileUrl: attachments.fileUrl,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.reportId, id),
          eq(attachments.purpose, 'DAMAGE_PHOTO'),
        ),
      )
      .orderBy(asc(attachments.createdAt), asc(attachments.id));
    const assignment = row.assignmentId
      ? {
          id: row.assignmentId,
          technician: row.technicianId
            ? { id: row.technicianId, name: row.technicianName! }
            : null,
          assignedBy: row.assignedById
            ? { id: row.assignedById, name: row.assignedByName! }
            : null,
          assignedAt: row.assignedAt!,
          estimatedArrivalAt: row.estimatedArrivalAt,
          note: row.assignmentNote,
        }
      : null;
    const detail = {
      id: row.id,
      reportNumber: row.reportNumber,
      unit: row.unit,
      title: row.title,
      category: row.category,
      proposedPriority: row.proposedPriority,
      finalPriority: row.finalPriority,
      status: row.status,
      reportedAt: row.reportedAt,
      description: row.description,
      rejectionReason: row.rejectionReason,
      reviewNote: row.reviewNote,
      closedAt: row.closedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdById
        ? { id: row.createdById, name: row.createdByName! }
        : null,
      reportedBy: row.reportedById
        ? { id: row.reportedById, name: row.reportedByName! }
        : null,
      reviewedBy: row.reviewedById
        ? { id: row.reviewedById, name: row.reviewedByName! }
        : null,
      closedBy: row.closedById
        ? { id: row.closedById, name: row.closedByName! }
        : null,
      assignment,
      damagePhotos: photos,
    };
    if (actor.role !== 'ADMIN') {
      const {
        createdBy: _createdBy,
        reportedBy: _reportedBy,
        reviewedBy: _reviewedBy,
        reviewNote: _reviewNote,
        closedBy: _closedBy,
        assignment: safeAssignment,
        ...safeDetail
      } = detail;
      return {
        ...safeDetail,
        assignment: safeAssignment
          ? {
              id: safeAssignment.id,
              technician: safeAssignment.technician,
              assignedAt: safeAssignment.assignedAt,
              estimatedArrivalAt: safeAssignment.estimatedArrivalAt,
              note: safeAssignment.note,
            }
          : null,
      };
    }
    return detail;
  }
}
