import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  notInArray,
  sql,
} from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import type {
  Database,
  DatabaseTransaction,
} from '../database/database.service.js';
import { damageReports, units, users } from '../database/schema.js';
import { INITIAL_PROPERTY_ID } from '../property/property.constants.js';
import type {
  UnitCreateInput,
  UnitListInput,
  UnitPatchInput,
} from './unit.schemas.js';
import type { UnitResponseDto } from './unit.dto.js';

type Executor = Database | DatabaseTransaction;
export type UnitRecord = typeof units.$inferSelect;
const unitProjection = {
  id: units.id,
  propertyId: units.propertyId,
  unitNumber: units.unitNumber,
  floor: units.floor,
  maintenanceFlag: units.maintenanceFlag,
  isArchived: units.isArchived,
  createdAt: units.createdAt,
  updatedAt: units.updatedAt,
  activeResident: {
    id: users.id,
    name: users.name,
    loginIdentifier: users.loginIdentifier,
  },
};
const residentJoin = and(
  eq(users.id, units.activeResidentUserId),
  eq(users.isActive, true),
  eq(users.role, 'RESIDENT'),
);
// Use the same active-resident join and precedence as the response status.
const displayStatus = sql<string>`CASE
  WHEN ${units.maintenanceFlag} THEN 'MAINTENANCE'
  WHEN ${users.id} IS NOT NULL THEN 'OCCUPIED'
  ELSE 'VACANT'
END`;

@Injectable()
export class UnitsRepository {
  constructor(private readonly database: DatabaseService) {}

  async findCurrentResidentUnit(residentUserId: string) {
    const [unit] = await this.database.db
      .select({
        id: units.id,
        unitNumber: units.unitNumber,
        floor: units.floor,
      })
      .from(units)
      .where(
        and(
          eq(units.activeResidentUserId, residentUserId),
          eq(units.propertyId, INITIAL_PROPERTY_ID),
          eq(units.isArchived, false),
        ),
      );
    return unit ?? null;
  }

  async findUnit(
    id: string,
    executor: Executor = this.database.db,
  ): Promise<UnitResponseDto | undefined> {
    const [unit] = await executor
      .select(unitProjection)
      .from(units)
      .leftJoin(users, residentJoin)
      .where(and(eq(units.id, id), eq(units.propertyId, INITIAL_PROPERTY_ID)));
    return unit
      ? {
          ...unit,
          displayStatus: unit.maintenanceFlag
            ? 'MAINTENANCE'
            : unit.activeResident
              ? 'OCCUPIED'
              : 'VACANT',
        }
      : undefined;
  }

  async listUnits(input: UnitListInput) {
    const searchPattern = input.q
      ? `%${input.q.replace(/[\\%_]/g, '\\$&')}%`
      : undefined;
    // Both queries see the same snapshot, including an empty page beyond the end.
    return this.database.db.transaction(
      async (transaction) => {
        const predicate = and(
          eq(units.propertyId, INITIAL_PROPERTY_ID),
          eq(units.isArchived, input.isArchived),
          input.displayStatus
            ? eq(displayStatus, input.displayStatus)
            : undefined,
          searchPattern
            ? sql`${units.unitNumber} ILIKE ${searchPattern} ESCAPE E'\\\\'`
            : undefined,
        );
        const [totals] = await transaction
          .select({ total: count() })
          .from(units)
          .leftJoin(users, residentJoin)
          .where(predicate);
        const rows = await transaction
          .select(unitProjection)
          .from(units)
          .leftJoin(users, residentJoin)
          .where(predicate)
          .orderBy(desc(units.createdAt), desc(units.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
        const data: UnitResponseDto[] = rows.map((unit) => ({
          ...unit,
          displayStatus: unit.maintenanceFlag
            ? 'MAINTENANCE'
            : unit.activeResident
              ? 'OCCUPIED'
              : 'VACANT',
        }));
        return {
          data,
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

  async createUnit(input: UnitCreateInput) {
    const [unit] = await this.database.db
      .insert(units)
      .values({ ...input, propertyId: INITIAL_PROPERTY_ID })
      .returning({ id: units.id });
    return unit.id;
  }

  async updateUnit(
    id: string,
    input: UnitPatchInput | { isArchived: true },
    transaction: DatabaseTransaction,
  ) {
    await transaction
      .update(units)
      .set(input)
      .where(and(eq(units.id, id), eq(units.propertyId, INITIAL_PROPERTY_ID)));
  }

  async lockUnits(
    ids: string[],
    transaction: DatabaseTransaction,
  ): Promise<UnitRecord[]> {
    return transaction
      .select()
      .from(units)
      .where(
        and(inArray(units.id, ids), eq(units.propertyId, INITIAL_PROPERTY_ID)),
      )
      .orderBy(asc(units.id))
      .for('update');
  }

  async hasActiveReports(
    unitId: string,
    transaction: DatabaseTransaction,
  ): Promise<boolean> {
    const [report] = await transaction
      .select({ id: damageReports.id })
      .from(damageReports)
      .where(
        and(
          eq(damageReports.unitId, unitId),
          notInArray(damageReports.status, ['CLOSED', 'REJECTED']),
        ),
      )
      .limit(1);
    return Boolean(report);
  }

  async findResidentUnit(residentUserId: string, executor: Executor) {
    const [unit] = await executor
      .select()
      .from(units)
      .where(eq(units.activeResidentUserId, residentUserId));
    return unit;
  }

  async findUnitRecord(id: string, executor: Executor) {
    const [unit] = await executor
      .select()
      .from(units)
      .where(and(eq(units.id, id), eq(units.propertyId, INITIAL_PROPERTY_ID)));
    return unit;
  }

  async lockResident(id: string, transaction: DatabaseTransaction) {
    const [resident] = await transaction
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, id))
      .for('update');
    return resident;
  }

  async setResident(
    unitId: string,
    residentUserId: string | null,
    transaction: DatabaseTransaction,
  ) {
    await transaction
      .update(units)
      .set({ activeResidentUserId: residentUserId })
      .where(
        and(eq(units.id, unitId), eq(units.propertyId, INITIAL_PROPERTY_ID)),
      );
  }
}
