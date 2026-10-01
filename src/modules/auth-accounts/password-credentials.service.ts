import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { AuthenticatedActor } from './authentication.types.js';
import { UsersRepository } from '../database/users.repository.js';

const ARGON2ID_HASH_PREFIX = '$argon2id$';

@Injectable()
export class PasswordCredentialsService implements OnModuleInit {
  private dummyPasswordHash: string | undefined;

  constructor(private readonly users: UsersRepository) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash(
      randomBytes(32).toString('base64url'),
      {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
      },
    );
  }

  async authenticate(
    loginIdentifier: string,
    password: string,
  ): Promise<AuthenticatedActor | undefined> {
    const user =
      await this.users.findCredentialsByLoginIdentifier(loginIdentifier);
    const passwordHash =
      user?.isActive && user.passwordHash.startsWith(ARGON2ID_HASH_PREFIX)
        ? user.passwordHash
        : this.getDummyPasswordHash();

    let validPassword = false;
    try {
      validPassword = await argon2.verify(passwordHash, password);
    } catch {
      // Invalid or outdated stored hashes must fail as ordinary credentials.
    }

    if (!user?.isActive || !validPassword) {
      return undefined;
    }

    return {
      id: user.id,
      name: user.name,
      loginIdentifier: user.loginIdentifier,
      role: user.role,
    };
  }

  private getDummyPasswordHash(): string {
    if (!this.dummyPasswordHash) {
      throw new Error('Password credential verifier has not initialized');
    }
    return this.dummyPasswordHash;
  }
}
