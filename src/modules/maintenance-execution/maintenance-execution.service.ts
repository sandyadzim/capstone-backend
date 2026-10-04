import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorException } from '../../common/http/api-error.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { DatabaseService } from '../database/database.service.js';
import { ReportsService } from '../reports-assignment/reports.service.js';
import type { StartWorkInput } from './maintenance-execution.schemas.js';
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
}
