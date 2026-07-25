import { Module } from '@nestjs/common';
import { PaymentApplicationService } from './application/service';
import { PaymentController } from './presentation/payment.controller';
import { PaymentRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [PaymentController], providers: [PaymentApplicationService, PaymentRepository] })
export class PaymentModule {}
