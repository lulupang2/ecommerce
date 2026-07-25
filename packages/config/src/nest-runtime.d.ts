import type { INestApplication, Type } from '@nestjs/common';

export interface BootstrapNestOptions {
  module: Type<unknown>;
  service: string;
  port: number;
  readiness?: () => Promise<Record<string, string>>;
  docsPath?: string;
}

export function bootstrapNest(options: BootstrapNestOptions): Promise<INestApplication>;
