import { Module } from '@nestjs/common';
import { OrderApplicationService } from './application/service';
import { OrderController } from './presentation/order.controller';
import { OrderRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [OrderController], providers: [OrderApplicationService, OrderRepository] })
export class OrderModule {}
