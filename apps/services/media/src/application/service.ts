import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { MediaRepository } from '../infrastructure/persistence/repository';
import { StorageProvider } from '../infrastructure/providers/storage.provider';

const crypto = require('node:crypto') as typeof import('node:crypto');
const ALLOWED_IMAGES = new Map([
  ['image/jpeg', new Set(['jpg', 'jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
]);

@Injectable()
export class MediaApplicationService implements OnModuleInit {
  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: StorageProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await this.storage.initialize();
  }

  async createUpload(input: any, ownerId: string): Promise<any> {
    const extension = String(input.fileName).split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_IMAGES.get(input.contentType)?.has(extension)) {
      throw new BadRequestException({
        code: 'INVALID_MEDIA_TYPE',
        message: 'JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.',
      });
    }
    const id = crypto.randomUUID();
    const safeName = String(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
    const objectKey = `uploads/${ownerId}/${id}-${safeName}`;
    const target = await this.storage.uploadTarget(objectKey, input.contentType);
    await this.repository.create({
      id,
      ownerId,
      contentType: input.contentType,
      objectKey,
      publicUrl: target.publicUrl,
    });
    return {
      assetId: id,
      ...target,
      expiresIn: 900,
    };
  }

  find(id: string) { return this.repository.find(id); }
}
