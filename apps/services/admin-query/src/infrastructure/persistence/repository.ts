import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminQueryRepository {
  readonly owner = 'admin-query';
}
