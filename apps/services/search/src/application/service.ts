import { Injectable, OnModuleInit } from '@nestjs/common';
import { SearchRepository } from '../infrastructure/persistence/repository';

const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, patterns: string[], handler: (event: any) => Promise<void>): Promise<void>;
};

@Injectable()
export class SearchApplicationService implements OnModuleInit {
  constructor(private readonly repository: SearchRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe('search', ['product.*'], event => this.repository.project(event));
  }

  async search(query: string, category: string): Promise<{ status: number; body: string; contentType: string }> {
    const catalog = process.env.CATALOG_URL || 'http://localhost:3002';
    try {
      const response = await fetch(
        `${catalog}/products?${new URLSearchParams({ q: query, category })}`,
      );
      return {
        status: response.status,
        body: await response.text(),
        contentType: response.headers.get('content-type') || 'application/json',
      };
    } catch {
      return {
        status: 503,
        body: JSON.stringify({ code: 'CATALOG_UNAVAILABLE' }),
        contentType: 'application/json',
      };
    }
  }
}
