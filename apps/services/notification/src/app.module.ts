import { Module } from '@nestjs/common';
import { NotificationApplicationService } from './application/service';
import { NotificationController } from './presentation/notification.controller';
import { NotificationRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [NotificationController], providers: [NotificationApplicationService, NotificationRepository] })
export class NotificationModule {}
