import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { MediaModule } from './app.module';

void bootstrapNest({
  module: MediaModule,
  service: 'media',
  port: Number(process.env.PORT || 3009),
});
