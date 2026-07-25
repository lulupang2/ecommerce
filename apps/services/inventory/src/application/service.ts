import { Injectable, OnModuleInit } from '@nestjs/common';
import { executeIdempotent, type IdempotentResult } from '@techzone/messaging/idempotency';
import { InventoryRepository } from '../infrastructure/persistence/repository';

const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, events: string[], handler: (event: any) => Promise<void>): Promise<void>;
};

@Injectable()
export class InventoryApplicationService implements OnModuleInit {
  constructor(private readonly repository: InventoryRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe('inventory', ['inventory.reserve', 'inventory.received'], async event => {
      if (event.type === 'inventory.reserve') await this.repository.reserve(event);
      if (event.type === 'inventory.received') await this.repository.receive(event.payload);
    });
  }

  idempotent<T>(
    request: any,
    scope: string,
    operation: () => Promise<IdempotentResult<T>>,
  ): Promise<IdempotentResult<T>> {
    return executeIdempotent(this.repository.db, scope, request, operation);
  }

  list() { return this.repository.list(); }
  movements(variantId?: string) { return this.repository.movements(variantId); }
  serials() { return this.repository.serials(); }
  warehouses() { return this.repository.warehouses(); }
  stock(productId: string) { return this.repository.stock(productId); }
  internalInventory() { return this.repository.internalInventory(); }

  async adjust(productId: string, input: any, actorId: string): Promise<IdempotentResult> {
    return {
      status: 200,
      body: await this.repository.adjust(productId, input, actorId),
    };
  }

  async transfer(input: any, actorId: string): Promise<IdempotentResult> {
    const result = await this.repository.transfer(input, actorId);
    return result
      ? { status: 201, body: result }
      : { status: 409, body: { code: 'INSUFFICIENT_STOCK' } };
  }
}
