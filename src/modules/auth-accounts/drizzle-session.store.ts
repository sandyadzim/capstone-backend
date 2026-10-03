import { Injectable } from '@nestjs/common';
import { and, eq, lte, lt } from 'drizzle-orm';
import { AuthenticationStorage } from '@nestjs/authentication';
import type { SessionRecord, SessionStore } from '@nestjs/authentication';
import { sessions } from '../database/schema.js';
import { DatabaseService } from '../database/database.service.js';
import type { DatabaseTransaction } from '../database/database.service.js';

@Injectable()
export class DrizzleSessionStore implements SessionStore {
  constructor(
    private readonly database: DatabaseService,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ sessions: this });
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const [session] = await this.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    return session ? this.toSessionRecord(session) : undefined;
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.database.db
      .delete(sessions)
      .where(lte(sessions.expiresAt, record.createdAt));

    await this.database.db.insert(sessions).values({
      id: record.id,
      userId: record.userId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastActiveAt: record.lastActiveAt,
      mfa: record.mfa ?? null,
      metadata: record.metadata ?? null,
    });
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    await this.database.db
      .update(sessions)
      .set({ lastActiveAt })
      .where(and(eq(sessions.id, id), lt(sessions.lastActiveAt, lastActiveAt)));
  }

  async deleteSession(id: string): Promise<boolean> {
    const deleted = await this.database.db
      .delete(sessions)
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });
    return deleted.length > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const records = await this.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
    return records.map((record) => this.toSessionRecord(record));
  }

  async deleteUserSessions(
    userId: string,
    transaction?: DatabaseTransaction,
  ): Promise<void> {
    const executor = transaction ?? this.database.db;
    await executor.delete(sessions).where(eq(sessions.userId, userId));
  }

  private toSessionRecord(record: typeof sessions.$inferSelect): SessionRecord {
    return {
      id: record.id,
      userId: record.userId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastActiveAt: record.lastActiveAt,
      ...(record.mfa !== null && { mfa: record.mfa }),
      ...(record.metadata !== null && { metadata: record.metadata }),
    };
  }
}
