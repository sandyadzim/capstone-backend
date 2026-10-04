import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module.js';
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsRepository } from './attachments.repository.js';
import { AttachmentsService } from './attachments.service.js';
import { UploadThingStorageService } from './uploadthing-storage.service.js';

@Module({
  imports: [PropertyModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsRepository,
    AttachmentsService,
    UploadThingStorageService,
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
