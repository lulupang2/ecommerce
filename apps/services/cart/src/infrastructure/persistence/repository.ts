import { Injectable } from '@nestjs/common';

@Injectable()
export class CartRepository {
  readonly owner = 'cart';
}
