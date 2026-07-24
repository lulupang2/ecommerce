import { Module } from '@nestjs/common';
import { ProcurementApplicationService } from './application/service';
import { ProcurementController } from './presentation/procurement.controller';
import { ProcurementRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [ProcurementController], providers: [ProcurementApplicationService, ProcurementRepository] })
export class ProcurementModule {}
