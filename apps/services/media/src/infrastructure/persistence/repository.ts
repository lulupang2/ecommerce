import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

const { database } = require('@techzone/database/db') as { database(service: string): any };
const { mediaAssets } = require('@techzone/database/schema') as { mediaAssets: any };

@Injectable()
export class MediaRepository {
  readonly owner = 'media';
  readonly db = database('media');

  initialize(): Promise<void> { return this.db.wait(); }

  async create(value: any): Promise<void> {
    await this.db.orm.insert(mediaAssets).values(value);
  }

  async find(id: string): Promise<any | null> {
    const rows = await this.db.orm
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id))
      .limit(1);
    return rows[0] || null;
  }
}
