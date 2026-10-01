import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './roles.decorator.js';

class AdminOnlyController {
  @Roles('ADMIN')
  protectedAction(this: void): void {}
}

describe('RolesGuard', () => {
  const handler = AdminOnlyController.prototype.protectedAction;
  const guard = new RolesGuard(new Reflector());

  function contextFor(user?: { role: 'ADMIN' | 'TECHNICIAN' | 'RESIDENT' }) {
    return {
      getHandler: () => handler,
      getClass: () => AdminOnlyController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('allows a user whose database role meets the route requirement', () => {
    expect(guard.canActivate(contextFor({ role: 'ADMIN' }))).toBe(true);
  });

  it('automatically attaches role enforcement to decorated handlers', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(RolesGuard);
  });

  it('denies a user with a different role', () => {
    expect(() => guard.canActivate(contextFor({ role: 'RESIDENT' }))).toThrow(
      ForbiddenException,
    );
  });

  it('requires an authenticated actor before checking roles', () => {
    expect(() => guard.canActivate(contextFor())).toThrow(
      UnauthorizedException,
    );
  });
});
