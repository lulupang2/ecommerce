import { Injectable } from '@nestjs/common';

@Injectable()
export class FulfillmentRepository {
  readonly owner = 'fulfillment';
}
