import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser, Public, SignInService } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { USER_ROLES } from '../database/schema.js';
import type { AuthenticatedActor } from './authentication.types.js';
import { PasswordCredentialsService } from './password-credentials.service.js';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';

const loginSchema = z
  .object({
    loginIdentifier: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(1024),
  })
  .strict();

type LoginInput = z.infer<typeof loginSchema>;

export class AuthenticatedActorResponseDto implements AuthenticatedActor {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ maxLength: 254 })
  loginIdentifier!: string;

  @ApiProperty({ enum: USER_ROLES })
  role!: AuthenticatedActor['role'];
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly credentials: PasswordCredentialsService,
    private readonly signIn: SignInService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with a login identifier and password' })
  @ApiOkResponse({
    type: AuthenticatedActorResponseDto,
    headers: {
      'Set-Cookie': {
        description: 'HttpOnly session cookie named __Host-sid',
        schema: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async login(
    @Body({ schema: loginSchema })
    input: LoginInput,
  ): Promise<AuthenticatedActorResponseDto> {
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
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get the authenticated account' })
  @ApiOkResponse({ type: AuthenticatedActorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getCurrentActor(
    @CurrentUser() actor: AuthenticatedActor | null,
  ): AuthenticatedActorResponseDto {
    if (!actor) {
      throw new UnauthorizedException();
    }
    return actor;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out and revoke the current session' })
  @ApiNoContentResponse({
    headers: {
      'Set-Cookie': {
        description: 'Expires the __Host-sid session cookie',
        schema: { type: 'string' },
      },
    },
  })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async logout(): Promise<void> {
    await this.signIn.signOut();
  }
}
