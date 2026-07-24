import { Injectable } from '@nestjs/common';

@Injectable()
export class MediaRepository {
  readonly owner = 'media';
}
