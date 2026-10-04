import {
  Controller,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { Roles } from '../auth-accounts/roles.decorator.js';
import { PropertyResponseDto } from '../property/property.dto.js';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import { AttachmentResponseDto } from './attachment.dto.js';
import { attachmentReportIdSchema } from './attachment.schemas.js';
import type { AttachmentReportId } from './attachment.schemas.js';
import { AttachmentsService } from './attachments.service.js';

const fileUpload = () =>
  FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });

@Controller()
@ApiTags('Attachments')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('reports/:id/damage-photos')
  @Roles('ADMIN', 'RESIDENT')
  @UseInterceptors(fileUpload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
      additionalProperties: false,
    },
  })
  @ApiOperation({ summary: 'Upload a damage photo' })
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  uploadDamagePhoto(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: attachmentReportIdSchema }) params: AttachmentReportId,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.attachments.uploadReportFile(
      actor,
      params.id,
      'DAMAGE_PHOTO',
      file,
    );
  }

  @Post('reports/:id/repair-photos')
  @Roles('TECHNICIAN')
  @UseInterceptors(fileUpload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
      additionalProperties: false,
    },
  })
  @ApiOperation({ summary: 'Upload a repair photo' })
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  uploadRepairPhoto(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: attachmentReportIdSchema }) params: AttachmentReportId,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.attachments.uploadReportFile(
      actor,
      params.id,
      'REPAIR_PHOTO',
      file,
    );
  }

  @Put('reports/:id/receipt')
  @Roles('TECHNICIAN')
  @HttpCode(200)
  @UseInterceptors(fileUpload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
      additionalProperties: false,
    },
  })
  @ApiOperation({ summary: 'Upload or replace a report receipt' })
  @ApiOkResponse({ type: AttachmentResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  uploadReceipt(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: attachmentReportIdSchema }) params: AttachmentReportId,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.attachments.uploadReportFile(actor, params.id, 'RECEIPT', file);
  }

  @Put('property/logo')
  @Roles('ADMIN')
  @HttpCode(200)
  @UseInterceptors(fileUpload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
      additionalProperties: false,
    },
  })
  @ApiOperation({ summary: 'Upload or replace the property logo (Admin)' })
  @ApiOkResponse({ type: PropertyResponseDto })
  uploadLogo(
    @CurrentUser() actor: AuthenticatedActor,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.attachments.uploadLogo(actor, file);
  }
}
