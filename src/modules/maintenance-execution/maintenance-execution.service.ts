import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorException } from '../../common/http/api-error.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { DatabaseService } from '../database/database.service.js';
import { ReportsService } from '../reports-assignment/reports.service.js';
import type {
  CostItemsInput,
  MaintenanceResultInput,
  StartWorkInput,
} from './maintenance-execution.schemas.js';
import { MaintenanceExecutionRepository } from './maintenance-execution.repository.js';

function conflict(message: string): never {
  throw new ApiErrorException({ statusCode: 409, code: 'CONFLICT', message });
}

@Injectable()
export class MaintenanceExecutionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: MaintenanceExecutionRepository,
    private readonly reports: ReportsService,
  ) {}

  async start(
    actor: AuthenticatedActor,
    reportId: string,
    input: StartWorkInput,
  ) {
    if (actor.role !== 'TECHNICIAN') throw new ForbiddenException();

    return this.database.transaction(async (transaction) => {
      const result = await this.repository.start(
        transaction,
        actor,
        reportId,
        input.estimatedArrivalAt,
      );
      if (result.kind === 'actor-changed') throw new ForbiddenException();
      if (result.kind === 'report-not-found') throw new NotFoundException();
      if (result.kind === 'status-conflict') {
        conflict(
          `Report status is ${result.status}; only ASSIGNED reports can be started`,
        );
      }

      const report = await this.reports.get(actor, reportId, transaction);
      return report;
    });
  }

  async saveResult(
    actor: AuthenticatedActor,
    reportId: string,
    input: MaintenanceResultInput,
  ) {
    if (actor.role !== 'TECHNICIAN') throw new ForbiddenException();
    return this.mutate(actor, reportId, (transaction) =>
      this.repository.saveResult(transaction, actor, reportId, input),
    );
  }

  async saveCostItems(
    actor: AuthenticatedActor,
    reportId: string,
    input: CostItemsInput,
  ) {
    if (actor.role !== 'TECHNICIAN') throw new ForbiddenException();
    return this.mutate(actor, reportId, (transaction) =>
      this.repository.saveCostItems(transaction, actor, reportId, input.items),
    );
  }

  async complete(actor: AuthenticatedActor, reportId: string) {
    if (actor.role !== 'TECHNICIAN') throw new ForbiddenException();
    return this.mutate(actor, reportId, (transaction) =>
      this.repository.complete(transaction, actor, reportId),
    );
  }

  private async mutate<T extends { kind: string }>(
    actor: AuthenticatedActor,
    reportId: string,
    operation: (transaction: import('../database/database.service.js').DatabaseTransaction) => Promise<T>,
  ) {
    return this.database.transaction(async (transaction) => {
      const result = await operation(transaction);
      if (result.kind === 'actor-changed') throw new ForbiddenException();
      if (result.kind === 'report-not-found') throw new NotFoundException();
      if (result.kind === 'status-conflict') {
        conflict(`Report status is not IN_PROGRESS`);
      }
      if (result.kind === 'result-missing')
        conflict('Maintenance result is required before completion');
      if (result.kind === 'receipt-missing')
        conflict('A receipt attachment is required before completion');
      return this.reports.get(actor, reportId, transaction);
    });
  }
}
