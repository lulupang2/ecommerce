import { Injectable } from '@nestjs/common';
import { SERVICE_NAME } from '../domain/service-name';

@Injectable()
export class CartApplicationService {
  describe() { return { service: SERVICE_NAME, architecture: 'module-controller-service-repository' as const }; }
}
