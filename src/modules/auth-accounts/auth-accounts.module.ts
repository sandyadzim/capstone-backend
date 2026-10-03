import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { getApiEnvironment } from '../../config/environment.js';
import { AuthController } from './auth.controller.js';
import { DrizzleSessionStore } from './drizzle-session.store.js';
import { PasswordCredentialsService } from './password-credentials.service.js';
import { AccountSessionProvider } from './session-cookie.provider.js';
import { RolesGuard } from './roles.guard.js';
import { PersistentSessionStoreCheck } from './persistent-session-store.check.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsRepository } from './accounts.repository.js';
import { AccountsService } from './accounts.service.js';
import { UnitsModule } from '../units/units.module.js';

@Global()
@Module({
  imports: [
    UnitsModule,
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // SessionCookieProvider also requires MFA and refresh-token stores.
        // This API has no MFA or refresh-token routes; the startup check below
        // prevents its required session store from falling back to memory.
        allowInMemoryStorage: true,
        session: {
          absoluteTtl: '7d',
          idleTtl: '1d',
          cookie: { secure: true, sameSite: 'lax' },
          trustedOrigins: getApiEnvironment(config).CORS_ORIGINS,
        },
      }),
    }),
  ],
  controllers: [AuthController, AccountsController],
  providers: [
    DrizzleSessionStore,
    AccountSessionProvider,
    PasswordCredentialsService,
    RolesGuard,
    PersistentSessionStoreCheck,
    AccountsRepository,
    AccountsService,
  ],
  exports: [RolesGuard],
})
export class AuthAccountsModule {}
