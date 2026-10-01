import type { UserRole } from '../database/schema.js';

export interface AuthenticatedActor {
  id: string;
  name: string;
  loginIdentifier: string;
  role: UserRole;
}

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AuthenticatedActor;
  }
}
