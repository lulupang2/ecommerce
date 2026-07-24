import { Injectable, OnModuleInit } from '@nestjs/common';
import { CartRepository } from '../infrastructure/persistence/repository';

@Injectable()
export class CartApplicationService implements OnModuleInit {
  constructor(private readonly repository: CartRepository) {}

  onModuleInit() { return this.repository.initialize(); }

  async authorizeOwner(userId: string, user: any): Promise<'allowed' | 'auth_required' | 'forbidden' | 'unavailable'> {
    if (user) return user.sub === userId || user.role === 'admin' ? 'allowed' : 'forbidden';
    try {
      const response = await fetch(
        `${process.env.AUTH_URL || 'http://localhost:3001'}/internal/users/${userId}/exists`,
        { headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' } },
      );
      const payload = response.ok ? await response.json() as any : null;
      return payload?.exists ? 'auth_required' : 'allowed';
    } catch {
      return 'unavailable';
    }
  }

  list(userId: string) { return this.repository.list(userId); }
  upsert(userId: string, input: any) { return this.repository.upsert(userId, input); }
  updateQuantity(userId: string, variantId: string, quantity: number) {
    return this.repository.updateQuantity(userId, variantId, quantity);
  }
  clear(userId: string) { return this.repository.clear(userId); }
}
