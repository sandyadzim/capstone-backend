import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../database/schema.js';
import type { AuthenticatedActor } from './authentication.types.js';
import { REQUIRED_ROLES_METADATA } from './roles.constants.js';

interface AuthenticatedRequest {
  user?: AuthenticatedActor;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      REQUIRED_ROLES_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) {
      return true;
    }

    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().user;
    if (!actor) {
      throw new UnauthorizedException();
    }
    if (!requiredRoles.includes(actor.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
