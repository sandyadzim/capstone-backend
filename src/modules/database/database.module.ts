import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { schema } from './schema.js';
import { DatabaseService } from './database.service.js';
import { UsersRepository } from './users.repository.js';

export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Sql => {
        const databaseUrl = config.get<string>('DATABASE_URL')?.trim();
        if (!databaseUrl) {
          throw new Error('DATABASE_URL must be set to connect to PostgreSQL');
        }
        return postgres(databaseUrl, {
          max: 10,
          connect_timeout: 10,
          idle_timeout: 20,
          prepare: false,
        });
      },
    },
    {
      provide: DatabaseService,
      inject: [DATABASE_CLIENT],
      useFactory: (client: Sql): DatabaseService =>
        new DatabaseService(client, drizzle(client, { schema })),
    },
    UsersRepository,
  ],
  exports: [DatabaseService, UsersRepository],
})
export class DatabaseModule {}
