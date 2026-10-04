import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UTApi, UTFile } from 'uploadthing/server';

export interface StoredUpload {
  fileUrl: string;
  fileKey: string;
}

@Injectable()
export class UploadThingStorageService {
  private readonly logger = new Logger(UploadThingStorageService.name);
  private readonly api?: UTApi;

  constructor(config: ConfigService) {
    const token = config.get<string>('UPLOADTHING_TOKEN');
    if (token) this.api = new UTApi({ token, logLevel: 'Error' });
  }

  async upload(
    buffer: Buffer,
    name: string,
    mimeType: string,
  ): Promise<StoredUpload> {
    if (!this.api) throw new Error('UploadThing is not configured');
    const result = await this.api.uploadFiles(
      new UTFile([Uint8Array.from(buffer)], name, { type: mimeType }),
      { acl: 'public-read' },
    );
    if (result.error || !result.data) {
      throw new Error('UploadThing rejected the file');
    }
    return { fileUrl: result.data.ufsUrl, fileKey: result.data.key };
  }

  async delete(fileKey: string): Promise<void> {
    if (!this.api) return;
    const result = await this.api.deleteFiles(fileKey);
    if (!result.success) throw new Error('UploadThing file deletion failed');
  }

  async deleteByUrl(fileUrl: string): Promise<void> {
    const url = new URL(fileUrl);
    if (
      !url.hostname.endsWith('.ufs.sh') &&
      url.hostname !== 'ufs.sh' &&
      url.hostname !== 'utfs.io'
    ) {
      this.logger.warn('Skipped deletion for a non-UploadThing file URL');
      return;
    }
    const marker = '/f/';
    const markerIndex = url.pathname.indexOf(marker);
    const fileKey =
      markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : '';
    if (!fileKey) {
      this.logger.warn(
        'Skipped deletion because the UploadThing URL had no file key',
      );
      return;
    }
    await this.delete(decodeURIComponent(fileKey));
  }
}
