import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { createCacheOptions } from '@techzone/config/cache';
import { AdminQueryApplicationService } from './application/service';
import { AdminQueryController } from './presentation/admin-query.controller';
import { AdminQueryRepository } from './infrastructure/persistence/repository';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => createCacheOptions('admin-query', 15_000),
    }),
  ],
  controllers: [AdminQueryController],
  providers: [AdminQueryApplicationService, AdminQueryRepository],
})
export class AdminQueryModule {}
