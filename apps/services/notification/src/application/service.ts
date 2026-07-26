import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { NotificationRepository } from '../infrastructure/persistence/repository';

const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, patterns: string[], handler: (event: any) => Promise<void>): Promise<void>;
};

@Injectable()
export class NotificationApplicationService implements OnModuleInit {
  constructor(
    private readonly repository: NotificationRepository,
    @InjectQueue('notification-jobs') private readonly jobs: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe(
      'notification',
      ['order.confirmed', 'order.cancelled'],
      async event => {
        await this.jobs.add('persist', event, {
          jobId: event.id,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        });
      },
    );
  }

  list(userId: string) { return this.repository.list(userId); }
}
