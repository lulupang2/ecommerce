import { Module } from '@nestjs/common';
import { InventoryApplicationService } from './application/service';
import { InventoryController } from './presentation/inventory.controller';
import { InventoryRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [InventoryController], providers: [InventoryApplicationService, InventoryRepository] })
export class InventoryModule {}
