import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Sql } from 'postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { schema } from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly client: Sql,
    readonly db: Database,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.client`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }

  transaction<T>(work: (transaction: DatabaseTransaction) => Promise<T>) {
    return this.db.transaction(work);
  }
}
