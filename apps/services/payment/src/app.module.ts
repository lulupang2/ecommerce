import { Module } from '@nestjs/common';
import { PaymentApplicationService } from './application/service';
import { PaymentArchitectureController } from './presentation/architecture.controller';
import { PaymentRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [PaymentArchitectureController], providers: [PaymentApplicationService, PaymentRepository] })
export class PaymentModule {}
