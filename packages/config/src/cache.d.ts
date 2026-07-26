import type { CacheManagerOptions } from '@nestjs/cache-manager';

export function createCacheOptions(
  namespace: string,
  ttl?: number,
): CacheManagerOptions;
