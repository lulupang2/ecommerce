import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationRepository {
  readonly owner = 'notification';
}
