import { Injectable, OnModuleInit } from '@nestjs/common';
import { ProcurementRepository } from '../infrastructure/persistence/repository';

@Injectable()
export class ProcurementApplicationService implements OnModuleInit {
  constructor(private readonly repository: ProcurementRepository) {}
  onModuleInit() { return this.repository.initialize(); }
  suppliers() { return this.repository.suppliers(); }
  purchaseOrders() { return this.repository.purchaseOrders(); }
  create(input: any, actorId: string) { return this.repository.create(input, actorId); }
  approve(id: string, actorId: string) { return this.repository.approve(id, actorId); }
  receive(id: string, input: any, actorId: string) {
    return this.repository.receive(id, input, actorId);
  }
}
