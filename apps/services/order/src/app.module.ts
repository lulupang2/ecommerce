import { Module } from '@nestjs/common';
import { OrderApplicationService } from './application/service';
import { OrderArchitectureController } from './presentation/architecture.controller';
import { OrderRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [OrderArchitectureController], providers: [OrderApplicationService, OrderRepository] })
export class OrderModule {}
