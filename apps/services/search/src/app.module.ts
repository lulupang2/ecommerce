import { Module } from '@nestjs/common';
import { SearchApplicationService } from './application/service';
import { SearchController } from './presentation/search.controller';
import { SearchRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [SearchController], providers: [SearchApplicationService, SearchRepository] })
export class SearchModule {}
