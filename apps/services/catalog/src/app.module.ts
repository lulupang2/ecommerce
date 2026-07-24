import { Module } from '@nestjs/common';
import { CatalogApplicationService } from './application/service';
import { CatalogArchitectureController } from './presentation/architecture.controller';
import { CatalogRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [CatalogArchitectureController], providers: [CatalogApplicationService, CatalogRepository] })
export class CatalogModule {}
