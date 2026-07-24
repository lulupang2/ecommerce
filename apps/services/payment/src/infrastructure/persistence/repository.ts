import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentRepository {
  readonly owner = 'payment';
}
