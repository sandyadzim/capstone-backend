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

@Global()
@Module({
  imports: [
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
  controllers: [AuthController],
  providers: [
    DrizzleSessionStore,
    AccountSessionProvider,
    PasswordCredentialsService,
    RolesGuard,
    PersistentSessionStoreCheck,
  ],
  exports: [RolesGuard],
})
export class AuthAccountsModule {}
