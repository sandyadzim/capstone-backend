import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import type {
  HistoryListInput,
  DashboardTrendsInput,
} from './dashboard-history.schemas.js';
import { DashboardHistoryRepository } from './dashboard-history.repository.js';

@Injectable()
export class DashboardHistoryService {
  constructor(private readonly repository: DashboardHistoryRepository) {}

  listUnitHistory(
    actor: AuthenticatedActor,
    unitId: string,
    input: HistoryListInput,
  ) {
    if (actor.role !== 'ADMIN' && actor.role !== 'RESIDENT') {
      throw new ForbiddenException();
    }
    return this.repository.listUnitHistory(actor, unitId, input);
  }

  trends(actor: AuthenticatedActor, input: DashboardTrendsInput) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    return this.repository.dashboardTrends(new Date(), input.months);
  }

  summary(actor: AuthenticatedActor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    return this.repository.dashboardSummary(new Date());
  }
}
