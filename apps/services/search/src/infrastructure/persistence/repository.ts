import { Injectable } from '@nestjs/common';

const { database } = require('@techzone/database/db') as { database(service: string): any };
import { searchEvents } from './schema';
const { registerReliability } = require('@techzone/messaging/bus') as {
  registerReliability(service: string, database: any): Promise<void>;
};

@Injectable()
export class SearchRepository {
  readonly owner = 'search';
  readonly db = database('search');

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('search', this.db);
  }

  async project(event: any): Promise<void> {
    await this.db.orm
      .insert(searchEvents)
      .values({ id: event.id, eventType: event.type })
      .onConflictDoNothing();
  }
}
