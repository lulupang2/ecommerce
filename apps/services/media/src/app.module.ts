import { Module } from '@nestjs/common';
import { MediaApplicationService } from './application/service';
import { MediaArchitectureController } from './presentation/architecture.controller';
import { MediaRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [MediaArchitectureController], providers: [MediaApplicationService, MediaRepository] })
export class MediaModule {}
