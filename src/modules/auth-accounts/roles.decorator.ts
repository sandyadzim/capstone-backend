import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { UserRole } from '../database/schema.js';
import { RolesGuard } from './roles.guard.js';
import { REQUIRED_ROLES_METADATA } from './roles.constants.js';

export const Roles = (...roles: UserRole[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_ROLES_METADATA, roles),
    UseGuards(RolesGuard),
  );
