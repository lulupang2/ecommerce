import { Injectable } from '@nestjs/common';

@Injectable()
export class InventoryRepository {
  readonly owner = 'inventory';
}
