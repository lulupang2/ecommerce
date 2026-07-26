import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { executeIdempotent, type IdempotentResult } from '@techzone/messaging/idempotency';
import { InventoryRepository } from '../infrastructure/persistence/repository';

const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, events: string[], handler: (event: any) => Promise<void>): Promise<void>;
};

@Injectable()
export class InventoryApplicationService implements OnModuleInit, OnModuleDestroy {
  private expiryTimer?: NodeJS.Timeout;

  constructor(private readonly repository: InventoryRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe('inventory', [
      'inventory.reserve',
      'inventory.received',
      'order.confirmed',
      'order.cancelled',
      'shipment.shipped',
    ], async event => {
      if (event.type === 'inventory.reserve') await this.repository.reserve(event);
      if (event.type === 'inventory.received') await this.repository.receive(event.payload);
      if (event.type === 'order.confirmed') {
        await this.repository.confirmReservations(event.payload.orderId);
      }
      if (event.type === 'order.cancelled') {
        await this.repository.releaseReservations(
          event.payload.orderId,
          event.payload.reason || 'ORDER_CANCELLED',
          event,
        );
      }
      if (event.type === 'shipment.shipped') {
        await this.repository.commitReservations(event.payload.orderId);
      }
    });
    const intervalMs = Number(process.env.RESERVATION_SWEEP_INTERVAL_MS || 60_000);
    this.expiryTimer = setInterval(() => {
      this.repository.expireReservations().catch(() => undefined);
    }, intervalMs);
    this.expiryTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
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
  availability(variantIds: string[]) { return this.repository.availability(variantIds); }

  async adjust(productId: string, input: any, actorId: string): Promise<IdempotentResult> {
    return {
      status: 200,
      body: await this.repository.adjust(productId, input, actorId),
    };
  }

  async adjustVariant(variantId: string, input: any, actorId: string): Promise<IdempotentResult> {
    return {
      status: 200,
      body: await this.repository.adjustVariant(variantId, input, actorId),
    };
  }

  async transfer(input: any, actorId: string): Promise<IdempotentResult> {
    const result = await this.repository.transfer(input, actorId);
    return result
      ? { status: 201, body: result }
      : { status: 409, body: { code: 'INSUFFICIENT_STOCK' } };
  }
}
