import { Module } from '@nestjs/common';
import { CatalogApplicationService } from './application/service';
import { CatalogController } from './presentation/catalog.controller';
import { CatalogRepository } from './infrastructure/persistence/repository';
import { RichTextProvider } from './infrastructure/providers/rich-text.provider';

@Module({ controllers: [CatalogController], providers: [CatalogApplicationService, CatalogRepository, RichTextProvider] })
export class CatalogModule {}
