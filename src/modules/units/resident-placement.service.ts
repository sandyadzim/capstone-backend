import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { DatabaseTransaction } from '../database/database.service.js';
import { INITIAL_PROPERTY_ID } from '../property/property.constants.js';
import { UnitsRepository } from './units.repository.js';
import { unitsConflict, rethrowUnitsError } from './units.errors.js';
import type { UnitResponseDto } from './unit.dto.js';

@Injectable()
export class ResidentPlacementService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: UnitsRepository,
  ) {}

  // A caller-owned transaction allows BE-05 to compose account changes and
  // placement atomically. Callers must lock accounts before units.
  async place(
    unitId: string,
    residentUserId: string,
    transaction?: DatabaseTransaction,
  ): Promise<UnitResponseDto> {
    const work = async (tx: DatabaseTransaction) => {
      const resident = await this.repository.lockResident(residentUserId, tx);
      if (!resident) {
        throw new NotFoundException();
      }
      if (!resident.isActive || resident.role !== 'RESIDENT') {
        unitsConflict(
          'Only an active RESIDENT account can be placed in a unit',
        );
      }
      const previous = await this.repository.findResidentUnit(
        residentUserId,
        tx,
      );
      if (previous && previous.propertyId !== INITIAL_PROPERTY_ID) {
        unitsConflict('Resident is assigned outside the configured property');
      }
      const locked = await this.repository.lockUnits(
        previous ? [previous.id, unitId] : [unitId],
        tx,
      );
      const target = locked.find((unit) => unit.id === unitId);
      if (!target) {
        throw new NotFoundException();
      }
      if (target.isArchived) {
        unitsConflict('Archived units cannot receive a resident');
      }
      if (
        target.activeResidentUserId &&
        target.activeResidentUserId !== residentUserId
      ) {
        unitsConflict('Destination unit is already occupied');
      }
      if (
        previous &&
        !locked.some(
          (unit) =>
            unit.id === previous.id &&
            unit.activeResidentUserId === residentUserId,
        )
      ) {
        unitsConflict('Resident placement changed; reload and try again');
      }
      if (target.activeResidentUserId !== residentUserId) {
        if (previous) {
          await this.repository.setResident(previous.id, null, tx);
        }
        await this.repository.setResident(unitId, residentUserId, tx);
      }
      return (await this.repository.findUnit(unitId, tx))!;
    };
    try {
      return await (transaction
        ? work(transaction)
        : this.database.transaction(work));
    } catch (error) {
      rethrowUnitsError(error);
    }
  }

  async release(
    unitId: string,
    transaction?: DatabaseTransaction,
  ): Promise<UnitResponseDto> {
    const work = async (tx: DatabaseTransaction) => {
      const observed = await this.repository.findUnitRecord(unitId, tx);
      if (!observed) {
        throw new NotFoundException();
      }
      if (observed.activeResidentUserId) {
        await this.repository.lockResident(observed.activeResidentUserId, tx);
      }
      const [unit] = await this.repository.lockUnits([unitId], tx);
      if (!unit) {
        throw new NotFoundException();
      }
      if (unit.activeResidentUserId !== observed.activeResidentUserId) {
        unitsConflict('Resident placement changed; reload and try again');
      }
      if (unit.activeResidentUserId) {
        await this.repository.setResident(unitId, null, tx);
      }
      return (await this.repository.findUnit(unitId, tx))!;
    };
    return transaction ? work(transaction) : this.database.transaction(work);
  }

  // BE-05 uses this within its account transaction when changing role/activity.
  async releaseForResident(
    residentUserId: string,
    transaction: DatabaseTransaction,
  ): Promise<void> {
    if (!(await this.repository.lockResident(residentUserId, transaction))) {
      throw new NotFoundException();
    }
    const previous = await this.repository.findResidentUnit(
      residentUserId,
      transaction,
    );
    if (!previous) {
      return;
    }
    if (previous.propertyId !== INITIAL_PROPERTY_ID) {
      unitsConflict('Resident is assigned outside the configured property');
    }
    const [unit] = await this.repository.lockUnits([previous.id], transaction);
    if (unit.activeResidentUserId !== residentUserId) {
      unitsConflict('Resident placement changed; reload and try again');
    }
    await this.repository.setResident(unit.id, null, transaction);
  }
}
