import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationApplicationService } from './application/service';
import { NotificationController } from './presentation/notification.controller';
import { NotificationRepository } from './infrastructure/persistence/repository';
import { NotificationProcessor } from './infrastructure/messaging/notification.processor';

function redisConnection() {
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  const database = Number(url.pathname.slice(1) || 0);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isInteger(database) ? database : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

@Module({
  imports: [
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue({ name: 'notification-jobs' }),
  ],
  controllers: [NotificationController],
  providers: [NotificationApplicationService, NotificationRepository, NotificationProcessor],
})
export class NotificationModule {}
