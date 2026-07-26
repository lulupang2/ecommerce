import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { AdminQueryRepository } from '../infrastructure/persistence/repository';

const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, patterns: string[], handler: (event: any) => Promise<void>): Promise<void>;
};
const logger = require('@techzone/observability/logger') as {
  warn(message: string, fields?: Record<string, unknown>): void;
};

@Injectable()
export class AdminQueryApplicationService implements OnModuleInit {
  constructor(
    private readonly repository: AdminQueryRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe(
      'admin',
      [
        'product.*', 'order.*', 'payment.*', 'inventory.*', 'shipment.*',
        'return.*', 'purchase_order.*', 'admin.*', 'user.*', 'system.*',
      ],
      async event => {
        await this.repository.projectEvent(event);
        await this.clearDashboardCache();
      },
    );
    setTimeout(() => {
      this.repository.rebuild().catch(error => {
        console.warn(`admin rebuild retry: ${error instanceof Error ? error.message : 'unknown'}`);
      });
    }, 3000).unref();
  }

  async dashboard(fromValue?: string, toValue?: string) {
    const to = toValue ? new Date(`${toValue}T23:59:59+09:00`) : new Date();
    const from = fromValue
      ? new Date(`${fromValue}T00:00:00+09:00`)
      : new Date(to.getTime() - 29 * 86_400_000);
    const key = `dashboard:${from.toISOString()}:${to.toISOString()}`;
    try {
      const cached = await this.cache.get(key);
      if (cached !== undefined && cached !== null) return cached;
    } catch (error) {
      logger.warn('cache.read_failed', {
        key,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
    const result = await this.repository.dashboard(from, to);
    try {
      await this.cache.set(key, result, 15_000);
    } catch (error) {
      logger.warn('cache.write_failed', {
        key,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
    return result;
  }

  private async clearDashboardCache(): Promise<void> {
    try {
      await this.cache.clear();
    } catch (error) {
      logger.warn('cache.clear_failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  async listResource(resource: string, query: any, user: any): Promise<any> {
    const permission = this.repository.permissionFor(resource);
    if (!permission) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' });
    if (
      user.role !== 'admin'
      && user.adminRole !== 'super_admin'
      && !user.permissions?.includes(permission)
    ) {
      throw new ForbiddenException({ code: 'MISSING_PERMISSION', details: { permission } });
    }
    return this.repository.listResource(resource, query);
  }

  alerts() { return this.repository.alerts(); }
  warehouses() { return this.repository.fetchInternal('inventory', '/internal/warehouses'); }
  roles(authorization: string) { return this.repository.roles(authorization); }
  reprocessDeadLetter(id: string, actorId: string, reason?: string) {
    return this.repository.reprocessDeadLetter(id, actorId, reason);
  }
  discardDeadLetter(id: string, actorId: string, reason?: string) {
    return this.repository.discardDeadLetter(id, actorId, reason);
  }
  outbox(query: any) { return this.repository.outbox(query); }
  reservations(query: any) { return this.repository.reservations(query); }
  systemStatus() { return this.repository.systemStatus(); }

  async rebuild(actorId: string, reason?: string): Promise<any> {
    const result = await this.repository.rebuild();
    await this.clearDashboardCache();
    await this.repository.audit('admin.projection_rebuilt', {
      actorId,
      entityType: 'admin_projection',
      metadata: result,
      reason: reason || '수동 재구축',
    });
    return result;
  }
}
