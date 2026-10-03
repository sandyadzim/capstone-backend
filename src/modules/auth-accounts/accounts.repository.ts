import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, or } from 'drizzle-orm';
import { ApiErrorException } from '../../common/http/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import type {
  Database,
  DatabaseTransaction,
} from '../database/database.service.js';
import {
  damageReports,
  assignments,
  units,
  users,
} from '../database/schema.js';
import type { AccountListInput } from './account.schemas.js';

type Executor = Database | DatabaseTransaction;
export type AccountRecord = typeof users.$inferSelect;

export const accountProjection = {
  id: users.id,
  name: users.name,
  loginIdentifier: users.loginIdentifier,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  activeUnit: {
    id: units.id,
    unitNumber: units.unitNumber,
    floor: units.floor,
  },
};

export type AccountResponse = Pick<
  AccountRecord,
  | 'id'
  | 'name'
  | 'loginIdentifier'
  | 'role'
  | 'isActive'
  | 'createdAt'
  | 'updatedAt'
> & {
  activeUnit: { id: string; unitNumber: string; floor: number } | null;
};

function conflict(message: string): never {
  throw new ApiErrorException({ statusCode: 409, code: 'CONFLICT', message });
}

@Injectable()
export class AccountsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: AccountListInput) {
    return this.database.db.transaction(
      async (transaction) => {
        const filters = [
          ...(input.role ? [eq(users.role, input.role)] : []),
          ...(input.isActive === undefined
            ? []
            : [eq(users.isActive, input.isActive)]),
        ];
        const predicate = filters.length ? and(...filters) : undefined;
        const [totals] = await transaction
          .select({ total: count() })
          .from(users)
          .where(predicate);
        const rows = await transaction
          .select(accountProjection)
          .from(users)
          .leftJoin(
            units,
            and(
              eq(units.activeResidentUserId, users.id),
              eq(users.role, 'RESIDENT'),
              eq(users.isActive, true),
            ),
          )
          .where(predicate)
          .orderBy(asc(users.name), asc(users.id))
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

  async find(id: string, executor: Executor = this.database.db) {
    const [account] = await executor
      .select(accountProjection)
      .from(users)
      .leftJoin(
        units,
        and(
          eq(units.activeResidentUserId, users.id),
          eq(users.role, 'RESIDENT'),
          eq(users.isActive, true),
        ),
      )
      .where(eq(users.id, id));
    return account;
  }

  async lockAccountsForMembershipChange(
    ids: string[],
    transaction: DatabaseTransaction,
  ) {
    const sortedIds = [...new Set(ids)].sort();
    return transaction
      .select()
      .from(users)
      .where(or(eq(users.role, 'ADMIN'), inArray(users.id, sortedIds)))
      .orderBy(asc(users.id))
      .for('update');
  }

  async lockAccounts(ids: string[], transaction: DatabaseTransaction) {
    return transaction
      .select()
      .from(users)
      .where(inArray(users.id, [...new Set(ids)]))
      .orderBy(asc(users.id))
      .for('update');
  }

  async create(
    input: {
      name: string;
      loginIdentifier: string;
      passwordHash: string;
      role: AccountRecord['role'];
      isActive: boolean;
    },
    transaction: DatabaseTransaction,
  ) {
    try {
      const [account] = await transaction
        .insert(users)
        .values(input)
        .returning({ id: users.id });
      return account.id;
    } catch (error) {
      this.rethrowUniqueLogin(error);
    }
  }

  async update(
    id: string,
    input: Partial<{
      name: string;
      loginIdentifier: string;
      passwordHash: string;
      role: AccountRecord['role'];
      isActive: boolean;
    }>,
    transaction: DatabaseTransaction,
  ) {
    try {
      await transaction.update(users).set(input).where(eq(users.id, id));
    } catch (error) {
      this.rethrowUniqueLogin(error);
    }
  }

  async countActiveAdmins(executor: Executor) {
    const [result] = await executor
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));
    return result.total;
  }

  async hasPendingTechnicianWork(id: string, executor: Executor) {
    const [row] = await executor
      .select({ id: assignments.id })
      .from(assignments)
      .innerJoin(damageReports, eq(damageReports.id, assignments.reportId))
      .where(
        and(
          eq(assignments.technicianUserId, id),
          inArray(damageReports.status, ['ASSIGNED', 'IN_PROGRESS']),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private rethrowUniqueLogin(error: unknown): never {
    let current = error;
    const visited = new Set<unknown>();
    while (current && typeof current === 'object' && !visited.has(current)) {
      visited.add(current);
      if ('code' in current && current.code === '23505') {
        const constraint =
          'constraint_name' in current
            ? current.constraint_name
            : 'constraint' in current
              ? current.constraint
              : undefined;
        if (constraint === 'uk_users_login_lower') {
          conflict('Login identifier is already in use');
        }
      }
      current = 'cause' in current ? current.cause : undefined;
    }
    throw error;
  }
}
