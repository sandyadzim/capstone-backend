import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuthenticationStorage } from '@nestjs/authentication';
import { DrizzleSessionStore } from './drizzle-session.store.js';

@Injectable()
export class PersistentSessionStoreCheck implements OnModuleInit {
  constructor(
    private readonly storage: AuthenticationStorage,
    private readonly drizzleSessions: DrizzleSessionStore,
  ) {}

  onModuleInit(): void {
    if (this.storage.sessions !== this.drizzleSessions) {
      throw new Error(
        'A PostgreSQL-backed SessionStore must be registered before the API starts',
      );
    }
  }
}
