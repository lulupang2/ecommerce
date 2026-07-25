import { Injectable, OnModuleInit } from '@nestjs/common';
import { executeIdempotent, type IdempotentResult } from '@techzone/messaging/idempotency';
import jwt from 'jsonwebtoken';
import { FulfillmentRepository } from '../infrastructure/persistence/repository';
import { PaymentProvider } from '../infrastructure/providers/payment.provider';

const { subscribe, publish } = require('@techzone/messaging/bus') as {
  subscribe(service: string, patterns: string[], handler: (event: any) => Promise<void>): Promise<void>;
  publish(event: string, payload: Record<string, unknown>): Promise<void>;
};

@Injectable()
export class FulfillmentApplicationService implements OnModuleInit {
  constructor(
    private readonly repository: FulfillmentRepository,
    private readonly payments: PaymentProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe(
      'fulfillment',
      ['order.confirmed'],
      event => this.repository.createShipment(event.payload),
    );
  }

  idempotent<T>(
    request: any,
    scope: string,
    operation: () => Promise<IdempotentResult<T>>,
  ): Promise<IdempotentResult<T>> {
    return executeIdempotent(this.repository.db, scope, request, operation);
  }

  shipments() { return this.repository.shipments(); }
  returns() { return this.repository.returns(); }

  async createShipment(input: any, actorId: string): Promise<IdempotentResult> {
    const shipment = await this.repository.createShipment(input);
    await publish('admin.action', {
      actorId,
      action: 'shipment.create',
      entityType: 'shipment',
      entityId: shipment.shipmentId,
      metadata: input,
    });
    return { status: 201, body: shipment };
  }

  updateShipment(id: string, input: any, actorId: string) {
    return this.repository.updateShipment(id, input, actorId);
  }

  createReturn(input: any, actorId: string) {
    return this.repository.createReturn(input, actorId);
  }

  async createGuestReturn(input: any, authorization?: string): Promise<IdempotentResult> {
    try {
      const token = String(authorization || '').replace(/^Bearer /, '');
      const access = jwt.verify(
        token,
        process.env.JWT_SECRET || 'canvas-local-secret',
        { audience: 'techzone-guest-order' },
      ) as any;
      if (access.type !== 'guest_order' || access.orderId !== input.orderId) {
        return { status: 403, body: { code: 'GUEST_ORDER_FORBIDDEN' } };
      }
      const order = await this.repository.findDeliveredOrder(input.orderId);
      if (
        !order
        || order.status !== 'delivered'
        || Date.now() - new Date(order.updated_at).getTime() > 7 * 86_400_000
      ) {
        return { status: 409, body: { code: 'RETURN_WINDOW_CLOSED' } };
      }
      return {
        status: 201,
        body: await this.repository.createReturn({
          ...input,
          reason: input.reason || '비회원 반품 요청',
          refundAmount: input.refundAmount || order.total_amount,
        }),
      };
    } catch (error) {
      const expired = (error as any).name === 'TokenExpiredError';
      return {
        status: expired ? 410 : 401,
        body: { code: expired ? 'GUEST_TOKEN_EXPIRED' : 'GUEST_TOKEN_REQUIRED' },
      };
    }
  }

  updateReturn(id: string, input: any, actorId: string) {
    return this.repository.updateReturn(id, input, actorId);
  }

  async refund(
    id: string,
    input: any,
    actorId: string,
    authorization?: string,
  ): Promise<IdempotentResult> {
    const current = await this.repository.receivedReturn(id);
    if (!current) return { status: 409, body: { code: 'RETURN_NOT_RECEIVED' } };
    const result = await this.payments.refund(
      current.order_id,
      Number(input.amount || current.refund_amount),
      input.reason || current.reason,
      authorization,
    );
    if (result.status < 200 || result.status >= 300) return result;
    return {
      status: 200,
      body: await this.repository.completeRefund(id, current, result.body, actorId),
    };
  }
}
