import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { createCacheOptions } from '@techzone/config/cache';
import { CatalogApplicationService } from './application/service';
import { CatalogController } from './presentation/catalog.controller';
import { CatalogRepository } from './infrastructure/persistence/repository';
import { RichTextProvider } from './infrastructure/providers/rich-text.provider';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => createCacheOptions('catalog', 30_000),
    }),
  ],
  controllers: [CatalogController],
  providers: [CatalogApplicationService, CatalogRepository, RichTextProvider],
})
export class CatalogModule {}
