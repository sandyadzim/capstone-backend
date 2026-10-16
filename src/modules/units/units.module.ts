import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module.js';
import { ResidentPlacementService } from './resident-placement.service.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';
import { UnitsRepository } from './units.repository.js';
import { ResidentUnitController } from './resident-unit.controller.js';

@Module({
  imports: [PropertyModule],
  controllers: [UnitsController, ResidentUnitController],
  providers: [UnitsService, ResidentPlacementService, UnitsRepository],
  exports: [ResidentPlacementService],
})
export class UnitsModule {}
