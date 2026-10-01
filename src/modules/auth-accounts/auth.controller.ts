import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  StandardSchemaValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser, Public, SignInService } from '@nestjs/authentication';
import { z } from 'zod';
import type { AuthenticatedActor } from './authentication.types.js';
import { PasswordCredentialsService } from './password-credentials.service.js';

const loginSchema = z
  .object({
    loginIdentifier: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(1024),
  })
  .strict();

type LoginInput = z.infer<typeof loginSchema>;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly credentials: PasswordCredentialsService,
    private readonly signIn: SignInService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body({
      schema: loginSchema,
      pipes: [new StandardSchemaValidationPipe()],
    })
    input: LoginInput,
  ): Promise<AuthenticatedActor> {
    const actor = await this.credentials.authenticate(
      input.loginIdentifier,
      input.password,
    );
    if (!actor) {
      throw new UnauthorizedException('Invalid login identifier or password');
    }

    await this.signIn.signIn(actor.id, { method: 'password' });
    return actor;
  }

  @Get('me')
  getCurrentActor(
    @CurrentUser() actor: AuthenticatedActor | null,
  ): AuthenticatedActor {
    if (!actor) {
      throw new UnauthorizedException();
    }
    return actor;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(): Promise<void> {
    await this.signIn.signOut();
  }
}
