import { Module } from '@nestjs/common';
import { CartApplicationService } from './application/service';
import { CartController } from './presentation/cart.controller';
import { CartRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [CartController], providers: [CartApplicationService, CartRepository] })
export class CartModule {}
