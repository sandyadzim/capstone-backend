import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorException } from '../../common/http/api-error.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { DatabaseService } from '../database/database.service.js';
import { ReportsRepository } from './reports.repository.js';
import type {
  ReportCreateInput,
  ReportListInput,
  ReportRejectInput,
  ReportVerifyInput,
} from './report.schemas.js';

function conflict(message: string): never {
  throw new ApiErrorException({ statusCode: 409, code: 'CONFLICT', message });
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: ReportsRepository,
  ) {}

  list(actor: AuthenticatedActor, input: ReportListInput) {
    return this.repository.list(actor, input);
  }

  async create(actor: AuthenticatedActor, input: ReportCreateInput) {
    if (actor.role === 'TECHNICIAN') throw new ForbiddenException();
    const result = await this.repository.create(input, actor);
    if (result.kind === 'actor-changed') throw new ForbiddenException();
    if (result.kind === 'unit-not-found') throw new NotFoundException();
    if (result.kind === 'unit-archived') {
      conflict('Archived units cannot receive reports');
    }
    return result.report;
  }

  async verify(
    actor: AuthenticatedActor,
    id: string,
    input: ReportVerifyInput,
  ) {
    return this.review(actor, id, { kind: 'verify', input });
  }

  async reject(
    actor: AuthenticatedActor,
    id: string,
    input: ReportRejectInput,
  ) {
    return this.review(actor, id, { kind: 'reject', input });
  }

  private async review(
    actor: AuthenticatedActor,
    id: string,
    decision:
      | { kind: 'verify'; input: ReportVerifyInput }
      | { kind: 'reject'; input: ReportRejectInput },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    const result = await this.repository.review(id, actor, decision);
    if (result.kind === 'actor-changed') throw new ForbiddenException();
    if (result.kind === 'report-not-found') throw new NotFoundException();
    if (result.kind === 'status-conflict') {
      conflict(
        `Report status is ${result.status}; only REPORTED reports can be reviewed`,
      );
    }
    return result.report;
  }

  async get(actor: AuthenticatedActor, id: string) {
    return this.database.db.transaction(
      async (transaction) => {
        const report = await this.repository.findAccessible(
          id,
          actor,
          transaction,
        );
        if (!report) throw new NotFoundException();
        return report;
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async assertCanAccessReport(id: string, actor: AuthenticatedActor) {
    if (!(await this.repository.findAccessible(id, actor))) {
      throw new NotFoundException();
    }
  }
}
