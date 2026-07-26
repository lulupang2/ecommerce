import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NotificationRepository } from '../persistence/repository';

@Processor('notification-jobs', { concurrency: 10 })
export class NotificationProcessor extends WorkerHost {
  constructor(private readonly repository: NotificationRepository) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'persist') return;
    await this.repository.create(job.data);
  }
}
