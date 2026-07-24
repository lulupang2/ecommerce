import { Injectable, OnModuleInit } from '@nestjs/common';
import { executeIdempotent, type IdempotentResult } from '@techzone/messaging/idempotency';
import { PaymentRepository } from '../infrastructure/persistence/repository';

const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, events: string[], handler: (event: any) => Promise<void>): Promise<void>;
};

@Injectable()
export class PaymentApplicationService implements OnModuleInit {
  constructor(private readonly repository: PaymentRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe('payment', ['order.created'], async event => {
      if (!process.env.TOSS_SECRET_KEY) {
        await this.repository.approve(
          event.payload,
          event.payload.paymentMethod || 'card',
          `mock_${event.payload.orderId}`,
        );
      }
    });
  }

  idempotent<T>(
    request: any,
    scope: string,
    operation: () => Promise<IdempotentResult<T>>,
  ): Promise<IdempotentResult<T>> {
    return executeIdempotent(this.repository.db, scope, request, operation);
  }

  async confirm(input: any): Promise<IdempotentResult> {
    const provider = input.provider || input.method || 'card';
    if (!process.env.TOSS_SECRET_KEY) {
      await this.repository.approve(
        { ...(input.order || {}), orderId: input.orderId, totalAmount: Number(input.amount) },
        provider,
        input.paymentKey || `mock_${input.orderId}`,
      );
      return { status: 200, body: { status: 'approved', provider, orderId: input.orderId } };
    }
    try {
      const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          paymentKey: input.paymentKey,
          orderId: input.orderId,
          amount: Number(input.amount),
        }),
      });
      const data = await response.json() as any;
      if (!response.ok) {
        return {
          status: response.status,
          body: { code: data.code || 'PAYMENT_FAILED', message: data.message },
        };
      }
      await this.repository.approve(
        { ...(input.order || {}), orderId: input.orderId, totalAmount: Number(input.amount) },
        'toss',
        input.paymentKey,
      );
      return {
        status: 200,
        body: {
          status: 'approved',
          provider: 'toss',
          orderId: input.orderId,
          paymentKey: input.paymentKey,
        },
      };
    } catch (error) {
      return {
        status: 502,
        body: {
          code: 'PAYMENT_PROVIDER_ERROR',
          message: error instanceof Error ? error.message : '결제 제공자 오류',
        },
      };
    }
  }

  async refund(orderId: string, input: any, actorId: string): Promise<IdempotentResult> {
    const result = await this.repository.refund(
      orderId,
      Number(input.amount),
      input.reason || '관리자 환불',
      actorId,
    );
    if (!result) return { status: 404, body: { code: 'NOT_FOUND' } };
    if (result.invalidAmount) {
      return {
        status: 400,
        body: {
          code: 'INVALID_REFUND_AMOUNT',
          refundableAmount: result.refundableAmount,
        },
      };
    }
    return { status: 201, body: result };
  }

  detail(orderId: string): Promise<any | null> {
    return this.repository.detail(orderId);
  }

  all(): Promise<any[]> {
    return this.repository.all();
  }
}
