import { Module } from '@nestjs/common';
import { InventoryApplicationService } from './application/service';
import { InventoryArchitectureController } from './presentation/architecture.controller';
import { InventoryRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [InventoryArchitectureController], providers: [InventoryApplicationService, InventoryRepository] })
export class InventoryModule {}
