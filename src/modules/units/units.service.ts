import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { PropertyService } from '../property/property.service.js';
import { UnitsRepository } from './units.repository.js';
import { unitsConflict, rethrowUnitsError } from './units.errors.js';
import type {
  UnitCreateInput,
  UnitListInput,
  UnitPatchInput,
} from './unit.schemas.js';
import type {
  ResidentUnitResponseDto,
  UnitListResponseDto,
  UnitResponseDto,
} from './unit.dto.js';

@Injectable()
export class UnitsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: UnitsRepository,
    private readonly property: PropertyService,
  ) {}
  async getResidentUnit(
    residentUserId: string,
  ): Promise<ResidentUnitResponseDto> {
    await this.property.get();
    return {
      unit: await this.repository.findCurrentResidentUnit(residentUserId),
    };
  }

  async list(input: UnitListInput): Promise<UnitListResponseDto> {
    await this.property.get();
    return this.repository.listUnits(input);
  }

  async get(id: string): Promise<UnitResponseDto> {
    const unit = await this.repository.findUnit(id);
    if (!unit) {
      throw new NotFoundException();
    }
    return unit;
  }

  async create(input: UnitCreateInput): Promise<UnitResponseDto> {
    await this.property.get();
    try {
      return await this.get(await this.repository.createUnit(input));
    } catch (error) {
      rethrowUnitsError(error);
    }
  }

  async update(id: string, input: UnitPatchInput): Promise<UnitResponseDto> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [unit] = await this.repository.lockUnits([id], transaction);
        if (!unit) {
          throw new NotFoundException();
        }
        if (unit.isArchived) {
          unitsConflict('Archived units cannot be edited');
        }
        await this.repository.updateUnit(id, input, transaction);
        return (await this.repository.findUnit(id, transaction))!;
      });
    } catch (error) {
      rethrowUnitsError(error);
    }
  }

  async archive(id: string): Promise<UnitResponseDto> {
    return this.database.transaction(async (transaction) => {
      // BE-07 must acquire this same unit lock before checking archive state
      // and inserting a report, so create-report and archive cannot both win.
      const [unit] = await this.repository.lockUnits([id], transaction);
      if (!unit) {
        throw new NotFoundException();
      }
      if (!unit.isArchived) {
        if (unit.activeResidentUserId) {
          unitsConflict('Release the resident before archiving the unit');
        }
        if (await this.repository.hasActiveReports(id, transaction)) {
          unitsConflict('Resolve active reports before archiving the unit');
        }
        await this.repository.updateUnit(id, { isArchived: true }, transaction);
      }
      return (await this.repository.findUnit(id, transaction))!;
    });
  }
}
