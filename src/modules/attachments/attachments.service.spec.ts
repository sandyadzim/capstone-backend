import { ApiErrorException } from '../../common/http/api-error.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { AttachmentsService } from './attachments.service.js';
import type { AttachmentsRepository } from './attachments.repository.js';
import type { UploadThingStorageService } from './uploadthing-storage.service.js';
import type { PropertyService } from '../property/property.service.js';
import { vi } from 'vitest';

describe('AttachmentsService', () => {
  const actor: AuthenticatedActor = {
    id: '33000000-0000-4000-8000-000000000003',
    name: 'Resident',
    loginIdentifier: 'resident@example.test',
    role: 'RESIDENT',
  };
  const file = {
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    size: 8,
  } as Express.Multer.File;

  it('deletes the UploadThing file when database persistence fails', async () => {
    const repository = {
      checkAccess: vi.fn().mockResolvedValue({ kind: 'allowed' }),
      addReportAttachment: vi
        .fn()
        .mockRejectedValue(new Error('database down')),
    };
    const storage = {
      upload: vi.fn().mockResolvedValue({
        fileUrl: 'https://test-app.ufs.sh/f/image.png',
        fileKey: 'image.png',
      }),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteByUrl: vi.fn(),
    };
    const service = new AttachmentsService(
      repository as unknown as AttachmentsRepository,
      storage as unknown as UploadThingStorageService,
      {} as PropertyService,
    );

    await expect(
      service.uploadReportFile(
        actor,
        '99000000-0000-4000-8000-000000000001',
        'DAMAGE_PHOTO',
        file,
      ),
    ).rejects.toThrow('database down');
    expect(storage.delete).toHaveBeenCalledWith('image.png');
  });

  it('does not write a database reference when UploadThing fails', async () => {
    const repository = {
      checkAccess: vi.fn().mockResolvedValue({ kind: 'allowed' }),
      addReportAttachment: vi.fn(),
    };
    const storage = {
      upload: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      delete: vi.fn(),
      deleteByUrl: vi.fn(),
    };
    const service = new AttachmentsService(
      repository as unknown as AttachmentsRepository,
      storage as unknown as UploadThingStorageService,
      {} as PropertyService,
    );

    await expect(
      service.uploadReportFile(
        actor,
        '99000000-0000-4000-8000-000000000001',
        'DAMAGE_PHOTO',
        file,
      ),
    ).rejects.toBeInstanceOf(ApiErrorException);
    expect(repository.addReportAttachment).not.toHaveBeenCalled();
  });
});
