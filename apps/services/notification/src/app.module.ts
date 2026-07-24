import { Module } from '@nestjs/common';
import { NotificationApplicationService } from './application/service';
import { NotificationArchitectureController } from './presentation/architecture.controller';
import { NotificationRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [NotificationArchitectureController], providers: [NotificationApplicationService, NotificationRepository] })
export class NotificationModule {}
