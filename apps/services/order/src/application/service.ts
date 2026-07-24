import { Injectable, OnModuleInit } from '@nestjs/common';
import { executeIdempotent, type IdempotentResult } from '@techzone/messaging/idempotency';
import jwt from 'jsonwebtoken';
import { OrderRepository } from '../infrastructure/persistence/repository';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, events: string[], handler: (event: any) => Promise<void>): Promise<void>;
};

@Injectable()
export class OrderApplicationService implements OnModuleInit {
  constructor(private readonly repository: OrderRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe('order', [
      'payment.approved',
      'payment.refunded',
      'inventory.reserved',
      'inventory.failed',
      'shipment.created',
      'shipment.shipped',
      'shipment.delivered',
      'return.received',
    ], event => this.repository.handleEvent(event));
  }

  private jwtSecret(): string {
    return process.env.JWT_SECRET || 'canvas-local-secret';
  }

  private normalizePhone(value: string): string {
    return String(value || '').replace(/\D/g, '');
  }

  idempotent<T>(
    request: any,
    scope: string,
    operation: () => Promise<IdempotentResult<T>>,
  ): Promise<IdempotentResult<T>> {
    return executeIdempotent(this.repository.db, scope, request, operation);
  }

  async quote(input: any): Promise<IdempotentResult> {
    try {
      const quote = await this.repository.calculateQuote(input.items, input.couponCode);
      const quoteToken = jwt.sign({
        type: 'checkout_quote',
        items: input.items,
        couponCode: quote.coupon?.code || null,
        subtotalAmount: quote.subtotalAmount,
        discountAmount: quote.discountAmount,
        shippingFee: quote.shippingFee,
        totalAmount: quote.totalAmount,
      }, this.jwtSecret(), { expiresIn: '10m', audience: 'techzone-checkout' });
      return { status: 200, body: { ...quote, quoteToken, expiresIn: 600 } };
    } catch (error) {
      return {
        status: Number((error as any).status || 500),
        body: { code: error instanceof Error ? error.message : 'QUOTE_FAILED' },
      };
    }
  }

  publicCoupons() { return this.repository.publicCoupons(); }
  adminCoupons() { return this.repository.adminCoupons(); }
  createCoupon(input: any) { return this.repository.createCoupon(input); }
  updateCoupon(id: string, input: any) { return this.repository.updateCoupon(id, input); }

  async createOrder(input: any, request: any): Promise<IdempotentResult> {
    const { userId, shipping } = input;
    if (!input.guestOrder && (!request.user || request.user.sub !== userId)) {
      return {
        status: 403,
        body: {
          code: 'ORDER_OWNER_MISMATCH',
          message: '로그인 사용자와 주문자가 일치하지 않습니다.',
        },
      };
    }
    let quote: any;
    let items: any[];
    try {
      if (input.quoteToken) {
        const token = jwt.verify(input.quoteToken, this.jwtSecret(), {
          audience: 'techzone-checkout',
        }) as any;
        quote = await this.repository.calculateQuote(token.items, token.couponCode);
        if (
          quote.totalAmount !== token.totalAmount
          || quote.discountAmount !== token.discountAmount
        ) {
          return { status: 409, body: { code: 'PRICE_CHANGED', quote } };
        }
        items = quote.lines;
      } else {
        items = input.items || [];
        if (!items.length) {
          return { status: 400, body: { code: 'INVALID_ORDER_ITEM' } };
        }
        const subtotal = items.reduce(
          (sum: number, item: any) => sum + Number(item.price) * Number(item.quantity),
          0,
        );
        quote = {
          subtotalAmount: subtotal,
          discountAmount: 0,
          shippingFee: 0,
          totalAmount: subtotal,
          taxAmount: Math.round(subtotal / 11),
          coupon: null,
        };
      }
    } catch (error) {
      const expired = (error as any).name === 'TokenExpiredError';
      return {
        status: expired ? 410 : Number((error as any).status || 400),
        body: { code: expired ? 'QUOTE_EXPIRED' : (error as Error).message },
      };
    }
    if (quote.coupon && await this.repository.couponUsed(quote.coupon.id, userId)) {
      return { status: 409, body: { code: 'COUPON_ALREADY_USED' } };
    }
    const id = crypto.randomUUID();
    const orderNumber = `TZ-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const paymentMethod = input.paymentMethod || 'card';
    const payload = {
      orderId: id,
      orderNumber,
      userId,
      items,
      subtotalAmount: quote.subtotalAmount,
      discountAmount: quote.discountAmount,
      shippingFee: quote.shippingFee,
      taxAmount: quote.taxAmount,
      totalAmount: quote.totalAmount,
      paymentMethod,
      status: 'pending',
      paymentStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      recipient: shipping.recipient,
      createdAt: new Date().toISOString(),
    };
    await this.repository.createOrder({
      id,
      orderNumber,
      userId,
      items,
      quote,
      shipping,
      guestOrder: Boolean(input.guestOrder),
      paymentMethod,
      payload,
    });
    return {
      status: 201,
      body: {
        id,
        orderNumber,
        status: 'pending',
        totalAmount: quote.totalAmount,
        ...(input.guestOrder
          ? { guestOrderToken: this.issueGuestToken(id, orderNumber, shipping.phone) }
          : {}),
      },
    };
  }

  private issueGuestToken(orderId: string, orderNumber: string, phone: string): string {
    return jwt.sign({
      type: 'guest_order',
      orderId,
      orderNumber,
      phone: this.normalizePhone(phone),
    }, this.jwtSecret(), { expiresIn: '15m', audience: 'techzone-guest-order' });
  }

  verifyGuest(authorization: string | undefined, orderId: string): boolean {
    try {
      const token = String(authorization || '').replace(/^Bearer /, '');
      const payload = jwt.verify(token, this.jwtSecret(), {
        audience: 'techzone-guest-order',
      }) as any;
      return payload.type === 'guest_order' && payload.orderId === orderId;
    } catch {
      return false;
    }
  }

  async guestAccess(input: any): Promise<any | null> {
    const order = await this.repository.guestOrderByNumber(input.orderNumber);
    if (!order || this.normalizePhone(order.phone) !== this.normalizePhone(input.phone)) return null;
    return {
      accessToken: this.issueGuestToken(order.id, order.order_number, order.phone),
      expiresIn: 900,
      orderId: order.id,
    };
  }

  cancelGuestOrder(id: string, reason?: string) {
    return this.repository.cancelGuestOrder(id, reason || '비회원 주문 취소');
  }

  list(userId?: string) { return this.repository.list(userId); }
  updateStatus(id: string, status: string, actorId: string, reason?: string) {
    return this.repository.updateStatus(id, status, actorId, reason || '관리자 상태 변경');
  }
  detail(id: string) { return this.repository.detail(id); }
  internalOrders() { return this.repository.internalOrders(); }
  orderItems(id: string) { return this.repository.orderItems(id); }
  purchases(userId: string) { return this.repository.purchases(userId); }
}
