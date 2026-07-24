import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentProvider {
  async refund(
    orderId: string,
    amount: number,
    reason: string,
    authorization?: string,
  ): Promise<{ status: number; body: any }> {
    const response = await fetch(
      `${process.env.PAYMENT_URL || 'http://localhost:3005'}/payments/${orderId}/refunds`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authorization ? { authorization } : {}),
        },
        body: JSON.stringify({ amount, reason }),
      },
    );
    return { status: response.status, body: await response.json() };
  }
}
