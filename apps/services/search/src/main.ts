import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { SearchModule } from './app.module';

void bootstrapNest({
  module: SearchModule,
  service: 'search',
  port: Number(process.env.PORT || 3008),
});
