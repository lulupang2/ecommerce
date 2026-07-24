import { Module } from '@nestjs/common';
import { CartApplicationService } from './application/service';
import { CartArchitectureController } from './presentation/architecture.controller';
import { CartRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [CartArchitectureController], providers: [CartApplicationService, CartRepository] })
export class CartModule {}
