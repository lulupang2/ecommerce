import { Module } from '@nestjs/common';
import { FulfillmentApplicationService } from './application/service';
import { FulfillmentController } from './presentation/fulfillment.controller';
import { FulfillmentRepository } from './infrastructure/persistence/repository';
import { PaymentProvider } from './infrastructure/providers/payment.provider';

@Module({ controllers: [FulfillmentController], providers: [FulfillmentApplicationService, FulfillmentRepository, PaymentProvider] })
export class FulfillmentModule {}
