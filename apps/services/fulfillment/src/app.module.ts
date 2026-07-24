import { Module } from '@nestjs/common';
import { FulfillmentApplicationService } from './application/service';
import { FulfillmentArchitectureController } from './presentation/architecture.controller';
import { FulfillmentRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [FulfillmentArchitectureController], providers: [FulfillmentApplicationService, FulfillmentRepository] })
export class FulfillmentModule {}
