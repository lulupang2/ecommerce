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
    await subscribe('payment', ['order.created', 'order.cancelled'], async event => {
      if (event.type === 'order.created' && !process.env.TOSS_SECRET_KEY) {
        await this.repository.approve(
          event.payload,
          event.payload.paymentMethod || 'card',
          `mock_${event.payload.orderId}`,
        );
      }
      if (event.type === 'order.cancelled') {
        await this.repository.refundCancelledOrder(
          event.payload.orderId,
          event.payload.reason || 'ORDER_CANCELLED',
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

  private async canonicalOrder(orderId: string): Promise<any> {
    const response = await fetch(
      `${process.env.ORDER_URL || 'http://localhost:3004'}/internal/orders/${orderId}`,
      {
        headers: {
          'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal',
        },
      },
    );
    if (response.status === 404) {
      throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
    }
    if (!response.ok) {
      throw Object.assign(new Error('ORDER_UNAVAILABLE'), { status: 503 });
    }
    const order = await response.json() as any;
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      orderStatus: order.status,
      paymentStatus: order.payment_status,
      totalAmount: Number(order.total_amount),
      paymentMethod: order.payment_method || 'card',
      items: (order.items || []).map((item: any) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        sku: item.sku,
        name: item.name,
        brand: item.brand,
        image: item.image,
        price: Number(item.unit_price),
        quantity: Number(item.quantity),
      })),
    };
  }

  async confirm(input: any): Promise<IdempotentResult> {
    const provider = input.provider || input.method || 'card';
    let order: any;
    try {
      order = await this.canonicalOrder(input.orderId);
    } catch (error) {
      return {
        status: Number((error as any).status || 503),
        body: {
          code: error instanceof Error ? error.message : 'ORDER_UNAVAILABLE',
        },
      };
    }
    if (Number(input.amount) !== order.totalAmount) {
      return {
        status: 409,
        body: {
          code: 'PAYMENT_AMOUNT_MISMATCH',
          expectedAmount: order.totalAmount,
          requestedAmount: Number(input.amount),
        },
      };
    }
    if (order.orderStatus === 'cancelled' || ['refunded', 'partially_refunded'].includes(order.paymentStatus)) {
      return {
        status: 409,
        body: { code: 'ORDER_NOT_PAYABLE' },
      };
    }
    if (!process.env.TOSS_SECRET_KEY) {
      const approved = await this.repository.approve(
        order,
        provider,
        input.paymentKey || `mock_${input.orderId}`,
      );
      return {
        status: 200,
        body: { status: approved.status, provider, orderId: input.orderId },
      };
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
        order,
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
