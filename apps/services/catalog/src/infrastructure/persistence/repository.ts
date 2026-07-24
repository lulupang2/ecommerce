import { Injectable } from '@nestjs/common';

@Injectable()
export class CatalogRepository {
  readonly owner = 'catalog';
}
