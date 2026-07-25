import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationRepository } from '../infrastructure/persistence/repository';

const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, patterns: string[], handler: (event: any) => Promise<void>): Promise<void>;
};

@Injectable()
export class NotificationApplicationService implements OnModuleInit {
  constructor(private readonly repository: NotificationRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe(
      'notification',
      ['order.confirmed', 'order.cancelled'],
      event => this.repository.create(event),
    );
  }

  list(userId: string) { return this.repository.list(userId); }
}
