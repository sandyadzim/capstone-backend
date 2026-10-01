import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { users } from './schema.js';
import { DatabaseService } from './database.service.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export interface UserCredentials extends AuthenticatedActor {
  isActive: boolean;
  passwordHash: string;
}

export function normalizeLoginIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 254) {
    throw new Error('Login identifier must contain 1 to 254 characters');
  }
  return normalized;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByLoginIdentifier(identifier: string): Promise<User | undefined> {
    const normalized = normalizeLoginIdentifier(identifier);
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(sql`lower(${users.loginIdentifier}) = ${normalized}`)
      .limit(1);
    return user;
  }

  async findCredentialsByLoginIdentifier(
    identifier: string,
  ): Promise<UserCredentials | undefined> {
    const normalized = normalizeLoginIdentifier(identifier);
    const [user] = await this.database.db
      .select({
        id: users.id,
        name: users.name,
        loginIdentifier: users.loginIdentifier,
        role: users.role,
        isActive: users.isActive,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(sql`lower(${users.loginIdentifier}) = ${normalized}`)
      .limit(1);
    return user;
  }

  async findActiveActorById(
    id: string,
  ): Promise<AuthenticatedActor | undefined> {
    const [user] = await this.database.db
      .select({
        id: users.id,
        name: users.name,
        loginIdentifier: users.loginIdentifier,
        role: users.role,
      })
      .from(users)
      .where(sql`${users.id} = ${id} AND ${users.isActive} = true`)
      .limit(1);
    return user;
  }

  async create(input: NewUser): Promise<User> {
    const [user] = await this.database.db
      .insert(users)
      .values({
        ...input,
        loginIdentifier: normalizeLoginIdentifier(input.loginIdentifier!),
      })
      .returning();
    return user;
  }

  async deactivate(id: User['id']): Promise<User | undefined> {
    const [user] = await this.database.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, id))
      .returning();
    return user;
  }
}
