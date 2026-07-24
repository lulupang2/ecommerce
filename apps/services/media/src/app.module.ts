import { Module } from '@nestjs/common';
import { MediaApplicationService } from './application/service';
import { MediaController } from './presentation/media.controller';
import { MediaRepository } from './infrastructure/persistence/repository';
import { StorageProvider } from './infrastructure/providers/storage.provider';

@Module({ controllers: [MediaController], providers: [MediaApplicationService, MediaRepository, StorageProvider] })
export class MediaModule {}
