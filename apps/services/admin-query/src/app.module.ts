import { Module } from '@nestjs/common';
import { AdminQueryApplicationService } from './application/service';
import { AdminQueryController } from './presentation/admin-query.controller';
import { AdminQueryRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [AdminQueryController], providers: [AdminQueryApplicationService, AdminQueryRepository] })
export class AdminQueryModule {}
