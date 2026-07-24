import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderRepository {
  readonly owner = 'order';
}
