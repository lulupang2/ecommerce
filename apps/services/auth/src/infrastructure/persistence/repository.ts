import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthRepository {
  readonly owner = 'auth';
}
