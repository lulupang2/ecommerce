import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { CatalogModule } from './app.module';

void bootstrapNest({
  module: CatalogModule,
  service: 'catalog',
  port: Number(process.env.PORT || 3002),
});
