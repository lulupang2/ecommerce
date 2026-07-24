import { Module } from '@nestjs/common';
import { ProcurementApplicationService } from './application/service';
import { ProcurementArchitectureController } from './presentation/architecture.controller';
import { ProcurementRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [ProcurementArchitectureController], providers: [ProcurementApplicationService, ProcurementRepository] })
export class ProcurementModule {}
