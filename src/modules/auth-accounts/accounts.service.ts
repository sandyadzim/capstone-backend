import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorException } from '../../common/http/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import { normalizeLoginIdentifier } from '../database/users.repository.js';
import type { AccountRecord } from './accounts.repository.js';
import { AccountsRepository } from './accounts.repository.js';
import { DrizzleSessionStore } from './drizzle-session.store.js';
import { PasswordCredentialsService } from './password-credentials.service.js';
import { ResidentPlacementService } from '../units/resident-placement.service.js';
import type {
  AccountCreateInput,
  AccountListInput,
  AccountPatchInput,
} from './account.schemas.js';
import type { AccountResponseDto } from './account.dto.js';

function conflict(message: string): never {
  throw new ApiErrorException({ statusCode: 409, code: 'CONFLICT', message });
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsRepository,
    private readonly credentials: PasswordCredentialsService,
    private readonly sessions: DrizzleSessionStore,
    private readonly placement: ResidentPlacementService,
  ) {}

  list(input: AccountListInput) {
    return this.accounts.list(input);
  }

  async get(id: string): Promise<AccountResponseDto> {
    const account = await this.accounts.find(id);
    if (!account) throw new NotFoundException();
    return account;
  }

  async create(input: AccountCreateInput): Promise<AccountResponseDto> {
    const passwordHash = await this.credentials.hash(input.password);
    const id = await this.database.transaction(async (transaction) => {
      if (typeof input.unitId === 'string') {
        this.assertCanHavePlacement(input.role, input.isActive);
      }
      const accountId = await this.accounts.create(
        {
          name: input.name,
          loginIdentifier: normalizeLoginIdentifier(input.loginIdentifier),
          passwordHash,
          role: input.role,
          isActive: input.isActive,
        },
        transaction,
      );
      if (typeof input.unitId === 'string') {
        await this.placement.place(input.unitId, accountId, transaction);
      }
      return accountId;
    });
    return this.get(id);
  }

  async update(
    actorId: string,
    id: string,
    input: AccountPatchInput,
  ): Promise<AccountResponseDto> {
    const passwordHash = input.password
      ? await this.credentials.hash(input.password)
      : undefined;
    await this.database.transaction(async (transaction) => {
      const membershipFieldsChanged =
        input.role !== undefined || input.isActive !== undefined;
      const locked = membershipFieldsChanged
        ? await this.accounts.lockAccountsForMembershipChange(
            [actorId, id],
            transaction,
          )
        : await this.accounts.lockAccounts([id], transaction);
      const actor = membershipFieldsChanged
        ? locked.find((account) => account.id === actorId)
        : undefined;
      if (
        membershipFieldsChanged &&
        (!actor?.isActive || actor.role !== 'ADMIN')
      ) {
        throw new ForbiddenException();
      }
      const current = locked.find((account) => account.id === id);
      if (!current) throw new NotFoundException();

      const role = input.role ?? current.role;
      const isActive = input.isActive ?? current.isActive;
      const changingAdminMembership =
        current.role === 'ADMIN' &&
        current.isActive &&
        (role !== 'ADMIN' || !isActive);
      if (changingAdminMembership) {
        if (actorId === id) {
          throw new ForbiddenException('Admins cannot remove their own access');
        }
      }
      if (actorId === id && (role !== 'ADMIN' || !isActive)) {
        throw new ForbiddenException('Admins cannot remove their own access');
      }
      if (typeof input.unitId === 'string') {
        this.assertCanHavePlacement(role, isActive);
      }

      const leavingActiveTechnician =
        current.role === 'TECHNICIAN' &&
        current.isActive &&
        (role !== 'TECHNICIAN' || !isActive);
      if (
        leavingActiveTechnician &&
        (await this.accounts.hasPendingTechnicianWork(id, transaction))
      ) {
        conflict(
          'Resolve assigned work before changing this active Technician account',
        );
      }

      const accountChanges = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.loginIdentifier !== undefined && {
          loginIdentifier: normalizeLoginIdentifier(input.loginIdentifier),
        }),
        ...(passwordHash !== undefined && { passwordHash }),
        ...(input.role !== undefined && { role }),
        ...(input.isActive !== undefined && { isActive }),
      };
      if (Object.keys(accountChanges).length > 0) {
        await this.accounts.update(id, accountChanges, transaction);
      }

      if (
        input.unitId === null ||
        (current.role === 'RESIDENT' &&
          current.isActive &&
          (role !== 'RESIDENT' || !isActive))
      ) {
        await this.placement.releaseForResident(id, transaction);
      } else if (typeof input.unitId === 'string') {
        await this.placement.place(input.unitId, id, transaction);
      }

      if (passwordHash !== undefined || input.isActive === false) {
        await this.sessions.deleteUserSessions(id, transaction);
      }

      if (changingAdminMembership) {
        const activeAdmins = await this.accounts.countActiveAdmins(transaction);
        if (activeAdmins < 1) {
          conflict('At least one active Admin account must remain');
        }
      }
    });
    return this.get(id);
  }

  deactivate(actorId: string, id: string): Promise<AccountResponseDto> {
    return this.update(actorId, id, { isActive: false });
  }

  private assertCanHavePlacement(
    role: AccountRecord['role'],
    isActive: boolean,
  ): void {
    if (role !== 'RESIDENT' || !isActive) {
      conflict('Only an active RESIDENT account can be placed in a unit');
    }
  }
}
