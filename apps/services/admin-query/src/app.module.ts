import { Module } from '@nestjs/common';
import { AdminQueryApplicationService } from './application/service';
import { AdminQueryArchitectureController } from './presentation/architecture.controller';
import { AdminQueryRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [AdminQueryArchitectureController], providers: [AdminQueryApplicationService, AdminQueryRepository] })
export class AdminQueryModule {}
