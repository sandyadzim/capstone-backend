import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  SessionCookieProvider,
  type SessionRecord,
} from '@nestjs/authentication';
import type { AuthenticatedActor } from './authentication.types.js';
import { UsersRepository } from '../database/users.repository.js';

@Injectable()
export class AccountSessionProvider extends SessionCookieProvider<AuthenticatedActor> {
  constructor(
    private readonly users: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this);
  }

  protected validate(
    session: SessionRecord,
  ): Promise<AuthenticatedActor | undefined> {
    return this.users.findActiveActorById(session.userId);
  }
}
