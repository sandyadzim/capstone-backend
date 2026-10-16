import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBody,
} from '@nestjs/swagger';
import type { AuthenticatedActor } from './authentication.types.js';
import { Roles } from './roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import { AccountListResponseDto, AccountResponseDto } from './account.dto.js';
import {
  accountCreateSchema,
  accountIdSchema,
  accountListSchema,
  accountPatchSchema,
} from './account.schemas.js';
import type {
  AccountCreateInput,
  AccountIdInput,
  AccountListInput,
  AccountPatchInput,
} from './account.schemas.js';
import { AccountsService } from './accounts.service.js';
import { USER_ROLES } from '../database/schema.js';

const accountProperties = {
  name: { type: 'string', minLength: 1, maxLength: 160 },
  loginIdentifier: { type: 'string', minLength: 1, maxLength: 254 },
  password: {
    type: 'string',
    minLength: 4,
    maxLength: 30,
    writeOnly: true,
  },
  role: { type: 'string', enum: [...USER_ROLES] },
  isActive: { type: 'boolean' },
  unitId: {
    oneOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }],
  },
};

@Controller('accounts')
@Roles('ADMIN')
@ApiTags('Accounts')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiNotFoundResponse({ type: ApiErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List accounts newest first with name/login search, role and active-status filters',
  })
  @ApiOkResponse({ type: AccountListResponseDto })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Case-insensitive literal substring of name or login identifier; trimmed, blank means no search',
    schema: { type: 'string', maxLength: 254 },
  })
  @ApiQuery({
    name: 'role',
    required: false,
    schema: { type: 'string', enum: ['ADMIN', 'TECHNICIAN', 'RESIDENT'] },
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    schema: { type: 'string', enum: ['true', 'false'] },
  })
  @ApiQuery({
    name: 'unassignedOnly',
    required: false,
    description:
      'Only Resident accounts with no unit assignment, applied before pagination',
    schema: { type: 'string', enum: ['true', 'false'] },
  })
  list(
    @Query({ schema: accountListSchema }) input: AccountListInput,
  ): ReturnType<AccountsService['list']> {
    return this.accounts.list(input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read an account, including inactive accounts' })
  @ApiOkResponse({ type: AccountResponseDto })
  get(
    @Param({ schema: accountIdSchema }) params: AccountIdInput,
  ): Promise<AccountResponseDto> {
    return this.accounts.get(params.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an account and optionally place a Resident',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'loginIdentifier', 'password', 'role'],
      properties: {
        ...accountProperties,
        isActive: { type: 'boolean', default: true },
      },
    },
  })
  @ApiCreatedResponse({ type: AccountResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  create(
    @Body({ schema: accountCreateSchema }) input: AccountCreateInput,
  ): Promise<AccountResponseDto> {
    return this.accounts.create(input);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an account and optionally place or release a Resident',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: accountProperties,
    },
  })
  @ApiOkResponse({ type: AccountResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() actor: AuthenticatedActor | null,
    @Param({ schema: accountIdSchema }) params: AccountIdInput,
    @Body({ schema: accountPatchSchema }) input: AccountPatchInput,
  ): Promise<AccountResponseDto> {
    return this.accounts.update(actor!.id, params.id, input);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Deactivate an account while preserving history; idempotent',
  })
  @ApiOkResponse({ type: AccountResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  deactivate(
    @CurrentUser() actor: AuthenticatedActor | null,
    @Param({ schema: accountIdSchema }) params: AccountIdInput,
  ): Promise<AccountResponseDto> {
    return this.accounts.deactivate(actor!.id, params.id);
  }
}
