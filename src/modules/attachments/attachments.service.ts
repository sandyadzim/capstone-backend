import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiErrorException } from '../../common/http/api-error.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { PropertyService } from '../property/property.service.js';
import { AttachmentsRepository } from './attachments.repository.js';
import type { UploadPurpose } from './attachments.repository.js';
import { UploadThingStorageService } from './uploadthing-storage.service.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly repository: AttachmentsRepository,
    private readonly storage: UploadThingStorageService,
    private readonly property: PropertyService,
  ) {}

  async uploadReportFile(
    actor: AuthenticatedActor,
    reportId: string,
    purpose: UploadPurpose,
    file?: Express.Multer.File,
  ) {
    this.validateFile(file, purpose === 'RECEIPT');
    const access = await this.repository.checkAccess(actor, reportId, purpose);
    this.assertAccess(access);

    const contentType = this.detectType(file!.buffer);
    if (contentType === 'application/pdf' && purpose !== 'RECEIPT') {
      throw new ApiErrorException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'This upload only accepts images',
      });
    }
    const ext =
      contentType === 'application/pdf' ? 'pdf' : IMAGE_TYPES.get(contentType)!;
    const stored = await this.upload(
      file!.buffer,
      `${randomUUID()}.${ext}`,
      contentType,
    );

    let result;
    try {
      result = await this.repository.addReportAttachment(
        actor,
        reportId,
        purpose,
        stored.fileUrl,
      );
    } catch (error) {
      await this.cleanupNewUpload(stored.fileKey);
      throw error;
    }
    if (result.kind !== 'saved') {
      await this.cleanupNewUpload(stored.fileKey);
      this.assertAccess(result);
      throw new ApiErrorException({
        statusCode: 409,
        code: 'CONFLICT',
        message:
          'The report already has the maximum number of attachments for this purpose',
      });
    }
    if (result.previousUrl) await this.cleanupOldUpload(result.previousUrl);
    return result.attachment;
  }

  async uploadLogo(actor: AuthenticatedActor, file?: Express.Multer.File) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    this.validateFile(file, false);
    const contentType = this.detectType(file!.buffer);
    const ext = IMAGE_TYPES.get(contentType);
    if (!ext)
      throw new ApiErrorException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Logo must be a JPEG, PNG, or WebP image',
      });
    const stored = await this.upload(
      file!.buffer,
      `${randomUUID()}.${ext}`,
      contentType,
    );

    let result;
    try {
      result = await this.property.updateLogoFromVerifiedUpload(
        actor.id,
        stored.fileUrl,
      );
    } catch (error) {
      await this.cleanupNewUpload(stored.fileKey);
      throw error;
    }
    if (result.previousUrl) await this.cleanupOldUpload(result.previousUrl);
    return result.property;
  }

  private validateFile(
    file: Express.Multer.File | undefined,
    allowPdf: boolean,
  ): asserts file is Express.Multer.File {
    if (!file?.buffer?.length) {
      throw new ApiErrorException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Exactly one file is required in the file field',
      });
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiErrorException({
        statusCode: 413,
        code: 'HTTP_ERROR',
        message: 'File exceeds the 5 MiB upload limit',
      });
    }
    const contentType = this.detectType(file.buffer);
    if (
      !IMAGE_TYPES.has(contentType) &&
      !(allowPdf && contentType === 'application/pdf')
    ) {
      throw new ApiErrorException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Unsupported file content',
      });
    }
  }

  private detectType(buffer: Buffer): string {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    )
      return 'image/jpeg';
    if (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return 'image/png';
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
      return 'image/webp';
    if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-')
      return 'application/pdf';
    return 'application/octet-stream';
  }

  private async upload(buffer: Buffer, name: string, contentType: string) {
    try {
      return await this.storage.upload(buffer, name, contentType);
    } catch (error) {
      this.logger.error(
        'UploadThing upload failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ApiErrorException({
        statusCode: 502,
        code: 'INTERNAL_ERROR',
        message: 'File storage is temporarily unavailable',
      });
    }
  }

  private async cleanupNewUpload(fileKey: string) {
    try {
      await this.storage.delete(fileKey);
    } catch (error) {
      this.logger.error(
        `Could not clean up uploaded file ${fileKey}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async cleanupOldUpload(fileUrl: string) {
    try {
      await this.storage.deleteByUrl(fileUrl);
    } catch (error) {
      this.logger.warn(
        `Could not delete replaced file URL ${fileUrl}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private assertAccess(result: { kind: string }): void {
    switch (result.kind) {
      case 'allowed':
        return;
      case 'actor-changed':
        throw new ForbiddenException();
      case 'forbidden':
        throw new ForbiddenException();
      case 'report-not-found':
        throw new NotFoundException();
      case 'status-conflict':
        throw new ApiErrorException({
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Report status does not allow this attachment',
        });
      default:
        return;
    }
  }
}
