import { Module } from '@nestjs/common';
import { SearchApplicationService } from './application/service';
import { SearchArchitectureController } from './presentation/architecture.controller';
import { SearchRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [SearchArchitectureController], providers: [SearchApplicationService, SearchRepository] })
export class SearchModule {}
